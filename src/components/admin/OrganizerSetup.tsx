import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/public-supabase-client";
import { getOrganizerSetup } from "@/lib/organizer-setup.functions";
import { adminWorkspace } from "@/lib/admin-workspace.functions";
import { getBoxOfficeSurfaceState } from "@/lib/box-office.functions";
import { listEventReconciliationCases } from "@/lib/reconciliation-visibility.functions";
import {
  parseSetupResult,
  setupReconciliationCount,
  type SetupConfiguration,
} from "@/lib/organizer-setup-core";
import { object, parseAdminWorkspace } from "@/lib/admin-workspace-core";
import type { OrganizerSection } from "@/lib/organizer-navigation";
import { AdminCard, AdminCardContent, AdminCardHeader } from "./AdminCard";

export interface SetupReads {
  configuration: unknown;
  workspace: unknown;
  door: unknown;
  cases: unknown;
}
const emptyReads = (): SetupReads => ({
  configuration: null,
  workspace: null,
  door: null,
  cases: null,
});
export function OrganizerSetup({
  eventId,
  userId,
  onSection,
}: {
  eventId: string;
  userId: string;
  onSection: (section: OrganizerSection) => void;
}) {
  const request = useCallback(async (): Promise<SetupReads> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session || data.session.user.id !== userId) throw Error("Session changed");
    const headers = { authorization: `Bearer ${data.session.access_token}` };
    const results = await Promise.allSettled([
      getOrganizerSetup({ data: { eventId }, headers }),
      adminWorkspace({ data: { action: "read", eventId }, headers }),
      getBoxOfficeSurfaceState({ headers }),
      listEventReconciliationCases({ data: { eventId }, headers }),
    ]);
    const value = (index: number) => {
      const result = results[index]!;
      return result.status === "fulfilled" ? result.value : null;
    };
    return { configuration: value(0), workspace: value(1), door: value(2), cases: value(3) };
  }, [eventId, userId]);
  return <OrganizerSetupController eventId={eventId} request={request} onSection={onSection} />;
}
export function OrganizerSetupController({
  eventId,
  request,
  onSection,
}: {
  eventId: string;
  request: () => Promise<SetupReads>;
  onSection: (section: OrganizerSection) => void;
}) {
  const [reads, setReads] = useState<SetupReads | null>(null),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState("Reading setup and operational status…");
  const generation = useRef(0),
    pending = useRef(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setReads(null);
    setMessage("Reading setup and operational status…");
    const current = ++generation.current;
    try {
      const result = await request();
      if (generation.current === current) {
        setReads(result);
        setMessage(
          "Read-only checks completed. Each result below has its own evidence and limits.",
        );
      }
    } catch {
      if (generation.current === current) {
        setReads(emptyReads());
        setMessage(
          "Setup reads could not be completed. Check your current account and retry; nothing was changed.",
        );
      }
    } finally {
      if (generation.current === current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }, [request]);
  useEffect(() => {
    const invalidate = () => {
      ++generation.current;
      pending.current = false;
    };
    void load();
    return invalidate;
  }, [load]);
  return (
    <section className="admin-setup">
      <p>
        Configuration is not proof of delivery. This page reads existing TEST settings and
        application records only. It cannot change settings, grant access, send email, create a
        payment, retry a delivery or submit a refund.
      </p>
      <button
        type="button"
        className="admin-secondary-button"
        disabled={busy}
        onClick={() => void load()}
      >
        Refresh read-only checks
      </button>
      {busy ? (
        <button
          type="button"
          className="admin-secondary-button"
          onClick={() => {
            ++generation.current;
            pending.current = false;
            setBusy(false);
            setReads(null);
            setMessage(
              "Stopped waiting in this view. In-flight read-only checks may finish independently; their results will be ignored. Refresh when ready.",
            );
          }}
        >
          Stop waiting for reads
        </button>
      ) : null}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {reads ? <OrganizerSetupView eventId={eventId} reads={reads} onSection={onSection} /> : null}
    </section>
  );
}
const settingRows: {
  key: Exclude<keyof SetupConfiguration, "eventId" | "mode">;
  label: string;
  guidance: string;
}[] = [
  {
    key: "checkout",
    label: "Restricted Stripe TEST checkout",
    guidance:
      "Check STRIPE_TEST_RESTRICTED_KEY and STAGING_ALLOWED_ORIGIN with the installation owner. The key must remain TEST-only; the allowed origin must be the exact HTTPS host.",
  },
  {
    key: "webhook",
    label: "Required webhook verification setting",
    guidance:
      "Check STRIPE_TEST_WEBHOOK_SECRET. The deployed endpoint and signed event delivery still need separate verification; this page never sends or replays an event.",
  },
  {
    key: "email",
    label: "Mailtrap Email Testing sandbox",
    guidance:
      "Check Mailtrap Email Testing mode, API token, account/inbox IDs, synthetic sender and recipient domain. Keep existing TEST credentials in secure settings or 1Password, not chat or source.",
  },
  {
    key: "recovery",
    label: "Guest receipt and recovery configuration",
    guidance:
      "Check GUEST_CHECKOUT_SANDBOX_MODE, GUEST_RECOVERY_SANDBOX_MODE, HTTPS origin and the Mailtrap TEST settings. This guest flow requires the example.test recipient domain.",
  },
  {
    key: "promotions",
    label: "Promotion pricing module",
    guidance:
      "PROMOTION_PRICING_SANDBOX_MODE controls this optional module. Configuration alone does not verify quote/schema installation or pricing acceptance.",
  },
];
export function OrganizerSetupView({
  eventId,
  reads,
  onSection,
}: {
  eventId: string;
  reads: SetupReads;
  onSection: (section: OrganizerSection) => void;
}) {
  const setup = parseSetupResult(reads.configuration, eventId);
  const response = object(reads.workspace);
  const workspace =
    response?.["ok"] === true &&
    response["action"] === "read" &&
    typeof response["canEdit"] === "boolean"
      ? parseAdminWorkspace(response["workspace"], eventId)
      : null;
  const door = object(reads.door);
  const doorKnown =
    typeof door?.["enabled"] === "boolean" &&
    typeof door["authorized"] === "boolean" &&
    (door["enabled"] || !door["authorized"]);
  const cases = setupReconciliationCount(reads.cases);
  const delivery = setup?.ok ? setup.delivery : null;
  return (
    <>
      <div className="admin-setup-grid">
        <AdminCard>
          <AdminCardHeader>
            <h2>Organizer workspace</h2>
          </AdminCardHeader>
          <AdminCardContent>
            <p className="admin-setup-state">
              {workspace
                ? "Extension read succeeded"
                : response?.["code"] === "setup_required"
                  ? "Extension setup required"
                  : "Workspace read unavailable"}
            </p>
            {workspace ? (
              <>
                <p>
                  Current event: <strong>{workspace.event.name}</strong>. Catalog editing is{" "}
                  {response?.["canEdit"] ? "configured" : "disabled"}; no write was tested.
                </p>
                <p>
                  Event catalog is{" "}
                  {workspace.event.published
                    ? "marked published in application data"
                    : "draft/unpublished in application data"}
                  . This is not a host-publication or reachability check.
                </p>
                <p>
                  {workspace.tiers.filter((t) => t.active).length} active ticket tiers;{" "}
                  {
                    workspace.tiers.filter(
                      (t) => t.active && t.capacity !== null && t.capacity > t.committed,
                    ).length
                  }{" "}
                  with currently available finite capacity. Inventory is a snapshot, not a
                  reservation.
                </p>
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => onSection("event")}
                >
                  Review event setup
                </button>
              </>
            ) : (
              <p>
                The installation owner should inspect the reviewed workspace extension and TEST
                flags. A missing extension is setup work, not proof of a provider failure. This page
                does not apply SQL.
              </p>
            )}
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader>
            <h2>TEST service configuration</h2>
          </AdminCardHeader>
          <AdminCardContent>
            {setup?.ok ? (
              <>
                <p>
                  Server confirmed TEST mode. These are format/configuration checks, not provider
                  acceptance.
                </p>
                <dl className="admin-setup-settings">
                  {settingRows.map((row) => (
                    <div key={row.key}>
                      <dt>{row.label}</dt>
                      <dd>
                        <strong>
                          {setup.configuration[row.key] === "configured"
                            ? "Configured · not provider-verified"
                            : setup.configuration[row.key] === "disabled"
                              ? "Disabled"
                              : "Missing or invalid setup"}
                        </strong>
                        <details open={setup.configuration[row.key] === "needs_setup"}>
                          <summary>Settings to inspect</summary>
                          <p>{row.guidance}</p>
                        </details>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p>
                {setup && !setup.ok && setup.code === "test_mode_required"
                  ? "TEST mode is not configured. The installation owner must check PAYMENTS_TEST_MODE and PAYMENT_PROVIDER; no service settings or delivery state were exposed."
                  : "Configuration read unavailable. Retry with your current organizer account; do not assume the services are configured or rotate credentials just because this read failed."}
              </p>
            )}
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader>
            <h2>Receipt delivery records</h2>
          </AdminCardHeader>
          <AdminCardContent>
            {delivery?.state === "available" ? (
              <>
                <p className="admin-setup-state">
                  {delivery.uncertain || delivery.sending
                    ? "Unconfirmed delivery work needs inspection"
                    : delivery.pending
                      ? "Queued receipt work"
                      : delivery.sent
                        ? "Recorded send acknowledgments"
                        : "No receipt work recorded"}
                </p>
                <p>
                  {delivery.pending} pending · {delivery.sending} sending/unconfirmed ·{" "}
                  {delivery.sent} recorded sent · {delivery.uncertain} uncertain.
                </p>
                <p>
                  Counts cover this event's complete read, up to 1,000 receipt rows. “Sent” is an
                  application acknowledgment, not independent inbox proof. Pending work is not a
                  confirmed failure; sending/uncertain outcomes must be inspected before any resend.
                </p>
              </>
            ) : (
              <p>
                {delivery?.state === "setup_required"
                  ? "Receipt table/relationship setup is missing. This is not a failed send."
                  : "Delivery history unavailable or outside this bounded read. Do not interpret that as an empty or healthy queue."}
              </p>
            )}
            <p>
              Mailbox capture, actual recipient access and external delivery are not verified here.
              No messages are sent or retried.
            </p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader>
            <h2>Door access and refund exceptions</h2>
          </AdminCardHeader>
          <AdminCardContent>
            <p>
              {!doorKnown
                ? "Door access read unavailable."
                : !door?.["enabled"]
                  ? "Box Office module is disabled."
                  : door["authorized"]
                    ? "Existing door-surface access confirmed for the single-event pilot."
                    : "Box Office is enabled, but this account is not authorized for the single-event pilot."}
            </p>
            <p>
              The pilot requires access to exactly one eligible event. This read does not scan a
              pass, test camera hardware or grant a role.
            </p>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => onSection("check-in")}
            >
              Review check-in options
            </button>
            <p className="admin-setup-state">
              {cases === null
                ? "Refund exception read unavailable"
                : cases
                  ? `${cases} unresolved refund case${cases === 1 ? " requires" : "s require"} inspection`
                  : "No unresolved refund cases in this complete application read"}
            </p>
            <p>
              Unknown or incomplete reads are not a zero-case result. The installation owner must
              reconcile unresolved outcomes; this page cannot recover, retry or resolve them.
            </p>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => onSection("orders")}
            >
              Open order support
            </button>
          </AdminCardContent>
        </AdminCard>
      </div>
      <aside className="admin-check-in-limits" aria-label="Readiness limits">
        <h2>Not a release or live-money certificate</h2>
        <p>
          Provider key permissions, hosted webhook ingress, end-to-end receipt/recovery,
          payment/refund reconciliation and physical-camera behavior are not proven by settings or
          an empty queue. Use separately authorized TEST acceptance evidence for those journeys. No
          live funds, real recipients, account changes or publication are enabled here.
        </p>
      </aside>
    </>
  );
}
