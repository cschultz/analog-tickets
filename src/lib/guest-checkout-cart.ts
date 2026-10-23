import { isUuid, MAX_CHECKOUT_QUANTITY } from "./checkout-core";
import { parseGuestCheckoutContact, type GuestCheckoutContact } from "./guest-checkout-contact";

export interface GuestCartInput {
  cartId: string;
  ticketTypeId: string;
  quantity: number;
  contact: GuestCheckoutContact;
}

/** Only buyer choices; owner, prices, event, expiry and verification stay server-owned. */
export function parseGuestCartInput(input: unknown): GuestCartInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (
    Object.keys(raw).length !== 4 ||
    Object.keys(raw).some((key) => !["cartId", "ticketTypeId", "quantity", "contact"].includes(key))
  )
    return null;
  const contact = parseGuestCheckoutContact(raw["contact"]);
  if (
    !isUuid(raw["cartId"]) ||
    !isUuid(raw["ticketTypeId"]) ||
    !Number.isSafeInteger(raw["quantity"]) ||
    (raw["quantity"] as number) < 1 ||
    (raw["quantity"] as number) > MAX_CHECKOUT_QUANTITY ||
    !contact
  )
    return null;
  return {
    cartId: raw["cartId"],
    ticketTypeId: raw["ticketTypeId"],
    quantity: raw["quantity"] as number,
    contact,
  };
}
