/** Fresh-evidence adapter for the off-default signature-verified expiry path.
 * No provider discovery, persistence or release authority within this adapter.
 * Caller loads the exact authenticated session ID/attempt/hold first; rechecks
 * the local facts and invokes guarded SQL separately. */
import {
  buildRetrievedV2ExpiryReleaseArgs,
  type ExpiryAttemptFacts,
  type ExpiryHoldFacts,
  type V2ExpiryReleaseArgs,
} from "./checkout-expiry-evidence";
import {
  resolveStripeAdapterConfig,
  STRIPE_API_URL,
  STRIPE_API_VERSION,
  type StripeAdapterEnv,
} from "./stripe-checkout.server";
import type { CheckoutReadTransport } from "./stripe-checkout-lookup.server";

/** One authenticated exact GET only. An event's age/creation timestamp is not
 * consumed or refreshed. GET begins after full immutable hold expiry; observing
 * the rounded provider deadline during an in-flight request cannot qualify. */
export async function readFreshStripeTestExpiry(options: {
  env: StripeAdapterEnv;
  serverSessionId: string;
  attempt: ExpiryAttemptFacts;
  hold: ExpiryHoldFacts;
  transport: CheckoutReadTransport;
  now?: () => number;
}): Promise<V2ExpiryReleaseArgs | null> {
  const now = options.now ?? Date.now;
  const config = resolveStripeAdapterConfig(options.env);
  const startedAt = now();
  const attempt = { ...options.attempt },
    hold = { ...options.hold };
  const { serverSessionId } = options;
  if (typeof config === "string" || !/^cs_test_[A-Za-z0-9]{8,200}$/.test(serverSessionId))
    return null;
  // Reuse the strict local tuple validator for preflight only. This synthetic
  // minimum session never leaves this function and is NOT returned as evidence.
  const preflight = buildRetrievedV2ExpiryReleaseArgs(
    {
      id: serverSessionId,
      object: "checkout.session",
      livemode: false,
      mode: "payment",
      status: "expired",
      payment_status: "unpaid",
      payment_intent: null,
      client_reference_id: attempt.id,
      created: Math.floor(Date.parse(attempt.createdAt) / 1000),
      expires_at: attempt.providerExpiresAtSeconds,
      amount_total: attempt.amountCents,
      currency: attempt.currency,
    },
    attempt,
    hold,
    startedAt,
    startedAt,
  );
  if (!preflight) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      options.transport({
        url: `${STRIPE_API_URL}/${serverSessionId}`,
        method: "GET",
        headers: {
          authorization: `Bearer ${config.restrictedKey}`,
          "stripe-version": STRIPE_API_VERSION,
        },
        timeoutMs: 5000,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Read timed out")), 5000);
      }),
    ]);
    const completedAt = now();
    if (
      !Number.isSafeInteger(completedAt) ||
      completedAt < startedAt ||
      completedAt - startedAt > 5000 ||
      response.status !== 200 ||
      typeof response.body !== "string" ||
      response.body.length > 512 * 1024
    )
      return null;
    const session: unknown = JSON.parse(response.body);
    if (
      !session ||
      typeof session !== "object" ||
      Array.isArray(session) ||
      (session as Record<string, unknown>)["id"] !== serverSessionId
    )
      return null;
    return buildRetrievedV2ExpiryReleaseArgs(session, attempt, hold, startedAt, completedAt);
  } catch {
    // Never retain transport/provider error text, credentials or raw bodies.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
