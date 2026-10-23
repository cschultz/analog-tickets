import { resolveCors, parseBearer } from "./transfer-otp-core";
import { readGuestCheckoutJson } from "./guest-checkout-cart-http";
import { readRecoveryCookie } from "./guest-recovery-http";
import { isUuid } from "./checkout-core";
import type { VerifiedGuestAccount } from "./guest-account-core";
import type { GuestPurchaseStatus } from "./guest-purchase-status";
import { handleOwnerPass, type OwnerPassDependencies } from "./owner-pass-core";
export interface GuestAccountHttpDeps {
  enabled: boolean;
  passEnabled: boolean;
  allowedOrigin: string | undefined;
  authenticate(token: string): Promise<VerifiedGuestAccount | null>;
  attach(secret: string, accountId: string): Promise<"saved" | "conflict" | "unavailable">;
  library(accountId: string, offset: number): Promise<unknown>;
  status(
    accountId: string,
    cartId: string,
  ): Promise<{ ownerId: string; purchase: GuestPurchaseStatus } | null>;
  inspect: OwnerPassDependencies["inspect"];
  issue: OwnerPassDependencies["issue"];
}
export async function handleGuestAccount(
  request: Request,
  action: "attach" | "library" | "status" | "pass",
  deps: GuestAccountHttpDeps,
): Promise<Response> {
  const cors = resolveCors(request.headers.get("origin"), deps.allowedOrigin);
  const headers = {
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
  if (!deps.enabled || (action === "pass" && !deps.passEnabled))
    return reply({ error: "TEST account access is unavailable." }, 503);
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return reply({ error: "A verified account sign-in is required." }, 401);
  try {
    const raw = await readGuestCheckoutJson(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return reply({ error: "Invalid request." }, 400);
    const b = raw as Record<string, unknown>,
      account = await deps.authenticate(token);
    if (!account) return reply({ error: "A verified account sign-in is required." }, 401);
    if (action === "attach") {
      const secret = readRecoveryCookie(request);
      if (!secret) return reply({ error: "Open a fresh ticket email first." }, 401);
      if (
        Object.keys(b).length !== 2 ||
        b["confirmed"] !== true ||
        b["expectedAccountId"] !== account.id
      )
        return reply({ error: "The selected account changed. Review it again." }, 409);
      const result = await deps.attach(secret, account.id);
      return result === "saved"
        ? reply({ saved: true })
        : reply(
            {
              error:
                result === "conflict"
                  ? "This purchase is already saved to another account. Email ticket access is unchanged."
                  : "Purchase ownership could not be verified.",
            },
            409,
          );
    }
    if (action === "library") {
      if (
        Object.keys(b).length !== 1 ||
        !Number.isSafeInteger(b["offset"]) ||
        (b["offset"] as number) < 0 ||
        (b["offset"] as number) > 10000
      )
        return reply({ error: "Invalid request." }, 400);
      const page = await deps.library(account.id, b["offset"] as number);
      return page ? reply(page) : reply({ error: "Saved purchases are unavailable." }, 503);
    }
    if (!isUuid(b["cartId"])) return reply({ error: "Invalid request." }, 400);
    if (action === "status" && Object.keys(b).length !== 1)
      return reply({ error: "Invalid request." }, 400);
    const scope = await deps.status(account.id, b["cartId"]);
    if (!scope || scope.purchase.status !== "confirmed" || scope.purchase.cartId !== b["cartId"])
      return reply({ error: "Purchase access is unavailable." }, 404);
    if (action === "status") return reply(scope.purchase);
    const { cartId: _cartId, ...passBody } = b;
    const eligible = (id: string) =>
      scope.purchase.status === "confirmed" &&
      scope.purchase.tickets.some(
        (t) => t.ticketId === id && t.status === "issued" && !t.checkedInAt,
      );
    // Validate normal pass body while retaining only this verified account's exact link.
    return handleOwnerPass(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(passBody),
      }),
      {
        enabled: "true",
        allowedOrigin: deps.allowedOrigin,
        authenticate: async () => scope.ownerId,
        inspect: async (id, owner) =>
          eligible(id) ? deps.inspect(id, owner) : { outcome: "not_eligible" },
        issue: async (id, owner, expected) =>
          eligible(id) ? deps.issue(id, owner, expected) : { outcome: "not_eligible" },
      },
    );
  } catch {
    return reply({ error: "Account purchase access is unavailable." }, 503);
  }
}
