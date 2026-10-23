/** Pure deadline policy: new linked creation uses the planner; classification
 * still grants no I/O, mutation, retry, or inventory-release authority. */
export const DEADLINE_REQUEST_VERSION = 2;
export const SESSION_MIN_LIFETIME_SECONDS = 30 * 60;
export const SESSION_MAX_LIFETIME_SECONDS = 24 * 60 * 60;
// Allow the existing 15-second transport timeout plus rounding margin.
export const SESSION_CREATION_MARGIN_SECONDS = 16;

/** Only for a new version-2 request. Persist this exact deadline before sending.
 * Never apply it to a version-1 retry: changing an idempotent form is unsafe.
 * Replay must reuse the saved value, not recompute or extend it.
 */
export function planSessionDeadline(input: {
  requestVersion: number;
  holdExpiresAt: string;
  nowMs: number;
}): number | null {
  const holdMs = Date.parse(input.holdExpiresAt);
  if (
    input.requestVersion !== DEADLINE_REQUEST_VERSION ||
    !Number.isSafeInteger(input.nowMs) ||
    !Number.isFinite(holdMs)
  )
    return null;
  const expiry = Math.floor(holdMs / 1000);
  const remaining = expiry - Math.ceil(input.nowMs / 1000);
  return remaining >= SESSION_MIN_LIFETIME_SECONDS + SESSION_CREATION_MARGIN_SECONDS &&
    remaining <= SESSION_MAX_LIFETIME_SECONDS
    ? expiry
    : null;
}

export interface DeadlineReconciliationFacts {
  nowMs: number;
  attemptId: string;
  requestVersion: number;
  savedExpiresAtSeconds: number;
  holdExpiresAt: string;
  holdStatus: string;
  attemptStatus: string;
  amountCents: number;
  currency: string;
  hasFulfillment: boolean;
  /** Must come from authenticated server-side provider retrieval/verified event,
   * never client input. This pure policy cannot establish that provenance.
   */
  observed: {
    clientReferenceId: string;
    expiresAtSeconds: number;
    amountCents: number;
    currency: string;
    livemode: boolean;
    mode: string;
    status: string;
    paymentStatus: string;
    paymentIntentStatus: string;
  } | null;
}
export type DeadlineCandidate = "retain" | "paid_review" | "unpaid_release_candidate";

/** Classification only. A candidate is NOT a safe-to-release command.
 * A future writer must lock/recheck the exact hold/attempt/fulfillment tuple
 * atomically; provider observation and local reads are not one transaction.
 */
export function classifyDeadlineCandidate(facts: DeadlineReconciliationFacts): DeadlineCandidate {
  const o = facts.observed;
  const holdMs = Date.parse(facts.holdExpiresAt);
  if (
    !o ||
    facts.requestVersion !== DEADLINE_REQUEST_VERSION ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(facts.attemptId) ||
    !Number.isSafeInteger(facts.nowMs) ||
    !Number.isFinite(holdMs) ||
    !Number.isSafeInteger(facts.savedExpiresAtSeconds) ||
    facts.savedExpiresAtSeconds <= 0 ||
    facts.savedExpiresAtSeconds !== Math.floor(holdMs / 1000) ||
    !Number.isSafeInteger(facts.amountCents) ||
    facts.amountCents < 50 ||
    !/^[a-z]{3}$/.test(facts.currency) ||
    o.clientReferenceId !== facts.attemptId ||
    o.expiresAtSeconds !== facts.savedExpiresAtSeconds ||
    o.amountCents !== facts.amountCents ||
    o.currency !== facts.currency ||
    o.livemode !== false ||
    o.mode !== "payment"
  )
    return "retain";
  // Paid outcomes require reconciliation even after the local deadline. Never
  // reinterpret paid funds as abandoned inventory or auto-refund/auto-issue.
  if (o.paymentStatus === "paid") return "paid_review";
  if (
    facts.hasFulfillment !== false ||
    facts.holdStatus !== "confirmed" ||
    facts.attemptStatus !== "pending" ||
    facts.nowMs < holdMs ||
    o.status !== "expired" ||
    o.paymentStatus !== "unpaid" ||
    !["none", "canceled"].includes(o.paymentIntentStatus)
  )
    return "retain";
  return "unpaid_release_candidate";
}
