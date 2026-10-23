import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import {
  parsePromotionInput,
  decimalMinorUnits,
  type OrganizerPromotion,
  type PromotionInput,
  type PromotionPage,
  type PromotionResult,
} from "@/lib/organizer-promotions-core";

function localDate(iso: string) {
  const d = new Date(iso),
    pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function localIso(value: string) {
  const iso = new Date(value).toISOString();
  // Native local-date inputs do not identify nonexistent daylight-saving
  // times. Reject normalization rather than silently move an offer by an hour.
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ||
    localDate(iso).slice(0, value.length) !== value
  )
    throw Error("invalid_local_date");
  return iso;
}
const fresh = () => ({
  code: "",
  ticketTypeId: "",
  enabled: true,
  startsAt: "",
  expiresAt: "",
  kind: "fixed" as "fixed" | "percentage",
  discount: "",
  limit: "",
});
const messages = {
  invalid_request:
    "Check the code, dates and usage limit. Enter a positive discount; percentages must be below 100%.",
  unavailable: "Promo management is unavailable for this event.",
  code_taken: "That code already exists. Reload codes and edit it instead.",
  version_conflict: "Someone changed this code. Reload codes before editing again.",
  immutable_scope: "Code and ticket scope cannot change. Create a new code instead.",
  invalid_scope: "Choose a USD ticket tier belonging to this event.",
  limit_below_usage: "The limit cannot be below reserved plus consumed uses.",
  too_many_tiers:
    "This event has more than 100 tiers; the editor cannot load its complete scope list.",
};

