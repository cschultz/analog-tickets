/** Trusted internal TEST entry points. No HTTP endpoint, scheduler or provider POST. */
import { isUuid } from "./checkout-core";
import { reconcilePricedCartExpiry } from "./guest-promo-expiry.server";
import { readPricedCart, type PromoRpcClient } from "./guest-promo.server";
import { parseStripeExpiryEvent, type AbandonOutcome } from "./stripe-webhook-core";
import type { CheckoutReadTransport } from "./stripe-checkout-lookup.server";
import type { StripeAdapterEnv } from "./stripe-checkout.server";

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
type Options = {
  client: PromoRpcClient;
  enabled: string | undefined;
  env: StripeAdapterEnv;
  loadTransport: () => Promise<CheckoutReadTransport>;
  now?: () => number;
};
const enabled = (o: Options) =>
  o.enabled === "true" &&
  o.env.PAYMENTS_TEST_MODE === "true" &&
  o.env.PAYMENT_PROVIDER === "stripe_test";
const failed = { outcome: "error" as const, released: 0 };
const noop = { outcome: "not_abandonable" as const, released: 0 };

/** Caller MUST verify Stripe signature first. Signed data selects only the
 * attempt; SQL supplies owner/cart and the original immutable price contract.
 * Stale signed events can prompt a new GET, never be retimestamped as evidence. */
export async function reconcileSignedPricedExpiry(
  o: Options & {
    verifiedEvent: unknown;
    attemptId: string;
  },
): Promise<{ outcome: AbandonOutcome; released: number } | null> {
  if (!enabled(o)) return failed;
  const parsed = parseStripeExpiryEvent(o.verifiedEvent);
  if (typeof parsed === "string" || parsed.attemptId !== o.attemptId) return noop;
  try {
    const target = await o.client.rpc("read_priced_expiry_target", { p_attempt: o.attemptId });
    if (target.error || !Array.isArray(target.data) || target.data.length !== 1) return failed;
    const t = record(target.data[0]);
    if (!t || t["attempt_id"] !== o.attemptId) return failed;
    if (t["quote_id"] === null && t["owner_user_id"] === null && t["cart_id"] === null) return null; // Only an explicit legacy row may use the legacy reconciler.
    if (!isUuid(t["quote_id"]) || !isUuid(t["owner_user_id"]) || !isUuid(t["cart_id"]))
      return failed;
    const c = await readPricedCart(o.client, t["owner_user_id"], t["cart_id"]);
    if (!c || c.attemptId !== o.attemptId || c.quote.quoteId !== t["quote_id"]) return failed;
    const root = record(o.verifiedEvent),
      s = record(record(root?.["data"])?.["object"]);
    const now = (o.now ?? Date.now)();
    if (
      !s ||
      !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(root?.["created"]) ||
      (root!["created"] as number) <= 0 ||
      (root!["created"] as number) * 1000 > now ||
      !Number.isSafeInteger(s["created"]) ||
      c.createdAtSeconds === null ||
      (s["created"] as number) < c.createdAtSeconds ||
      (s["created"] as number) > (root!["created"] as number) ||
      !/^cs_test_[A-Za-z0-9]{8,200}$/.test(String(s["id"])) ||
      s["amount_total"] !== c.quote.totalCents ||
      s["currency"] !== c.quote.currency ||
      s["expires_at"] !== c.deadline ||
      (s["created"] as number) >= (c.deadline ?? 0) ||
      record(s["metadata"])?.["analog_price_quote"] !== c.quote.quoteId
    )
      return noop;
    // Keep a delivery before the full immutable quote deadline retryable.
    if (now < c.quote.expiresAtMs) return failed;
    if (!["pending", "abandoned"].includes(c.attemptStatus ?? "") || c.paymentAttached) return noop;
    const result = await reconcilePricedCartExpiry({
      client: o.client,
      owner: t["owner_user_id"],
      cartId: t["cart_id"],
      env: o.env,
      // Lazy: never-started/recorded replay has no provider or credential I/O.
      readTransport: async (request) => (await o.loadTransport())(request),
      now: o.now ?? Date.now,
    });
    if (!result.ok) return failed; // Unknown provider outcome must not be terminal ignored.
    return result.value.outcome === "released"
      ? { outcome: "abandoned_released", released: 1 }
      : { outcome: "idempotent_replay", released: 0 };
  } catch {
    return failed;
  }
}

export type ExpiryCursor = { expiresAt: string; quoteId: string };
/** One bounded page for a trusted operator/worker. No schedule is configured.
 * Resume with next; restart at null on a later sweep to reconsider uncertainty.
 * Cursor advances only over attempted rows. No customer data/provider refs in result. */
export async function runPricedExpiryBatch(
  o: Options & {
    limit?: number;
    after?: ExpiryCursor | null;
  },
): Promise<{
  ok: boolean;
  scanned: number;
  released: number;
  retained: number;
  next: ExpiryCursor | null;
  exhausted: boolean;
}> {
  const empty = { ok: false, scanned: 0, released: 0, retained: 0, next: null, exhausted: false };
  const limit = o.limit ?? 10,
    after = o.after ?? null,
    now = o.now ?? Date.now;
  const start = now();
  if (
    !enabled(o) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 10 ||
    (after !== null && (!isUuid(after.quoteId) || !Number.isFinite(Date.parse(after.expiresAt))))
  )
    return empty;
  try {
    const result = await o.client.rpc("list_priced_expiry_candidates", {
      p_limit: limit,
      p_after_expiry: after?.expiresAt ?? null,
      p_after_quote: after?.quoteId ?? null,
    });
    if (result.error || !Array.isArray(result.data) || result.data.length > limit) return empty;
    const readAt = now();
    if (!Number.isSafeInteger(readAt) || readAt < start) return empty;
    const rows = result.data.map(record),
      ids = new Set<string>();
    for (const r of rows) {
      if (
        !r ||
        !isUuid(r["quote_id"]) ||
        !isUuid(r["owner_user_id"]) ||
        !isUuid(r["cart_id"]) ||
        typeof r["expires_at"] !== "string" ||
        !Number.isFinite(Date.parse(r["expires_at"])) ||
        Date.parse(r["expires_at"]) > readAt ||
        ids.has(r["quote_id"])
      )
        return empty;
      ids.add(r["quote_id"]);
    }
    let scanned = 0,
      released = 0,
      retained = 0,
      next: ExpiryCursor | null = null;
    for (const r of rows) {
      const clock = now();
      if (!Number.isSafeInteger(clock) || clock < start || clock - start >= 30_000) break;
      const row = r!;
      const expiry = await reconcilePricedCartExpiry({
        client: o.client,
        owner: row["owner_user_id"] as string,
        cartId: row["cart_id"] as string,
        env: o.env,
        readTransport: async (request) => (await o.loadTransport())(request),
        now,
      });
      scanned++;
      if (expiry.ok && expiry.value.outcome === "released") released++;
      else retained++;
      next = { expiresAt: row["expires_at"] as string, quoteId: row["quote_id"] as string };
    }
    // Null means this sweep is exhausted; caller may restart in a later sweep.
    const exhausted = scanned === rows.length && rows.length < limit;
    if (exhausted) next = null;
    return {
      ok: true,
      scanned,
      released,
      retained,
      exhausted,
      next: scanned === 0 && rows.length ? after : next,
    };
  } catch {
    return empty;
  }
}
