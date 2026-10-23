/** Exact GET-only expiry evidence; SQL rechecks the owner/quote/attempt under locks. */
import { isUuid } from "./checkout-core";
import { readPricedCart, type PromoRpcClient } from "./guest-promo.server";
import {
  lookupStripeTestCheckout,
  type CheckoutReadTransport,
} from "./stripe-checkout-lookup.server";
import {
  STRIPE_API_URL,
  STRIPE_API_VERSION,
  resolveStripeAdapterConfig,
  type StripeAdapterEnv,
} from "./stripe-checkout.server";
import type { PromoResult } from "./guest-promo-core";
type Context = NonNullable<Awaited<ReturnType<typeof readPricedCart>>>;
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
async function release(
  client: PromoRpcClient,
  owner: string,
  cart: string,
  evidence: Record<string, unknown> = {},
) {
  const result = await client.rpc("release_priced_guest_cart", {
    p_owner: owner,
    p_cart: cart,
    ...evidence,
  });
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1) return null;
  return record(result.data[0])?.["outcome"];
}
async function freshEvidence(options: {
  context: Context;
  sessionId: string;
  env: StripeAdapterEnv;
  transport: CheckoutReadTransport;
  now: () => number;
}) {
  const config = resolveStripeAdapterConfig(options.env),
    c = options.context;
  const started = options.now();
  if (
    typeof config === "string" ||
    !/^cs_test_[A-Za-z0-9]{8,200}$/.test(options.sessionId) ||
    !Number.isSafeInteger(started) ||
    started < c.quote.expiresAtMs ||
    !c.attemptId ||
    c.createdAtSeconds === null ||
    c.deadline === null ||
    c.paymentAttached
  )
    return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      options.transport({
        url: `${STRIPE_API_URL}/${options.sessionId}`,
        method: "GET",
        headers: {
          authorization: `Bearer ${config.restrictedKey}`,
          "stripe-version": STRIPE_API_VERSION,
        },
        timeoutMs: 5000,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 5000);
      }),
    ]);
    const ended = options.now();
    if (
      !Number.isSafeInteger(ended) ||
      ended < started ||
      ended - started > 5000 ||
      response.status !== 200 ||
      typeof response.body !== "string" ||
      response.body.length > 512 * 1024
    )
      return null;
    const s = record(JSON.parse(response.body));
    if (
      !s ||
      s["id"] !== options.sessionId ||
      s["object"] !== "checkout.session" ||
      s["livemode"] !== false ||
      s["mode"] !== "payment" ||
      s["status"] !== "expired" ||
      s["payment_status"] !== "unpaid" ||
      s["payment_intent"] !== null ||
      s["client_reference_id"] !== c.attemptId ||
      record(s["metadata"])?.["analog_price_quote"] !== c.quote.quoteId ||
      s["expires_at"] !== c.deadline ||
      s["amount_total"] !== c.quote.totalCents ||
      s["currency"] !== c.quote.currency ||
      !Number.isSafeInteger(s["created"]) ||
      (s["created"] as number) < c.createdAtSeconds ||
      (s["created"] as number) >= c.deadline ||
      (s["created"] as number) * 1000 > started
    )
      return null;
    return {
      p_quote: c.quote.quoteId,
      p_attempt: c.attemptId,
      p_deadline: c.deadline,
      p_amount: c.quote.totalCents,
      p_currency: c.quote.currency,
      p_observed_at: new Date(started).toISOString(),
      p_state: "test_expired_unpaid_null_intent",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
export async function reconcilePricedCartExpiry(options: {
  client: PromoRpcClient;
  owner: string;
  cartId: string;
  env: StripeAdapterEnv;
  readTransport: CheckoutReadTransport;
  now?: () => number;
}): Promise<PromoResult<{ outcome: "released" | "already_released" }>> {
  const { client, owner, cartId } = options,
    now = options.now ?? Date.now;
  if (!isUuid(owner) || !isUuid(cartId)) return { ok: false, code: "invalid_request" };
  if (options.env.PAYMENTS_TEST_MODE !== "true" || options.env.PAYMENT_PROVIDER !== "stripe_test")
    return { ok: false, code: "configuration" };
  try {
    // Atomically handles a never-started quote and recorded replay with no provider I/O.
    const first = await release(client, owner, cartId);
    if (first === "released" || first === "already_released")
      return { ok: true, value: { outcome: first } };
    if (first !== "evidence_required") return { ok: false, code: "not_available" };
    const before = await readPricedCart(client, owner, cartId);
    if (
      !before ||
      before.attemptStatus !== "pending" ||
      before.reservationStatus !== "confirmed" ||
      before.paymentAttached ||
      !before.attemptId ||
      before.createdAtSeconds === null ||
      before.deadline === null ||
      before.quote.expiresAtMs > now()
    )
      return { ok: false, code: "not_available" };
    const candidate = await lookupStripeTestCheckout({
      env: options.env,
      transport: options.readTransport,
      now,
      facts: {
        attemptId: before.attemptId,
        requestVersion: 2,
        createdAtSeconds: before.createdAtSeconds,
        expiresAtSeconds: before.deadline,
        amountCents: before.quote.totalCents,
        currency: before.quote.currency,
        priceQuoteId: before.quote.quoteId,
      },
    });
    if (candidate.status !== "expired_unpaid_candidate")
      return { ok: false, code: "not_available" };
    const evidence = await freshEvidence({
      context: before,
      sessionId: candidate.sessionId,
      env: options.env,
      transport: options.readTransport,
      now,
    });
    if (!evidence) return { ok: false, code: "not_available" };
    const after = await readPricedCart(client, owner, cartId);
    if (JSON.stringify(before) !== JSON.stringify(after))
      return { ok: false, code: "not_available" };
    const outcome = await release(client, owner, cartId, evidence);
    return outcome === "released" || outcome === "already_released"
      ? { ok: true, value: { outcome } }
      : { ok: false, code: "not_available" };
  } catch {
    return { ok: false, code: "server_error" };
  }
}

/** Browser acknowledgments deliberately omit internal effect/replay details. */
export async function expirePricedCart(
  options: Parameters<typeof reconcilePricedCartExpiry>[0],
): Promise<PromoResult<{ status: "released" }>> {
  const result = await reconcilePricedCartExpiry(options);
  return result.ok ? { ok: true, value: { status: "released" } } : result;
}
