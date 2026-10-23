/**
 * Gate 87 — pure, dependency-free logic for the private staging per-ticket
 * reversal (refund) layer.
 *
 * Scope guard: nothing in this module, or in the modules that import it, calls
 * Stripe, creates a refund, configures a webhook, sends mail, or is reachable
 * from a browser. The only state change any of it can cause happens inside the
 * service-role-only database routine `public.reverse_refunded_tickets`, which
 * is atomic and fail-closed.
 *
 * Eligibility is the immutable `tickets.refundable_at_issue` snapshot taken at
 * paid issuance (Gate 85). A checked-in ticket is always denied: any override
 * would need an explicit future product decision and is deliberately absent.
 */

/** Every outcome the atomic routine can report. Exactly one is a success. */
export const REVERSAL_OUTCOMES = [
  "reversed",
  "idempotent_replay",
  "invalid_reference",
  "invalid_payment_reference",
  "invalid_selection",
  "duplicate_ticket_ids",
  "unknown_ticket",
  "checked_in_ticket",
  "ticket_not_issued",
  "ticket_not_refundable",
  "ticket_already_reversed",
  "mixed_selection",
  "order_not_paid",
  "payment_not_correlated",
  "selection_exceeds_payment",
  "reference_conflict",
] as const;

export type ReversalOutcome = (typeof REVERSAL_OUTCOMES)[number];

/** Outcomes that must leave every row, counter and snapshot untouched. */
export const REVERSAL_NO_OP_OUTCOMES: readonly ReversalOutcome[] = REVERSAL_OUTCOMES.filter(
  (outcome) => outcome !== "reversed",
);

export function isReversalOutcome(value: unknown): value is ReversalOutcome {
  return typeof value === "string" && (REVERSAL_OUTCOMES as readonly string[]).includes(value);
}

/** An opaque provider refund reference (Stripe test-mode `re_...`). */
const REFUND_REFERENCE_RE = /^re_[A-Za-z0-9_]{6,120}$/;
/** An opaque payment correlation reference (Gate 86 `pi_...`). */
const PAYMENT_INTENT_RE = /^pi_[A-Za-z0-9]{6,120}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Hard ceiling on one reversal selection; mirrors the SQL routine. */
export const MAX_REVERSAL_SELECTION = 50;

export function isRefundReference(value: unknown): value is string {
  return typeof value === "string" && REFUND_REFERENCE_RE.test(value);
}

export function isPaymentCorrelationReference(value: unknown): value is string {
  return typeof value === "string" && PAYMENT_INTENT_RE.test(value);
}

export interface ReversalRequest {
  ticketIds: string[];
  paymentIntentId: string;
  providerRefundReference: string;
}

/**
 * Client-side-of-the-database mirror of the routine's own argument checks.
 * It can only ever reject: a request that passes here is still re-validated in
 * full, under row locks, inside the transaction.
 */
export function parseReversalRequest(input: unknown): ReversalRequest | ReversalOutcome {
  if (!input || typeof input !== "object") return "invalid_selection";
  const raw = input as Record<string, unknown>;

  if (!isRefundReference(raw["providerRefundReference"])) return "invalid_reference";
  if (!isPaymentCorrelationReference(raw["paymentIntentId"])) return "invalid_payment_reference";

  const ids = raw["ticketIds"];
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_REVERSAL_SELECTION) {
    return "invalid_selection";
  }
  if (!ids.every((id) => typeof id === "string" && UUID_RE.test(id))) return "invalid_selection";
  if (new Set(ids as string[]).size !== ids.length) return "duplicate_ticket_ids";

  return {
    ticketIds: ids as string[],
    paymentIntentId: raw["paymentIntentId"] as string,
    providerRefundReference: raw["providerRefundReference"] as string,
  };
}

/** One ticket as the routine sees it under lock. */
export interface ReversalTicketFacts {
  ticketId: string;
  orderId: string;
  eventId: string;
  ticketTypeId: string;
  status: string;
  checkedIn: boolean;
  refundableAtIssue: boolean;
  alreadyReversed: boolean;
}

/**
 * Pure mirror of the eligibility gate, in the routine's own precedence order.
 * Used by tests to prove the denial matrix without touching the database.
 */
export function evaluateReversalEligibility(args: {
  requested: string[];
  tickets: ReversalTicketFacts[];
  orderStatus: string | null;
  correlatedPaymentIntentId: string | null;
  paymentIntentId: string;
  paidQuantity: number;
}): ReversalOutcome {
  const { requested, tickets } = args;
  if (requested.length === 0) return "invalid_selection";
  if (new Set(requested).size !== requested.length) return "duplicate_ticket_ids";
  if (tickets.length !== requested.length) return "unknown_ticket";
  if (tickets.some((t) => t.checkedIn)) return "checked_in_ticket";
  if (tickets.some((t) => t.status !== "issued")) return "ticket_not_issued";
  if (tickets.some((t) => t.refundableAtIssue !== true)) return "ticket_not_refundable";
  if (tickets.some((t) => t.alreadyReversed)) return "ticket_already_reversed";

  const distinct = (values: string[]) => new Set(values).size;
  if (
    distinct(tickets.map((t) => t.orderId)) !== 1 ||
    distinct(tickets.map((t) => t.ticketTypeId)) !== 1 ||
    distinct(tickets.map((t) => t.eventId)) !== 1
  ) {
    return "mixed_selection";
  }

  if (args.orderStatus !== "paid") return "order_not_paid";
  if (
    !args.correlatedPaymentIntentId ||
    args.correlatedPaymentIntentId !== args.paymentIntentId
  ) {
    return "payment_not_correlated";
  }
  if (requested.length > args.paidQuantity) return "selection_exceeds_payment";
  return "reversed";
}

/**
 * Capacity math. Restock is exactly the number of tickets actually reversed —
 * never more, never enough to drive `quantity_sold` below zero.
 */
export function computeRestock(args: {
  quantitySold: number;
  reversedCount: number;
}): { ok: true; quantitySold: number } | { ok: false; reason: "invariant_breach" } {
  if (!Number.isInteger(args.reversedCount) || args.reversedCount <= 0) {
    return { ok: false, reason: "invariant_breach" };
  }
  if (!Number.isInteger(args.quantitySold) || args.quantitySold < args.reversedCount) {
    return { ok: false, reason: "invariant_breach" };
  }
  return { ok: true, quantitySold: args.quantitySold - args.reversedCount };
}

/** Replay classification for a re-presented provider reference. */
export function classifyReplay(args: {
  existing: { ticketIds: string[]; paymentIntentId: string } | null;
  requested: string[];
  paymentIntentId: string;
}): "new" | "idempotent_replay" | "reference_conflict" {
  if (!args.existing) return "new";
  const same =
    args.existing.paymentIntentId === args.paymentIntentId &&
    args.existing.ticketIds.length === args.requested.length &&
    args.existing.ticketIds.every((id) => args.requested.includes(id));
  return same ? "idempotent_replay" : "reference_conflict";
}
