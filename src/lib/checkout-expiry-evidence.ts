/** Pure v2 expiry evidence adapter. NOT signature verification or release authority
 * by itself. Only a signature-verified route may pass an event here; saved facts
 * must come from minimum server-owned reads. The RPC still rechecks under lock. */
import { isUuid } from "./checkout-core";
import { parseStripeExpiryEvent } from "./stripe-webhook-core";

export interface ExpiryAttemptFacts {
  id: string;
  userId: string;
  reservationId: string;
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  currency: string;
  provider: string;
  status: string;
  providerRequestVersion: number;
  providerExpiresAtSeconds: number;
  createdAt: string;
  paymentIntentId: string | null;
}
export interface ExpiryHoldFacts {
  id: string;
  ownerUserId: string;
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  status: string;
  /** Preserve the original precision for the SQL exact-match parameter. */
  expiresAt: string;
}
export interface V2ExpiryReleaseArgs {
  p_attempt_id: string;
  p_reservation_id: string;
  p_owner_user_id: string;
  p_event_id: string;
  p_ticket_type_id: string;
  p_quantity: number;
  p_unit_price_cents: number;
  p_amount_cents: number;
  p_currency: string;
  p_hold_expires_at: string;
  p_provider_expires_at_seconds: number;
  p_observed_expires_at_seconds: number;
  p_observed_at: string;
  p_observed_status: "expired";
  p_observed_payment_status: "unpaid";
  p_observed_intent_state: "none";
}
const record = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
const wholeSeconds = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x > 0;

/** Fail closed; return only the exact RPC tuple, never provider/contact bodies. */
export function buildV2ExpiryReleaseArgs(
  verifiedEvent: unknown,
  attempt: ExpiryAttemptFacts,
  hold: ExpiryHoldFacts,
  nowMs: number,
): V2ExpiryReleaseArgs | null {
  const parsed = parseStripeExpiryEvent(verifiedEvent);
  if (typeof parsed === "string") return null;
  const root = record(verifiedEvent);
  const data = record(root?.["data"]);
  const session = record(data?.["object"]);
  const eventCreated = root?.["created"],
    observedAtMs = wholeSeconds(eventCreated) ? eventCreated * 1000 : NaN;
  return buildRetrievedV2ExpiryReleaseArgs(session, attempt, hold, observedAtMs, nowMs);
}

/** Pure validator, NOT provider authentication. Only a trusted exact GET caller
 * may supply retrievedSession and its server-measured request-start timestamp.
 * Never adapt a webhook to this function by replacing its creation timestamp. */
export function buildRetrievedV2ExpiryReleaseArgs(
  retrievedSession: unknown,
  attempt: ExpiryAttemptFacts,
  hold: ExpiryHoldFacts,
  observedAtMs: number,
  nowMs: number,
): V2ExpiryReleaseArgs | null {
  const session = record(retrievedSession);
  if (
    !session ||
    session["object"] !== "checkout.session" ||
    session["livemode"] !== false ||
    session["mode"] !== "payment" ||
    session["status"] !== "expired" ||
    session["payment_status"] !== "unpaid" ||
    session["payment_intent"] !== null
  )
    return null;
  const sessionCreated = session["created"];
  const holdMs = Date.parse(hold.expiresAt),
    attemptMs = Date.parse(attempt.createdAt);
  // PostgreSQL retains microseconds; Date.parse truncates them. Round the
  // comparison up, never the RPC's original exact string, to avoid admitting
  // evidence from the provider's rounded second before full hold expiry.
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/.exec(hold.expiresAt)?.[1];
  const holdCeilingMs = holdMs + (fraction && /[1-9]/.test(fraction.slice(3)) ? 1 : 0);
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0 ||
    !Number.isFinite(new Date(nowMs).getTime()) ||
    !Number.isFinite(holdMs) ||
    !Number.isFinite(attemptMs) ||
    attemptMs > nowMs ||
    attemptMs >= holdMs ||
    holdCeilingMs > nowMs ||
    !Number.isSafeInteger(observedAtMs) ||
    observedAtMs <= 0 ||
    !wholeSeconds(sessionCreated) ||
    observedAtMs > nowMs ||
    observedAtMs < nowMs - 300_000 ||
    // Require independent full hold expiry, not just its rounded provider second.
    observedAtMs < holdCeilingMs ||
    sessionCreated < Math.floor(attemptMs / 1000) ||
    sessionCreated * 1000 > observedAtMs ||
    sessionCreated >= attempt.providerExpiresAtSeconds ||
    !wholeSeconds(attempt.providerExpiresAtSeconds) ||
    attempt.providerExpiresAtSeconds !== Math.floor(holdMs / 1000) ||
    session?.["expires_at"] !== attempt.providerExpiresAtSeconds ||
    typeof session?.["id"] !== "string" ||
    !/^cs_test_[A-Za-z0-9]{6,200}$/.test(session["id"]) ||
    session["client_reference_id"] !== attempt.id ||
    !isUuid(attempt.id) ||
    !isUuid(attempt.userId) ||
    !isUuid(attempt.reservationId) ||
    !isUuid(attempt.eventId) ||
    !isUuid(attempt.ticketTypeId) ||
    attempt.providerRequestVersion !== 2 ||
    attempt.provider !== "stripe_test" ||
    attempt.status !== "pending" ||
    attempt.paymentIntentId !== null ||
    hold.id !== attempt.reservationId ||
    hold.ownerUserId !== attempt.userId ||
    hold.eventId !== attempt.eventId ||
    hold.ticketTypeId !== attempt.ticketTypeId ||
    hold.quantity !== attempt.quantity ||
    hold.status !== "confirmed" ||
    !Number.isSafeInteger(attempt.quantity) ||
    attempt.quantity < 1 ||
    attempt.quantity > 10 ||
    !Number.isSafeInteger(attempt.unitPriceCents) ||
    attempt.unitPriceCents < 0 ||
    !Number.isSafeInteger(attempt.amountCents) ||
    attempt.amountCents < 0 ||
    attempt.unitPriceCents * attempt.quantity !== attempt.amountCents ||
    !/^[a-z]{3}$/.test(attempt.currency) ||
    session["amount_total"] !== attempt.amountCents ||
    session["currency"] !== attempt.currency
  )
    return null;
  return {
    p_attempt_id: attempt.id,
    p_reservation_id: hold.id,
    p_owner_user_id: attempt.userId,
    p_event_id: attempt.eventId,
    p_ticket_type_id: attempt.ticketTypeId,
    p_quantity: attempt.quantity,
    p_unit_price_cents: attempt.unitPriceCents,
    p_amount_cents: attempt.amountCents,
    p_currency: attempt.currency,
    p_hold_expires_at: hold.expiresAt,
    p_provider_expires_at_seconds: attempt.providerExpiresAtSeconds,
    p_observed_expires_at_seconds: attempt.providerExpiresAtSeconds,
    p_observed_at: new Date(observedAtMs).toISOString(),
    p_observed_status: "expired",
    p_observed_payment_status: "unpaid",
    p_observed_intent_state: "none",
  };
}
