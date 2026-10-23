import { isUuid, parseBearer, resolveCors, isSandboxEnabled } from "./transfer-otp-core";

export const OWNER_TICKET_PAGE_SIZE = 20;
export interface OwnerTicket {
  ticketId: string;
  eventName: string;
  ticketTypeName: string;
  eventStartsAt: string | null;
  eventTimezone: string | null;
  venueName: string | null;
  status: "issued" | "refunded" | "void" | "unknown";
  checkedInAt: string | null;
}

export function validEventTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validEventStart(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

/** Do not return any rows if the query ever returns another owner's ticket. */
export function presentOwnerTickets(data: unknown, ownerId: string): OwnerTicket[] | null {
  if (!isUuid(ownerId) || !Array.isArray(data) || data.length > OWNER_TICKET_PAGE_SIZE + 1)
    return null;
  const ids = new Set<string>();
  const out: OwnerTicket[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (!isUuid(r["id"]) || r["owner_user_id"] !== ownerId || ids.has(r["id"])) return null;
    ids.add(r["id"]);
    const checked = r["checked_in_at"];
    if (checked !== null && (typeof checked !== "string" || !Number.isFinite(Date.parse(checked))))
      return null;
    const name = (value: unknown, fallback: string) => {
      if (!value || typeof value !== "object") return fallback;
      const n = (value as Record<string, unknown>)["name"];
      return typeof n === "string" && n.trim() && n.length <= 200 ? n : fallback;
    };
    const status = r["status"];
    const event =
      r["events"] && typeof r["events"] === "object" && !Array.isArray(r["events"])
        ? (r["events"] as Record<string, unknown>)
        : null;
    const eventTimeOk =
      validEventStart(event?.["starts_at"]) && validEventTimezone(event?.["timezone"]);
    const venue = event?.["venue_name"];
    out.push({
      ticketId: r["id"],
      eventName: name(r["events"], "Event details unavailable"),
      ticketTypeName: name(r["ticket_types"], "Ticket"),
      eventStartsAt: eventTimeOk ? (event?.["starts_at"] as string) : null,
      eventTimezone: eventTimeOk ? (event?.["timezone"] as string) : null,
      venueName:
        typeof venue === "string" && venue.trim() && venue.length <= 200 ? venue.trim() : null,
      status:
        status === "issued" || status === "refunded" || status === "void" ? status : "unknown",
      checkedInAt: checked as string | null,
    });
  }
  return out;
}

export interface OwnerTicketsDependencies {
  enabled: string | undefined;
  allowedOrigin: string | undefined;
  authenticate: (token: string) => Promise<string | null>;
  load: (token: string, ownerId: string, offset: number) => Promise<unknown>;
}

/** Read-only POST avoids putting pagination/account details in URLs. No caller owner ID accepted. */
export async function handleOwnerTickets(
  request: Request,
  deps: OwnerTicketsDependencies,
): Promise<Response> {
  const cors = resolveCors(request.headers.get("origin"), deps.allowedOrigin);
  const headers = {
    ...cors.headers,
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!cors.allowed) return reply({ error: "Not permitted." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "Not permitted." }, 405);
  if (!isSandboxEnabled(deps.enabled)) return reply({ error: "Service unavailable." }, 503);
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return reply({ error: "Authentication required." }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  try {
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply({ error: "Invalid request." }, 400);
    const b = body as Record<string, unknown>;
    if (
      Object.keys(b).some((k) => k !== "offset") ||
      !Number.isSafeInteger(b["offset"]) ||
      (b["offset"] as number) < 0 ||
      (b["offset"] as number) > 10000
    )
      return reply({ error: "Invalid request." }, 400);
    const ownerId = await deps.authenticate(token);
    if (!isUuid(ownerId)) return reply({ error: "Authentication required." }, 401);
    const tickets = presentOwnerTickets(
      await deps.load(token, ownerId, b["offset"] as number),
      ownerId,
    );
    if (!tickets) return reply({ error: "Service unavailable." }, 503);
    return reply({
      tickets: tickets.slice(0, OWNER_TICKET_PAGE_SIZE),
      hasMore: tickets.length > OWNER_TICKET_PAGE_SIZE,
    });
  } catch {
    return reply({ error: "Service unavailable." }, 503);
  }
}
