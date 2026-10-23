import type { OwnerTicket } from "./owner-tickets-core";
import { isUuid } from "./checkout-core";
import { parseRecoveryPage } from "./owner-ticket-recovery";
import { parsePurchasePricing, type PurchasePricing } from "./purchase-pricing";

export type GuestPurchaseStatus =
  | { status: "missing" | "pending" | "review" }
  | {
      status: "confirmed";
      cartId: string;
      ticketTypeId: string;
      quantity: number;
      amountCents: number;
      currency: string;
      tickets: OwnerTicket[];
      unavailableTickets: number;
      pricing?: PurchasePricing;
    };

/** Parse only a server status response; no URL or browser flag can confirm tickets. */
export function parseGuestPurchaseStatus(value: unknown): GuestPurchaseStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v["status"] === "missing" || v["status"] === "pending" || v["status"] === "review")
    return { status: v["status"] };
  if (
    v["status"] !== "confirmed" ||
    !isUuid(v["cartId"]) ||
    !isUuid(v["ticketTypeId"]) ||
    !Number.isSafeInteger(v["quantity"]) ||
    (v["quantity"] as number) < 1 ||
    (v["quantity"] as number) > 10 ||
    !Number.isSafeInteger(v["amountCents"]) ||
    (v["amountCents"] as number) < 0 ||
    typeof v["currency"] !== "string" ||
    !/^[a-z]{3}$/.test(v["currency"]) ||
    !Number.isSafeInteger(v["unavailableTickets"]) ||
    (v["unavailableTickets"] as number) < 0
  )
    return null;
  const page = parseRecoveryPage({ tickets: v["tickets"], hasMore: false });
  if (!page || page.tickets.length + (v["unavailableTickets"] as number) !== v["quantity"])
    return null;
  const pricing =
    v["pricing"] === undefined
      ? undefined
      : parsePurchasePricing(
          v["pricing"],
          v["quantity"] as number,
          v["amountCents"] as number,
          v["currency"],
        );
  if (v["pricing"] !== undefined && !pricing) return null;
  return {
    status: "confirmed",
    cartId: v["cartId"],
    ticketTypeId: v["ticketTypeId"],
    quantity: v["quantity"] as number,
    amountCents: v["amountCents"] as number,
    currency: v["currency"],
    tickets: page.tickets,
    unavailableTickets: v["unavailableTickets"] as number,
    ...(pricing ? { pricing } : {}),
  };
}
