import { isUuid } from "./checkout-core";
import {
  RECOVERY_SECRET_RE,
  newRecoverySecret,
  recoveryDigest,
} from "./guest-recovery-secrets.server";
import { loadGuestPurchaseStatus } from "./guest-purchase-status.server";
import type { GuestLookupClient } from "./guest-checkout-lookup.server";
import { normalizeStagingOrigin } from "./stripe-checkout.server";
import type { PromoRpcClient } from "./guest-promo.server";
import type { PurchasePricing } from "./purchase-pricing";
export interface RecoveryRpc {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export type RecoveryScope = { cartId: string; ownerId: string };
export async function resolveGuestRecovery(
  db: RecoveryRpc,
  secret: string,
): Promise<RecoveryScope | null> {
  if (!RECOVERY_SECRET_RE.test(secret)) return null;
  try {
    const r = await db.rpc("resolve_guest_purchase_session", {
      p_session_digest: await recoveryDigest(secret),
    });
    if (r.error || !Array.isArray(r.data) || r.data.length !== 1) return null;
    const v = r.data[0] as Record<string, unknown>;
    return isUuid(v["cart_id"]) && isUuid(v["owner_id"])
      ? { cartId: v["cart_id"], ownerId: v["owner_id"] }
      : null;
  } catch {
    return null;
  }
}
export async function redeemGuestRecovery(db: RecoveryRpc, proof: string): Promise<string | null> {
  if (!RECOVERY_SECRET_RE.test(proof)) return null;
  try {
    const secret = newRecoverySecret();
    const r = await db.rpc("redeem_guest_purchase_proof", {
      p_proof_digest: await recoveryDigest(proof),
      p_session_digest: await recoveryDigest(secret),
    });
    return !r.error && r.data === true ? secret : null;
  } catch {
    return null;
  }
}
export async function revokeGuestRecovery(db: RecoveryRpc, secret: string) {
  if (RECOVERY_SECRET_RE.test(secret))
    await db.rpc("revoke_guest_purchase_session", {
      p_session_digest: await recoveryDigest(secret),
    });
}
/** One bounded delivery claim. Unknown send/ack outcome is not automatically retried. */
export async function deliverGuestPurchase(
  db: RecoveryRpc & GuestLookupClient,
  cartId: string,
  send: (
    email: string,
    link: string,
    quantity: number,
    pricing?: PurchasePricing,
  ) => Promise<boolean>,
  origin: string,
  pricingClient?: PromoRpcClient,
): Promise<"sent" | "skipped" | "uncertain"> {
  if (!isUuid(cartId) || normalizeStagingOrigin(origin) !== origin) return "skipped";
  try {
    const proof = newRecoverySecret(),
      lease = crypto.randomUUID();
    const claimed = await db.rpc("claim_guest_purchase_delivery", {
      p_cart_id: cartId,
      p_lease_id: lease,
      p_proof_digest: await recoveryDigest(proof),
    });
    if (claimed.error) return "uncertain";
    if (!Array.isArray(claimed.data) || claimed.data.length !== 1) return "skipped";
    const row = claimed.data[0] as Record<string, unknown>;
    let sent = false;
    if (
      row["cart_id"] === cartId &&
      isUuid(row["owner_id"]) &&
      typeof row["buyer_email"] === "string" &&
      /^[^\s@]+@example\.test$/i.test(row["buyer_email"])
    ) {
      const status = await loadGuestPurchaseStatus(db, row["owner_id"], cartId, pricingClient);
      if (status?.status === "confirmed")
        try {
          sent = await send(
            row["buyer_email"],
            `${origin}/tickets/recover?purchase=${cartId}#token=${proof}`,
            status.quantity,
            status.pricing,
          );
        } catch {
          /* retained uncertain */
        }
    }
    const ack = await db.rpc("finish_guest_purchase_delivery", {
      p_cart_id: cartId,
      p_lease_id: lease,
      p_delivered: sent,
    });
    return sent && !ack.error && ack.data === true ? "sent" : "uncertain";
  } catch {
    return "uncertain";
  }
}
export async function requestGuestRecovery(
  db: RecoveryRpc & GuestLookupClient,
  email: string,
  send: Parameters<typeof deliverGuestPurchase>[2],
  origin: string,
  cartId?: string,
  pricingClient?: PromoRpcClient,
): Promise<void> {
  if (!/^[^\s@]+@example\.test$/.test(email) || email.length > 254) return;
  if (cartId !== undefined && !isUuid(cartId)) return;
  const r = await db.rpc("request_guest_purchase_recovery", {
    p_email: email,
    p_cart_id: cartId ?? null,
  });
  if (r.error || !Array.isArray(r.data) || r.data.length > 5) return;
  await Promise.all(
    r.data.map(async (row) => {
      const id = (row as Record<string, unknown>)["cart_id"];
      if (isUuid(id)) await deliverGuestPurchase(db, id, send, origin, pricingClient);
    }),
  );
}
