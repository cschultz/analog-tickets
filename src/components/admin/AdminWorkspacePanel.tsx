import { useCallback, useEffect, useRef, useState } from "react";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminStatCard } from "./AdminCard";
import { AdminCapacityTracker } from "./AdminCapacityTracker";
import { AdminPageHeader } from "./AdminPageHeader";
import { StatusPill } from "./StatusPill";
import { OrganizerSalesReport } from "./OrganizerSalesReport";
import type { ReportWindow } from "@/lib/organizer-report-core";
import { organizerMoney } from "@/lib/organizer-order-detail-core";
import { catalogDate } from "@/lib/event-catalog-core";
import { catalogReview } from "@/lib/admin-catalog-review";
import {
  parseWorkspaceInput,
  type AdminWorkspace,
  type WorkspaceInput,
  type WorkspaceResult,
  type WorkspaceError,
  type AdminTier,
} from "@/lib/admin-workspace-core";
import { adminWorkspace } from "@/lib/admin-workspace.functions";
import { supabase } from "@/lib/public-supabase-client";

export type CatalogSection = "dashboard" | "reports" | "event" | "tickets" | "inventory";
const errors: Record<WorkspaceError, string> = {
  invalid_request: "Check the required fields, dates, USD price and finite capacity.",
  unavailable:
    "This workspace is unavailable. Reload to check the current state before another change.",
  setup_required:
    "The reviewed TEST workspace extension is not installed. The existing order and promotion tools remain available.",
  writes_disabled: "Catalog editing is disabled on this installation.",
  version_conflict:
    "This record changed, possibly because ticket stock was reserved. Reload before editing again.",
  capacity_below_committed: "Capacity cannot be below the reserved-or-sold quantity.",
  slug_taken: "That ticket slug already exists. Reload and choose another slug.",
  immutable_slug: "Existing ticket slugs cannot be changed.",
  too_many_tiers:
    "More than 200 ticket tiers are configured; this editor cannot display them completely.",
};
const utcInput = (value: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
const utcValue = (value: string, original: string | null) =>
  value === utcInput(original) ? original : value ? new Date(value + "Z").toISOString() : null;

export function AdminWorkspacePanel({
  eventId,
  userId,
  section,
}: {
  eventId: string;
  userId: string;
  section: CatalogSection;
}) {
  const request = useCallback(
    async (input: WorkspaceInput): Promise<WorkspaceResult> => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || data.session.user.id !== userId)
        return { ok: false, code: "unavailable" };
      return adminWorkspace({
        data: input,
        headers: { authorization: `Bearer ${data.session.access_token}` },
      });
    },
    [userId],
  );
  return (
    <AdminWorkspaceController
      key={`${userId}:${eventId}:${section}`}
      eventId={eventId}
      section={section}
      request={request}
    />
  );
}
export function AdminWorkspaceController({
  eventId,
  section,
  request,
}: {
  eventId: string;
  section: CatalogSection;
  request: (input: WorkspaceInput) => Promise<WorkspaceResult>;
}) {
  const [workspace, setWorkspace] = useState<AdminWorkspace | null>(null),
    [canEdit, setCanEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [message, setMessage] = useState("Loading event workspace…"),
    [review, setReview] = useState<WorkspaceInput | null>(null);
  const generation = useRef(0),
    pending = useRef(false);
  const [reportWindow, setReportWindow] = useState<ReportWindow>();
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const reviewOrigin = useRef<HTMLElement | null>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const hadReview = useRef(false),
    returnFocus = useRef(false);
  const preview = workspace && review ? catalogReview(workspace, review) : null;
  useEffect(() => {
    if (review) confirmationHeading.current?.focus();
    else if (hadReview.current) returnFocus.current = true;
    if (!review && !busy && returnFocus.current) {
      (reviewOrigin.current?.isConnected ? reviewOrigin.current : reloadButton.current)?.focus();
      returnFocus.current = false;
    }
    hadReview.current = !!review;
  }, [review, busy]);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setWorkspace(null);
    setReview(null);
    setMessage("Loading event workspace…");
    const g = ++generation.current;
    try {
      const result = await request({ action: "read", eventId });
      if (g !== generation.current) return;
      if (result.ok && result.action === "read") {
        setWorkspace(result.workspace);
        setCanEdit(result.canEdit);
        setLocked(false);
        setMessage("Workspace loaded. Amounts are recorded TEST application data.");
      } else setMessage(!result.ok ? errors[result.code] : "Workspace could not be loaded.");
    } catch {
      if (g === generation.current)
        setMessage("Workspace could not be loaded. Reload to try again.");
    } finally {
      if (g === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }, [eventId, request]);
  useEffect(() => {
    const invalidate = () => {
      generation.current += 1;
      pending.current = false;
    };
    void load();
    return invalidate;
  }, [load]);
  async function save() {
    if (
      pending.current ||
      !review ||
      !preview ||
      !preview.changes.length ||
      preview.blocked ||
      locked ||
      !canEdit
    )
      return;
    pending.current = true;
    setBusy(true);
    const g = ++generation.current;
    setMessage("Saving reviewed TEST changes…");
    try {
      const result = await request(review);
      if (g !== generation.current) return;
      setReview(null);
      if (result.ok && result.action === "saved") {
        setLocked(true);
        setWorkspace(null);
        setMessage("Saved. Refreshing current records without repeating the save…");
        // A confirmed write gets exactly one read-only refresh. A failed refresh
        // is not an uncertain write and must never trigger another command.
        try {
          const refreshed = await request({ action: "read", eventId });
          if (g !== generation.current) return;
          if (refreshed.ok && refreshed.action === "read") {
            setWorkspace(refreshed.workspace);
            setCanEdit(refreshed.canEdit);
            setLocked(false);
            setMessage(
              "Saved and current records refreshed. Existing purchases were not repriced.",
            );
          } else
            setMessage(
              "Saved, but current records could not be refreshed. Reload workspace (read-only); do not repeat the save.",
            );
        } catch {
          if (g === generation.current)
            setMessage(
              "Saved, but current records could not be refreshed. Reload workspace (read-only); do not repeat the save.",
            );
        }
      } else {
        setLocked(true);
        setMessage(
          !result.ok
            ? errors[result.code]
            : "The save outcome is uncertain. Reload before another change.",
        );
      }
    } catch {
      if (g === generation.current) {
        setLocked(true);
        setReview(null);
        setMessage(
          "The save outcome is uncertain. Reload to inspect current state; no automatic retry was made.",
        );
      }
    } finally {
      if (g === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section className="admin-workspace-panel">
      <button
        ref={reloadButton}
        type="button"
        className="admin-secondary-button"
        disabled={busy}
        onClick={() => void load()}
      >
        Reload workspace
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {workspace ? (
        <AdminWorkspaceView
          workspace={workspace}
          section={section}
          canEdit={canEdit && !locked && !busy && !review}
          editingConfigured={canEdit}
          reportWindow={reportWindow}
          onReportWindow={setReportWindow}
          onReview={(input) => {
            const parsed = parseWorkspaceInput(input);
            const next = parsed && workspace ? catalogReview(workspace, parsed) : null;
            if (next && !next.changes.length) {
              setMessage("No changes to save. Edit a field before reviewing again.");
            } else if (parsed && next) {
              reviewOrigin.current = document.activeElement as HTMLElement | null;
              setReview(parsed);
              setMessage("Review the proposed changes, then confirm once.");
            } else setMessage(errors.invalid_request);
          }}
        />
      ) : null}
      {review && preview && review.action !== "read" ? (
        <section className="admin-change-review" aria-labelledby="catalog-confirm-heading">
          <h2 id="catalog-confirm-heading" ref={confirmationHeading} tabIndex={-1}>
            Confirm TEST catalog changes
          </h2>
          <p>
            <strong>{workspace?.event.name}</strong>
            {preview.subject !== workspace?.event.name ? ` · ${preview.subject}` : ""}
          </p>
          <p>
            {review.action === "save_event"
              ? "Update the selected event details"
              : "Save this ticket tier"}
            . No existing order or saved price quote is repriced.
          </p>
          <p>Only changed fields</p>
          <dl className="admin-catalog-diff" aria-label="Catalog change comparison">
            {preview.changes.map((change) => (
              <div key={change.label}>
                <dt>{change.label}</dt>
                <dd>
                  <span>Current</span>
                  <span>{change.before}</span>
                </dd>
                <dd>
                  <span>Proposed</span>
                  <span>{change.after}</span>
                </dd>
              </div>
            ))}
          </dl>
          {preview.schedule ? (
            <p>
              Schedule after change: {preview.schedule.starts} → {preview.schedule.ends}. Changing
              timezone alone does not move the saved instants.
            </p>
          ) : null}
          {preview.committed !== null ? (
            <p>
              Currently {preview.committed} reserved or sold. The server rechecks committed stock
              and this record’s version before saving.
            </p>
          ) : null}
          {preview.blocked ? <p role="alert">{preview.blocked}</p> : null}
          <button
            type="button"
            className="admin-primary-button"
            disabled={busy || !!preview.blocked || !preview.changes.length}
            onClick={() => void save()}
          >
            Confirm and save TEST changes
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setReview(null);
              setMessage("Review cancelled. No changes were saved; the draft remains editable.");
            }}
          >
            Cancel changes
          </button>
        </section>
      ) : null}
    </section>
  );
}

export function AdminWorkspaceView({
  workspace: w,
  section,
  canEdit,
  editingConfigured = canEdit,
  onReview,
  reportWindow,
  onReportWindow,
}: {
  workspace: AdminWorkspace;
  section: CatalogSection;
  canEdit: boolean;
  editingConfigured?: boolean;
  onReview: (v: WorkspaceInput) => void;
  reportWindow?: ReportWindow | undefined;
  onReportWindow?: ((window: ReportWindow) => void) | undefined;
}) {
  const [editing, setEditing] = useState<AdminTier | null | undefined>(undefined);
  const event = w.event;
  if (section === "reports")
    return (
      <OrganizerSalesReport workspace={w} initialWindow={reportWindow} onWindow={onReportWindow} />
    );
  if (section === "dashboard")
    return (
      <>
        <AdminPageHeader title="Dashboard" subtitle={event.name} />
        <p>
          All-time TEST data for this event. Original totals are not net revenue, deposits or a live
          Stripe balance.
        </p>
        <div className="admin-metrics">
          <AdminStatCard
            label="Original paid order totals"
            value={organizerMoney(w.summary.originalPaidCents)}
          />
          <AdminStatCard label="Paid or refunded orders" value={w.summary.paidOrders} />
          <AdminStatCard label="Valid tickets" value={w.attendance.validTickets} />
          <AdminStatCard
            label="Checked in"
            value={`${w.attendance.checkedIn} / ${w.attendance.validTickets}`}
          />
        </div>
        <div className="admin-detail-grid">
          <AdminCard>
            <AdminCardHeader>
              <h2>Order and refund context</h2>
            </AdminCardHeader>
            <AdminCardContent>
              <p>
                {w.summary.pendingOrders} pending · {w.summary.cancelledOrders} cancelled ·{" "}
                {w.attendance.voidTickets} void tickets
              </p>
              <p>
                Recorded refund reversals: {organizerMoney(w.refunds.knownCents)} across{" "}
                {w.refunds.records} records.
              </p>
              <p>
                {w.refunds.unknownAmounts} records have an unknown amount/currency. Pending or
                failed refund attempts are not included. No net total is inferred.
              </p>
            </AdminCardContent>
          </AdminCard>
          <AdminCapacityTracker
            inventory={w.tiers.map((t) => ({
              ticket_type: t.name,
              total_quantity: t.capacity,
              sold_quantity: t.committed,
            }))}
          />
        </div>
      </>
    );
  if (section === "event")
    return (
      <>
        <AdminPageHeader
          title="Event Management"
          subtitle="Edit the selected event; account and publication settings stay unchanged"
        />
        <p>
          <StatusPill status={event.published ? "published" : "draft"} /> · Slug: {event.slug}
        </p>
        <p>
          New-event provisioning and its first organizer assignment remain installation-owner setup,
          not an event-scoped permission granted here.
        </p>
        <p>
          Event schedule:{" "}
          {event.startsAt ? catalogDate(event.startsAt, event.timezone) : "Not scheduled"} →{" "}
          {event.endsAt ? catalogDate(event.endsAt, event.timezone) : "Not scheduled"}.
        </p>
        <p className="checkout-note">
          Date inputs below are explicitly UTC. Event timezone controls display and report days;
          changing it alone does not move recorded start/end instants. Review shows the resulting
          event-local schedule.
        </p>
        {!editingConfigured ? (
          <p className="admin-readonly">
            Read-only until the reviewed TEST catalog extension and server write flag are enabled.
            No publishing control is supplied.
          </p>
        ) : null}
        <form
          className="checkout-form"
          key={event.revision}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              onReview({
                action: "save_event",
                eventId: event.id,
                revision: event.revision,
                values: {
                  name: String(f.get("name")),
                  description: String(f.get("description")),
                  venue: String(f.get("venue")),
                  timezone: String(f.get("timezone")),
                  startsAt: utcValue(String(f.get("startsAt")), event.startsAt),
                  endsAt: utcValue(String(f.get("endsAt")), event.endsAt),
                },
              });
            } catch {
              /* Native required/date controls plus parent parser handle invalid drafts. */
            }
          }}
        >
          <fieldset disabled={!canEdit}>
            <label>
              Event name
              <input name="name" required maxLength={160} defaultValue={event.name} />
            </label>
            <label>
              Description
              <textarea
                name="description"
                maxLength={4000}
                defaultValue={event.description ?? ""}
              />
            </label>
            <label>
              Venue
              <input name="venue" maxLength={200} defaultValue={event.venue ?? ""} />
            </label>
            <label>
              Event timezone
              <input name="timezone" required maxLength={100} defaultValue={event.timezone} />
            </label>
            <label>
              Starts (UTC)
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={utcInput(event.startsAt)}
              />
            </label>
            <label>
              Ends (UTC)
              <input name="endsAt" type="datetime-local" defaultValue={utcInput(event.endsAt)} />
            </label>
            <button className="admin-primary-button" type="submit">
              Review event changes
            </button>
          </fieldset>
        </form>
      </>
    );
  return (
    <>
      <AdminPageHeader
        title={section === "inventory" ? "Inventory" : "Ticket Management"}
        subtitle="Ticket tiers for the selected event"
      />
      <p>
        Reserved-or-sold stock includes held inventory. Availability is a snapshot, not a
        reservation guarantee. Expired holds may remain committed until the existing release
        workflow reconciles them.
      </p>
      {!editingConfigured ? (
        <p className="admin-readonly">Catalog editing is disabled. Reads do not enable writes.</p>
      ) : null}
      <div
        className="admin-table-scroll"
        role="region"
        tabIndex={0}
        aria-label="Ticket tier inventory"
      >
        <table>
          <caption>Ticket tiers and committed inventory</caption>
          <thead>
            <tr>
              <th scope="col">Ticket</th>
              <th scope="col">Price</th>
              <th scope="col">Capacity</th>
              <th scope="col">Reserved or sold</th>
              <th scope="col">Available</th>
              <th scope="col">State</th>
              <th scope="col">Manage</th>
            </tr>
          </thead>
          <tbody>
            {w.tiers.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.name}
                  <br />
                  <code>{t.slug}</code>
                </td>
                <td>{organizerMoney(t.priceCents)}</td>
                <td>{t.capacity ?? "Unbounded"}</td>
                <td>{t.committed}</td>
                <td>{t.capacity === null ? "Not available" : t.capacity - t.committed}</td>
                <td>
                  <StatusPill status={t.active ? "active" : "inactive"} />
                </td>
                <td>
                  <button disabled={!canEdit} onClick={() => setEditing(t)}>
                    Edit {t.name}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!w.tiers.length ? <p>No ticket tiers configured.</p> : null}
      <button
        type="button"
        className="admin-secondary-button"
        disabled={!canEdit}
        onClick={() => setEditing(null)}
      >
        Create ticket tier
      </button>
      {editing !== undefined ? (
        <TierEditor
          key={editing?.revision ?? "new"}
          eventId={event.id}
          tier={editing}
          disabled={!canEdit}
          onReview={onReview}
          onCancel={() => setEditing(undefined)}
        />
      ) : null}
    </>
  );
}
function TierEditor({
  eventId,
  tier,
  disabled,
  onReview,
  onCancel,
}: {
  eventId: string;
  tier: AdminTier | null;
  disabled: boolean;
  onReview: (v: WorkspaceInput) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="checkout-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          price = String(f.get("price"));
        const cents = /^\d{1,6}(?:\.\d{1,2})?$/.test(price) ? Math.round(Number(price) * 100) : NaN;
        onReview({
          action: "save_tier",
          eventId,
          id: tier?.id ?? null,
          revision: tier?.revision ?? null,
          values: {
            name: String(f.get("name")),
            slug: String(f.get("slug")),
            priceCents: cents,
            capacity: Number(f.get("capacity")),
            maxPerOrder: Number(f.get("max")),
            active: f.get("active") === "on",
          },
        });
      }}
    >
      <h2>{tier ? "Edit ticket tier" : "Create ticket tier"}</h2>
      <p>
        Existing slugs, currency, refundability snapshots and committed-stock counters are not
        editable. No free tickets or live sales are enabled here.
      </p>
      <fieldset disabled={disabled}>
        <label>
          Ticket name
          <input name="name" required maxLength={160} defaultValue={tier?.name ?? ""} />
        </label>
        <label>
          Ticket slug
          <input
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]{0,79}"
            maxLength={80}
            readOnly={!!tier}
            defaultValue={tier?.slug ?? ""}
          />
        </label>
        <label>
          Price (USD)
          <input
            name="price"
            required
            inputMode="decimal"
            pattern="[0-9]{1,6}(\.[0-9]{1,2})?"
            defaultValue={tier ? (tier.priceCents / 100).toFixed(2) : ""}
          />
        </label>
        <label>
          Finite total capacity
          <input
            name="capacity"
            required
            type="number"
            min={tier?.committed ?? 0}
            max={999999999}
            step="1"
            defaultValue={tier?.capacity ?? ""}
          />
        </label>
        <label>
          Maximum per order
          <input
            name="max"
            required
            type="number"
            min="1"
            max="10"
            step="1"
            defaultValue={tier?.maxPerOrder ?? 4}
          />
        </label>
        <label>
          <input name="active" type="checkbox" defaultChecked={tier?.active ?? false} /> Available
          for new TEST sales
        </label>
        <button type="submit" className="admin-primary-button">
          Review ticket changes
        </button>
        <button type="button" onClick={onCancel}>
          Cancel editing
        </button>
      </fieldset>
    </form>
  );
}
