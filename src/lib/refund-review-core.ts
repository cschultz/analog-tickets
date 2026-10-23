/**
 * Gate 92 — pure view-model helpers for the private staging admin
 * refund-*review* screen.
 *
 * Pure presentation. Nothing here contacts a payment provider, reverses or
 * restocks a ticket, writes a row, or touches reconciliation state. It shapes
 * text for the Gate 91 read-only eligibility contract and, since Gate 94, for
 * the confirm-guarded action that delegates to the Gate 93 server command.
 */

import {
  isUuid,
  MAX_TICKET_SELECTION,
  type RefundEligibilityReason,
  type RefundEligibilityResult,
} from "@/lib/refund-eligibility-core";
import type { RefundCommandCode } from "@/lib/refund-command-core";
import type {
  ReconciliationCaseView,
  ReconciliationReasonCode,
} from "@/lib/reconciliation-visibility-core";

export type { ReconciliationCaseView };

export { MAX_TICKET_SELECTION };

/** Token refreshes and repeat sign-in events must not discard a pending review. */
export function shouldResetRefundReviewForAuthChange(
  previousUserId: string | null | undefined,
  nextUserId: string | null,
): boolean {
  return previousUserId !== nextUserId;
}

export type SelectionErrorCode = "no_selection" | "invalid_selection" | "too_many";

export const SELECTION_MESSAGE: Record<SelectionErrorCode, string> = {
  no_selection: "Enter at least one ticket ID to review.",
  invalid_selection: "That selection isn't a valid list of ticket IDs.",
  too_many: `Review at most ${MAX_TICKET_SELECTION} ticket IDs at a time.`,
};

/** Generic screen-level states. None of them reveal why a caller was denied. */
export const NOT_PERMITTED_MESSAGE = "Not permitted.";
export const UNAVAILABLE_MESSAGE = "This review is unavailable right now.";
export const EMPTY_RESULT_MESSAGE = "No results for this selection.";

/**
 * Splits a pasted/typed list of opaque ticket IDs on commas or whitespace.
 * Returns generic codes only — it never says which entry was wrong.
 */
export function parseTicketIdSelection(
  raw: string,
): { ok: true; ticketIds: string[] } | { ok: false; code: SelectionErrorCode } {
  const tokens = String(raw ?? "")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return { ok: false, code: "no_selection" };
  if (!tokens.every(isUuid)) return { ok: false, code: "invalid_selection" };
  const unique = Array.from(new Set(tokens));
  if (unique.length > MAX_TICKET_SELECTION) return { ok: false, code: "too_many" };
  return { ok: true, ticketIds: unique };
}

/**
 * Reason labels. `not_found` deliberately reads the same for an unknown ticket
 * and for a ticket belonging to another event: the screen must never disclose
 * whether such a ticket exists.
 */
export const REASON_LABEL: Record<RefundEligibilityReason, string> = {
  eligible: "Eligible",
  not_issued: "Not eligible — not an issued ticket",
  checked_in: "Not eligible — checked in (no override)",
  nonrefundable: "Not eligible — sold nonrefundable (no override)",
  not_found: "Not available for review in this event",
};

export function reasonLabel(reason: RefundEligibilityReason): string {
  return REASON_LABEL[reason] ?? REASON_LABEL.not_found;
}

export function refundabilityLabel(refundableAtIssue: boolean): string {
  return refundableAtIssue ? "Refundable at purchase" : "Nonrefundable at purchase";
}

export interface ReviewSummary {
  total: number;
  eligible: number;
  ineligible: number;
  mixed: boolean;
}

export function summarizeResults(results: RefundEligibilityResult[]): ReviewSummary {
  const total = results.length;
  const eligible = results.filter((r) => r.eligible).length;
  const ineligible = total - eligible;
  return { total, eligible, ineligible, mixed: eligible > 0 && ineligible > 0 };
}

export const POLICY_LINES = [
  "Only issued tickets whose purchase-time snapshot is refundable are eligible.",
  "Checked-in tickets are never eligible, and this is not overrideable here.",
  "Tickets sold nonrefundable are never eligible, and this is not overrideable here.",
  "Refunding requires an explicit confirmation, applies only to a wholly eligible selection, and cannot be undone from this screen.",
] as const;

/* -------------------------------------------------------------------------- */
/* Gate 94 — confirm-guarded action presentation.                             */
/*                                                                            */
/* Presentation only. Nothing here decides anything: the server command        */
/* re-derives authorization, eligibility, and payment coherence and remains    */
/* authoritative. These helpers only gate the button and turn the command's    */
/* generic code into one of four safe screen states.                          */
/* -------------------------------------------------------------------------- */

