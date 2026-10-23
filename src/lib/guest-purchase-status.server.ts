/** Exact guest purchase status. Read-only; fulfillment belongs to the signed webhook. */
import { isUuid } from "./checkout-core";
import { presentOwnerTickets } from "./owner-tickets-core";
import type { GuestLookupClient } from "./guest-checkout-lookup.server";
import type { GuestPurchaseStatus } from "./guest-purchase-status";
import { readPricedCart, type PromoRpcClient } from "./guest-promo.server";

export async function loadGuestPurchaseStatus(
  client: GuestLookupClient,
  owner: string,
  cartId: string,
  pricingClient?: PromoRpcClient,
): Promise<GuestPurchaseStatus | null> {
  if (!isUuid(owner) || !isUuid(cartId)) return null;
  const one = async (table: string, columns: string, predicates: Record<string, string>) => {
    let q = client.from(table).select(columns);
    for (const [key, value] of Object.entries(predicates)) q = q.eq(key, value);
    const result = await q.maybeSingle();
    if (result.error) throw new Error("unavailable");
    return result.data;
  };
  try {
    const cart = await one(
      "guest_checkout_carts",
      "id,owner_user_id,ticket_type_id,quantity,reservation_id",
      { id: cartId, owner_user_id: owner },
    );
    if (!cart) return { status: "missing" };
    const qty = cart["quantity"];
    if (
      cart["id"] !== cartId ||
      cart["owner_user_id"] !== owner ||
      !isUuid(cart["ticket_type_id"]) ||
      !isUuid(cart["reservation_id"]) ||
      !Number.isSafeInteger(qty) ||
      (qty as number) < 1 ||
      (qty as number) > 10
    )
      return null;
    const hold = await one(
      "inventory_reservations",
      "id,owner_user_id,event_id,ticket_type_id,quantity",
      { id: cart["reservation_id"], owner_user_id: owner },
    );
    if (
      !hold ||
      hold["id"] !== cart["reservation_id"] ||
      hold["owner_user_id"] !== owner ||
      !isUuid(hold["event_id"]) ||
      hold["ticket_type_id"] !== cart["ticket_type_id"] ||
      hold["quantity"] !== qty
    )
      return null;
    const attempts = await client
      .from("checkout_attempts")
      .select(
        "id,user_id,reservation_id,event_id,ticket_type_id,quantity,status,provider,provider_request_version,unit_price_cents,amount_cents,currency" +
          (pricingClient ? ",price_quote_id" : ""),
      )
      .eq("reservation_id", cart["reservation_id"])
      .limit(2);
    if (attempts.error || !Array.isArray(attempts.data) || attempts.data.length > 1) return null;
    const a = attempts.data[0];
    if (!a) return { status: "pending" };
    const priced =
      pricingClient && a["price_quote_id"] != null
        ? await readPricedCart(pricingClient, owner, cartId)
        : null;
    const quote = priced?.quote;
    if (
      pricingClient &&
      a["price_quote_id"] != null &&
      (!quote ||
        quote.quoteId !== a["price_quote_id"] ||
        priced?.attemptId !== a["id"] ||
        priced.attemptStatus !== a["status"] ||
        quote.eventId !== hold["event_id"] ||
        quote.ticketTypeId !== cart["ticket_type_id"] ||
        quote.quantity !== qty ||
        quote.unitPriceCents !== a["unit_price_cents"] ||
        quote.currency !== a["currency"])
    )
      return null;
    if (
      !isUuid(a["id"]) ||
      a["user_id"] !== owner ||
      a["reservation_id"] !== hold["id"] ||
      a["event_id"] !== hold["event_id"] ||
      a["ticket_type_id"] !== cart["ticket_type_id"] ||
      a["quantity"] !== qty ||
      a["provider"] !== "stripe_test" ||
      a["provider_request_version"] !== 2 ||
      !Number.isSafeInteger(a["unit_price_cents"]) ||
      (a["unit_price_cents"] as number) < 0 ||
      !Number.isSafeInteger(a["amount_cents"]) ||
      a["amount_cents"] !==
        (quote?.totalCents ?? (a["unit_price_cents"] as number) * (qty as number)) ||
      typeof a["currency"] !== "string" ||
      !/^[a-z]{3}$/.test(a["currency"])
    )
      return null;
    if (a["status"] === "pending") return { status: "pending" };
    if (a["status"] !== "completed") return { status: "review" };
    const order = await one(
      "orders",
      "id,user_id,event_id,status,subtotal_cents,total_cents,currency,checkout_attempt_id",
      { checkout_attempt_id: a["id"], user_id: owner },
    );
    if (
      !order ||
      !isUuid(order["id"]) ||
      order["user_id"] !== owner ||
      order["event_id"] !== a["event_id"] ||
      order["checkout_attempt_id"] !== a["id"] ||
      !["paid", "refunded"].includes(String(order["status"])) ||
      order["subtotal_cents"] !== (quote?.subtotalCents ?? a["amount_cents"]) ||
      order["total_cents"] !== a["amount_cents"] ||
      order["currency"] !== a["currency"]
    )
      return null;
    const line = await one("order_items", "id,order_id,ticket_type_id,quantity,unit_price_cents", {
      order_id: order["id"],
      ticket_type_id: cart["ticket_type_id"],
    });
    if (
      !line ||
      !isUuid(line["id"]) ||
      line["order_id"] !== order["id"] ||
      line["ticket_type_id"] !== a["ticket_type_id"] ||
      line["quantity"] !== qty ||
      line["unit_price_cents"] !== a["unit_price_cents"]
    )
      return null;
    const rows = await client
      .from("tickets")
      .select(
        "id,order_id,order_item_id,event_id,ticket_type_id,owner_user_id,status,checked_in_at,events(name,starts_at,timezone,venue_name),ticket_types(name)" +
          (quote ? ",price_quote_id,price_quote_ordinal" : ""),
      )
      .eq("order_id", order["id"])
      .limit(11);
    if (rows.error || !Array.isArray(rows.data) || rows.data.length !== qty) return null;
    const ids = new Set();
    const ordinals = new Set();
    for (const t of rows.data) {
      if (
        !isUuid(t["id"]) ||
        ids.has(t["id"]) ||
        !isUuid(t["owner_user_id"]) ||
        t["order_id"] !== order["id"] ||
        t["order_item_id"] !== line["id"] ||
        t["event_id"] !== a["event_id"] ||
        t["ticket_type_id"] !== a["ticket_type_id"]
      )
        return null;
      ids.add(t["id"]);
      if (quote) {
        const ordinal = t["price_quote_ordinal"];
        if (
          t["price_quote_id"] !== quote.quoteId ||
          !Number.isSafeInteger(ordinal) ||
          (ordinal as number) < 0 ||
          (ordinal as number) >= quote.quantity ||
          ordinals.has(ordinal)
        )
          return null;
        ordinals.add(ordinal);
      }
    }
    // Never expose a transferred ticket's ID, holder or recipient to the purchaser.
    const tickets = presentOwnerTickets(
      rows.data.filter((t) => t["owner_user_id"] === owner),
      owner,
    );
    if (!tickets) return null;
    return {
      status: "confirmed",
      cartId,
      ticketTypeId: cart["ticket_type_id"],
      quantity: qty as number,
      amountCents: a["amount_cents"] as number,
      currency: a["currency"],
      tickets,
      unavailableTickets: (qty as number) - tickets.length,
      ...(quote
        ? {
            pricing: {
              unitPriceCents: quote.unitPriceCents,
              subtotalCents: quote.subtotalCents,
              discountCents: quote.discountCents,
              feeCents: quote.feeCents,
              taxMode: quote.taxMode,
              totalCents: quote.totalCents,
              currency: quote.currency,
              promotionCode: quote.discount?.code ?? null,
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}
