/**
 * Gate 88 — pure, dependency-free logic for the private staging test-mode
 * refund coordinator.
 *
 * Nothing in this module performs I/O. It owns: request validation, the stable
 * provider idempotency key, refund amount math, the Stripe refund request form,
 * and strict verification of the returned refund object (correct payment
 * correlation, test mode only). Every provider failure collapses to a generic
 * code; no provider payload, key, or PII is ever surfaced or retained.
 */
import {
  MAX_REVERSAL_SELECTION,
  isPaymentCorrelationReference,
  isRefundReference,
} from "@/lib/refund-reversal-core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Every outcome the coordinator can report. Exactly one is a success. */
export const REFUND_OUTCOMES = [
  "refunded",
  "idempotent_replay",
  "attempt_in_progress",
  "previous_attempt_failed",
  "reconciliation_needed",
  "invalid_selection",
  "invalid_payment_reference",
  "duplicate_ticket_ids",
  "ineligible_selection",
  "configuration",
  "provider_failed",
] as const;

export type RefundOutcome = (typeof REFUND_OUTCOMES)[number];

/** Outcomes that must leave every ticket, counter and Stripe object untouched. */
export const REFUND_NO_PROVIDER_CALL_OUTCOMES: readonly RefundOutcome[] = [
  "idempotent_replay",
  "attempt_in_progress",
  "previous_attempt_failed",
  "invalid_selection",
  "invalid_payment_reference",
  "duplicate_ticket_ids",
  "ineligible_selection",
  "configuration",
];

export function isRefundOutcome(value: unknown): value is RefundOutcome {
  return typeof value === "string" && (REFUND_OUTCOMES as readonly string[]).includes(value);
}

/* ------------------------------- request ---------------------------------- */

export interface RefundRequest {
  /** Distinct ticket ids, canonically sorted. */
  ticketIds: string[];
  paymentIntentId: string;
}

export function parseRefundRequest(input: unknown): RefundRequest | RefundOutcome {
  if (!input || typeof input !== "object") return "invalid_selection";
  const raw = input as Record<string, unknown>;

  if (!isPaymentCorrelationReference(raw["paymentIntentId"])) return "invalid_payment_reference";

  const ids = raw["ticketIds"];
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_REVERSAL_SELECTION) {
    return "invalid_selection";
  }
  if (!ids.every((id) => typeof id === "string" && UUID_RE.test(id))) return "invalid_selection";
  if (new Set(ids as string[]).size !== ids.length) return "duplicate_ticket_ids";

  return {
    ticketIds: [...(ids as string[])].map((id) => id.toLowerCase()).sort(),
    paymentIntentId: raw["paymentIntentId"] as string,
  };
}

/* --------------------------- idempotency key ------------------------------ */

/**
 * Stable, non-identifying key for one selection of one payment. Derived only
 * from opaque server-side references, so the same request always reuses the
 * same provider idempotency key and can never create a second Stripe refund.
 */
export function buildRefundIdempotencyKey(request: RefundRequest): string {
  const canonical = `${request.paymentIntentId}|${request.ticketIds.join(",")}`;
  // 128-bit FNV-1a over four offset lanes: deterministic, dependency-free, and
  // only ever applied to opaque identifiers.
  const lanes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x7feb352d];
  for (let lane = 0; lane < lanes.length; lane += 1) {
    let h = lanes[lane]! >>> 0;
    for (let i = 0; i < canonical.length; i += 1) {
      h ^= canonical.charCodeAt(i) + lane;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    lanes[lane] = h >>> 0;
  }
  const hex = lanes.map((h) => h.toString(16).padStart(8, "0")).join("");
  return `g88_${hex}`;
}

export function isRefundIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^g88_[0-9a-f]{32}$/.test(value);
}

/* ------------------------------ amount math ------------------------------- */

export function computeRefundAmountCents(args: {
  unitPriceCents: number;
  selectedCount: number;
  paidQuantity: number;
}): number | RefundOutcome {
  const { unitPriceCents, selectedCount, paidQuantity } = args;
  if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) return "ineligible_selection";
  if (!Number.isInteger(selectedCount) || selectedCount <= 0) return "invalid_selection";
  if (!Number.isInteger(paidQuantity) || selectedCount > paidQuantity) {
    return "ineligible_selection";
  }
  const amount = unitPriceCents * selectedCount;
  if (!Number.isSafeInteger(amount) || amount <= 0) return "ineligible_selection";
  return amount;
}

