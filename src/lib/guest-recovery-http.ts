import { resolveCors } from "./transfer-otp-core";
import { readGuestCheckoutJson } from "./guest-checkout-cart-http";
import { isUuid } from "./checkout-core";
import { RECOVERY_SECRET_RE } from "./guest-recovery-secrets.server";
import type { GuestPurchaseStatus } from "./guest-purchase-status";
export const GUEST_RECOVERY_COOKIE = "__Host-analog_guest_recovery";
const cookie = (secret: string, age = 3600) =>
  `${GUEST_RECOVERY_COOKIE}=${secret}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export function readRecoveryCookie(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(GUEST_RECOVERY_COOKIE + "="));
  if (matches.length !== 1) return null;
  const value = matches[0]!.slice(GUEST_RECOVERY_COOKIE.length + 1);
  return RECOVERY_SECRET_RE.test(value) ? value : null;
}
export type RecoveryAction = "request" | "redeem" | "status" | "logout";
export interface GuestRecoveryHttpDeps {
  enabled: boolean;
  allowedOrigin: string | undefined;
  request(email: string, cartId?: string): Promise<void>;
  redeem(proof: string): Promise<string | null>;
  status(secret: string): Promise<GuestPurchaseStatus | null>;
  revoke(secret: string): Promise<void>;
}
/** Strict same-origin POSTs. The cookie grants one purchase, never a Supabase identity. */
export async function handleGuestRecovery(
  request: Request,
  action: RecoveryAction,
  deps: GuestRecoveryHttpDeps,
): Promise<Response> {
  const cors = resolveCors(request.headers.get("origin"), deps.allowedOrigin);
  const headers: Record<string, string> = {
    ...cors.headers,
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!request.headers.get("origin") || !cors.allowed)
    return reply({ error: "Not permitted." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "Not permitted." }, 405);
  if (!deps.enabled) return reply({ error: "TEST recovery is unavailable." }, 503);
  try {
    const raw = await readGuestCheckoutJson(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return reply({ error: "Invalid request." }, 400);
    const body = raw as Record<string, unknown>;
    if (action === "request") {
      const email = typeof body["email"] === "string" ? body["email"].trim().toLowerCase() : "";
      if (
        Object.keys(body).some((key) => key !== "email" && key !== "cartId") ||
        (body["cartId"] !== undefined && !isUuid(body["cartId"])) ||
        email.length > 254 ||
        !/^[^\s@]+@example\.test$/.test(email)
      )
        return reply({ error: "Use a synthetic TEST email." }, 400);
      // Match/no-match, cooldown and provider uncertainty have the same public result.
      try {
        if (isUuid(body["cartId"])) await deps.request(email, body["cartId"]);
        else await deps.request(email);
      } catch {
        /* no enumeration or raw provider error */
      }
      return reply({ accepted: true });
    }
    if (action === "redeem") {
      if (
        Object.keys(body).length !== 1 ||
        typeof body["proof"] !== "string" ||
        !RECOVERY_SECRET_RE.test(body["proof"])
      )
        return reply({ error: "Link unavailable. Request a fresh email." }, 400);
      const secret = await deps.redeem(body["proof"]);
      if (!secret || !RECOVERY_SECRET_RE.test(secret))
        return reply({ error: "Link unavailable. Request a fresh email." }, 401);
      headers["Set-Cookie"] = cookie(secret);
      return reply({ opened: true });
    }
    if (Object.keys(body).length !== 0) return reply({ error: "Invalid request." }, 400);
    const secret = readRecoveryCookie(request);
    if (action === "logout") {
      if (secret) await deps.revoke(secret);
      headers["Set-Cookie"] = cookie("", 0);
      return reply({ closed: true });
    }
    if (!secret) return reply({ error: "Open a fresh ticket email." }, 401);
    const result = await deps.status(secret);
    return result?.status === "confirmed"
      ? reply(result)
      : reply({ error: "Purchase access is unavailable." }, 401);
  } catch {
    return reply({ error: "Purchase access is unavailable." }, 503);
  }
}
