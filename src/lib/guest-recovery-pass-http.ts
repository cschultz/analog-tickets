import { handleOwnerPass, type OwnerPassDependencies } from "./owner-pass-core";
import { resolveCors } from "./transfer-otp-core";
import { readRecoveryCookie } from "./guest-recovery-http";
import type { RecoveryScope } from "./guest-recovery.server";
import type { GuestPurchaseStatus } from "./guest-purchase-status";
import { readGuestCheckoutJson } from "./guest-checkout-cart-http";
export async function handleRecoveredPass(
  request: Request,
  deps: {
    enabled: boolean;
    allowedOrigin: string | undefined;
    resolve(secret: string): Promise<RecoveryScope | null>;
    status(secret: string): Promise<GuestPurchaseStatus | null>;
    inspect: OwnerPassDependencies["inspect"];
    issue: OwnerPassDependencies["issue"];
  },
): Promise<Response> {
  const cors = resolveCors(request.headers.get("origin"), deps.allowedOrigin);
  const headers = {
    ...cors.headers,
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  const fail = (status: number) => Response.json({ outcome: "unavailable" }, { status, headers });
  if (!request.headers.get("origin") || !cors.allowed) return fail(403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return fail(405);
  if (!deps.enabled) return fail(503);
  const secret = readRecoveryCookie(request);
  if (!secret) return fail(401);
  try {
    const body = await readGuestCheckoutJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400);
    const scope = await deps.resolve(secret);
    if (!scope) return fail(401);
    const status = await deps.status(secret);
    if (status?.status !== "confirmed" || status.cartId !== scope.cartId) return fail(401);
    const eligible = (id: string) =>
      status.tickets.some((t) => t.ticketId === id && t.status === "issued" && !t.checkedInAt);
    // Reuse body validation/atomic pass behavior, NOT Supabase bearer auth.
    // The internal sentinel is never a user JWT or returned to the client.
    const headers = new Headers(request.headers);
    headers.set("authorization", "Bearer scoped-purchase-cookie");
    return handleOwnerPass(
      new Request(request.url, { method: "POST", headers, body: JSON.stringify(body) }),
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
    return fail(503);
  }
}
