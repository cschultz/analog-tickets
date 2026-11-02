import { isUuid } from "./checkout-core";
import type { PurchasePricing } from "./purchase-pricing";

export interface OrganizerOrderPricing {
  subtotalCents: number;
  items: { id: string; ticketTypeId: string; quantity: number; unitPriceCents: number }[];
  /** null means no verified saved quote, not a zero discount/fee claim. */
  quote: PurchasePricing | null;
  /** Original immutable shares, not remaining balances or refund authorization. */
  paidShares?: { ticketId: string; amountCents: number }[];
}

export interface OrganizerOrderDetailInput {
  eventId: string;
  orderId: string;
}
export interface OrganizerOrderDetail {
  id: string;
  eventId: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  currency: "usd";
  originalTotalCents: number;
  pricing?: OrganizerOrderPricing | null;
  tickets: {
    id: string;
    name: string;
    email: string;
    status: string;
    checkedInAt: string | null;
    createdAt: string;
  }[];
  refunds: { id: string; createdAt: string; amountCents: number | null; ticketCount: number }[];
}

export function organizerOrderActivity(order: OrganizerOrderDetail) {
  const rank = (id: string) => ["order", "issued", "checkin", "refund"].indexOf(id.split(":")[0]!);
  return [
    { id: `order:${order.id}`, at: order.createdAt, label: "Order created" },
    ...order.tickets.flatMap((ticket) => [
      {
        id: `issued:${ticket.id}`,
        at: ticket.createdAt,
        label: `Ticket ${ticket.id.slice(0, 8)} issued`,
      },
      ...(ticket.checkedInAt
        ? [
            {
              id: `checkin:${ticket.id}`,
              at: ticket.checkedInAt,
              label: `Ticket ${ticket.id.slice(0, 8)} current check-in recorded`,
            },
          ]
        : []),
    ]),
    ...order.refunds.map((refund) => ({
      id: `refund:${refund.id}`,
      at: refund.createdAt,
      label: `Refund reversal recorded · ${refund.amountCents === null ? "amount not recorded" : organizerMoney(refund.amountCents)} · ${refund.ticketCount} ticket${refund.ticketCount === 1 ? "" : "s"}`,
    })),
  ].sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id),
  );
}
export type OrganizerOrderDetailResult =
  | { ok: true; order: OrganizerOrderDetail }
  | { ok: false; code: "invalid_request" | "unavailable" };
export function parseOrganizerOrderDetailInput(raw: unknown): OrganizerOrderDetailInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (
    Object.keys(r).sort().join(",") !== "eventId,orderId" ||
    !isUuid(r["eventId"]) ||
    !isUuid(r["orderId"])
  )
    return null;
  return { eventId: r["eventId"].toLowerCase(), orderId: r["orderId"].toLowerCase() };
}

export function organizerDate(value: string, timeZone = "UTC"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    }).format(date) + ` ${zone}`;
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}
export function organizerMoney(cents: number): string {
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100) +
    " USD"
  );
}
