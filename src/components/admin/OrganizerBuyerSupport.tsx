import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/public-supabase-client";
import { getTicketRefundEligibility } from "@/lib/refund-eligibility.functions";
import { executeTicketRefundCommand } from "@/lib/refund-command.functions";
import { listEventReconciliationCases } from "@/lib/reconciliation-visibility.functions";
import { MAX_REFUND_COMMAND_SELECTION } from "@/lib/refund-command-core";
import {
  confirmMessage,
  reasonLabel,
  reconciliationReasonLabel,
  reconciliationStateLabel,
} from "@/lib/refund-review-core";
import { organizerMoney, type OrganizerOrderDetail } from "@/lib/organizer-order-detail-core";
import {
  OrganizerSupportController,
  type OrganizerSupportMemory,
  type SupportDependencies,
  type SupportOutcome,
} from "@/lib/organizer-support-controller";

const dependencies: SupportDependencies = {
  session: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session
      ? {
          userId: data.session.user.id,
          token: data.session.access_token,
        }
      : null;
  },
  eligibility: (eventId, ticketIds, token) =>
    getTicketRefundEligibility({
      data: { eventId, ticketIds },
      headers: { authorization: `Bearer ${token}` },
    }),
  cases: (eventId, token) =>
    listEventReconciliationCases({
      data: { eventId },
      headers: { authorization: `Bearer ${token}` },
    }),
  refund: (eventId, ticketIds, token) =>
    executeTicketRefundCommand({
      data: { eventId, ticketIds },
      headers: { authorization: `Bearer ${token}` },
    }),
};
const outcomeText: Record<SupportOutcome, string> = {
  refunded:
    "TEST refund completed. Reload the order records to view its recorded reversal and ticket status.",
  already_refunded:
    "These tickets were already handled. No new refund was started; reload the order records.",
  in_progress:
    "A refund is already in progress. Do not retry; ask the installation owner to verify its outcome.",
  denied:
    "The command was not permitted or the selection was no longer eligible. No refund was completed by this command.",
  unconfirmed:
    "The refund outcome could not be confirmed. Do not retry. Ask the installation owner to reconcile the request before any further refund action.",
};

export function OrganizerBuyerSupport({
  order,
  userId,
  memory,
  onRefresh,
}: {
  order: OrganizerOrderDetail;
  userId: string;
  memory: OrganizerSupportMemory;
  onRefresh(): void;
}) {
  const [controller, setController] = useState<OrganizerSupportController | null>(null);
  useEffect(() => {
    const next = new OrganizerSupportController(userId, order, dependencies, memory);
    setController(next);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) next.invalidate();
    });
    return () => {
      subscription.unsubscribe();
      next.invalidate();
    };
  }, [userId, order, memory]);
  return (
    <section className="admin-buyer-support" aria-labelledby="buyer-support-heading">
      <h3 id="buyer-support-heading">Buyer support</h3>
      <p>
        <a href="/tickets/recover" target="_blank" rel="noopener noreferrer">
          Open buyer ticket recovery ↗
        </a>
      </p>
      <p className="checkout-note">
        Give the buyer this recovery page. They verify the checkout email themselves; this does not
        send an email or reveal a ticket pass to staff.
      </p>
      {controller ? (
        <SupportActions controller={controller} onRefresh={onRefresh} />
      ) : (
        <p role="status">Preparing support controls…</p>
      )}
    </section>
  );
}

