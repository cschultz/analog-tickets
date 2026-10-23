import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/public-supabase-client";
import {
  getTicketTypeRefundPolicy,
  setTicketTypeRefundPolicy,
} from "@/lib/refund-policy.functions";
import {
  CONTROL_LABEL,
  displayedSetting,
  INVALID_SELECTION_MESSAGE,
  isUuid,
  LOAD_LABEL,
  NOT_PERMITTED_MESSAGE,
  refundableStateLabel,
  SAVE_LABEL,
  SAVING_MESSAGE,
  saveResultMessage,
  SCOPE_LINES,
  UNAVAILABLE_MESSAGE,
  type SaveResultKind,
} from "@/lib/refund-policy-ui-core";

const TITLE = "Analog Tickets — Staging Ticket Type Refundability";
const DESCRIPTION =
  "Private authenticated staging screen for the admin refundability setting on a ticket type. It affects future sales only and never changes tickets already issued.";

export const Route = createFileRoute("/staging/admin/ticket-type-policy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StagingTicketTypePolicy,
});

type Screen =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "loaded"; ticketTypeId: string; isRefundable: boolean };

type Save = { kind: "idle" } | { kind: "saving" } | { kind: "done"; result: SaveResultKind };

function StagingTicketTypePolicy() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [save, setSave] = useState<Save>({ kind: "idle" });
  const version = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const generation = version;
    const initialVersion = generation.current;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && generation.current === initialVersion) setSignedIn(Boolean(data.session));
      } catch {
        if (!cancelled && generation.current === initialVersion) setSignedIn(false);
      }
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      ++generation.current;
      setSignedIn(Boolean(session));
      setScreen({ kind: "idle" });
      setSave({ kind: "idle" });
    });
    return () => {
      cancelled = true;
      ++generation.current;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    if (screen.kind === "loading" || saving.current) return;
    const requestVersion = ++version.current;
    setSave({ kind: "idle" });
    if (!signedIn) {
      setScreen({ kind: "denied" });
      return;
    }
    const selectedId = ticketTypeId.trim();
    if (!isUuid(selectedId)) {
      setScreen({ kind: "invalid" });
      return;
    }
    setScreen({ kind: "loading" });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (version.current !== requestVersion) return;
      if (!token) {
        setScreen({ kind: "denied" });
        return;
      }
      const response = await getTicketTypeRefundPolicy({
        data: { ticketTypeId: selectedId },
        headers: { authorization: `Bearer ${token}` },
      });
      if (version.current === requestVersion) {
        setScreen({
          kind: "loaded",
          ticketTypeId: selectedId,
          isRefundable: displayedSetting(response?.isRefundable),
        });
      }
    } catch {
      // Unauthenticated, nonmember, box_office, unknown ticket type, or
      // transport: one generic denial, no raw error text, no backend detail.
      if (version.current === requestVersion) setScreen({ kind: "denied" });
    }
  }

  async function handleSave(next: boolean) {
    if (screen.kind !== "loaded" || !signedIn || saving.current) return;
    const requestVersion = version.current;
    const selectedId = screen.ticketTypeId;
    saving.current = true;
    setSave({ kind: "saving" });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (version.current !== requestVersion) return;
      if (!token) {
        setSave({ kind: "done", result: "denied" });
        return;
      }
      const response = await setTicketTypeRefundPolicy({
        data: { ticketTypeId: selectedId, isRefundable: next },
        headers: { authorization: `Bearer ${token}` },
      });
      if (version.current !== requestVersion) return;
      const applied = displayedSetting(response?.isRefundable);
      setScreen({ kind: "loaded", ticketTypeId: selectedId, isRefundable: applied });
      setSave({ kind: "done", result: "saved" });
    } catch {
      if (version.current === requestVersion) setSave({ kind: "done", result: "denied" });
    } finally {
      saving.current = false;
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-6 py-12 text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">{TITLE}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Private staging surface for event organizers and admins. It reads and sets one setting on
        one ticket type. The server re-checks permission on every request.
      </p>

      <section aria-labelledby="scope-heading" className="mt-8">
        <h2 id="scope-heading" className="text-base font-medium">
          What this changes
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {SCOPE_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {signedIn === false ? (
        <p role="status" className="mt-8 text-sm font-medium">
          {NOT_PERMITTED_MESSAGE}
        </p>
      ) : null}

      <section aria-labelledby="type-heading" className="mt-8">
        <h2 id="type-heading" className="text-base font-medium">
          Choose a ticket type
        </h2>
        <form onSubmit={handleLoad} className="mt-3 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Ticket type ID</span>
            <input
              value={ticketTypeId}
              onChange={(e) => {
                ++version.current;
                setTicketTypeId(e.target.value);
                setScreen({ kind: "idle" });
                setSave({ kind: "idle" });
              }}
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={!signedIn || screen.kind === "loading"}
              className="rounded border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {screen.kind === "loading" ? "Loading…" : LOAD_LABEL}
            </button>
          </div>
        </form>

        {screen.kind === "invalid" ? (
          <p role="status" className="mt-4 text-sm">
            {INVALID_SELECTION_MESSAGE}
          </p>
        ) : null}
        {screen.kind === "denied" ? (
          <p role="status" className="mt-4 text-sm font-medium">
            {NOT_PERMITTED_MESSAGE}
          </p>
        ) : null}
        {screen.kind === "unavailable" ? (
          <p role="status" className="mt-4 text-sm font-medium">
            {UNAVAILABLE_MESSAGE}
          </p>
        ) : null}
      </section>

      {screen.kind === "loaded" ? (
        <section aria-labelledby="setting-heading" className="mt-8">
          <h2 id="setting-heading" className="text-base font-medium">
            Refundability for future sales
          </h2>
          <div className="mt-3 flex items-center gap-3">
            <input
              id="refundable"
              type="checkbox"
              role="switch"
              aria-describedby="refundable-state"
              checked={screen.isRefundable}
              disabled={save.kind === "saving"}
              onChange={(e) => void handleSave(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="refundable" className="text-sm font-medium">
              {CONTROL_LABEL}
            </label>
          </div>
          <p id="refundable-state" role="status" className="mt-2 text-sm">
            {refundableStateLabel(screen.isRefundable)}
          </p>
          <div className="mt-3">
            <button
              type="button"
              disabled={save.kind === "saving"}
              onClick={() => void handleSave(screen.isRefundable)}
              className="rounded border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {save.kind === "saving" ? SAVING_MESSAGE : SAVE_LABEL}
            </button>
          </div>
          {save.kind === "done" ? (
            <p role="status" className="mt-3 text-sm font-medium">
              {saveResultMessage(save.result)}
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
