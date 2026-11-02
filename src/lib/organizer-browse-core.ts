import { isUuid } from "./checkout-core";

export interface OrganizerFilters {
  status: string;
  from: string | null;
  through: string | null;
  ticketTypeId: string | null;
}
export const emptyOrganizerFilters: OrganizerFilters = {
  status: "all",
  from: null,
  through: null,
  ticketTypeId: null,
};
export const organizerStatuses = {
  orders: ["pending", "paid", "cancelled", "refunded"],
  attendees: ["issued", "checked_in", "void"],
};
export function organizerDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function afterOrganizerDay(value: string): string {
  return new Date(Date.parse(value + "T00:00:00Z") + 86400000).toISOString();
}
export function parseOrganizerFilters(
  value: unknown,
  resource: "orders" | "attendees",
): OrganizerFilters | null {
  if (value === undefined) return { ...emptyOrganizerFilters };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((k) => !["status", "from", "through", "ticketTypeId"].includes(k)))
    return null;
  const { status = "all", from = null, through = null, ticketTypeId = null } = raw;
  if (
    typeof status !== "string" ||
    (status !== "all" && !organizerStatuses[resource].includes(status)) ||
    (from !== null && !organizerDay(from)) ||
    (through !== null && (!organizerDay(through) || through >= "9999-12-31")) ||
    (from !== null && through !== null && String(from) > String(through)) ||
    (ticketTypeId !== null && !isUuid(ticketTypeId))
  )
    return null;
  return {
    status,
    from: from as string | null,
    through: through as string | null,
    ticketTypeId: typeof ticketTypeId === "string" ? ticketTypeId.toLowerCase() : null,
  };
}

/** Normalize timezone but retain PostgreSQL microseconds: JS milliseconds alone skip page boundaries. */
export function organizerTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
    value,
  );
  if (
    !match ||
    !Number.isFinite(Date.parse(value)) ||
    !Number.isFinite(Date.parse(match[1] + "Z")) ||
    new Date(match[1] + "Z").toISOString().slice(0, 19) !== match[1]
  )
    return null;
  const utc = new Date(value).toISOString();
  if (!/^\d{4}-/.test(utc)) return null;
  return utc.slice(0, 19) + "." + (match[2] ?? "").padEnd(6, "0") + "Z";
}
export interface OrganizerCursor {
  createdAt: string;
  id: string;
}
export function readOrganizerCursor(value: unknown): OrganizerCursor | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const [createdAt, id, extra] = value.split("~");
  if (extra !== undefined || !isUuid(id) || organizerTimestamp(createdAt) !== createdAt)
    return null;
  return { createdAt: createdAt!, id: id.toLowerCase() };
}
export function organizerCursor(value: OrganizerCursor): string {
  return `${value.createdAt}~${value.id}`;
}
export function organizerPageHistory(
  history: (string | null)[],
  cursor: string | null,
  direction: "search" | "next" | "previous" | "refresh",
): (string | null)[] {
  if (direction === "next") return [...history, cursor];
  if (direction === "refresh") return [...history];
  if (direction === "previous") return history.length > 1 ? history.slice(0, -1) : [null];
  return [cursor];
}
export function isBeforeOrganizerCursor(
  value: OrganizerCursor,
  previous: OrganizerCursor,
): boolean {
  return (
    value.createdAt < previous.createdAt ||
    (value.createdAt === previous.createdAt && value.id < previous.id)
  );
}

/** PostgREST quoted literal, not raw user-controlled filter syntax. */
export function organizerLiteralPattern(query: string): string {
  return JSON.stringify(`%${query.replace(/[\\%_]/g, "\\$&")}%`);
}
export function organizerBrowseLogic(
  resource: "orders" | "attendees",
  query: string,
  auto: boolean,
  after: string | null,
): string | null {
  const groups: string[] = [];
  if (auto && query) {
    if (isUuid(query))
      groups.push(
        resource === "orders"
          ? `id.eq.${query.toLowerCase()}`
          : `id.eq.${query.toLowerCase()},order_id.eq.${query.toLowerCase()}`,
      );
    else {
      const prefix = resource === "orders" ? "buyer" : "holder";
      const pattern = organizerLiteralPattern(query);
      groups.push(`${prefix}_name.ilike.${pattern},${prefix}_email.ilike.${pattern}`);
    }
  }
  if (after) {
    const cursor = readOrganizerCursor(after);
    if (!cursor) throw new Error("Invalid recent-order cursor");
    groups.push(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  return groups.length > 1
    ? `and(${groups.map((g) => `or(${g})`).join(",")})`
    : (groups[0] ?? null);
}
