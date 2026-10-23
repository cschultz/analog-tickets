/**
 * Pure, dependency-free Stripe **test-mode** webhook adapter for the private
 * staging checkout ledger.
 *
 * Scope and guarantees:
 * - Verifies Stripe's real `Stripe-Signature` header (`t=<unix>,v1=<hex>`)
 *   over the exact raw request body using `STRIPE_TEST_WEBHOOK_SECRET`.
 * - Extracts nothing from the event except the event id, the event type, and
 *   the opaque server-owned `client_reference_id` (our own attempt id).
 *   The paid-amount guard separately reads total/currency in memory and compares
 *   them with server-owned facts. No provider price/contact payload is retained.
 * - Never fulfils: no order, ticket, or inventory effect is expressible here.
 * - Fails closed: anything unexpected collapses to a generic safe code.
 */

import { isUuid, verifyWebhookSignature, type CheckoutErrorCode } from "./checkout-core";

/** Standard Stripe webhook signature header name (lowercase). */
export const STRIPE_SIGNATURE_HEADER = "stripe-signature";

/** Immediate and delayed Checkout success use the same paid-session guards. */
export const STRIPE_COMPLETION_EVENT_TYPE = "checkout.session.completed";
export const STRIPE_ASYNC_SUCCESS_EVENT_TYPE = "checkout.session.async_payment_succeeded";
export const STRIPE_ASYNC_FAILURE_EVENT_TYPE = "checkout.session.async_payment_failed";

const EVENT_ID_RE = /^evt_[A-Za-z0-9_]{6,120}$/;

/**
 * Stripe signatures use the same scheme this project already verifies, so the
 * shared verifier is reused verbatim (raw body, timestamp tolerance, v1 hex).
 */
