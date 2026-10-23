/** Exact-cart owner lookup. No provider calls, writes or owner-wide history scan. */
import { isUuid, MAX_CHECKOUT_QUANTITY } from "./checkout-core";
import { parseGuestCheckoutContact, type GuestCheckoutContact } from "./guest-checkout-contact";

type Row = Record<string, unknown>;
interface Query {
  eq(column: string, value: string): Query;
  maybeSingle(): PromiseLike<{ data: Row | null; error: unknown }>;
  limit(count: number): PromiseLike<{ data: Row[] | null; error: unknown }>;
}
export interface GuestLookupClient {
  from(table: string): { select(columns: string): Query };
}
export type GuestCartLookup =
  | { status: "missing" | "unavailable" }
  | {
      status: "found";
      cartId: string;
      ticketTypeId: string;
      quantity: number;
      contact: GuestCheckoutContact;
      reservationId: string;
      expiresAt: string;
      phase: "ready" | "pending" | "closed";
    };

export async function lookupGuestCart(
  client: GuestLookupClient,
  ownerId: string,
  cartId: string,
  now: () => number = Date.now,
): Promise<GuestCartLookup> {
  const unavailable = { status: "unavailable" as const };
  if (!isUuid(ownerId) || !isUuid(cartId)) return unavailable;
  try {
    const cart = await client
      .from("guest_checkout_carts")
      .select("id,owner_user_id,ticket_type_id,quantity,buyer_name,buyer_email,reservation_id")
      .eq("id", cartId)
      .eq("owner_user_id", ownerId)
      .maybeSingle();
    if (cart.error) return unavailable;
    if (!cart.data) return { status: "missing" };
    const c = cart.data;
    const contact = parseGuestCheckoutContact({ name: c["buyer_name"], email: c["buyer_email"] });
    if (
      c["id"] !== cartId ||
      c["owner_user_id"] !== ownerId ||
      !isUuid(c["ticket_type_id"]) ||
      !isUuid(c["reservation_id"]) ||
      !Number.isSafeInteger(c["quantity"]) ||
      (c["quantity"] as number) < 1 ||
      (c["quantity"] as number) > MAX_CHECKOUT_QUANTITY ||
      !contact ||
      !contact.email.toLowerCase().endsWith("@example.test")
    )
      return unavailable;
    const hold = await client
      .from("inventory_reservations")
      .select("id,owner_user_id,event_id,ticket_type_id,quantity,status,expires_at")
      .eq("id", c["reservation_id"])
      .eq("owner_user_id", ownerId)
      .maybeSingle();
    const h = hold.data;
    if (
      hold.error ||
      !h ||
      h["id"] !== c["reservation_id"] ||
      h["owner_user_id"] !== ownerId ||
      !isUuid(h["event_id"]) ||
      h["ticket_type_id"] !== c["ticket_type_id"] ||
      h["quantity"] !== c["quantity"] ||
      typeof h["expires_at"] !== "string" ||
      !Number.isFinite(Date.parse(h["expires_at"]))
    )
      return unavailable;
    const attempts = await client
      .from("checkout_attempts")
      .select(
        "id,user_id,reservation_id,event_id,ticket_type_id,quantity,status,provider,provider_request_version",
      )
      .eq("reservation_id", c["reservation_id"])
      .limit(2);
    if (attempts.error || !Array.isArray(attempts.data) || attempts.data.length > 1)
      return unavailable;
    const attempt = attempts.data[0];
    if (
      attempt &&
      (!isUuid(attempt["id"]) ||
        attempt["user_id"] !== ownerId ||
        attempt["reservation_id"] !== h["id"] ||
        attempt["event_id"] !== h["event_id"] ||
        attempt["ticket_type_id"] !== c["ticket_type_id"] ||
        attempt["quantity"] !== c["quantity"] ||
        attempt["provider"] !== "stripe_test" ||
        attempt["provider_request_version"] !== 2)
    )
      return unavailable;
    const phase =
      h["status"] !== "confirmed" ||
      Date.parse(h["expires_at"]) <= now() ||
      (attempt && attempt["status"] !== "pending")
        ? "closed"
        : attempt
          ? "pending"
          : "ready";
    return {
      status: "found",
      cartId,
      ticketTypeId: c["ticket_type_id"],
      quantity: c["quantity"] as number,
      contact,
      reservationId: c["reservation_id"],
      expiresAt: h["expires_at"],
      phase,
    };
  } catch {
    return unavailable;
  }
}
