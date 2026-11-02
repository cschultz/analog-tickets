import { isUuid } from "./checkout-core";
export interface AdminEvent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  venue: string | null;
  timezone: string;
  startsAt: string | null;
  endsAt: string | null;
  published: boolean;
  revision: string;
}
export interface AdminTier {
  id: string;
  eventId: string;
  name: string;
  slug: string;
  priceCents: number;
  capacity: number | null;
  committed: number;
  maxPerOrder: number;
  active: boolean;
  refundable: boolean;
  revision: string;
}
export interface AdminWorkspace {
  event: AdminEvent;
  tiers: AdminTier[];
  summary: {
    paidOrders: number;
    pendingOrders: number;
    cancelledOrders: number;
    originalPaidCents: number;
  };
  attendance: { validTickets: number; voidTickets: number; checkedIn: number };
  refunds: { knownCents: number; unknownAmounts: number; records: number };
  daily: { day: string; orders: number; originalPaidCents: number }[];
  dailyDateCount: number;
}
export interface EventValues {
  name: string;
  description: string;
  venue: string;
  timezone: string;
  startsAt: string | null;
  endsAt: string | null;
}
export interface TierValues {
  name: string;
  slug: string;
  priceCents: number;
  capacity: number;
  maxPerOrder: number;
  active: boolean;
}
export type WorkspaceInput =
  | { action: "read"; eventId: string }
  | { action: "save_event"; eventId: string; revision: string; values: EventValues }
  | {
      action: "save_tier";
      eventId: string;
      id: string | null;
      revision: string | null;
      values: TierValues;
    };
export type WorkspaceError =
  | "invalid_request"
  | "unavailable"
  | "setup_required"
  | "writes_disabled"
  | "version_conflict"
  | "capacity_below_committed"
  | "slug_taken"
  | "immutable_slug"
  | "too_many_tiers";
export type WorkspaceResult =
  | { ok: true; action: "read"; workspace: AdminWorkspace; canEdit: boolean }
  | { ok: true; action: "saved" }
  | { ok: false; code: WorkspaceError };
export const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const keys = (r: Record<string, unknown>, allowed: string[]) =>
  Object.keys(r).sort().join(",") === allowed.sort().join(",");
