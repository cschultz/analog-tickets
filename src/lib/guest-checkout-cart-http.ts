import { checkoutErrorResponse, checkoutJsonResponse, isUuid } from "./checkout-core";
import { parseGuestCartInput, type GuestCartInput } from "./guest-checkout-cart";
import type { GuestCartResult } from "./guest-checkout-cart.server";
import { parseBearer, resolveCors } from "./transfer-otp-core";

interface GuestCartHttpDependencies {
  enabled: string | undefined;
  testMode: string | undefined;
  provider: string | undefined;
  allowedOrigin: string | undefined;
  authenticate(token: string): Promise<string | null>;
  prepare(ownerId: string, input: GuestCartInput): Promise<GuestCartResult>;
}
export async function readGuestCheckoutJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function handleGuestCart(
  request: Request,
  deps: GuestCartHttpDependencies,
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
    const input = parseGuestCartInput(await readGuestCheckoutJson(request));
    if (!input || !input.contact.email.toLowerCase().endsWith("@example.test"))
      return checkoutErrorResponse("invalid_request", headers);
    const result = await deps.prepare(owner, input);
    return result.ok
      ? checkoutJsonResponse(
          {
            ok: true,
            status: "ready",
            cartId: result.cartId,
            reservationId: result.reservationId,
            expiresAt: result.expiresAt,
          },
          headers,
        )
      : checkoutErrorResponse(result.code, headers);
  } catch {
    return checkoutErrorResponse("server_error", headers);
  }
}
