import { isUuid } from "./checkout-core";
export interface VerifiedGuestAccount {
  id: string;
  email: string;
}
/** Only Auth's verified fields count. user_metadata and supplied email are not authority. */
export function verifiedGuestAccount(value: unknown): VerifiedGuestAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const u = value as Record<string, unknown>;
  return isUuid(u["id"]) &&
    u["is_anonymous"] === false &&
    typeof u["email_confirmed_at"] === "string" &&
    Number.isFinite(Date.parse(u["email_confirmed_at"])) &&
    typeof u["email"] === "string" &&
    u["email"].length <= 254 &&
    /^[^\s@]+@example\.test$/i.test(u["email"])
    ? { id: u["id"], email: u["email"] }
    : null;
}
export interface GuestAccountPurchaseSummary {
  cartId: string;
  quantity: number;
  eventName: string;
  ticketTypeName: string;
  linkedAt: string;
}
export function parseGuestAccountLibrary(
  value: unknown,
): { purchases: GuestAccountPurchaseSummary[]; hasMore: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !Array.isArray(v["purchases"]) ||
    v["purchases"].length > 20 ||
    typeof v["hasMore"] !== "boolean"
  )
    return null;
  const ids = new Set<string>();
  const purchases: GuestAccountPurchaseSummary[] = [];
  for (const raw of v["purchases"]) {
    if (!raw || typeof raw !== "object") return null;
    const x = raw as Record<string, unknown>;
    if (
      !isUuid(x["cartId"]) ||
      ids.has(x["cartId"]) ||
      !Number.isSafeInteger(x["quantity"]) ||
      (x["quantity"] as number) < 1 ||
      (x["quantity"] as number) > 10 ||
      typeof x["eventName"] !== "string" ||
      !x["eventName"].trim() ||
      x["eventName"].length > 200 ||
      typeof x["ticketTypeName"] !== "string" ||
      !x["ticketTypeName"].trim() ||
      x["ticketTypeName"].length > 200 ||
      typeof x["linkedAt"] !== "string" ||
      !Number.isFinite(Date.parse(x["linkedAt"]))
    )
      return null;
    ids.add(x["cartId"]);
    purchases.push({
      cartId: x["cartId"],
      quantity: x["quantity"] as number,
      eventName: x["eventName"],
      ticketTypeName: x["ticketTypeName"],
      linkedAt: x["linkedAt"],
    });
  }
  if (v["hasMore"] && purchases.length !== 20) return null;
  return { purchases, hasMore: v["hasMore"] };
}
