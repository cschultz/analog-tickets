/**
 * Gate 91 — pure, dependency-free refund *eligibility* logic for the private
 * staging admin read contract.
 *
 * Read-only by construction: nothing here (or in the modules importing it)
 * contacts a payment provider, writes a row, restocks capacity, reverses a
 * ticket, or touches the reconciliation ledger. It answers exactly one
 * question — "would this ticket be refundable today?" — with generic,
 * non-enumerating reason codes.
 */

import {
  isUuid,
  REFUND_POLICY_ADMIN_ROLES,
  resolveIssuedTicketRefundability,
  type MembershipSnapshot,
} from "@/lib/refund-policy-core";

export { isUuid };

/** Roles allowed to read refund eligibility. `box_office` is deliberately absent. */
export const REFUND_ELIGIBILITY_ADMIN_ROLES = REFUND_POLICY_ADMIN_ROLES;

export type RefundEligibilityErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "server_error";

export const REFUND_ELIGIBILITY_ERROR_MESSAGE: Record<RefundEligibilityErrorCode, string> = {
  unauthorized: "Authentication required.",
  forbidden: "Not permitted.",
  invalid_request: "Invalid request.",
  server_error: "Service unavailable.",
};

/** Generic, non-enumerating per-ticket reason codes. */
export type RefundEligibilityReason =
  | "eligible"
  | "not_issued"
  | "checked_in"
  | "nonrefundable"
  | "not_found";

export const MAX_TICKET_SELECTION = 100;

export interface RefundEligibilityInput {
  eventId: string;
  ticketIds: string[];
}

export function parseRefundEligibilityInput(
  body: unknown,
): RefundEligibilityInput | RefundEligibilityErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const eventId = raw["eventId"];
  const ticketIds = raw["ticketIds"];
  if (!isUuid(eventId)) return "invalid_request";
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) return "invalid_request";
  if (ticketIds.length > MAX_TICKET_SELECTION) return "invalid_request";
  if (!ticketIds.every(isUuid)) return "invalid_request";
  const unique = Array.from(new Set(ticketIds as string[]));
  return { eventId, ticketIds: unique };
}

export function isRefundEligibilityAdminRole(role: unknown): boolean {
  return (
    typeof role === "string" && (REFUND_ELIGIBILITY_ADMIN_ROLES as readonly string[]).includes(role)
  );
}

/**
 * Fail-closed authorization. Membership rows must have been read with the
 * caller's own RLS-scoped session; roles never come from client input, user
 * metadata, or a JWT claim.
 */
export function evaluateRefundEligibilityAuthorization(args: {
  memberships: MembershipSnapshot[] | null;
  eventId: string;
  userId: string;
}): { ok: true } | { ok: false; code: RefundEligibilityErrorCode } {
  if (!args.memberships) return { ok: false, code: "server_error" };
  if (!args.eventId || !args.userId) return { ok: false, code: "forbidden" };
  const permitted = args.memberships.some(
    (m) =>
      m.eventId === args.eventId &&
      m.userId === args.userId &&
      isRefundEligibilityAdminRole(m.role),
  );
  return permitted ? { ok: true } : { ok: false, code: "forbidden" };
}

/** The only ticket facts this contract ever reads. */
export interface EligibilityTicketFacts {
  id: string;
  eventId: string;
  status: string;
  refundableAtIssue: unknown;
  checkedIn: boolean;
}

/** The only ticket facts this contract ever returns. No PII, no provider ids. */
export interface RefundEligibilityResult {
  ticketId: string;
  status: string;
  refundableAtIssue: boolean;
  eligible: boolean;
  reason: RefundEligibilityReason;
}

function classify(ticket: EligibilityTicketFacts): RefundEligibilityResult {
  const refundableAtIssue = resolveIssuedTicketRefundability({
    refundableAtIssue: ticket.refundableAtIssue,
  });
  const base = { ticketId: ticket.id, status: ticket.status, refundableAtIssue };
  if (ticket.status !== "issued") {
    return { ...base, eligible: false, reason: "not_issued" };
  }
  if (ticket.checkedIn) {
    return { ...base, eligible: false, reason: "checked_in" };
  }
  if (!refundableAtIssue) {
    return { ...base, eligible: false, reason: "nonrefundable" };
  }
  return { ...base, eligible: true, reason: "eligible" };
}

/** Unknown, cross-event, and unmatched ids collapse to one generic denial. */
const notFound = (ticketId: string): RefundEligibilityResult => ({
  ticketId,
  status: "unknown",
  refundableAtIssue: false,
  eligible: false,
  reason: "not_found",
});

/**
 * Evaluates the requested selection in request order. Tickets belonging to a
 * different event are indistinguishable from tickets that do not exist.
 */
export function evaluateRefundEligibility(args: {
  eventId: string;
  ticketIds: string[];
  tickets: EligibilityTicketFacts[];
}): RefundEligibilityResult[] {
  const byId = new Map<string, EligibilityTicketFacts>();
  for (const ticket of args.tickets) {
    if (ticket.eventId === args.eventId) byId.set(ticket.id, ticket);
  }
  return args.ticketIds.map((id) => {
    const ticket = byId.get(id);
    return ticket ? classify(ticket) : notFound(id);
  });
}
