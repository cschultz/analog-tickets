import { guestRecoveryEnabled } from "./guest-recovery-mail.server";
import { verifiedGuestAccount } from "./guest-account-core";
import {
  attachGuestAccount,
  resolveAccountPurchase,
  listAccountPurchases,
} from "./guest-account.server";
import { loadGuestPurchaseStatus } from "./guest-purchase-status.server";
import type { RecoveryRpc } from "./guest-recovery.server";
import type { GuestLookupClient } from "./guest-checkout-lookup.server";
import { normalizeStagingOrigin } from "./stripe-checkout.server";
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as RecoveryRpc & GuestLookupClient;
}
export function guestAccountEnabled(env: Record<string, string | undefined>) {
  return env["GUEST_ACCOUNT_SANDBOX_MODE"] === "true" && guestRecoveryEnabled(env);
}
export function guestAccountRuntime() {
  const env = process.env as Record<string, string | undefined>,
    origin = normalizeStagingOrigin(env["STAGING_ALLOWED_ORIGIN"]);
  const priced = env["PROMOTION_PRICING_SANDBOX_MODE"] === "true";
  return {
    enabled: guestAccountEnabled(env) && Boolean(origin),
    passEnabled: env["ATTENDEE_PASS_SANDBOX_MODE"] === "true",
    allowedOrigin: origin ?? undefined,
    authenticate: async (token: string) => {
      const { createUserClient } = await import("./transfer-otp.server");
      const r = await createUserClient(token).auth.getUser(token);
      return !r.error ? verifiedGuestAccount(r.data.user) : null;
    },
    attach: async (secret: string, account: string) => {
      const client = await db();
      return attachGuestAccount(client, secret, account, priced ? client : undefined);
    },
    library: async (account: string, offset: number) =>
      listAccountPurchases(await db(), account, offset),
    status: async (account: string, cart: string) => {
      const client = await db(),
        scope = await resolveAccountPurchase(client, account, cart);
      if (!scope) return null;
      const purchase = await loadGuestPurchaseStatus(
        client,
        scope.ownerId,
        scope.cartId,
        priced ? client : undefined,
      );
      return purchase ? { ownerId: scope.ownerId, purchase } : null;
    },
    inspect: async (id: string, owner: string) => {
      const { inspectOwnerPass } = await import("./owner-pass.server");
      return inspectOwnerPass(id, owner);
    },
    issue: async (id: string, owner: string, expected: string | null) => {
      const { createOwnerPass } = await import("./owner-pass.server");
      return createOwnerPass(id, owner, expected);
    },
  };
}
