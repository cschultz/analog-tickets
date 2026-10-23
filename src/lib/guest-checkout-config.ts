/** A public feature flag is not authorization. Every write route enforces its own gate. */
export function guestCheckoutConfigResponse(env: Record<string, string | undefined>): Response {
  const enabled =
    env["GUEST_CHECKOUT_SANDBOX_MODE"] === "true" &&
    env["PAYMENTS_TEST_MODE"] === "true" &&
    env["PAYMENT_PROVIDER"] === "stripe_test";
  return Response.json(
    {
      enabled,
      pricingEnabled: enabled && env["PROMOTION_PRICING_SANDBOX_MODE"] === "true",
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