/* --------------------------- provider request ----------------------------- */

export const STRIPE_REFUNDS_URL = "https://api.stripe.com/v1/refunds";

export function buildRefundForm(args: {
  paymentIntentId: string;
  amountCents: number;
}): URLSearchParams {
  const form = new URLSearchParams();
  form.set("payment_intent", args.paymentIntentId);
  form.set("amount", String(args.amountCents));
  return form;
}

export function buildRefundHeaders(
  restrictedKey: string,
  idempotencyKey: string,
  apiVersion: string,
): Record<string, string> {
  return {
    authorization: `Bearer ${restrictedKey}`,
    "content-type": "application/x-www-form-urlencoded",
    "stripe-version": apiVersion,
    "idempotency-key": idempotencyKey,
  };
}

/* --------------------------- provider response ---------------------------- */

/** The only refund facts this project keeps: all opaque, none identifying. */
export interface VerifiedRefund {
  reference: string;
  amountCents: number;
  status: string;
}

export type RefundResponseOutcome =
  | { ok: true; refund: VerifiedRefund }
  | { ok: false; code: "provider_failed" | "reconciliation_needed" };

const ACCEPTED_REFUND_STATUSES = new Set(["succeeded", "pending"]);

/**
 * Accepts only a non-live refund object that belongs to the expected payment
 * intent and matches the requested amount exactly. A 2xx response that fails
 * any of these checks means Stripe may hold money we cannot safely reverse, so
 * it is escalated to `reconciliation_needed` rather than treated as a failure.
 */
export function parseRefundResponse(
  status: number,
  body: string,
  expected: { paymentIntentId: string; amountCents: number },
): RefundResponseOutcome {
  // Only an explicit client refusal is treated as a definite failure. A
  // conflict, rate limit, dependency error, timeout, or server error cannot
  // establish whether provider-side execution began. Never invite a retry or
  // an overlapping refund based solely on one of those responses.
  if (status !== 200)
    return {
      ok: false,
      code: [400, 401, 402, 403, 404].includes(status)
        ? "provider_failed"
        : "reconciliation_needed",
    };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, code: "reconciliation_needed" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, code: "reconciliation_needed" };
  const raw = parsed as Record<string, unknown>;

  if (raw["object"] !== "refund") return { ok: false, code: "reconciliation_needed" };
  // The Refund resource does not carry `livemode` on this API version; test mode
  // is enforced by the restricted test key and by the correlated test payment
  // intent. A refund that explicitly declares live mode is always rejected.
  if (raw["livemode"] === true) return { ok: false, code: "reconciliation_needed" };
  if (!isRefundReference(raw["id"])) return { ok: false, code: "reconciliation_needed" };
  if (raw["payment_intent"] !== expected.paymentIntentId) {
    return { ok: false, code: "reconciliation_needed" };
  }
  if (raw["amount"] !== expected.amountCents) return { ok: false, code: "reconciliation_needed" };

  const refundStatus = raw["status"];
  if (typeof refundStatus !== "string" || !ACCEPTED_REFUND_STATUSES.has(refundStatus)) {
    return { ok: false, code: "reconciliation_needed" };
  }

  return {
    ok: true,
    refund: {
      reference: raw["id"] as string,
      amountCents: expected.amountCents,
      status: refundStatus,
    },
  };
}

/* ------------------------------ ledger replay ----------------------------- */

export type LedgerState =
  "pending" | "provider_refunded" | "reversed" | "reconciliation_needed" | "failed";

/**
 * Replay policy. A previously observed key never triggers another provider
 * call: succeeded is a silent replay, an incomplete attempt is escalated, and a
 * failed attempt is reported rather than blindly retried against Stripe.
 */
export function classifyLedgerState(state: LedgerState | null): RefundOutcome | "proceed" {
  switch (state) {
    case null:
      return "proceed";
    case "reversed":
      return "idempotent_replay";
    case "pending":
      return "attempt_in_progress";
    case "provider_refunded":
    case "reconciliation_needed":
      return "reconciliation_needed";
    case "failed":
      return "previous_attempt_failed";
    default:
      return "reconciliation_needed";
  }
}
