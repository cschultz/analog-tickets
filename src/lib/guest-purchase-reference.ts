import { isUuid } from "./checkout-core";
export const GUEST_RETURN_REFERENCE_KEY = "analog-guest-return-v1";
export interface GuestPurchaseReference {
  version: 1;
  ownerId: string;
  cartId: string;
  ticketTypeId: string;
  quantity: number;
}
export function parseGuestPurchaseReference(value: unknown): GuestPurchaseReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (
    Object.keys(r).length !== 5 ||
    r["version"] !== 1 ||
    !isUuid(r["ownerId"]) ||
    !isUuid(r["cartId"]) ||
    !isUuid(r["ticketTypeId"]) ||
    !Number.isSafeInteger(r["quantity"]) ||
    (r["quantity"] as number) < 1 ||
    (r["quantity"] as number) > 10
  )
    return null;
  return {
    version: 1,
    ownerId: r["ownerId"],
    cartId: r["cartId"],
    ticketTypeId: r["ticketTypeId"],
    quantity: r["quantity"] as number,
  };
}
