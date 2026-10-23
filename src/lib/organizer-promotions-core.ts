import { isUuid } from "./checkout-core";
export type PromotionEdit = {
  eventId: string;
  id: string | null;
  version: number | null;
  code: string;
  ticketTypeId: string | null;
  enabled: boolean;
  startsAt: string;
  expiresAt: string;
  kind: "fixed" | "percentage";
  value: number;
  maxRedemptions: number | null;
};
export type OrganizerPromotion = PromotionEdit & {
  id: string;
  version: number;
  currency: "usd";
  reserved: number;
  consumed: number;
};
export type PromotionPage = {
  rows: OrganizerPromotion[];
  tiers: {
    id: string;
    name: string;
    currency: string;
    active: boolean;
  }[];
  nextAfter: string | null;
};
export type PromotionInput =
  { action: "list"; eventId: string; after: string | null } | (PromotionEdit & { action: "save" });
export type PromotionError =
  | "invalid_request"
  | "unavailable"
  | "code_taken"
  | "version_conflict"
  | "immutable_scope"
  | "invalid_scope"
  | "limit_below_usage"
  | "too_many_tiers";
export type PromotionResult =
  | { ok: false; code: PromotionError }
  | { ok: true; action: "list"; page: PromotionPage }
  | { ok: true; action: "save"; id: string; version: number };
export const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
export const canonicalCode = (v: unknown): string | null =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(v.trim())
    ? v.trim().toUpperCase()
    : null;
/** Form decimals become cents/basis points without binary float rounding. */
export function decimalMinorUnits(value: string): number | null {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
const integer = (v: unknown, min: number, max = 2147483647): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const date = (v: unknown): v is string => {
  if (typeof v !== "string" || v.length > 40 || !Number.isFinite(Date.parse(v))) return false;
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!m || Number(m[1]) < 1 || Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59)
    return false;
  const d = new Date(0);
  d.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
};
export function parsePromotionEdit(value: unknown): PromotionEdit | null {
  const r = object(value),
    code = canonicalCode(r?.["code"]);
  if (
    !r ||
    !code ||
    !isUuid(r["eventId"]) ||
    (r["id"] !== null && !isUuid(r["id"])) ||
    (r["id"] === null ? r["version"] !== null : !integer(r["version"], 1)) ||
    (r["ticketTypeId"] !== null && !isUuid(r["ticketTypeId"])) ||
    typeof r["enabled"] !== "boolean" ||
    !date(r["startsAt"]) ||
    !date(r["expiresAt"]) ||
    Date.parse(r["expiresAt"]) <= Date.parse(r["startsAt"]) ||
    !["fixed", "percentage"].includes(r["kind"] as string) ||
    !integer(r["value"], 1, r["kind"] === "percentage" ? 10000 : 99999999) ||
    (r["maxRedemptions"] !== null && !integer(r["maxRedemptions"], 1))
  )
    return null;
  return {
    eventId: r["eventId"].toLowerCase(),
    id: r["id"] === null ? null : (r["id"] as string).toLowerCase(),
    version: r["version"] as number | null,
    code,
    ticketTypeId: r["ticketTypeId"] === null ? null : (r["ticketTypeId"] as string).toLowerCase(),
    enabled: r["enabled"],
    startsAt: r["startsAt"],
    expiresAt: r["expiresAt"],
    kind: r["kind"] as "fixed" | "percentage",
    value: r["value"],
    maxRedemptions: r["maxRedemptions"] as number | null,
  };
}
export function parsePromotionInput(value: unknown): PromotionInput | null {
  const r = object(value);
  if (!r) return null;
  if (r["action"] === "list")
    return Object.keys(r).length === 3 &&
      isUuid(r["eventId"]) &&
      (r["after"] === null ||
        (canonicalCode(r["after"]) === r["after"] && typeof r["after"] === "string"))
      ? { action: "list", eventId: r["eventId"].toLowerCase(), after: r["after"] as string | null }
      : null;
  const edit = r["action"] === "save" ? parsePromotionEdit(r) : null;
  const keys = [
    "action",
    "eventId",
    "id",
    "version",
    "code",
    "ticketTypeId",
    "enabled",
    "startsAt",
    "expiresAt",
    "kind",
    "value",
    "maxRedemptions",
  ];
  return edit &&
    !(edit.kind === "percentage" && edit.value === 10000 && (edit.id === null || edit.enabled)) &&
    Object.keys(r).length === keys.length &&
    Object.keys(r).every((k) => keys.includes(k))
    ? { action: "save", ...edit }
    : null;
}
export function parsePromotionPage(
  value: unknown,
  eventId: string,
  after: string | null,
): PromotionPage | null {
  const r = object(value);
  if (
    !r ||
    !Array.isArray(r["rows"]) ||
    r["rows"].length > 50 ||
    !Array.isArray(r["tiers"]) ||
    r["tiers"].length > 100
  )
    return null;
  const rows: OrganizerPromotion[] = [],
    tiers: PromotionPage["tiers"] = [];
  let previous = after ?? "";
  const ids = new Set<string>();
  for (const raw of r["rows"]) {
    const edit = parsePromotionEdit(raw),
      p = object(raw);
    if (
      !edit ||
      !edit.id ||
      edit.version === null ||
      edit.eventId !== eventId ||
      edit.code !== p?.["code"] ||
      edit.code <= previous ||
      ids.has(edit.id) ||
      p?.["currency"] !== "usd" ||
      !integer(p["reserved"], 0, Number.MAX_SAFE_INTEGER) ||
      !integer(p["consumed"], 0, Number.MAX_SAFE_INTEGER) ||
      !Number.isSafeInteger(p["reserved"] + p["consumed"]) ||
      (edit.maxRedemptions !== null && edit.maxRedemptions < p["reserved"] + p["consumed"])
    )
      return null;
    previous = edit.code;
    ids.add(edit.id);
    rows.push({
      ...edit,
      id: edit.id,
      version: edit.version,
      currency: "usd",
      reserved: p["reserved"],
      consumed: p["consumed"],
    });
  }
  const next = r["nextAfter"];
  if (next !== null && (rows.length !== 50 || next !== previous)) return null;
  for (const raw of r["tiers"]) {
    const t = object(raw);
    if (
      !t ||
      !isUuid(t["id"]) ||
      typeof t["name"] !== "string" ||
      t["name"].length > 500 ||
      typeof t["currency"] !== "string" ||
      !/^[a-z]{3}$/.test(t["currency"]) ||
      typeof t["active"] !== "boolean" ||
      tiers.some((x) => x.id === t["id"])
    )
      return null;
    tiers.push({ id: t["id"], name: t["name"], currency: t["currency"], active: t["active"] });
  }
  if (rows.some((p) => p.ticketTypeId !== null && !tiers.some((t) => t.id === p.ticketTypeId)))
    return null;
  return { rows, tiers, nextAfter: next as string | null };
}
