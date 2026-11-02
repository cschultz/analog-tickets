/** Read-only, TEST-only organizer queries, with the caller's RLS-scoped client. */
import { isUuid } from "./checkout-core";
import { evaluateRefundPolicyAuthorization } from "./refund-policy-core";
import { loadCallerMemberships } from "./refund-policy.server";
import {
  afterOrganizerDay,
  organizerBrowseLogic,
  organizerTimestamp,
  readOrganizerCursor,
  organizerCursor,
  isBeforeOrganizerCursor,
} from "./organizer-browse-core";
import {
  ORGANIZER_EXPORT_LIMIT,
  ORGANIZER_PAGE_SIZE,
  organizerRecordsCsv,
  organizerSearchPattern,
  parseOrganizerRecordsInput,
  type OrganizerRecord,
  type OrganizerRecordsResult,
} from "./organizer-records-core";

type Row = Record<string, unknown>;
interface OrganizerTestEnv {
  PAYMENTS_TEST_MODE?: string | undefined;
  PAYMENT_PROVIDER?: string | undefined;
}
interface ReadQuery extends PromiseLike<{
  data: Row[] | null;
  error: unknown;
  count: number | null;
}> {
  eq: (field: string, value: string) => ReadQuery;
  in: (field: string, values: string[]) => ReadQuery;
  ilike: (field: string, value: string) => ReadQuery;
  gt: (field: string, value: string) => ReadQuery;
  gte: (field: string, value: string) => ReadQuery;
  lt: (field: string, value: string) => ReadQuery;
  or: (filter: string) => ReadQuery;
  order: (field: string, options: { ascending: boolean }) => ReadQuery;
  limit: (limit: number) => ReadQuery;
}
interface ReadClient {
  from: (table: string) => { select: (columns: string, options: { count: "exact" }) => ReadQuery };
}
const unavailable = (): OrganizerRecordsResult => ({ ok: false, code: "unavailable" });
export type OrganizerEventChoices =
  { ok: true; events: { id: string; name: string }[] } | { ok: false };

/** Event names come through caller RLS too; unpublished names may be unavailable. */
export async function readOrganizerEvents(args: {
  userClient: unknown;
  userId: string;
  env: OrganizerTestEnv;
}): Promise<OrganizerEventChoices> {
  if (
    args.env.PAYMENTS_TEST_MODE !== "true" ||
    args.env.PAYMENT_PROVIDER !== "stripe_test" ||
    !isUuid(args.userId)
  )
    return { ok: false };
  try {
    const { data, error, count } = await (args.userClient as ReadClient)
      .from("event_memberships")
      .select("event_id,user_id,role,events(name)", { count: "exact" })
      .eq("user_id", args.userId)
      .in("role", ["organizer", "admin"])
      .order("event_id", { ascending: true })
      .limit(101);
    if (
      error ||
      !Array.isArray(data) ||
      !Number.isSafeInteger(count) ||
      count! > 100 ||
      count !== data.length
    )
      return { ok: false };
    const events: { id: string; name: string }[] = [];
    for (const row of data) {
      if (
        !isUuid(row["event_id"]) ||
        row["user_id"] !== args.userId ||
        !["organizer", "admin"].includes(row["role"] as string)
      )
        return { ok: false };
      const joined = row["events"];
      const name =
        joined && typeof joined === "object" && !Array.isArray(joined)
          ? (joined as Row)["name"]
          : null;
      events.push({
        id: row["event_id"],
        name:
          typeof name === "string" && name.length <= 500
            ? name
            : `Event ${row["event_id"].slice(0, 8)}`,
      });
    }
    if (new Set(events.map((e) => e.id)).size !== events.length) return { ok: false };
    return { ok: true, events };
  } catch {
    return { ok: false };
  }
}
const text = (value: unknown, max: number): string | null =>
  value === null ? "" : typeof value === "string" && value.length <= max ? value : null;
function date(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64 || !Number.isFinite(Date.parse(value)))
    return null;
  return new Date(value).toISOString();
}

