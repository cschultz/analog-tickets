import { isUuid } from "./checkout-core";
import { parseGuestAccountLibrary } from "./guest-account-core";
import {
  resolveGuestRecovery,
  type RecoveryRpc,
  type RecoveryScope,
} from "./guest-recovery.server";
import { recoveryDigest } from "./guest-recovery-secrets.server";
import type { GuestLookupClient } from "./guest-checkout-lookup.server";
import { loadGuestPurchaseStatus } from "./guest-purchase-status.server";
import type { PromoRpcClient } from "./guest-promo.server";
export async function attachGuestAccount(
  db: RecoveryRpc & GuestLookupClient,
  secret: string,
  verifiedAccountId: string,
  pricingClient?: PromoRpcClient,
): Promise<"saved" | "conflict" | "unavailable"> {
  if (!isUuid(verifiedAccountId)) return "unavailable";
  try {
    const scope = await resolveGuestRecovery(db, secret);
    if (
      !scope ||
      (await loadGuestPurchaseStatus(db, scope.ownerId, scope.cartId, pricingClient))?.status !==
        "confirmed"
    )
      return "unavailable";
    const r = await db.rpc("attach_guest_purchase_account", {
      p_session_digest: await recoveryDigest(secret),
      p_account_id: verifiedAccountId,
    });
    return !r.error && (r.data === "saved" || r.data === "conflict") ? r.data : "unavailable";
  } catch {
    return "unavailable";
  }
}
export async function resolveAccountPurchase(
  db: RecoveryRpc,
  accountId: string,
  cartId: string,
): Promise<RecoveryScope | null> {
  if (!isUuid(accountId) || !isUuid(cartId)) return null;
  try {
    const r = await db.rpc("resolve_guest_account_purchase", {
      p_account_id: accountId,
      p_cart_id: cartId,
    });
    if (r.error || !Array.isArray(r.data) || r.data.length !== 1) return null;
    const v = r.data[0] as Record<string, unknown>;
    return v["cart_id"] === cartId && isUuid(v["owner_id"])
      ? { cartId, ownerId: v["owner_id"] }
      : null;
  } catch {
    return null;
  }
}
export async function listAccountPurchases(db: RecoveryRpc, accountId: string, offset: number) {
  if (!isUuid(accountId) || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
    return null;
  const r = await db.rpc("list_guest_account_purchases", {
    p_account_id: accountId,
    p_offset: offset,
  });
  if (r.error || !Array.isArray(r.data) || r.data.length > 21) return null;
  return parseGuestAccountLibrary({
    purchases: r.data.slice(0, 20).map((raw) => {
      const v = raw as Record<string, unknown>;
      return {
        cartId: v["cart_id"],
        quantity: v["quantity"],
        eventName: v["event_name"],
        ticketTypeName: v["ticket_type_name"],
        linkedAt: v["linked_at"],
      };
    }),
    hasMore: r.data.length > 20,
  });
}