/** The action is offered only for a non-empty, wholly eligible selection. */
export function canRefundSelection(results: RefundEligibilityResult[]): boolean {
  return results.length > 0 && results.every((r) => r.eligible);
}

export type ActionResultKind = "success" | "denied" | "no_change" | "unavailable";

/**
 * Every command code collapses into four states. None of them carries a retry
 * hint, an override path, a provider detail, or a raw error.
 */
export const ACTION_RESULT_KIND: Record<RefundCommandCode, ActionResultKind> = {
  refunded: "success",
  already_refunded: "no_change",
  in_progress: "no_change",
  ineligible_selection: "denied",
  unauthorized: "denied",
  forbidden: "denied",
  invalid_request: "denied",
  server_error: "unavailable",
};

export const ACTION_RESULT_MESSAGE: Record<ActionResultKind, string> = {
  success: "Refund completed for the selected tickets.",
  denied: "Not permitted, or the selection is not eligible. Nothing was changed.",
  no_change: "Already handled. Nothing was changed.",
  unavailable:
    "The outcome could not be confirmed. Do not retry from this screen; review cases needing review.",
};

/** Unknown or absent codes fail closed to the most conservative state. */
export function actionResultKind(code: string | undefined): ActionResultKind {
  return ACTION_RESULT_KIND[code as RefundCommandCode] ?? "unavailable";
}

export const ACTION_LABEL = "Refund selected tickets";
export const CONFIRM_TITLE = "Confirm this action";
export const CONFIRM_YES_LABEL = "Yes, refund now";
export const CONFIRM_CANCEL_LABEL = "Cancel";

/** Deliberate confirmation copy: count plus irreversible effect, generically. */
export function confirmMessage(count: number): string {
  const plural = count === 1 ? "" : "s";
  return `This will refund ${count} selected ticket${plural}. The effect is irreversible: the ticket${plural} will be voided and the capacity returned to sale. It cannot be undone from this screen.`;
}

/* -------------------------------------------------------------------------- */
/* Gate 97 — read-only reconciliation-needed visibility presentation.         */
/*                                                                            */
/* Presentation only, and strictly read-only. These helpers shape the Gate 96  */
/* contract's already-minimal facts for display. There is no recovery control, */
/* no retry, no write, and no provider concept anywhere in this section, and   */
/* nothing here participates in eligibility or in the refund command's input.  */
/* -------------------------------------------------------------------------- */

export const RECONCILIATION_HEADING = "Cases needing review";

export const RECONCILIATION_INTRO =
  "These records may still be in progress or need human review. An unfinished state does not prove a refund occurred. This screen is read-only: nothing here can be resolved, retried, or changed from the browser.";

/** Shown only when the read succeeded and returned nothing. */
export const RECONCILIATION_EMPTY_MESSAGE = "No cases need review for this event.";

/**
 * Shown when the read did not succeed. It is deliberately identical in tone to
 * the empty state's neighbours and says nothing about whether cases exist.
 */
export const RECONCILIATION_UNAVAILABLE_MESSAGE = "This information is unavailable right now.";

export const RECONCILIATION_LOADING_MESSAGE = "Checking…";

export const RECONCILIATION_RUNBOOK_REFERENCE =
  "Follow the private reconciliation runbook (docs/STAGING_RECONCILIATION_RUNBOOK.md) to triage and escalate. Resolution is a manual, off-screen operation.";

/** Generic state/reason wording. Neither label names a provider or an amount. */
export const RECONCILIATION_STATE_LABEL = "Needs review";

export function reconciliationStateLabel(state: ReconciliationCaseView["state"]): string {
  if (state === "pending") return "Unconfirmed / possibly in progress";
  if (state === "provider_refunded") return "Internal completion pending";
  return RECONCILIATION_STATE_LABEL;
}

export const RECONCILIATION_REASON_LABEL: Record<ReconciliationReasonCode, string> = {
  refund_outcome_unconfirmed: "Outcome unconfirmed — verify before action",
  internal_completion_unconfirmed: "Internal completion unconfirmed",
  internal_reversal_unconfirmed: "Internal reversal unconfirmed",
  unspecified: "Unspecified — review required",
};

export function reconciliationReasonLabel(reason: string): string {
  return (
    RECONCILIATION_REASON_LABEL[reason as ReconciliationReasonCode] ??
    RECONCILIATION_REASON_LABEL.unspecified
  );
}
