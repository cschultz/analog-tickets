import { isUuid, type CheckoutErrorCode } from "./checkout-core";
import { normalizePromotionCode, MAX_QUOTE_CENTS } from "./promotion-pricing-core";
import { parseGuestCartInput, type GuestCartInput } from "./guest-checkout-cart";

export interface PricePreview {
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: "usd";
  feeCents: 0;
  taxMode: "not_calculated";
  code: string | null;
  revision: string;
}
export type PromoErrorCode =
  CheckoutErrorCode | "promotion_unavailable" | "review_required" | "unsupported_paid_total";
export type PromoResult<T> = { ok: true; value: T } | { ok: false; code: PromoErrorCode };
export type PromoInput =
  | { action: "preview"; ticketTypeId: string; quantity: number; code: string | null }
  | { action: "prepare"; cart: GuestCartInput; code: string | null; revision: string }
  | { action: "read" | "pay" | "resume" | "expire"; cartId: string };
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= 10;
const cents = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_QUOTE_CENTS;
const revision = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
export function parsePricePreview(value: unknown): PricePreview | null {
  const v = obj(value);
  if (!v) return null;
  if (
    !isUuid(v["ticketTypeId"]) ||
    !count(v["quantity"]) ||
    !cents(v["unitPriceCents"]) ||
    !cents(v["subtotalCents"]) ||
    !cents(v["discountCents"]) ||
    !cents(v["totalCents"]) ||
    v["totalCents"] < 50 ||
    v["currency"] !== "usd" ||
    v["feeCents"] !== 0 ||
    v["taxMode"] !== "not_calculated" ||
    !revision(v["revision"]) ||
    v["subtotalCents"] !== v["quantity"] * v["unitPriceCents"] ||
    v["totalCents"] !== v["subtotalCents"] - v["discountCents"] ||
    (v["code"] === null && v["discountCents"] !== 0) ||
    (v["code"] !== null && normalizePromotionCode(v["code"]) !== v["code"])
  )
    return null;
  return {
    ticketTypeId: v["ticketTypeId"],
    quantity: v["quantity"],
    unitPriceCents: v["unitPriceCents"],
    subtotalCents: v["subtotalCents"],
    discountCents: v["discountCents"],
    totalCents: v["totalCents"],
    currency: "usd",
    feeCents: 0,
    taxMode: "not_calculated",
    code: v["code"] as string | null,
    revision: v["revision"],
  };
}
export function parsePromoInput(value: unknown): PromoInput | null {
  const v = obj(value);
  if (!v) return null;
  const action = v["action"];
  const only = (keys: string[]) => Object.keys(v).every((k) => keys.includes(k));
  if (action === "read" || action === "pay" || action === "resume" || action === "expire")
    return only(["action", "cartId"]) && isUuid(v["cartId"])
      ? { action, cartId: v["cartId"] }
      : null;
  const code = v["code"] === null ? null : normalizePromotionCode(v["code"]);
  if (v["code"] !== null && code === null) return null;
  if (action === "preview")
    return only(["action", "ticketTypeId", "quantity", "code"]) &&
      isUuid(v["ticketTypeId"]) &&
      count(v["quantity"])
      ? { action, ticketTypeId: v["ticketTypeId"], quantity: v["quantity"], code }
      : null;
  if (
    action !== "prepare" ||
    !only(["action", "cartId", "ticketTypeId", "quantity", "contact", "code", "revision"]) ||
    !revision(v["revision"])
  )
    return null;
  const cart = parseGuestCartInput({
    cartId: v["cartId"],
    ticketTypeId: v["ticketTypeId"],
    quantity: v["quantity"],
    contact: v["contact"],
  });
  return cart && cart.contact.email.toLowerCase().endsWith("@example.test")
    ? { action, cart, code, revision: v["revision"] }
    : null;
}
export function promoFailure(value: unknown): PromoErrorCode {
  return typeof value === "string" &&
    [
      "invalid_request",
      "not_available",
      "promotion_unavailable",
      "review_required",
      "unsupported_paid_total",
    ].includes(value)
    ? (value as PromoErrorCode)
    : "server_error";
}
