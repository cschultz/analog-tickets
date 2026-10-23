import { checkoutErrorResponse, checkoutJsonResponse, isUuid } from "./checkout-core";
import { parseBearer, resolveCors } from "./transfer-otp-core";
import { readGuestCheckoutJson } from "./guest-checkout-cart-http";
import { parsePromoInput, type PromoErrorCode, type PromoResult } from "./guest-promo-core";
import type { PromoRpcClient } from "./guest-promo.server";
import type { StripeAdapterEnv, StripeTransport } from "./stripe-checkout.server";
import type { CheckoutReadTransport } from "./stripe-checkout-lookup.server";

export async function handleGuestPromo(
  request: Request,
  deps: {
    enabled: string | undefined;
    guestEnabled: string | undefined;
    env: StripeAdapterEnv;
    authenticate(token: string): Promise<string | null>;
    client(): Promise<PromoRpcClient>;
    transport: StripeTransport;
    readTransport: CheckoutReadTransport;
  },
): Promise<Response> {
  const cors = resolveCors(request.headers.get("origin"), deps.env.STAGING_ALLOWED_ORIGIN);
  const headers = {
    ...cors.headers,
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (code: PromoErrorCode) => {
    if (
      code === "promotion_unavailable" ||
      code === "review_required" ||
      code === "unsupported_paid_total"
    )
      return new Response(
        JSON.stringify({
          ok: false,
          code,
          message:
            code === "review_required"
              ? "The price changed. Review it before continuing."
              : code === "promotion_unavailable"
                ? "This code is not available for this order."
                : "This TEST checkout requires a paid total of at least USD 0.50.",
        }),
        { status: 409, headers: { ...headers, "Content-Type": "application/json" } },
      );
    return checkoutErrorResponse(code, headers);
  };
  const response = (result: PromoResult<unknown>, status: string) =>
    result.ok
      ? checkoutJsonResponse({ ok: true, status, value: result.value }, headers)
      : fail(result.code);
  if (!request.headers.get("origin") || !cors.allowed) return fail("forbidden");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  if (
    deps.enabled !== "true" ||
    deps.guestEnabled !== "true" ||
    deps.env.PAYMENTS_TEST_MODE !== "true" ||
    deps.env.PAYMENT_PROVIDER !== "stripe_test"
  )
    return fail("configuration");
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return fail("unauthorized");
  try {
    const owner = await deps.authenticate(token);
    if (!isUuid(owner)) return fail("unauthorized");
    const input = parsePromoInput(await readGuestCheckoutJson(request));
    if (!input) return fail("invalid_request");
    const client = await deps.client();
    if (input.action === "expire") {
      const { expirePricedCart } = await import("./guest-promo-expiry.server");
      return response(
        await expirePricedCart({
          client,
          owner,
          cartId: input.cartId,
          env: deps.env,
          readTransport: deps.readTransport,
        }),
        "expiry",
      );
    }
    const { previewGuestPrice, preparePricedCart, readPricedCart, payPricedCart } =
      await import("./guest-promo.server");
    if (input.action === "preview")
      return response(await previewGuestPrice(client, input), "preview");
    if (input.action === "prepare")
      return response(await preparePricedCart(client, owner, input), "ready");
    if (input.action === "read") {
      const context = await readPricedCart(client, owner, input.cartId);
      if (context?.releaseRecorded)
        return checkoutJsonResponse(
          { ok: true, status: "expiry", value: { status: "released" } },
          headers,
        );
      return context
        ? checkoutJsonResponse({ ok: true, status: "ready", value: context.quote }, headers)
        : fail("not_available");
    }
    return response(
      await payPricedCart({
        client,
        owner,
        cartId: input.cartId,
        resume: input.action === "resume",
        env: deps.env,
        transport: deps.transport,
        readTransport: deps.readTransport,
      }),
      "payment",
    );
  } catch {
    return fail("server_error");
  }
}
