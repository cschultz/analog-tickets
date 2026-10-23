/**
 * Gate 96 — pure, dependency-free logic for the private staging
 * reconciliation-needed *visibility* contract.
 *
 * Read-only by construction. Nothing here (or in the modules that import it)
 * recovers, retries, refunds, restocks, writes a row, runs an RPC, or contacts
 * a payment provider. It answers exactly one question — "which reconciliation
 * cases touch this event, and what generic facts may an organizer see?" — and
 * deliberately projects no payment intent, refund/provider reference, order,
 * customer, or raw database error.
 */

import {
  isUuid,
  REFUND_POLICY_ADMIN_ROLES,
  type MembershipSnapshot,
} from "@/lib/refund-policy-core";
import { evaluateRefundEligibilityAuthorization } from "@/lib/refund-eligibility-core";

export { isUuid };

/** Roles allowed to view reconciliation cases. `box_office` is deliberately absent. */
export const RECONCILIATION_VISIBILITY_ADMIN_ROLES = REFUND_POLICY_ADMIN_ROLES;

/** Unfinished states need manual inspection even when a state write failed. */
export const RECONCILIATION_VISIBLE_STATE = "reconciliation_needed";
export const RECONCILIATION_VISIBLE_STATES = [
  "pending",
  "provider_refunded",
  RECONCILIATION_VISIBLE_STATE,
] as const;

export type ReconciliationVisibilityErrorCode =
  "unauthorized" | "forbidden" | "invalid_request" | "server_error";

export const RECONCILIATION_VISIBILITY_ERROR_MESSAGE: Record<
  ReconciliationVisibilityErrorCode,
  string
> = {
  unauthorized: "Authentication required.",
  forbidden: "Not permitted.",
  invalid_request: "Invalid request.",
  server_error: "Service unavailable.",
};

export interface ReconciliationVisibilityInput {
  eventId: string;
}

/**
 * The request carries an event id and nothing else. No payment, order, refund,
 * or provider reference is accepted from the browser — association is always
 * derived server-side from ticket/event relationships.
 */
export function parseReconciliationVisibilityInput(
  body: unknown,
): ReconciliationVisibilityInput | ReconciliationVisibilityErrorCode {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_request";
  const raw = body as Record<string, unknown>;
  if (!isUuid(raw["eventId"])) return "invalid_request";
  for (const forbidden of [
    "paymentIntentId",
    "payment_intent_id",
    "providerRefundReference",
    "provider_refund_reference",
    "orderId",
    "order_id",
    "caseId",
    "case_id",
  ]) {
    if (raw[forbidden] !== undefined) return "invalid_request";
  }
  return { eventId: raw["eventId"] as string };
}

export function isReconciliationVisibilityAdminRole(role: unknown): boolean {
  return (
    typeof role === "string" &&
    (RECONCILIATION_VISIBILITY_ADMIN_ROLES as readonly string[]).includes(role)
  );
}

/**
 * Fail-closed authorization, identical in ordering and semantics to the Gate 91
 * contract: membership rows MUST have been read with the caller's own
 * RLS-scoped session; roles never come from client input, user metadata, or a
 * JWT claim.
 */
export function evaluateReconciliationVisibilityAuthorization(args: {
  memberships: MembershipSnapshot[] | null;
  eventId: string;
  userId: string;
}): { ok: true } | { ok: false; code: ReconciliationVisibilityErrorCode } {
  return evaluateRefundEligibilityAuthorization(args) as
    { ok: true } | { ok: false; code: ReconciliationVisibilityErrorCode };
}

/** Raw ledger facts the reader is allowed to load. No provider references. */
export interface ReconciliationCaseFacts {
  id: string;
  state: string;
  failureReason: string | null;
  ticketIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Generic, non-enumerating operational reason codes. */
export type ReconciliationReasonCode =
  | "refund_outcome_unconfirmed"
  | "internal_completion_unconfirmed"
  | "internal_reversal_unconfirmed"
  | "unspecified";

/** The only fields this contract ever returns. */
export interface ReconciliationCaseView {
  caseId: string;
  state: (typeof RECONCILIATION_VISIBLE_STATES)[number];
  reason: ReconciliationReasonCode;
  ticketCount: number;
  ticketIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function toReasonCode(failureReason: string | null): ReconciliationReasonCode {
  return failureReason === "webhook_unreconciled" ? "internal_reversal_unconfirmed" : "unspecified";
}

/**
 * Projects the visible cases for one event.
 *
 * A case is visible only when its ledger state is unresolved AND at
 * least one of its tickets belongs to the requested event. Ticket ids from any
 * other event are dropped entirely, so a cross-event case can never reveal
 * ticket identifiers the caller is not authorized for, and a case with no
 * in-event ticket is indistinguishable from a case that does not exist.
 */
export function projectReconciliationCases(args: {
  eventId: string;
  cases: ReconciliationCaseFacts[];
  eventTicketIds: string[];
}): ReconciliationCaseView[] {
  if (!args.eventId) return [];
  const allowed = new Set(args.eventTicketIds);
  const views: ReconciliationCaseView[] = [];
  for (const record of args.cases) {
    if (!(RECONCILIATION_VISIBLE_STATES as readonly string[]).includes(record.state)) continue;
    const ticketIds = Array.from(
      new Set(record.ticketIds.filter((id) => typeof id === "string" && allowed.has(id))),
    );
    if (ticketIds.length === 0) continue;
    views.push({
      caseId: record.id,
      state: record.state as ReconciliationCaseView["state"],
      reason:
        record.state === "pending"
          ? "refund_outcome_unconfirmed"
          : record.state === "provider_refunded"
            ? "internal_completion_unconfirmed"
            : toReasonCode(record.failureReason),
      ticketCount: ticketIds.length,
      ticketIds,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
  return views.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