export async function verifyStripeSignature(options: {
  secret: string;
  header: string | null | undefined;
  rawBody: string;
  nowSeconds: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  return verifyWebhookSignature(options);
}

export interface StripeCompletionEvent {
  /** Stripe event id — the only provider string retained (ledger key). */
  externalEventId: string;
  /** The accepted immediate or delayed Checkout success event type. */
  eventType: string;
  /** Our own opaque checkout_attempts id, echoed back by Stripe. */
  attemptId: string;
}

/** `unsupported` = validly signed but not a completion event we reconcile. */
export type StripeEventOutcome = StripeCompletionEvent | CheckoutErrorCode | "unsupported";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Accepts only the minimal unambiguous *paid, completed, test-mode* Checkout
 * Session event carrying our opaque attempt id. Everything else is either a
 * malformed request or an explicitly unsupported event.
 */
export function parseStripeCompletionEvent(body: unknown): StripeEventOutcome {
  const root = asRecord(body);
  if (!root) return "invalid_request";

  const id = root["id"];
  const type = root["type"];
  if (typeof id !== "string" || !EVENT_ID_RE.test(id)) return "invalid_request";
  if (typeof type !== "string" || !/^[A-Za-z0-9_.]{3,64}$/.test(type)) return "invalid_request";

  // Live-mode traffic must never touch this staging ledger.
  if (root["livemode"] !== false) return "unsupported";
  if (type !== STRIPE_COMPLETION_EVENT_TYPE && type !== STRIPE_ASYNC_SUCCESS_EVENT_TYPE)
    return "unsupported";

  const data = asRecord(root["data"]);
  const object = data ? asRecord(data["object"]) : null;
  if (!object) return "invalid_request";

  if (object["object"] !== "checkout.session") return "invalid_request";
  if (object["livemode"] !== false) return "unsupported";
  if (object["mode"] !== "payment") return "unsupported";
  if (object["status"] !== "complete") return "unsupported";
  if (object["payment_status"] !== "paid") return "unsupported";

  const attemptId = object["client_reference_id"];
  if (!isUuid(attemptId)) return "invalid_request";

  return { externalEventId: id, eventType: type, attemptId };
}

/** An inert, owner-attempt-correlated signal; never payment or release proof. */
export function parseStripeAsyncFailureEvent(body: unknown): StripeEventOutcome {
  const root = asRecord(body);
  if (!root) return "invalid_request";
  const id = root["id"];
  const type = root["type"];
  if (typeof id !== "string" || !EVENT_ID_RE.test(id)) return "invalid_request";
  if (type !== STRIPE_ASYNC_FAILURE_EVENT_TYPE) return "unsupported";
  if (root["livemode"] !== false) return "unsupported";
  const data = asRecord(root["data"]);
  const object = data ? asRecord(data["object"]) : null;
  if (!object || object["object"] !== "checkout.session") return "invalid_request";
  if (
    object["livemode"] !== false ||
    object["mode"] !== "payment" ||
    object["status"] !== "complete" ||
    object["payment_status"] !== "unpaid"
  )
    return "unsupported";
  const attemptId = object["client_reference_id"];
  if (!isUuid(attemptId)) return "invalid_request";
  return { externalEventId: id, eventType: type, attemptId };
}

/* -------------------------- attempt reconciliation ------------------------ */

export type AttemptReconciliation =
  | { action: "complete" }
  | { action: "already_completed" }
  | { action: "reject"; code: CheckoutErrorCode };

/**
 * Decides what a verified completion event may do to a server-owned attempt.
 *
 * Only a `pending` attempt is advanced. An already-`completed` attempt is a
 * safe replay. A missing attempt, or one in any other terminal state, is
 * rejected without any write. No other attempt is ever touched.
 */
export function decideAttemptReconciliation(
  attempt: { id: string; status: string } | null,
): AttemptReconciliation {
  if (!attempt) return { action: "reject", code: "not_available" };
  if (attempt.status === "pending") return { action: "complete" };
  if (attempt.status === "completed") return { action: "already_completed" };
  return { action: "reject", code: "not_available" };
}

/** A valid signature/paid flag does not prove this attempt's immutable amount was paid. */
export function validatePaidCheckoutAmount(
  body: unknown,
  attempt: {
    amountCents: number;
    currency: string;
    provider: string;
    priceQuoteId?: string | null;
  },
  pricingEnabled = false,
): CheckoutErrorCode | null {
  const root = asRecord(body);
  const data = root ? asRecord(root["data"]) : null;
  const object = data ? asRecord(data["object"]) : null;
  const amount = object?.["amount_total"];
  const currency = object?.["currency"];
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    typeof currency !== "string" ||
    !/^[a-z]{3}$/.test(currency)
  )
    return "invalid_request";
  if (
    !Number.isSafeInteger(attempt.amountCents) ||
    attempt.amountCents < 0 ||
    typeof attempt.currency !== "string" ||
    !/^[a-z]{3}$/.test(attempt.currency) ||
    attempt.provider !== "stripe_test"
  )
    return "not_available";
  if (pricingEnabled) {
    // Only the opt-in loader's server-owned nullable column is authority. An
    // omitted/malformed column must not silently fall back to legacy pricing.
    if (!Object.hasOwn(attempt, "priceQuoteId")) return "not_available";
    const quote = attempt.priceQuoteId,
      metadata = object ? asRecord(object["metadata"]) : null;
    if (quote === null) {
      if (metadata && Object.hasOwn(metadata, "analog_price_quote")) return "invalid_request";
    } else {
      if (!isUuid(quote)) return "not_available";
      if (metadata?.["analog_price_quote"] !== quote) return "invalid_request";
    }
  }
  return amount === attempt.amountCents && currency === attempt.currency ? null : "invalid_request";
}

/** Generic, non-revealing acknowledgement body. Never includes provider data. */
export function stripeWebhookAckBody(args: {
  duplicate: boolean;
  reconciled: boolean;
  issued?: boolean;
}): Record<string, unknown> {
  return {
    ok: true,
    duplicate: args.duplicate,
    status: "processed",
    reconciled: args.reconciled,
    issued: args.issued === true,
  };
}

/* --------------------------- paid finalization ---------------------------- */

/** Canonical outcomes of the atomic staging paid-finalization routine. */
export type FinalizeOutcome =
  "finalized" | "idempotent_replay" | "unlinked" | "not_finalizable" | "unknown_attempt" | "error";

