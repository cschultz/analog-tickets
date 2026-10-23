import { isUuid } from "./checkout-core";

export const ORGANIZER_PAGE_SIZE = 50;
export const ORGANIZER_EXPORT_LIMIT = 500;
export type OrganizerResource = "orders" | "attendees";
export type OrganizerSearchField = "name" | "email" | "id" | "orderId";
export interface OrganizerRecordsInput {
  eventId: string;
  resource: OrganizerResource;
  field: OrganizerSearchField;
  query: string;
  after: string | null;
  operation: "search" | "export";
}
export interface OrganizerRecord {
  id: string;
  orderId: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  checkedInAt: string | null;
  currency: string | null;
  /** Original order total, not net revenue or remaining refundable balance. */
  orderTotalCents: number | null;
}
export type OrganizerRecordsResult =
  | { ok: true; rows: OrganizerRecord[]; nextAfter: string | null; csv: string | null }
  | { ok: false; code: "unavailable" | "invalid_request" | "export_too_large" };

export function parseOrganizerRecordsInput(value: unknown): OrganizerRecordsInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) => !["eventId", "resource", "field", "query", "after", "operation"].includes(key),
    )
  )
    return null;
  const { eventId, resource, field, query, operation } = raw;
  const after = raw["after"] ?? null;
  if (
    !isUuid(eventId) ||
    (resource !== "orders" && resource !== "attendees") ||
    !["name", "email", "id", "orderId"].includes(field as string) ||
    typeof query !== "string" ||
    query.length > 120 ||
    /[\p{Cc}*]/u.test(query) ||
    (after !== null && !isUuid(after)) ||
    (operation !== "search" && operation !== "export") ||
    (operation === "export" && after !== null) ||
    (resource === "orders" && field === "orderId")
  )
    return null;
  const term = query.trim();
  if ((field === "id" || field === "orderId") && term !== "" && !isUuid(term)) return null;
  return {
    eventId: eventId.toLowerCase(),
    resource,
    field: field as OrganizerSearchField,
    query: term,
    after: after?.toLowerCase() ?? null,
    operation,
  };
}

/** Literal substring, not a user-controlled wildcard or PostgREST filter expression. */
export function organizerSearchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Quote every field and neutralize formula-leading text, even after invisible whitespace. */
export function organizerCsvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[\s\p{Cf}\p{Cc}]*[=+\-@]/u.test(text) || /^\p{Cc}/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function organizerRecordsCsv(input: OrganizerRecordsInput, rows: OrganizerRecord[]): string {
  if (rows.length > ORGANIZER_EXPORT_LIMIT) throw new Error("Export limit exceeded.");
  const header =
    input.resource === "orders"
      ? [
          "event_id",
          "order_id",
          "buyer_name",
          "buyer_email",
          "order_status",
          "created_at",
          "currency",
          "original_order_total_minor_units",
        ]
      : [
          "event_id",
          "ticket_id",
          "order_id",
          "holder_name",
          "holder_email",
          "ticket_status",
          "created_at",
          "checked_in_at",
        ];
  const values = rows.map((row) =>
    input.resource === "orders"
      ? [
          input.eventId,
          row.id,
          row.name,
          row.email,
          row.status,
          row.createdAt,
          row.currency,
          row.orderTotalCents,
        ]
      : [
          input.eventId,
          row.id,
          row.orderId,
          row.name,
          row.email,
          row.status,
          row.createdAt,
          row.checkedInAt,
        ],
  );
  return (
    [header, ...values].map((row) => row.map(organizerCsvCell).join(",")).join("\r\n") + "\r\n"
  );
}
