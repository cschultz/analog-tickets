import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/public-supabase-client";
import { isUuid, type RefundEligibilityResult } from "@/lib/refund-eligibility-core";
import { getTicketRefundEligibility } from "@/lib/refund-eligibility.functions";
import { executeTicketRefundCommand } from "@/lib/refund-command.functions";
import { listEventReconciliationCases } from "@/lib/reconciliation-visibility.functions";
import {
  ACTION_LABEL,
  ACTION_RESULT_MESSAGE,
  actionResultKind,
  canRefundSelection,
  CONFIRM_CANCEL_LABEL,
  CONFIRM_TITLE,
  CONFIRM_YES_LABEL,
  confirmMessage,
  EMPTY_RESULT_MESSAGE,
  MAX_TICKET_SELECTION,
  NOT_PERMITTED_MESSAGE,
  POLICY_LINES,
  parseTicketIdSelection,
  reasonLabel,
  refundabilityLabel,
  SELECTION_MESSAGE,
  summarizeResults,
  UNAVAILABLE_MESSAGE,
  RECONCILIATION_EMPTY_MESSAGE,
  RECONCILIATION_HEADING,
  RECONCILIATION_INTRO,
  RECONCILIATION_LOADING_MESSAGE,
  RECONCILIATION_RUNBOOK_REFERENCE,
  RECONCILIATION_UNAVAILABLE_MESSAGE,
  reconciliationReasonLabel,
  reconciliationStateLabel,
  shouldResetRefundReviewForAuthChange,
  type ActionResultKind,
  type ReconciliationCaseView,
  type SelectionErrorCode,
} from "@/lib/refund-review-core";

const TITLE = "Analog Tickets — Staging Refund Review";
const DESCRIPTION =
  "Private authenticated staging screen that reviews per-ticket refund eligibility and requires confirmation before an authorized refund command.";

export const Route = createFileRoute("/staging/admin/refund-review")({
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
  component: StagingRefundReview,
});

/**
 * Gate 94 action states. `done` is terminal for the reviewed selection: the
 * button is not re-offered, so a second click cannot start a second command.
 */
type Action =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "submitting" }
  | { kind: "done"; result: ActionResultKind };

/**
 * Gate 97 read-only visibility state. It is deliberately independent of the
 * review `Screen`: it can never change eligibility, enable the action, or
 * contribute a ticket id to the refund command's input.
 */
type Recon =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "loaded"; cases: ReconciliationCaseView[] };

type Screen =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "selection_error"; code: SelectionErrorCode }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "results"; eventId: string; results: RefundEligibilityResult[] };

