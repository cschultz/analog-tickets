/** Dynamic route/webhook boundary. Settings are read only; no new credential is provisioned. */
import { guestRecoveryEnabled, sendGuestRecoveryMail } from "./guest-recovery-mail.server";
import {
  deliverGuestPurchase,
  redeemGuestRecovery,
  requestGuestRecovery,
  resolveGuestRecovery,
  revokeGuestRecovery,
  type RecoveryRpc,
} from "./guest-recovery.server";
import { loadGuestPurchaseStatus } from "./guest-purchase-status.server";
import type { GuestLookupClient } from "./guest-checkout-lookup.server";
import { normalizeStagingOrigin } from "./stripe-checkout.server";
import { resolveMailtrapConfig } from "./mailtrap-capture-core";
import type { PurchasePricing } from "./purchase-pricing";
async function getDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as RecoveryRpc & GuestLookupClient;
}
export function guestRecoveryRuntime() {
  const env = process.env as Record<string, string | undefined>,
    origin = normalizeStagingOrigin(env["STAGING_ALLOWED_ORIGIN"]);
  const enabled = guestRecoveryEnabled(env) && Boolean(origin);
  const mailReady = resolveMailtrapConfig(env).enabled;
  const priced = env["PROMOTION_PRICING_SANDBOX_MODE"] === "true";
  const send = (email: string, link: string, quantity: number, pricing?: PurchasePricing) =>
    sendGuestRecoveryMail(email, link, quantity, {
      env,
      fetchImpl: (input, init) => fetch(input, init),
      ...(pricing ? { pricing } : {}),
    });
  return {
    enabled,
    mailReady,
    allowedOrigin: origin ?? undefined,
    request: async (email: string, cartId?: string) => {
      if (enabled && mailReady) {
        const db = await getDb();
        await requestGuestRecovery(db, email, send, origin!, cartId, priced ? db : undefined);
      }
    },
    redeem: async (proof: string) => redeemGuestRecovery(await getDb(), proof),
    status: async (secret: string) => {
      const db = await getDb();
      const scope = await resolveGuestRecovery(db, secret);
      return scope
        ? loadGuestPurchaseStatus(db, scope.ownerId, scope.cartId, priced ? db : undefined)
        : null;
    },
    revoke: async (secret: string) => revokeGuestRecovery(await getDb(), secret),
    resolve: async (secret: string) => resolveGuestRecovery(await getDb(), secret),
    deliver: async (cartId: string) => {
      if (!enabled || !mailReady) return "skipped" as const;
      const db = await getDb();
      return deliverGuestPurchase(db, cartId, send, origin!, priced ? db : undefined);
    },
  };
}
/** Only invoked from an already signature-verified paid webhook branch. */
export async function deliverGuestReceiptForAttempt(attemptId: string): Promise<void> {
  if (!guestRecoveryEnabled(process.env as Record<string, string | undefined>)) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = await getDb();
    const { data: a, error } = await supabaseAdmin
      .from("checkout_attempts")
      .select("id,reservation_id,status")
      .eq("id", attemptId)
      .maybeSingle();
    if (error || !a || a.status !== "completed" || !a.reservation_id) return;
    const { data: c, error: ce } = await db
      .from("guest_checkout_carts")
      .select("id")
      .eq("reservation_id", a.reservation_id)
      .maybeSingle();
    if (!ce && c && typeof c["id"] === "string") await guestRecoveryRuntime().deliver(c["id"]);
  } catch {
    /* durable queue retained; payment fulfillment must not depend on email */
  }
}