const str = (v: unknown, max: number, min = 0): v is string =>
  typeof v === "string" &&
  v.length <= max &&
  v.trim().length >= min &&
  !Array.from(v).some((c) => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0)));
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max;
const revision = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
const stamp = (v: unknown): v is string | null =>
  v === null ||
  (typeof v === "string" &&
    v.length <= 64 &&
    /(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
    Number.isFinite(Date.parse(v)));
export function validTimezone(v: unknown): v is string {
  if (!str(v, 100, 1)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}
export function parseWorkspaceInput(raw: unknown): WorkspaceInput | null {
  const r = object(raw);
  if (!r || !isUuid(r["eventId"])) return null;
  const eventId = r["eventId"].toLowerCase();
  if (r["action"] === "read" && keys(r, ["action", "eventId"])) return { action: "read", eventId };
  const v = object(r["values"]);
  if (!v || !str(v["name"], 160, 1)) return null;
  if (
    r["action"] === "save_event" &&
    keys(r, ["action", "eventId", "revision", "values"]) &&
    revision(r["revision"]) &&
    keys(v, ["name", "description", "venue", "timezone", "startsAt", "endsAt"]) &&
    str(v["description"], 4000) &&
    str(v["venue"], 200) &&
    validTimezone(v["timezone"]) &&
    stamp(v["startsAt"]) &&
    stamp(v["endsAt"]) &&
    (v["endsAt"] === null ||
      (v["startsAt"] !== null && Date.parse(v["endsAt"]) > Date.parse(v["startsAt"])))
  ) {
    return {
      action: "save_event",
      eventId,
      revision: r["revision"],
      values: {
        name: v["name"].trim(),
        description: v["description"],
        venue: v["venue"],
        timezone: v["timezone"],
        startsAt: v["startsAt"],
        endsAt: v["endsAt"],
      },
    };
  }
  if (
    r["action"] === "save_tier" &&
    keys(r, ["action", "eventId", "id", "revision", "values"]) &&
    (r["id"] === null ? r["revision"] === null : isUuid(r["id"]) && revision(r["revision"])) &&
    keys(v, ["name", "slug", "priceCents", "capacity", "maxPerOrder", "active"]) &&
    typeof v["slug"] === "string" &&
    /^[a-z0-9][a-z0-9-]{0,79}$/.test(v["slug"]) &&
    integer(v["priceCents"], 99999999) &&
    v["priceCents"] >= 50 &&
    integer(v["capacity"], 999999999) &&
    integer(v["maxPerOrder"], 10) &&
    v["maxPerOrder"] >= 1 &&
    typeof v["active"] === "boolean"
  )
    return {
      action: "save_tier",
      eventId,
      id: r["id"] as string | null,
      revision: r["revision"] as string | null,
      values: {
        name: v["name"].trim(),
        slug: v["slug"],
        priceCents: v["priceCents"],
        capacity: v["capacity"],
        maxPerOrder: v["maxPerOrder"],
        active: v["active"],
      },
    };
  return null;
}
export function parseAdminWorkspace(raw: unknown, eventId: string): AdminWorkspace | null {
  const r = object(raw),
    e = object(r?.["event"]),
    s = object(r?.["summary"]),
    a = object(r?.["attendance"]),
    f = object(r?.["refunds"]);
  if (
    !r ||
    !e ||
    e["id"] !== eventId ||
    !str(e["name"], 500, 1) ||
    !str(e["slug"], 200, 1) ||
    !(e["description"] === null || str(e["description"], 20000)) ||
    !(e["venue"] === null || str(e["venue"], 1000)) ||
    !validTimezone(e["timezone"]) ||
    !stamp(e["startsAt"]) ||
    !stamp(e["endsAt"]) ||
    typeof e["published"] !== "boolean" ||
    !revision(e["revision"]) ||
    !Array.isArray(r["tiers"]) ||
    r["tiers"].length > 200 ||
    !s ||
    !a ||
    !f ||
    !Array.isArray(r["daily"]) ||
    r["daily"].length > 90 ||
    !integer(r["dailyDateCount"])
  )
    return null;
  for (const [row, fields] of [
    [s, ["paidOrders", "pendingOrders", "cancelledOrders", "originalPaidCents"]],
    [a, ["validTickets", "voidTickets", "checkedIn"]],
    [f, ["knownCents", "unknownAmounts", "records"]],
  ] as const) {
    if (!keys(row, [...fields])) return null;
    for (const field of fields) if (!integer(row[field])) return null;
  }
  if (
    (a["checkedIn"] as number) > (a["validTickets"] as number) ||
    (f["unknownAmounts"] as number) > (f["records"] as number) ||
    r["daily"].length !== Math.min(r["dailyDateCount"], 90)
  )
    return null;
  const tiers: AdminTier[] = [],
    ids = new Set<string>();
  for (const rawTier of r["tiers"]) {
    const t = object(rawTier);
    if (
      !t ||
      !isUuid(t["id"]) ||
      ids.has(t["id"]) ||
      t["eventId"] !== eventId ||
      !str(t["name"], 500, 1) ||
      !str(t["slug"], 200, 1) ||
      !integer(t["priceCents"], 2147483647) ||
      !(t["capacity"] === null || integer(t["capacity"], 2147483647)) ||
      !integer(t["committed"], 2147483647) ||
      !integer(t["maxPerOrder"], 2147483647) ||
      t["maxPerOrder"] < 1 ||
      typeof t["active"] !== "boolean" ||
      typeof t["refundable"] !== "boolean" ||
      !revision(t["revision"])
    )
      return null;
    ids.add(t["id"]);
    tiers.push({
      id: t["id"],
      eventId,
      name: t["name"],
      slug: t["slug"],
      priceCents: t["priceCents"],
      capacity: t["capacity"],
      committed: t["committed"],
      maxPerOrder: t["maxPerOrder"],
      active: t["active"],
      refundable: t["refundable"],
      revision: t["revision"],
    });
  }
  const daily: AdminWorkspace["daily"] = [];
  let previous = "9999-99-99";
  let dailyOrders = 0,
    dailyCents = 0;
  for (const rawDay of r["daily"]) {
    const d = object(rawDay);
    if (
      !d ||
      typeof d["day"] !== "string" ||
      !/^\d{4}-\d\d-\d\d$/.test(d["day"]) ||
      !Number.isFinite(Date.parse(d["day"])) ||
      new Date(d["day"]).toISOString().slice(0, 10) !== d["day"] ||
      d["day"] >= previous ||
      !integer(d["orders"]) ||
      !integer(d["originalPaidCents"])
    )
      return null;
    previous = d["day"];
    dailyOrders += d["orders"];
    dailyCents += d["originalPaidCents"];
    daily.push({ day: d["day"], orders: d["orders"], originalPaidCents: d["originalPaidCents"] });
  }
  if (
    !Number.isSafeInteger(dailyOrders) ||
    !Number.isSafeInteger(dailyCents) ||
    dailyOrders > (s["paidOrders"] as number) ||
    dailyCents > (s["originalPaidCents"] as number) ||
    (r["dailyDateCount"] <= 90 &&
      (dailyOrders !== s["paidOrders"] || dailyCents !== s["originalPaidCents"]))
  )
    return null;
  return {
    event: {
      id: eventId,
      name: e["name"],
      slug: e["slug"],
      description: e["description"] as string | null,
      venue: e["venue"] as string | null,
      timezone: e["timezone"],
      startsAt: e["startsAt"],
      endsAt: e["endsAt"],
      published: e["published"],
      revision: e["revision"],
    },
    tiers,
    summary: s as unknown as AdminWorkspace["summary"],
    attendance: a as unknown as AdminWorkspace["attendance"],
    refunds: f as unknown as AdminWorkspace["refunds"],
    daily,
    dailyDateCount: r["dailyDateCount"],
  };
}
