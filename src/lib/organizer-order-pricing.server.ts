/** SELECT-only projection after caller membership/order visibility is proven by the parent. */
import { isUuid } from "./checkout-core";
import { parsePurchasePricing } from "./purchase-pricing";
import type { OrganizerOrderPricing } from "./organizer-order-detail-core";
import { parseStoredPriceQuote } from "./promotion-pricing-core";

type Row = Record<string, unknown>;
export interface OrganizerDetailReadClient {
  from(table: string): { select(columns: string, options: { count: "exact" }): Query };
}
interface Query extends PromiseLike<{ data: Row[] | null; error: unknown; count: number | null }> {
  eq(key: string, value: string): Query;
  order(key: string, value: { ascending: boolean }): Query;
  limit(value: number): Query;
}
export function completeDetailRows(
  result: { data: Row[] | null; error: unknown; count: number | null },
  max: number,
): Row[] | null {
  return !result.error &&
    Array.isArray(result.data) &&
    Number.isSafeInteger(result.count) &&
    result.count! >= 0 &&
    result.count! <= max &&
    result.count === result.data.length
    ? result.data
    : null;
}
const cents = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Missing historical lines are explicit; malformed/partial/cross-order data throws generically. */
export async function readOrganizerOrderPricing(args: {
  caller: OrganizerDetailReadClient;
  loadSupport: () => Promise<OrganizerDetailReadClient>;
  order: Row;
  pricingEnabled: boolean;
  tickets?: Row[];
}): Promise<OrganizerOrderPricing | null> {
  const { caller, order, pricingEnabled } = args;
  const orderId = order["id"],
    eventId = order["event_id"],
    subtotal = order["subtotal_cents"];
  if (!isUuid(orderId) || !isUuid(eventId) || !cents(subtotal) || !cents(order["total_cents"]))
    throw Error("unavailable");
  const rows = completeDetailRows(
    await caller
      .from("order_items")
      .select("id,order_id,ticket_type_id,quantity,unit_price_cents", { count: "exact" })
      .eq("order_id", orderId)
      .order("id", { ascending: true })
      .limit(201),
    200,
  );
  if (!rows) throw Error("unavailable");
  const items: OrganizerOrderPricing["items"] = [],
    ids = new Set<string>();
  let sum = 0;
  for (const row of rows) {
    const id = row["id"],
      type = row["ticket_type_id"],
      quantity = row["quantity"],
      unit = row["unit_price_cents"];
    if (
      !isUuid(id) ||
      ids.has(id) ||
      row["order_id"] !== orderId ||
      !isUuid(type) ||
      !Number.isSafeInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > 200 ||
      !cents(unit)
    )
      throw Error("unavailable");
    const lineTotal = (quantity as number) * unit;
    sum += lineTotal;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(sum)) throw Error("unavailable");
    ids.add(id);
    items.push({ id, ticketTypeId: type, quantity: quantity as number, unitPriceCents: unit });
  }
  if (items.length && sum !== subtotal) throw Error("unavailable");
  const pricing: OrganizerOrderPricing = { subtotalCents: subtotal, items, quote: null };
  const legacyShares = () => {
    if (!args.tickets || order["total_cents"] !== subtotal) return pricing;
    const seen = new Set<string>(),
      counts = new Map<string, number>();
    const shares = [];
    for (const ticket of args.tickets) {
      const id = ticket["id"],
        line = items.find((item) => item.id === ticket["order_item_id"]);
      if (
        !isUuid(id) ||
        seen.has(id) ||
        !line ||
        ticket["order_id"] !== orderId ||
        ticket["event_id"] !== eventId ||
        ticket["ticket_type_id"] !== line.ticketTypeId
      )
        return pricing;
      seen.add(id);
      counts.set(line.id, (counts.get(line.id) ?? 0) + 1);
      shares.push({ ticketId: id, amountCents: line.unitPriceCents });
    }
    if (items.every((item) => counts.get(item.id) === item.quantity)) pricing.paidShares = shares;
    return pricing;
  };
  const attemptId = order["checkout_attempt_id"];
  if (!pricingEnabled || attemptId === null) return items.length ? legacyShares() : null;
  if (!isUuid(attemptId) || !isUuid(order["user_id"])) throw Error("unavailable");
  const support = await args.loadSupport();
  const attempts = completeDetailRows(
    await support
      .from("checkout_attempts")
      .select(
        "id,event_id,user_id,ticket_type_id,quantity,unit_price_cents,amount_cents,currency,provider,price_quote_id",
        { count: "exact" },
      )
      .eq("id", attemptId)
      .eq("event_id", eventId)
      .eq("user_id", order["user_id"])
      .limit(2),
    1,
  );
  const attempt = attempts?.[0];
  if (
    !attempt ||
    attempt["id"] !== attemptId ||
    attempt["event_id"] !== eventId ||
    attempt["user_id"] !== order["user_id"] ||
    attempt["provider"] !== "stripe_test" ||
    attempt["currency"] !== "usd" ||
    attempt["amount_cents"] !== order["total_cents"]
  )
    throw Error("unavailable");
  const quoteId = attempt["price_quote_id"];
  if (quoteId === null) return items.length ? legacyShares() : null;
  if (!isUuid(quoteId)) throw Error("unavailable");
  const quotes = completeDetailRows(
    await support
      .from("ticket_price_quotes")
      .select(
        "id,event_id,owner_user_id,ticket_type_id,quantity,unit_price_cents,subtotal_cents,discount_cents,total_cents,currency,fee_cents,tax_mode,promotion_code,promotion_id,promotion_version,promotion_kind,promotion_value,created_at,expires_at",
        { count: "exact" },
      )
      .eq("id", quoteId)
      .eq("event_id", eventId)
      .eq("owner_user_id", order["user_id"])
      .limit(2),
    1,
  );
  const quote = quotes?.[0],
    line = items[0];
  if (
    !quote ||
    !line ||
    items.length !== 1 ||
    quote["id"] !== quoteId ||
    quote["event_id"] !== eventId ||
    quote["owner_user_id"] !== order["user_id"] ||
    quote["ticket_type_id"] !== attempt["ticket_type_id"] ||
    quote["quantity"] !== attempt["quantity"] ||
    quote["unit_price_cents"] !== attempt["unit_price_cents"] ||
    line.ticketTypeId !== quote["ticket_type_id"] ||
    line.quantity !== quote["quantity"] ||
    line.unitPriceCents !== quote["unit_price_cents"] ||
    quote["subtotal_cents"] !== subtotal
  )
    throw Error("unavailable");
  const saved = parsePurchasePricing(
    {
      unitPriceCents: quote["unit_price_cents"],
      subtotalCents: quote["subtotal_cents"],
      discountCents: quote["discount_cents"],
      totalCents: quote["total_cents"],
      feeCents: quote["fee_cents"],
      taxMode: quote["tax_mode"],
      currency: quote["currency"],
      promotionCode: quote["promotion_code"],
    },
    line.quantity,
    order["total_cents"],
    "usd",
  );
  if (!saved) throw Error("unavailable");
  pricing.quote = saved;
  if (args.tickets) {
    const allocations = completeDetailRows(
      await support
        .from("ticket_quote_allocations")
        .select("quote_id,ordinal,subtotal_cents,discount_cents,paid_cents", { count: "exact" })
        .eq("quote_id", quoteId)
        .order("ordinal", { ascending: true })
        .limit(11),
      10,
    );
    if (
      !allocations ||
      allocations.length !== line.quantity ||
      allocations.some((row) => row["quote_id"] !== quoteId)
    )
      throw Error("unavailable");
    const snapshot = parseStoredPriceQuote({
      version: 1,
      quoteId,
      eventId,
      ticketTypeId: line.ticketTypeId,
      currency: "usd",
      quantity: line.quantity,
      unitPriceCents: saved.unitPriceCents,
      subtotalCents: saved.subtotalCents,
      discountCents: saved.discountCents,
      totalCents: saved.totalCents,
      feeCents: saved.feeCents,
      taxMode: saved.taxMode,
      createdAtMs: typeof quote["created_at"] === "string" ? Date.parse(quote["created_at"]) : NaN,
      expiresAtMs: typeof quote["expires_at"] === "string" ? Date.parse(quote["expires_at"]) : NaN,
      discount:
        quote["promotion_id"] === null
          ? null
          : {
              promotionId: quote["promotion_id"],
              promotionVersion: quote["promotion_version"],
              code: quote["promotion_code"],
              kind: quote["promotion_kind"],
              value: quote["promotion_value"],
            },
      tickets: allocations.map((row) => ({
        ordinal: row["ordinal"],
        subtotalCents: row["subtotal_cents"],
        discountCents: row["discount_cents"],
        paidCents: row["paid_cents"],
      })),
    });
    if (
      !snapshot ||
      (snapshot.discount?.code ?? null) !== saved.promotionCode ||
      args.tickets.length !== line.quantity
    )
      throw Error("unavailable");
    const ordinals = new Set<number>(),
      ticketIds = new Set<string>(),
      shares = [];
    for (const ticket of args.tickets) {
      const id = ticket["id"],
        ordinal = ticket["price_quote_ordinal"];
      if (
        !isUuid(id) ||
        ticketIds.has(id) ||
        ticket["order_id"] !== orderId ||
        ticket["event_id"] !== eventId ||
        ticket["order_item_id"] !== line.id ||
        ticket["ticket_type_id"] !== line.ticketTypeId ||
        ticket["price_quote_id"] !== quoteId ||
        !Number.isSafeInteger(ordinal) ||
        (ordinal as number) < 0 ||
        (ordinal as number) >= line.quantity ||
        ordinals.has(ordinal as number)
      )
        throw Error("unavailable");
      ticketIds.add(id);
      ordinals.add(ordinal as number);
      shares.push({ ticketId: id, amountCents: snapshot.tickets[ordinal as number]!.paidCents });
    }
    pricing.paidShares = shares;
  }
  return pricing;
}
