/** Off-by-default synthetic guest cart adapter; RPC owns atomic allocation/contact binding. */
import { isUuid, type CheckoutErrorCode } from "./checkout-core";
import { parseGuestCartInput, type GuestCartInput } from "./guest-checkout-cart";
import { OWNED_RESERVATION_MAX_REMAINING_MS } from "./owned-reservation-core";
import type { OwnedReservationClient } from "./owned-reservation.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type GuestCartResult =
  | { ok: true; cartId: string; reservationId: string; expiresAt: string }
  | { ok: false; code: CheckoutErrorCode };

export async function prepareGuestCart(
  client: OwnedReservationClient | SupabaseClient<Database>,
  verifiedOwnerId: string,
  input: GuestCartInput,
  now: () => number = Date.now,
): Promise<GuestCartResult> {
  if (!isUuid(verifiedOwnerId)) return { ok: false, code: "unauthorized" };
  const parsed = parseGuestCartInput(input);
  if (!parsed || !parsed.contact.email.toLowerCase().endsWith("@example.test"))
    return { ok: false, code: "invalid_request" };
  try {
    // This draft RPC is not claimed as installed in generated database types.
    const { data, error } = await (client as unknown as OwnedReservationClient).rpc(
      "prepare_guest_checkout_cart",
      {
        p_owner_user_id: verifiedOwnerId,
        p_cart_id: parsed.cartId,
        p_ticket_type_id: parsed.ticketTypeId,
        p_quantity: parsed.quantity,
        p_buyer_name: parsed.contact.name,
        p_buyer_email: parsed.contact.email,
      },
    );
    if (
      error ||
      !Array.isArray(data) ||
      data.length !== 1 ||
      !data[0] ||
      typeof data[0] !== "object"
    )
      return { ok: false, code: "server_error" };
    const row = data[0] as Record<string, unknown>;
    if (row["outcome"] === "invalid_request") return { ok: false, code: "invalid_request" };
    if (
      [
        "not_available",
        "over_capacity",
        "inactive",
        "unknown_ticket_type",
        "unbounded_capacity",
      ].includes(String(row["outcome"]))
    )
      return { ok: false, code: "not_available" };
    if (
      row["outcome"] !== "ready" ||
      row["cart_id"] !== parsed.cartId ||
      !isUuid(row["reservation_id"]) ||
      typeof row["expires_at"] !== "string"
    )
      return { ok: false, code: "server_error" };
    const remaining = Date.parse(row["expires_at"]) - now();
    if (
      !Number.isFinite(remaining) ||
      remaining <= 0 ||
      remaining > OWNED_RESERVATION_MAX_REMAINING_MS
    )
      return { ok: false, code: "server_error" };
    return {
      ok: true,
      cartId: parsed.cartId,
      reservationId: row["reservation_id"],
      expiresAt: row["expires_at"],
    };
  } catch {
    return { ok: false, code: "server_error" };
  }
}
