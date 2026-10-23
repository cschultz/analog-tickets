import { isUuid, checkoutErrorResponse, checkoutJsonResponse } from "./checkout-core";
import { readGuestCheckoutJson } from "./guest-checkout-cart-http";
import { parseBearer, resolveCors } from "./transfer-otp-core";
import type { GuestCartLookup } from "./guest-checkout-lookup.server";

export async function handleGuestLookup<T extends { status: string } = GuestCartLookup>(
  request: Request,
  deps: {
    enabled: string | undefined;
    testMode: string | undefined;
    provider: string | undefined;
    allowedOrigin: string | undefined;
    authenticate(token: string): Promise<string | null>;
    lookup(owner: string, cart: string): Promise<T>;
  },
): Promise<Response> {
  const cors = resolveCors(request.headers.get("origin"), deps.allowedOrigin);
  const headers = {
    ...cors.headers,
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (!request.headers.get("origin") || !cors.allowed)
    return checkoutErrorResponse("forbidden", headers);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  if (deps.enabled !== "true" || deps.testMode !== "true" || deps.provider !== "stripe_test")
    return checkoutErrorResponse("configuration", headers);
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return checkoutErrorResponse("unauthorized", headers);
  try {
    const owner = await deps.authenticate(token);
    if (!isUuid(owner)) return checkoutErrorResponse("unauthorized", headers);
    const body = await readGuestCheckoutJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return checkoutErrorResponse("invalid_request", headers);
    const b = body as Record<string, unknown>;
    if (Object.keys(b).length !== 1 || !isUuid(b["cartId"]))
      return checkoutErrorResponse("invalid_request", headers);
    const result = await deps.lookup(owner, b["cartId"]);
    return result.status === "unavailable"
      ? checkoutErrorResponse("server_error", headers)
      : checkoutJsonResponse(result, headers);
  } catch {
    return checkoutErrorResponse("server_error", headers);
  }
}