export async function readOrganizerRecords(args: {
  userClient: unknown;
  userId: string;
  input: unknown;
  env: OrganizerTestEnv;
}): Promise<OrganizerRecordsResult> {
  const input = parseOrganizerRecordsInput(args.input);
  if (!input) return { ok: false, code: "invalid_request" };
  if (
    args.env.PAYMENTS_TEST_MODE !== "true" ||
    args.env.PAYMENT_PROVIDER !== "stripe_test" ||
    !isUuid(args.userId)
  )
    return unavailable();
  try {
    const memberships = await loadCallerMemberships(args.userClient, input.eventId);
    if (
      !evaluateRefundPolicyAuthorization({
        memberships,
        eventId: input.eventId,
        userId: args.userId,
      }).ok
    )
      return unavailable();
    // Deliberately NO service-role client. Existing RLS remains a second boundary.
    const orders = input.resource === "orders";
    let projection = orders
      ? "id,event_id,buyer_name,buyer_email,status,created_at,currency,total_cents"
      : "id,event_id,order_id,holder_name,holder_email,status,created_at,checked_in_at";
    const recent = input.sort === "recent";
    const filters = input.filters;
    if (filters?.ticketTypeId)
      projection += orders ? ",order_items!inner(ticket_type_id)" : ",ticket_type_id";
    let query = (args.userClient as ReadClient)
      .from(orders ? "orders" : "tickets")
      .select(projection, { count: "exact" })
      .eq("event_id", input.eventId);
    if (input.query && input.field !== "auto") {
      const field =
        input.field === "name"
          ? orders
            ? "buyer_name"
            : "holder_name"
          : input.field === "email"
            ? orders
              ? "buyer_email"
              : "holder_email"
            : input.field === "orderId"
              ? "order_id"
              : "id";
      query =
        input.field === "name" || input.field === "email"
          ? query.ilike(field, organizerSearchPattern(input.query))
          : query.eq(field, input.query.toLowerCase());
    }
    if (filters) {
      if (filters.status !== "all") query = query.eq("status", filters.status);
      if (filters.from) query = query.gte("created_at", filters.from + "T00:00:00Z");
      if (filters.through) query = query.lt("created_at", afterOrganizerDay(filters.through));
      if (filters.ticketTypeId)
        query = query.eq(
          orders ? "order_items.ticket_type_id" : "ticket_type_id",
          filters.ticketTypeId,
        );
    }
    if (recent) {
      const logic = organizerBrowseLogic(
        input.resource,
        input.query,
        input.field === "auto",
        input.after,
      );
      if (logic) query = query.or(logic);
      query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
    } else {
      if (input.after) query = query.gt("id", input.after);
      query = query.order("id", { ascending: true });
    }
    const limit = input.operation === "export" ? ORGANIZER_EXPORT_LIMIT : ORGANIZER_PAGE_SIZE;
    const { data, error, count } = await query.limit(limit + 1);
    if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count! < 0)
      return unavailable();
    if (input.operation === "export" && count! > limit)
      return { ok: false, code: "export_too_large" };
    // Fail if the Data API capped or unexpectedly omitted rows. Never label a partial export complete.
    if (data.length !== Math.min(count!, limit + 1)) return unavailable();
    const rows: OrganizerRecord[] = [];
    let previousId = input.after ?? "";
    let previousCursor = input.after && recent ? readOrganizerCursor(input.after) : null;
    for (const raw of recent ? data : data.slice(0, limit)) {
      if (raw["event_id"] !== input.eventId || !isUuid(raw["id"])) return unavailable();
      const id = raw["id"].toLowerCase();
      if (!recent && id <= previousId) return unavailable();
      previousId = id;
      const orderId = orders ? id : raw["order_id"];
      const name = text(raw[orders ? "buyer_name" : "holder_name"], 500);
      const email = text(raw[orders ? "buyer_email" : "holder_email"], 320);
      const createdAt = recent ? organizerTimestamp(raw["created_at"]) : date(raw["created_at"]);
      if (recent) {
        if (!createdAt) return unavailable();
        const currentCursor = { createdAt, id };
        if (previousCursor && !isBeforeOrganizerCursor(currentCursor, previousCursor))
          return unavailable();
        previousCursor = currentCursor;
        if (filters?.status !== "all" && raw["status"] !== filters?.status) return unavailable();
        if (filters?.from && createdAt < filters.from + "T00:00:00.000000Z") return unavailable();
        if (filters?.through && createdAt.slice(0, 10) > filters.through) return unavailable();
        if (filters?.ticketTypeId) {
          const items = raw["order_items"];
          if (
            orders
              ? !Array.isArray(items) ||
                !items.length ||
                items.some(
                  (item) =>
                    !item ||
                    typeof item !== "object" ||
                    item.ticket_type_id !== filters.ticketTypeId,
                )
              : raw["ticket_type_id"] !== filters.ticketTypeId
          )
            return unavailable();
        }
      }
      const checkedInAt =
        orders || raw["checked_in_at"] === null ? null : date(raw["checked_in_at"]);
      const currency = orders ? raw["currency"] : null;
      const total = orders ? raw["total_cents"] : null;
      const status = raw["status"];
      if (
        !isUuid(orderId) ||
        name === null ||
        email === null ||
        !createdAt ||
        (!orders && raw["checked_in_at"] !== null && !checkedInAt) ||
        typeof status !== "string" ||
        !(
          orders ? ["pending", "paid", "cancelled", "refunded"] : ["issued", "checked_in", "void"]
        ).includes(status) ||
        (orders &&
          (typeof currency !== "string" ||
            !/^[a-z]{3}$/.test(currency) ||
            !Number.isSafeInteger(total) ||
            (total as number) < 0))
      )
        return unavailable();
      rows.push({
        id,
        orderId,
        name,
        email,
        status,
        createdAt,
        checkedInAt,
        currency: currency as string | null,
        orderTotalCents: total as number | null,
      });
    }
    const pageRows = rows.slice(0, limit);
    return {
      ok: true,
      rows: pageRows,
      nextAfter:
        count! > limit ? (recent ? organizerCursor(pageRows.at(-1)!) : pageRows.at(-1)!.id) : null,
      csv: input.operation === "export" ? organizerRecordsCsv(input, pageRows) : null,
    };
  } catch {
    return unavailable();
  }
}