function StagingRefundReview() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [eventId, setEventId] = useState("");
  const [ticketIdsRaw, setTicketIdsRaw] = useState("");
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [action, setAction] = useState<Action>({ kind: "idle" });
  const [recon, setRecon] = useState<Recon>({ kind: "idle" });
  const [inFlight, setInFlight] = useState(false);
  // Guards a double submit even if two clicks land before React re-renders.
  const submitting = useRef(false);
  const version = useRef(0);
  const authUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const generation = version;
    const initialVersion = generation.current;
    const applyAuthSession = (session: { user?: { id?: string } } | null) => {
      const nextUserId = session?.user?.id ?? null;
      if (shouldResetRefundReviewForAuthChange(authUserId.current, nextUserId)) {
        authUserId.current = nextUserId;
        ++generation.current;
        setScreen({ kind: "idle" });
        setAction({ kind: "idle" });
        setRecon({ kind: "idle" });
        setEventId("");
        setTicketIdsRaw("");
      }
      setSignedIn(nextUserId !== null);
    };
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && generation.current === initialVersion) applyAuthSession(data.session);
      } catch {
        if (!cancelled && generation.current === initialVersion) applyAuthSession(null);
      }
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => applyAuthSession(session));
    return () => {
      cancelled = true;
      ++generation.current;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (screen.kind === "loading" || submitting.current) return;
    const requestVersion = ++version.current;
    setAction({ kind: "idle" });
    if (!signedIn) {
      setScreen({ kind: "denied" });
      return;
    }
    const selectedEventId = eventId.trim();
    if (!isUuid(selectedEventId)) {
      setScreen({ kind: "selection_error", code: "invalid_selection" });
      return;
    }
    const parsed = parseTicketIdSelection(ticketIdsRaw);
    if (!parsed.ok) {
      setScreen({ kind: "selection_error", code: parsed.code });
      return;
    }
    setScreen({ kind: "loading" });
    setRecon({ kind: "loading" });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (version.current !== requestVersion) return;
      if (!token) {
        setScreen({ kind: "denied" });
        setRecon({ kind: "unavailable" });
        return;
      }
      void loadReconciliation(selectedEventId, token, requestVersion);
      const response = await getTicketRefundEligibility({
        data: { eventId: selectedEventId, ticketIds: parsed.ticketIds },
        headers: { authorization: `Bearer ${token}` },
      });
      if (version.current === requestVersion) {
        setScreen({ kind: "results", eventId: selectedEventId, results: response.results });
      }
    } catch {
      // Every server-side failure — unauthenticated, nonmember, box_office,
      // or otherwise — collapses to one generic denial. No raw error text,
      // status code, or ticket detail is ever shown.
      if (version.current === requestVersion) setScreen({ kind: "denied" });
    }
  }

  /**
   * Read-only companion load. Any failure — unauthenticated, nonmember,
   * box_office, malformed, or transport — collapses to one generic state that
   * reveals nothing about whether cases exist. It never touches `screen`.
   */
  async function loadReconciliation(id: string, token: string, requestVersion: number) {
    try {
      const response = await listEventReconciliationCases({
        data: { eventId: id },
        headers: { authorization: `Bearer ${token}` },
      });
      if (version.current === requestVersion) {
        setRecon({ kind: "loaded", cases: response?.cases ?? [] });
      }
    } catch {
      if (version.current === requestVersion) setRecon({ kind: "unavailable" });
    }
  }

  async function handleRefund() {
    if (submitting.current) return;
    if (screen.kind !== "results" || !signedIn) return;
    if (!canRefundSelection(screen.results)) return;
    const requestVersion = version.current;
    const selectedEventId = screen.eventId;
    const selectedTicketIds = screen.results.map((r) => r.ticketId);
    submitting.current = true;
    setInFlight(true);
    setAction({ kind: "submitting" });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (version.current !== requestVersion) return;
      if (!token) {
        setAction({ kind: "done", result: "unavailable" });
        return;
      }
      const response = await executeTicketRefundCommand({
        data: {
          eventId: selectedEventId,
          ticketIds: selectedTicketIds,
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (version.current === requestVersion) {
        setAction({ kind: "done", result: actionResultKind(response?.code) });
      }
    } catch {
      // Any failure — unauthenticated, denied, provider, or transport — maps to
      // one generic terminal state. No raw error, no retry hint, no override.
      if (version.current === requestVersion) setAction({ kind: "done", result: "unavailable" });
    } finally {
      submitting.current = false;
      setInFlight(false);
    }
  }

  const summary = screen.kind === "results" ? summarizeResults(screen.results) : null;
  const actionable =
    screen.kind === "results" &&
    signedIn === true &&
    canRefundSelection(screen.results) &&
    action.kind !== "done";

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-background px-6 py-12 text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">{TITLE}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Private staging surface for event organizers and admins. It reviews eligibility and, after a
        deliberate confirmation, hands a wholly eligible selection to the authorized server command.
        It never shows customer, order, or payment information, and the server re-checks permission
        and eligibility on every request.
      </p>

      <section aria-labelledby="policy-heading" className="mt-8">
        <h2 id="policy-heading" className="text-base font-medium">
          Eligibility policy
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {POLICY_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {signedIn === false ? (
        <p role="status" className="mt-8 text-sm font-medium">
          {NOT_PERMITTED_MESSAGE}
        </p>
      ) : null}

      <section aria-labelledby="review-heading" className="mt-8">
        <h2 id="review-heading" className="text-base font-medium">
          Review a selection
        </h2>
        <form onSubmit={handleSubmit} className="mt-3 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Event ID</span>
            <input
              value={eventId}
              disabled={inFlight}
              onChange={(e) => {
                ++version.current;
                setEventId(e.target.value);
                setScreen({ kind: "idle" });
                setAction({ kind: "idle" });
                setRecon({ kind: "idle" });
              }}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Ticket IDs</span>
            <textarea
              value={ticketIdsRaw}
              disabled={inFlight}
              onChange={(e) => {
                ++version.current;
                setTicketIdsRaw(e.target.value);
                setScreen({ kind: "idle" });
                setAction({ kind: "idle" });
                setRecon({ kind: "idle" });
              }}
              rows={4}
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="text-xs text-muted-foreground">
              Comma- or whitespace-separated opaque IDs, up to {MAX_TICKET_SELECTION}.
            </span>
          </label>
          <div>
            <button
              type="submit"
              disabled={!signedIn || screen.kind === "loading" || inFlight}
              className="rounded border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {screen.kind === "loading" ? "Reviewing…" : "Review eligibility"}
            </button>
          </div>
        </form>

        {screen.kind === "selection_error" ? (
          <p role="status" className="mt-4 text-sm">
            {SELECTION_MESSAGE[screen.code]}
          </p>
        ) : null}
        {screen.kind === "denied" ? (
          <p role="status" className="mt-4 text-sm font-medium">
            {NOT_PERMITTED_MESSAGE}
          </p>
        ) : null}
        {screen.kind === "unavailable" ? (
          <p role="status" className="mt-4 text-sm">
            {UNAVAILABLE_MESSAGE}
          </p>
        ) : null}
        {screen.kind === "loading" ? (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            Reviewing…
          </p>
        ) : null}

        {screen.kind === "results" ? (
          screen.results.length === 0 ? (
            <p role="status" className="mt-4 text-sm">
              {EMPTY_RESULT_MESSAGE}
            </p>
          ) : (
            <div className="mt-4">
              <p role="status" className="text-sm">
                {summary!.total} reviewed · {summary!.eligible} eligible · {summary!.ineligible} not
                eligible
                {summary!.mixed ? " (mixed selection)" : ""}
              </p>
              <table className="mt-3 w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Ticket</th>
                    <th className="py-1.5 pr-3 font-medium">Status</th>
                    <th className="py-1.5 pr-3 font-medium">Refundability snapshot</th>
                    <th className="py-1.5 font-medium">Eligibility</th>
                  </tr>
                </thead>
                <tbody>
                  {screen.results.map((r) => (
                    <tr key={r.ticketId} className="border-b border-border/50 align-top">
                      <td className="py-1.5 pr-3 font-mono text-xs">{r.ticketId}</td>
                      <td className="py-1.5 pr-3">{r.status}</td>
                      <td className="py-1.5 pr-3">{refundabilityLabel(r.refundableAtIssue)}</td>
                      <td className="py-1.5">{reasonLabel(r.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 border-t border-border pt-4">
                {action.kind === "done" ? (
                  <p role="status" className="text-sm font-medium">
                    {ACTION_RESULT_MESSAGE[action.result]}
                  </p>
                ) : action.kind === "confirming" ? (
                  <div role="alertdialog" aria-labelledby="confirm-heading">
                    <h3 id="confirm-heading" className="text-sm font-medium">
                      {CONFIRM_TITLE}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {confirmMessage(screen.results.length)}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={handleRefund}
                        className="rounded border border-border px-3 py-1.5 text-sm font-medium"
                      >
                        {CONFIRM_YES_LABEL}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAction({ kind: "idle" })}
                        className="rounded border border-border px-3 py-1.5 text-sm"
                      >
                        {CONFIRM_CANCEL_LABEL}
                      </button>
                    </div>
                  </div>
                ) : action.kind === "submitting" ? (
                  <button
                    type="button"
                    disabled
                    className="rounded border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    Working…
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAction({ kind: "confirming" })}
                    disabled={!actionable}
                    className="rounded border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    {ACTION_LABEL}
                  </button>
                )}
                {!canRefundSelection(screen.results) && action.kind === "idle" ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    The action is available only when every reviewed ticket is eligible.
                  </p>
                ) : null}
              </div>
            </div>
          )
        ) : null}
      </section>

      {recon.kind !== "idle" ? (
        <section aria-labelledby="reconciliation-heading" className="mt-10">
          <h2 id="reconciliation-heading" className="text-base font-medium">
            {RECONCILIATION_HEADING}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{RECONCILIATION_INTRO}</p>

          {recon.kind === "loading" ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {RECONCILIATION_LOADING_MESSAGE}
            </p>
          ) : null}
          {recon.kind === "unavailable" ? (
            <p role="status" className="mt-3 text-sm">
              {RECONCILIATION_UNAVAILABLE_MESSAGE}
            </p>
          ) : null}
          {recon.kind === "loaded" && recon.cases.length === 0 ? (
            <p role="status" className="mt-3 text-sm">
              {RECONCILIATION_EMPTY_MESSAGE}
            </p>
          ) : null}

          {recon.kind === "loaded" && recon.cases.length > 0 ? (
            <>
              <table className="mt-3 w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Case</th>
                    <th className="py-1.5 pr-3 font-medium">State</th>
                    <th className="py-1.5 pr-3 font-medium">Reason</th>
                    <th className="py-1.5 pr-3 font-medium">Tickets</th>
                    <th className="py-1.5 pr-3 font-medium">Opened</th>
                    <th className="py-1.5 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.cases.map((c) => (
                    <tr key={c.caseId} className="border-b border-border/50 align-top">
                      <td className="py-1.5 pr-3 font-mono text-xs">{c.caseId}</td>
                      <td className="py-1.5 pr-3">{reconciliationStateLabel(c.state)}</td>
                      <td className="py-1.5 pr-3">{reconciliationReasonLabel(c.reason)}</td>
                      <td className="py-1.5 pr-3">
                        <span>{c.ticketCount}</span>
                        <span className="mt-1 block font-mono text-xs text-muted-foreground">
                          {c.ticketIds.join(" ")}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{c.createdAt}</td>
                      <td className="py-1.5 font-mono text-xs">{c.updatedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                {RECONCILIATION_RUNBOOK_REFERENCE}
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