export type FinalizationEffect =
  | { action: "issued" }
  | { action: "replay" }
  | { action: "complete_only" }
  | { action: "reject"; code: CheckoutErrorCode };

/**
 * Maps a finalization outcome onto the only effects the webhook may have.
 * `unlinked` preserves the pre-Gate-82 behaviour for a synthetic attempt that
 * carries no pre-payment hold: the attempt is completed, nothing is issued.
 */
export function decideFinalizationEffect(outcome: FinalizeOutcome): FinalizationEffect {
  switch (outcome) {
    case "finalized":
      return { action: "issued" };
    case "idempotent_replay":
      return { action: "replay" };
    case "unlinked":
      return { action: "complete_only" };
    case "not_finalizable":
    case "unknown_attempt":
      return { action: "reject", code: "not_available" };
    default:
      return { action: "reject", code: "server_error" };
  }
}

/* ------------------------- expiry (abandonment) --------------------------- */

/** The only abandonment event this staging adapter reaps. */
export const STRIPE_EXPIRY_EVENT_TYPE = "checkout.session.expired";

export interface StripeExpiryEvent {
  externalEventId: string;
  eventType: string;
  attemptId: string;
}

/**
 * Accepts only an unambiguous *expired, unpaid, test-mode* Checkout Session
 * event carrying our opaque attempt id. Anything paid, live, non-payment, or
 * otherwise unexpected is `unsupported` (acknowledged, never acted on).
 */
export function parseStripeExpiryEvent(body: unknown): StripeEventOutcome {
  const root = asRecord(body);
  if (!root) return "invalid_request";

  const id = root["id"];
  const type = root["type"];
  if (typeof id !== "string" || !EVENT_ID_RE.test(id)) return "invalid_request";
  if (typeof type !== "string" || !/^[A-Za-z0-9_.]{3,64}$/.test(type)) return "invalid_request";

  if (root["livemode"] !== false) return "unsupported";
  if (type !== STRIPE_EXPIRY_EVENT_TYPE) return "unsupported";

  const data = asRecord(root["data"]);
  const object = data ? asRecord(data["object"]) : null;
  if (!object) return "invalid_request";

  if (object["object"] !== "checkout.session") return "invalid_request";
  if (object["livemode"] !== false) return "unsupported";
  if (object["mode"] !== "payment") return "unsupported";
  if (object["status"] !== "expired") return "unsupported";
  if (object["payment_status"] !== "unpaid") return "unsupported";
  // Unpaid is not proof that a delayed PaymentIntent cannot still succeed.
  // Only explicit absence can use this automatic abandonment path. A present
  // or omitted intent requires independently verified reconciliation instead.
  if (object["payment_intent"] !== null) return "unsupported";

  const attemptId = object["client_reference_id"];
  if (!isUuid(attemptId)) return "invalid_request";

  return { externalEventId: id, eventType: type, attemptId };
}

/* --------------------- refund candidates (no execution) ------------------- */

/**
 * The only event types a *future* per-ticket refund gate would consume. They
 * are recognised here purely so a validly signed delivery can be acknowledged
 * and recorded once. There is deliberately no refund execution path: nothing
 * in this module can reverse an order, ticket, hold, capacity, or eligibility
 * snapshot, and no Stripe call is expressible.
 */
export const STRIPE_REFUND_CANDIDATE_EVENT_TYPES = ["charge.refunded", "refund.updated"] as const;

export type StripeRefundCandidateType = (typeof STRIPE_REFUND_CANDIDATE_EVENT_TYPES)[number];

export interface StripeRefundCandidateEvent {
  externalEventId: string;
  eventType: StripeRefundCandidateType;
}

/**
 * Accepts only a well-formed, test-mode refund-candidate event. Nothing but
 * the event id and type is read: amounts, charges, payment intents, customers
 * and every other provider field are ignored and never retained.
 */
