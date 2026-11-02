/** SELECT only. Caller RLS proves order visibility before any server-only refund read. */
import { isUuid } from "./checkout-core";
import { evaluateRefundPolicyAuthorization } from "./refund-policy-core";
import { loadCallerMemberships } from "./refund-policy.server";
import {
  readOrganizerOrderPricing,
  completeDetailRows,
  type OrganizerDetailReadClient,
} from "./organizer-order-pricing.server";
import {
  parseOrganizerOrderDetailInput,
  type OrganizerOrderDetail,
  type OrganizerOrderDetailResult,
} from "./organizer-order-detail-core";
type Row = Record<string, unknown>;
type Client = OrganizerDetailReadClient;
const fail = (): OrganizerOrderDetailResult => ({ ok: false, code: "unavailable" });
const date = (v: unknown): string | null =>
  typeof v === "string" && v.length <= 64 && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null;
const text = (v: unknown, max: number): string | null =>
  v === null ? "" : typeof v === "string" && v.length <= max ? v : null;
const complete = completeDetailRows;
export async function readOrganizerOrderDetail(args: {
  userClient: unknown;
  userId: string;
  input: unknown;
  env: {
    PAYMENTS_TEST_MODE?: string | undefined;
    PAYMENT_PROVIDER?: string | undefined;
    PROMOTION_PRICING_SANDBOX_MODE?: string | undefined;
  };
  loadRefundClient: () => Promise<unknown>;
}): Promise<OrganizerOrderDetailResult> {
  const input = parseOrganizerOrderDetailInput(args.input);
  if (!input) return { ok: false, code: "invalid_request" };
  if (
    args.env.PAYMENTS_TEST_MODE !== "true" ||
    args.env.PAYMENT_PROVIDER !== "stripe_test" ||
    !isUuid(args.userId)
  )
    return fail();
  try {
    const memberships = await loadCallerMemberships(args.userClient, input.eventId);
    if (
      !evaluateRefundPolicyAuthorization({
        memberships,
        eventId: input.eventId,
        userId: args.userId,
      }).ok
    )
      return fail();
    const user = args.userClient as Client;
    const orders = complete(
      await user
        .from("orders")
        .select(
          "id,event_id,user_id,checkout_attempt_id,buyer_name,buyer_email,status,created_at,currency,subtotal_cents,total_cents",
          {
            count: "exact",
          },
        )
        .eq("event_id", input.eventId)
        .eq("id", input.orderId)
        .limit(2),
      1,
    );
    if (!orders || orders.length !== 1) return fail();
    const raw = orders[0]!;
    const name = text(raw["buyer_name"], 500),
      email = text(raw["buyer_email"], 320),
      createdAt = date(raw["created_at"]);
    if (
      raw["id"] !== input.orderId ||
      raw["event_id"] !== input.eventId ||
      name === null ||
      email === null ||
      !createdAt ||
      raw["currency"] !== "usd" ||
      !["pending", "paid", "cancelled", "refunded"].includes(raw["status"] as string) ||
      !Number.isSafeInteger(raw["total_cents"]) ||
      (raw["total_cents"] as number) < 0
    )
      return fail();
    const tickets = complete(
      await user
        .from("tickets")
        .select(
          "id,event_id,order_id,order_item_id,ticket_type_id,holder_name,holder_email,status,checked_in_at,created_at" +
            (args.env.PROMOTION_PRICING_SANDBOX_MODE === "true"
              ? ",price_quote_id,price_quote_ordinal"
              : ""),
          {
            count: "exact",
          },
        )
        .eq("event_id", input.eventId)
        .eq("order_id", input.orderId)
        .order("id", { ascending: true })
        .limit(201),
      200,
    );
    if (!tickets) return fail();
    const order: OrganizerOrderDetail = {
      id: input.orderId,
      eventId: input.eventId,
      name,
      email,
      status: raw["status"] as string,
      createdAt,
      currency: "usd",
      originalTotalCents: raw["total_cents"] as number,
      tickets: [],
      refunds: [],
    };
    const ids = new Set<string>();
    for (const row of tickets) {
      const id = row["id"],
        holder = text(row["holder_name"], 500),
        contact = text(row["holder_email"], 320),
        issued = date(row["created_at"]);
      const checked = row["checked_in_at"] === null ? null : date(row["checked_in_at"]);
      if (
        !isUuid(id) ||
        ids.has(id) ||
        row["event_id"] !== input.eventId ||
        row["order_id"] !== input.orderId ||
        holder === null ||
        contact === null ||
        !issued ||
        !["issued", "checked_in", "void"].includes(row["status"] as string) ||
        (row["checked_in_at"] !== null && !checked)
      )
        return fail();
      ids.add(id);
      order.tickets.push({
        id,
        name: holder,
        email: contact,
        status: row["status"] as string,
        checkedInAt: checked,
        createdAt: issued,
      });
    }
    let support: Promise<OrganizerDetailReadClient> | undefined;
    const loadSupport = () =>
      (support ??= args.loadRefundClient().then((client) => client as OrganizerDetailReadClient));
    order.pricing = await readOrganizerOrderPricing({
      caller: user,
      loadSupport,
      order: raw,
      tickets,
      pricingEnabled: args.env.PROMOTION_PRICING_SANDBOX_MODE === "true",
    });
    // No global history, provider identifiers, pass tokens, or raw failure reasons projected.
    const refunds = complete(
      await (
        await loadSupport()
      )
        .from("ticket_refunds")
        .select("id,event_id,order_id,amount_cents,currency,ticket_count,created_at", {
          count: "exact",
        })
        .eq("event_id", input.eventId)
        .eq("order_id", input.orderId)
        .order("created_at", { ascending: true })
        .limit(201),
      200,
    );
    if (!refunds) return fail();
    ids.clear();
    for (const row of refunds) {
      const id = row["id"],
        created = date(row["created_at"]),
        amount = row["amount_cents"];
      if (
        !isUuid(id) ||
        ids.has(id) ||
        row["event_id"] !== input.eventId ||
        row["order_id"] !== input.orderId ||
        !created ||
        !Number.isSafeInteger(row["ticket_count"]) ||
        (row["ticket_count"] as number) < 1 ||
        (row["ticket_count"] as number) > 200 ||
        (amount !== null &&
          (!Number.isSafeInteger(amount) || (amount as number) < 1 || row["currency"] !== "usd")) ||
        (amount === null && row["currency"] !== null && row["currency"] !== "usd")
      )
        return fail();
      ids.add(id);
      order.refunds.push({
        id,
        createdAt: created,
        amountCents: amount as number | null,
        ticketCount: row["ticket_count"] as number,
      });
    }
    return { ok: true, order };
  } catch {
    return fail();
  }
}
