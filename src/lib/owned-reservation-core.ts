import { isUuid, type CheckoutErrorCode } from "./checkout-core";

/** Response validation only: server SQL owns deadlines; shorter legacy holds remain valid. */
export const OWNED_RESERVATION_MAX_REMAINING_MS = 35 * 60 * 1000 + 10000;

export interface OwnedReservationInput {
  ticketTypeId: string;
  quantity: number;
  idempotencyKey: string;
}
/** No customer-supplied owner, event, price or expiry authority. */
export function parseOwnedReservationInput(
  body: unknown,
): OwnedReservationInput | CheckoutErrorCode {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_request";
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !["ticketTypeId", "quantity", "idempotencyKey"].includes(key)))
    return "invalid_request";
  if (
    !isUuid(raw["ticketTypeId"]) ||
    !isUuid(raw["idempotencyKey"]) ||
    typeof raw["quantity"] !== "number" ||
    !Number.isInteger(raw["quantity"]) ||
    raw["quantity"] < 1 ||
    raw["quantity"] > 10
  )
    return "invalid_request";
  return {
    ticketTypeId: raw["ticketTypeId"],
    quantity: raw["quantity"],
    idempotencyKey: raw["idempotencyKey"],
  };
}