export function parseRefundCandidateEvent(
  body: unknown,
): StripeRefundCandidateEvent | CheckoutErrorCode | "unsupported" {
  const root = asRecord(body);
  if (!root) return "invalid_request";

  const id = root["id"];
  const type = root["type"];
  if (typeof id !== "string" || !EVENT_ID_RE.test(id)) return "invalid_request";
  if (typeof type !== "string" || !/^[A-Za-z0-9_.]{3,64}$/.test(type)) return "invalid_request";

  if (root["livemode"] !== false) return "unsupported";
  if (!(STRIPE_REFUND_CANDIDATE_EVENT_TYPES as readonly string[]).includes(type)) {
    return "unsupported";
  }
  if (!asRecord(root["data"])) return "invalid_request";

  return { externalEventId: id, eventType: type as StripeRefundCandidateType };
}

/**
 * Generic acknowledgement for a recognised refund candidate. `executed` is a
 * constant `false`: no refund execution path exists in this staging build.
 */
export function refundCandidateAckBody(args: { duplicate: boolean }): Record<string, unknown> {
  return {
    ok: true,
    duplicate: args.duplicate,
    status: "ignored",
    executed: false,
  };
}

/** Classifies a signed event as a completion, an expiry, a refund candidate, or neither. */
export function classifyStripeEvent(
  body: unknown,
): "completion" | "async_failure" | "expiry" | "refund_candidate" | "other" {
  const root = asRecord(body);
  const type = root?.["type"];
  if (type === STRIPE_COMPLETION_EVENT_TYPE || type === STRIPE_ASYNC_SUCCESS_EVENT_TYPE)
    return "completion";
  if (type === STRIPE_ASYNC_FAILURE_EVENT_TYPE) return "async_failure";
  if (type === STRIPE_EXPIRY_EVENT_TYPE) return "expiry";
  if (
    typeof type === "string" &&
    (STRIPE_REFUND_CANDIDATE_EVENT_TYPES as readonly string[]).includes(type)
  ) {
    return "refund_candidate";
  }
  return "other";
}

/* --------------------- opaque payment correlation ------------------------- */

const PAYMENT_INTENT_RE = /^pi_[A-Za-z0-9]{6,120}$/;

/**
 * Extracts the single opaque correlation identifier a completed Checkout
 * Session genuinely carries: its PaymentIntent id. Anything absent, expanded,
 * or malformed yields `null` — the completion path proceeds regardless, since
 * correlation is a convenience for a future refund gate, never a gate itself.
 *
 * Card, customer, e-mail, client secret, and URL fields are never read.
 */
export function extractPaymentCorrelation(body: unknown): string | null {
  const root = asRecord(body);
  const data = root ? asRecord(root["data"]) : null;
  const object = data ? asRecord(data["object"]) : null;
  if (!object) return null;
  const intent = object["payment_intent"];
  return typeof intent === "string" && PAYMENT_INTENT_RE.test(intent) ? intent : null;
}

export type AbandonReconciliation = { action: "abandon" } | { action: "noop" };

/**
 * Only a `pending` attempt may be abandoned. Unknown, paid/completed, failed,
 * refunded, fulfilled, or already-abandoned attempts are no-ops: the event is
 * acknowledged and nothing is written.
 */
export function decideAbandonReconciliation(
  attempt: { id: string; status: string } | null,
): AbandonReconciliation {
  if (!attempt) return { action: "noop" };
  return attempt.status === "pending" ? { action: "abandon" } : { action: "noop" };
}

/** Canonical outcomes of the atomic staging abandonment routine. */
export type AbandonOutcome =
  | "abandoned"
  | "abandoned_released"
  | "idempotent_replay"
  | "not_abandonable"
  | "unknown_attempt"
  | "error";

/** Generic acknowledgement for the expiry path. Never includes provider data. */
export function stripeExpiryAckBody(args: {
  duplicate: boolean;
  abandoned: boolean;
  released: boolean;
}): Record<string, unknown> {
  return {
    ok: true,
    duplicate: args.duplicate,
    status: args.abandoned ? "processed" : "ignored",
    abandoned: args.abandoned,
    released: args.released,
  };
}