export function SupportActions({
  controller,
  onRefresh,
}: {
  controller: OrganizerSupportController;
  onRefresh(): void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const confirmation = useRef<HTMLHeadingElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const lastPhase = useRef(state.phase);
  useEffect(() => {
    if (state.phase === "confirming") confirmation.current?.focus();
    else if (lastPhase.current === "confirming" && state.phase === "review")
      reviewButton.current?.focus();
    lastPhase.current = state.phase;
  }, [state.phase]);
  const busy = state.phase === "reviewing" || state.phase === "submitting";
  const amount = controller.originalAmount(),
    blocked = controller.blockingMessage();
  const statusOnly =
    !state.selected.length ||
    controller.hasOutstandingRequest() ||
    state.cases.length > 0 ||
    state.phase === "done";
  return (
    <>
      <h4>Refund tickets · TEST only</h4>
      <p className="checkout-note">
        Select up to {MAX_REFUND_COMMAND_SELECTION} tickets from this order. Checked-in, void and
        sold-nonrefundable tickets cannot be overridden. Eligibility is checked again by the
        command.
      </p>
      <fieldset disabled={busy || state.phase === "confirming"} className="admin-support-selection">
        <legend>Tickets to review</legend>
        {controller.order.tickets.length ? (
          controller.order.tickets.map((ticket) => {
            const selected = state.selected.includes(ticket.id);
            const selectable =
              ticket.status === "issued" && !ticket.checkedInAt && !controller.handled(ticket.id);
            const share = controller.order.pricing?.paidShares?.find(
              (share) => share.ticketId === ticket.id,
            );
            return (
              <label key={ticket.id}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={
                    !selectable ||
                    (!selected && state.selected.length >= MAX_REFUND_COMMAND_SELECTION)
                  }
                  onChange={(e) =>
                    controller.select(
                      e.target.checked
                        ? [...state.selected, ticket.id]
                        : state.selected.filter((id) => id !== ticket.id),
                    )
                  }
                />
                <span>
                  Ticket {ticket.id.slice(0, 8)}… · {ticket.name || "Holder name not provided"}
                  <br />
                  <small>
                    {ticket.status === "void"
                      ? "Voided"
                      : ticket.checkedInAt || ticket.status === "checked_in"
                        ? "Checked in — not refundable"
                        : controller.handled(ticket.id)
                          ? "Refund request handled — reload records"
                          : "Not checked in · eligibility review required"}
                    {share
                      ? ` · Original paid share ${organizerMoney(share.amountCents)}`
                      : " · Original paid share unavailable"}
                  </small>
                </span>
              </label>
            );
          })
        ) : (
          <p>No issued ticket records are available to select.</p>
        )}
      </fieldset>
      <div className="admin-record-actions">
        <button
          type="button"
          className="admin-secondary-button"
          ref={reviewButton}
          disabled={busy || state.phase === "confirming" || state.phase === "unauthorized"}
          onClick={() => void (statusOnly ? controller.checkCases() : controller.review())}
        >
          {state.phase === "reviewing"
            ? "Reviewing…"
            : statusOnly
              ? "Check support status (read-only)"
              : "Review refund eligibility"}
        </button>
      </div>
      {state.phase === "unauthorized" ? (
        <p role="status">Sign in again as the organizer for this workspace before continuing.</p>
      ) : null}
      {state.phase === "unavailable" ? (
        <p role="status">
          Support review is unavailable. No refund command was submitted by this review. You can
          retry this read-only review.
        </p>
      ) : null}
      {state.results.length ? (
        <>
          <ul className="admin-support-results" aria-label="Refund eligibility results">
            {state.results.map((result) => (
              <li key={result.ticketId}>
                Ticket {result.ticketId.slice(0, 8)}… · {reasonLabel(result.reason)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {state.casesStatus === "unavailable" ? (
        <p role="status">Support cases are unavailable. Refund confirmation remains disabled.</p>
      ) : null}
      {state.casesStatus === "ready" && !state.cases.length ? (
        <p>No unresolved refund cases were returned for this order.</p>
      ) : null}
      {state.cases.length ? (
        <section aria-labelledby="order-cases-heading">
          <h4 id="order-cases-heading">Refund cases needing review</h4>
          <p>
            Unfinished records do not prove a refund occurred. The installation owner must reconcile
            them; no retry or resolution action is available here.
          </p>
          <ul>
            {state.cases.map((item) => (
              <li key={item.caseId}>
                <code>{item.caseId}</code> · {reconciliationStateLabel(item.state)} ·{" "}
                {reconciliationReasonLabel(item.reason)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {blocked &&
      (state.selected.length > 0 ||
        state.phase === "done" ||
        controller.hasOutstandingRequest()) ? (
        <p className="admin-support-warning" role="status">
          {blocked}
        </p>
      ) : null}
      {state.phase === "review" && controller.canConfirm() ? (
        <button type="button" className="admin-primary-button" onClick={() => controller.confirm()}>
          Review TEST refund · {organizerMoney(amount!)}
        </button>
      ) : null}
      {state.phase === "confirming" ? (
        <div className="admin-change-review" role="region" aria-labelledby="refund-confirm-heading">
          <h4 id="refund-confirm-heading" ref={confirmation} tabIndex={-1}>
            Confirm TEST refund · {amount === null ? "Amount unavailable" : organizerMoney(amount)}
          </h4>
          <p>{confirmMessage(state.selected.length)}</p>
          <p>
            This is the selected tickets’ original paid allocation, not the order total or remaining
            balance. The server rechecks the selection and calculates the refund; no amount override
            is sent.
          </p>
          <div className="admin-record-actions">
            <button
              type="button"
              className="admin-primary-button"
              disabled={!controller.canConfirm()}
              onClick={() => void controller.submit()}
            >
              Confirm TEST refund
            </button>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => controller.cancel()}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {state.phase === "submitting" ? (
        <p role="status">Submitting one TEST refund request… Do not retry.</p>
      ) : null}
      {state.phase === "done" && state.outcome ? (
        <div role="status">
          <p>{outcomeText[state.outcome]}</p>
        </div>
      ) : null}
      <button type="button" className="admin-secondary-button" disabled={busy} onClick={onRefresh}>
        Reload order records (read-only)
      </button>
    </>
  );
}
