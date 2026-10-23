/**
 * Gate 88 — server-only Stripe test-mode refund adapter.
 *
 * Server-only by filename (`*.server.ts`); never reachable from a browser
 * bundle and never exposed through a route. It performs no I/O of its own:
 * every call goes through an injected transport, so all tests run offline.
 *
 * It can only ever create a refund for an opaque test-mode payment intent, with
 * a stable idempotency key, and it never logs or returns provider payload,
 * key material, customer data, or a raw error.
 */
import {
  STRIPE_REFUNDS_URL,
  buildRefundForm,
  buildRefundHeaders,
  parseRefundResponse,
  type RefundResponseOutcome,
} from "@/lib/refund-coordinator-core";
import { STRIPE_API_VERSION, type StripeTransport } from "@/lib/stripe-checkout.server";

export const STRIPE_REFUND_TIMEOUT_MS = 20_000;

export interface StripeRefundEnv {
  PAYMENTS_TEST_MODE?: string | undefined;
  PAYMENT_PROVIDER?: string | undefined;
  STRIPE_TEST_RESTRICTED_KEY?: string | undefined;
  /** Opt-in only after the reviewed quote schema is installed. */
  PROMOTION_PRICING_SANDBOX_MODE?: string | undefined;
}

const TEST_KEY_PREFIX = "rk_test_";

/** Fail-closed test-only boundary: anything live-looking makes no outbound call. */
export function resolveStripeRefundKey(env: StripeRefundEnv): string | null {
  if ((env.PAYMENTS_TEST_MODE ?? "").trim().toLowerCase() !== "true") return null;
  if ((env.PAYMENT_PROVIDER ?? "").trim() !== "stripe_test") return null;
  const key = (env.STRIPE_TEST_RESTRICTED_KEY ?? "").trim();
  if (!key.startsWith(TEST_KEY_PREFIX)) return null;
  if (key.length < TEST_KEY_PREFIX.length + 16) return null;
  if (/live/i.test(key)) return null;
  return key;
}

export async function createStripeTestRefund(options: {
  env: StripeRefundEnv;
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
  transport: StripeTransport;
}): Promise<RefundResponseOutcome | { ok: false; code: "configuration" }> {
  const key = resolveStripeRefundKey(options.env);
  if (!key) return { ok: false, code: "configuration" };

  const form = buildRefundForm({
    paymentIntentId: options.paymentIntentId,
    amountCents: options.amountCents,
  });

  let response: { status: number; body: string };
  try {
    response = await options.transport({
      url: STRIPE_REFUNDS_URL,
      method: "POST",
      headers: buildRefundHeaders(key, options.idempotencyKey, STRIPE_API_VERSION),
      body: form.toString(),
      timeoutMs: STRIPE_REFUND_TIMEOUT_MS,
    });
  } catch {
    // Network/timeout: the refund may or may not exist provider-side, so this
    // is deliberately not a plain failure for the caller's ledger.
    return { ok: false, code: "reconciliation_needed" };
  }

  if (!response || typeof response.status !== "number" || typeof response.body !== "string") {
    return { ok: false, code: "reconciliation_needed" };
  }

  return parseRefundResponse(response.status, response.body, {
    paymentIntentId: options.paymentIntentId,
    amountCents: options.amountCents,
  });
}
