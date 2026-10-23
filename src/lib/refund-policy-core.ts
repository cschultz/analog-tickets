/**
 * Pure, dependency-free refundability policy logic for private staging.
 *
 * Scope: the policy/configuration layer only. Nothing here (or in the modules
 * that import it) performs a refund, contacts a payment provider, changes an
 * order/ticket status, touches capacity, or sends mail.
 *
 * Two values exist:
 *  - the admin-controlled setting on a ticket type (`is_refundable`), and
 *  - the immutable snapshot stamped on each ticket at paid issuance
 *    (`refundable_at_issue`).
 *
 * Core invariant: once a ticket exists, only its snapshot decides
 * refundability. Later admin edits to the ticket type never reach it.
 */

export type RefundPolicyErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_available"
  | "server_error";

export const REFUND_POLICY_ERROR_MESSAGE: Record<RefundPolicyErrorCode, string> = {
  unauthorized: "Authentication required.",
  forbidden: "Not permitted.",
  invalid_request: "Invalid request.",
  not_available: "Not available.",
  server_error: "Service unavailable.",
};

/** The safe default: a ticket type is nonrefundable unless an admin says so. */
export const DEFAULT_REFUNDABLE = false;

/** Event membership roles allowed to change a ticket type's policy. */
export const REFUND_POLICY_ADMIN_ROLES = ["organizer", "admin"] as const;

export type RefundPolicyAdminRole = (typeof REFUND_POLICY_ADMIN_ROLES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isRefundPolicyAdminRole(role: unknown): role is RefundPolicyAdminRole {
  return typeof role === "string" && (REFUND_POLICY_ADMIN_ROLES as readonly string[]).includes(role);
}

/** Fail-closed coercion: anything that is not literally `true` is nonrefundable. */
export function normalizeRefundableSetting(value: unknown): boolean {
  return value === true;
}

/** The value stamped onto every ticket issued for a paid attempt. */
export function snapshotRefundabilityAtIssue(ticketTypeSetting: unknown): boolean {
  return normalizeRefundableSetting(ticketTypeSetting);
}

/**
 * Refundability of an already-issued ticket. Deliberately ignores the ticket
 * type's current setting: only the purchase-time snapshot counts.
 */
export function resolveIssuedTicketRefundability(ticket: {
  refundableAtIssue: unknown;
}): boolean {
  return normalizeRefundableSetting(ticket.refundableAtIssue);
}

export interface RefundPolicyInput {
  ticketTypeId: string;
  isRefundable: boolean;
}

export function parseRefundPolicyInput(body: unknown): RefundPolicyInput | RefundPolicyErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const ticketTypeId = raw["ticketTypeId"];
  const isRefundable = raw["isRefundable"];
  if (!isUuid(ticketTypeId)) return "invalid_request";
  if (typeof isRefundable !== "boolean") return "invalid_request";
  return { ticketTypeId, isRefundable };
}

/** One membership row as read through the caller's own RLS-scoped session. */
export interface MembershipSnapshot {
  eventId: string;
  userId: string;
  role: string;
}

/**
 * Fail-closed admin check. The membership rows must have been read with the
 * caller's own session (RLS restricts them to their own rows); a role is never
 * taken from client input, user metadata, or a JWT claim.
 */
export function evaluateRefundPolicyAuthorization(args: {
  memberships: MembershipSnapshot[] | null;
  eventId: string;
  userId: string;
}): { ok: true } | { ok: false; code: RefundPolicyErrorCode } {
  if (!args.memberships) return { ok: false, code: "server_error" };
  if (!args.eventId || !args.userId) return { ok: false, code: "forbidden" };
  const permitted = args.memberships.some(
    (m) => m.eventId === args.eventId && m.userId === args.userId && isRefundPolicyAdminRole(m.role),
  );
  return permitted ? { ok: true } : { ok: false, code: "forbidden" };
}