export function OrganizerPromotionPanel({
  eventId,
  eventName,
  request,
}: {
  eventId: string;
  eventName?: string;
  request: (input: PromotionInput) => Promise<PromotionResult>;
}) {
  const [page, setPage] = useState<PromotionPage | null>(null),
    [draft, setDraft] = useState(fresh),
    [editing, setEditing] = useState<OrganizerPromotion | null>(null);
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState("Loading promo codes…");
  const generation = useRef(0),
    pending = useRef(false);
  const load = useCallback(
    async (after: string | null) => {
      const g = ++generation.current;
      pending.current = true;
      setBusy(true);
      setPage(null);
      setEditing(null);
      setDraft(fresh());
      try {
        const result = await request({ action: "list", eventId, after });
        if (g !== generation.current) return;
        if (result.ok && result.action === "list") {
          setPage(result.page);
          setUncertain(false);
          setMessage(
            result.page.rows.length
              ? "Select a code to edit, or create a new one."
              : "No codes on this page. Create a code below.",
          );
        } else setMessage(!result.ok ? messages[result.code] : "Codes could not be loaded.");
      } catch {
        if (g === generation.current) setMessage("Codes could not be loaded. Reload to try again.");
      } finally {
        if (g === generation.current) {
          pending.current = false;
          setBusy(false);
        }
      }
    },
    [eventId, request],
  );
  useEffect(() => {
    void load(null);
    const ref = generation;
    return () => {
      ++ref.current;
      pending.current = false;
    };
  }, [load]);
  const change = <K extends keyof ReturnType<typeof fresh>>(
    key: K,
    value: ReturnType<typeof fresh>[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));
  const edit = (p: OrganizerPromotion) => {
    setEditing(p);
    setDraft({
      code: p.code,
      ticketTypeId: p.ticketTypeId ?? "",
      enabled: p.enabled,
      startsAt: localDate(p.startsAt),
      expiresAt: localDate(p.expiresAt),
      kind: p.kind,
      discount: (p.value / 100).toFixed(2),
      limit: p.maxRedemptions === null ? "" : String(p.maxRedemptions),
    });
    setMessage(
      `Editing ${p.code}, version ${p.version}. Existing quotes keep their original terms.`,
    );
  };
  async function save() {
    if (pending.current || uncertain || !page) return;
    const value = decimalMinorUnits(draft.discount);
    let startsAt = "",
      expiresAt = "";
    try {
      startsAt =
        editing && draft.startsAt === localDate(editing.startsAt)
          ? editing.startsAt
          : localIso(draft.startsAt);
      expiresAt =
        editing && draft.expiresAt === localDate(editing.expiresAt)
          ? editing.expiresAt
          : localIso(draft.expiresAt);
    } catch {
      /* Parser supplies a single form error. */
    }
    const input = parsePromotionInput({
      action: "save",
      eventId,
      id: editing?.id ?? null,
      version: editing?.version ?? null,
      code: draft.code,
      ticketTypeId: draft.ticketTypeId || null,
      enabled: draft.enabled,
      startsAt,
      expiresAt,
      kind: draft.kind,
      value,
      maxRedemptions:
        draft.limit === "" ? null : /^[1-9]\d{0,9}$/.test(draft.limit) ? Number(draft.limit) : 0,
    });
    if (!input || input.action !== "save") {
      setMessage(messages.invalid_request);
      return;
    }
    pending.current = true;
    setBusy(true);
    const g = ++generation.current;
    setMessage("Saving code…");
    try {
      const result = await request(input);
      if (g !== generation.current) return;
      if (!result.ok) {
        setMessage(messages[result.code]);
        if (["version_conflict", "code_taken", "unavailable"].includes(result.code))
          setUncertain(true);
        return;
      }
      if (result.action !== "save") {
        setUncertain(true);
        setMessage("Could not confirm the save. Reload codes before trying again.");
        return;
      }
      // Re-read once, never automatically repeat a mutation after uncertainty.
      setEditing(null);
      setDraft(fresh());
      const refreshed = await request({ action: "list", eventId, after: null });
      if (g !== generation.current) return;
      if (refreshed.ok && refreshed.action === "list") {
        setPage(refreshed.page);
        setUncertain(false);
        setMessage(
          `Saved ${input.code}, version ${result.version}. Existing purchases are unchanged.`,
        );
      } else {
        setPage(null);
        setUncertain(true);
        setMessage(
          `Saved ${input.code}. Reload codes to see current usage before making another change.`,
        );
      }
    } catch {
      if (g === generation.current) {
        setUncertain(true);
        setMessage("Could not confirm the save. Reload codes before trying again.");
      }
    } finally {
      if (g === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section
      className="checkout-form organizer-promotions mt-10"
      aria-labelledby="promotion-heading"
    >
      <h2 id="promotion-heading">Promo codes</h2>
      {eventName ? <p className="checkout-note">Managing codes for {eventName}.</p> : null}
      <p className="checkout-note">
        TEST only. One code per purchase, fixed USD off the whole order or a percentage. No added
        fees; tax is not calculated.
      </p>
      <p className="checkout-note">
        Reserved and consumed purchases count toward the limit. Refunds do not restore uses.
        Disabling or expiring a code affects new quotes, not saved checkouts. Accepted prices stay
        saved until their ticket hold ends.
      </p>
      <div role="status" aria-live="polite" className="checkout-note">
        {message}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void load(null)}>
          Reload codes
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !page?.nextAfter}
          onClick={() => void load(page?.nextAfter ?? null)}
        >
          Next codes
        </Button>
      </div>
      <ul className="grid gap-3" aria-label="Event promo codes">
        {page?.rows.map((p) => (
          <li key={p.id} className="rounded-lg border p-4">
            <strong className="break-all">{p.code}</strong>
            <p>
              {p.kind === "fixed"
                ? `$${(p.value / 100).toFixed(2)} USD off order`
                : `${(p.value / 100).toFixed(2)}% off`}{" "}
              · {p.enabled ? "Enabled" : "Disabled"} · v{p.version}
            </p>
            <p className="checkout-note">
              {p.ticketTypeId
                ? (page.tiers.find((t) => t.id === p.ticketTypeId)?.name ?? "Ticket tier")
                : "All USD tiers"}{" "}
              · {p.reserved} reserved · {p.consumed} consumed · limit{" "}
              {p.maxRedemptions ?? "unlimited"}
            </p>
            <p className="checkout-note">
              {new Date(p.startsAt).toLocaleString()} – {new Date(p.expiresAt).toLocaleString()} (
              {Intl.DateTimeFormat().resolvedOptions().timeZone})
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy || uncertain}
              onClick={() => edit(p)}
            >
              Edit {p.code}
            </Button>
          </li>
        ))}
      </ul>
      {page ? (
        <form
          className="checkout-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3>{editing ? `Edit ${editing.code}` : "Create a code"}</h3>
          <fieldset className="grid gap-3 border-0 p-0 min-w-0" disabled={busy || uncertain}>
            <label htmlFor="promo-admin-code">Code</label>
            <input
              id="promo-admin-code"
              required
              maxLength={32}
              autoComplete="off"
              pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,31}"
              value={draft.code}
              disabled={!!editing}
              onChange={(e) => change("code", e.target.value)}
            />
            <label htmlFor="promo-admin-tier">Ticket scope</label>
            <select
              id="promo-admin-tier"
              value={draft.ticketTypeId}
              disabled={!!editing}
              onChange={(e) => change("ticketTypeId", e.target.value)}
            >
              <option value="">All USD tiers in this event</option>
              {page.tiers
                .filter((t) => t.currency === "usd")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.active ? "" : " (inactive)"}
                  </option>
                ))}
            </select>
            <p className="checkout-note">
              Code and scope stay fixed after creation. Create a different code to change either.
            </p>
            <label htmlFor="promo-admin-kind">Discount type</label>
            <select
              id="promo-admin-kind"
              value={draft.kind}
              onChange={(e) => change("kind", e.target.value as "fixed" | "percentage")}
            >
              <option value="fixed">USD off the whole order</option>
              <option value="percentage">Percentage off</option>
            </select>
            <label htmlFor="promo-admin-value">
              {draft.kind === "fixed" ? "Discount in USD" : "Discount percentage"}
            </label>
            <input
              id="promo-admin-value"
              required
              type="text"
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,2})?"
              value={draft.discount}
              onChange={(e) => change("discount", e.target.value)}
            />
            <p className="checkout-note">
              Up to two decimal places. Purchases must still total at least $0.50 USD; free and
              100%-off purchases are not supported.
            </p>
            <label htmlFor="promo-admin-start">
              Starts ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            </label>
            <input
              id="promo-admin-start"
              required
              type="datetime-local"
              step="1"
              value={draft.startsAt}
              onChange={(e) => change("startsAt", e.target.value)}
            />
            <label htmlFor="promo-admin-end">
              Expires ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            </label>
            <input
              id="promo-admin-end"
              required
              type="datetime-local"
              step="1"
              value={draft.expiresAt}
              onChange={(e) => change("expiresAt", e.target.value)}
            />
            <label htmlFor="promo-admin-limit">Maximum purchases (blank means unlimited)</label>
            <input
              id="promo-admin-limit"
              type="text"
              inputMode="numeric"
              pattern="[1-9][0-9]*"
              value={draft.limit}
              onChange={(e) => change("limit", e.target.value)}
            />
            <label htmlFor="promo-admin-enabled">Availability for new quotes</label>
            <select
              id="promo-admin-enabled"
              value={String(draft.enabled)}
              onChange={(e) => change("enabled", e.target.value === "true")}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
            <Button type="submit">
              {busy ? "Saving…" : editing ? "Save changes" : "Create TEST code"}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setDraft(fresh());
                }}
              >
                Cancel editing
              </Button>
            ) : null}
          </fieldset>
        </form>
      ) : null}
    </section>
  );
}
