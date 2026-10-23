/**
 * Gate 89 — pure, dependency-free reconciliation logic for signed Stripe
 * **test-mode** refund events.
 *
 * Scope and guarantees:
 * - Reads nothing from an event except its id, its type, and two opaque
 *   server-correlatable references (the PaymentIntent id and the Refund id).
 *   Amounts, charges, customers, cards, receipts and every other provider
 *   field are ignored and never retained.
 * - Cannot start a refund. Nothing here can call a provider, void a ticket,
 *   restock capacity, or write an order: the only expressible effect is a
 *   state note on a *pre-existing* Gate 88 coordination record.
 * - Fails closed: unknown, mismatched, live-looking, out-of-order, or
 *   unsupported deliveries collapse to a safe, non-mutating decision.
 */
import {
  isPaymentCorrelationReference,
  isRefundReference,
} from "@/lib/refund-reversal-core";
import {
  STRIPE_REFUND_CANDIDATE_EVENT_TYPES,
  type StripeRefundCandidateType,
} from "@/lib/stripe-webhook-core";
import type { LedgerState } from "@/lib/refund-coordinator-core";

const EVENT_ID_RE = /^evt_[A-Za-z0-9_]{6,120}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The two opaque references a refund delivery may correlate on. */
export interface StripeRefundEvent {
  externalEventId: string;
  eventType: StripeRefundCandidateType;
  paymentIntentId: string;
  refundReference: string;
}

/**
 * `uncorrelated` = a validly signed, test-mode refund event that carries no
 * usable opaque correlation pair. It is acknowledged and recorded exactly as
 * the pre-existing Gate 86 candidate path already did — never acted on.
 */
export type StripeRefundEventOutcome =
  | StripeRefundEvent
  | "invalid_request"
  | "unsupported"
  | "uncorrelated";

/** Pulls `re_...` out of a charge's embedded refund list, if present. */
function refundFromChargeShape(object: Record<string, unknown>): string | null {
  const refunds = asRecord(object["refunds"]);
  const list = refunds ? refunds["data"] : null;
  if (!Array.isArray(list)) return null;
  const references = list
    .map((entry) => asRecord(entry)?.["id"])
    .filter((id): id is string => isRefundReference(id));
  // Exactly one refund keeps correlation unambiguous; anything else is not
  // safely attributable to one coordination record.
  return references.length === 1 ? references[0]! : null;
}

/**
 * Accepts only a well-formed, test-mode `charge.refunded` or `refund.updated`
 * event and extracts its opaque correlation pair.
 */
export function parseStripeRefundEvent(body: unknown): StripeRefundEventOutcome {
  const root = asRecord(body);
  if (!root) return "invalid_request";

  const id = root["id"];
  const type = root["type"];
  if (typeof id !== "string" || !EVENT_ID_RE.test(id)) return "invalid_request";
  if (typeof type !== "string" || !/^[A-Za-z0-9_.]{3,64}$/.test(type)) return "invalid_request";

  // Live-mode traffic must never reach a staging coordination record.
  if (root["livemode"] !== false) return "unsupported";
  if (!(STRIPE_REFUND_CANDIDATE_EVENT_TYPES as readonly string[]).includes(type)) {
    return "unsupported";
  }

  const data = asRecord(root["data"]);
  const object = data ? asRecord(data["object"]) : null;
  if (!object) return "invalid_request";
  if (object["livemode"] === true) return "unsupported";

  const paymentIntentId = object["payment_intent"];
  if (!isPaymentCorrelationReference(paymentIntentId)) return "uncorrelated";

  const kind = object["object"];
  const refundReference =
    kind === "refund"
      ? isRefundReference(object["id"])
        ? (object["id"] as string)
        : null
      : kind === "charge"
        ? refundFromChargeShape(object)
        : null;
  if (!refundReference) return "uncorrelated";

  return {
    externalEventId: id,
    eventType: type as StripeRefundCandidateType,
    paymentIntentId,
    refundReference,
  };
}

/* ------------------------------ reconciliation ---------------------------- */

/** The subset of a Gate 88 coordination record this phase may read. */
export interface RefundCoordinationRecord {
  id: string;
  state: string;
  paymentIntentId: string;
  providerRefundReference: string | null;
}

export type RefundReconciliation =
  /** Nothing matches this delivery; record it and change nothing. */
  | { action: "record_only"; reason: "unknown" | "mismatched" | "unexpected_state" }
  /** Already fully reversed by the coordinator: pure no-op replay. */
  | { action: "already_reconciled" }
  /** Coordinator has not finished; never guess, never restock. */
  | { action: "await_coordinator" }
  /** Provider refunded but internal reversal is unproven: flag durably. */
  | { action: "flag_reconciliation_needed" }
  /** Already flagged: retain the flag, write nothing. */
  | { action: "retain_reconciliation_needed" };

/**
 * Decides the only effect a verified refund event may have. No branch reverses
 * a ticket, restocks capacity, or contacts a provider — the strongest possible
 * outcome is marking an existing record `reconciliation_needed` for a human.
 */
export function decideRefundEventReconciliation(args: {
  event: Pick<StripeRefundEvent, "paymentIntentId" | "refundReference">;
  record: RefundCoordinationRecord | null;
}): RefundReconciliation {
  const { event, record } = args;
  if (!record) return { action: "record_only", reason: "unknown" };
  if (record.paymentIntentId !== event.paymentIntentId) {
    return { action: "record_only", reason: "mismatched" };
  }
  if (
    record.providerRefundReference !== null &&
    record.providerRefundReference !== event.refundReference
  ) {
    return { action: "record_only", reason: "mismatched" };
  }

  switch (record.state as LedgerState) {
    case "reversed":
      return { action: "already_reconciled" };
    case "pending":
      return { action: "await_coordinator" };
    case "provider_refunded":
      return { action: "flag_reconciliation_needed" };
    case "reconciliation_needed":
      return { action: "retain_reconciliation_needed" };
    default:
      return { action: "record_only", reason: "unexpected_state" };
  }
}

/** Ledger status for the event-idempotency row implied by a decision. */
export function refundEventLedgerStatus(
  decision: RefundReconciliation,
): "processed" | "ignored" {
  return decision.action === "record_only" || decision.action === "await_coordinator"
    ? "ignored"
    : "processed";
}

/**
 * Generic acknowledgement for a correlated refund delivery. `executed` and
 * `restocked` are constant `false`: no refund or inventory effect exists on
 * this path. No provider identifier is ever echoed.
 */
export function refundReconciliationAckBody(args: {
  duplicate: boolean;
  decision: RefundReconciliation;
}): Record<string, unknown> {
  const { decision } = args;
  const reconciled =
    decision.action === "already_reconciled" ||
    decision.action === "flag_reconciliation_needed" ||
    decision.action === "retain_reconciliation_needed";
  return {
    ok: true,
    duplicate: args.duplicate,
    status: refundEventLedgerStatus(decision),
    executed: false,
    restocked: false,
    reconciled,
    outcome: decision.action,
  };
}
