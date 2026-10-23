/** Presentation of an already verified original payment. Never pricing/ownership authority. */
import { MAX_QUOTE_CENTS, normalizePromotionCode } from "./promotion-pricing-core";
export interface PurchasePricing {
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  feeCents: 0;
  taxMode: "not_calculated";
  totalCents: number;
  currency: "usd";
  promotionCode: string | null;
}
export function parsePurchasePricing(
  value: unknown,
  quantity: number,
  amount: number,
  currency: string,
): PurchasePricing | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const cents = (x: unknown): x is number =>
    typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= MAX_QUOTE_CENTS;
  if (
    Object.keys(v).length !== 8 ||
    Object.keys(v).some(
      (k) =>
        ![
          "unitPriceCents",
          "subtotalCents",
          "discountCents",
          "feeCents",
          "taxMode",
          "totalCents",
          "currency",
          "promotionCode",
        ].includes(k),
    ) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 10 ||
    !cents(v["unitPriceCents"]) ||
    !cents(v["subtotalCents"]) ||
    !cents(v["discountCents"]) ||
    !cents(v["totalCents"]) ||
    v["totalCents"] < 50 ||
    v["totalCents"] !== amount ||
    v["currency"] !== "usd" ||
    currency !== "usd" ||
    v["feeCents"] !== 0 ||
    v["taxMode"] !== "not_calculated" ||
    v["unitPriceCents"] * quantity !== v["subtotalCents"] ||
    v["subtotalCents"] - v["discountCents"] !== v["totalCents"] ||
    (v["promotionCode"] === null
      ? v["discountCents"] !== 0
      : normalizePromotionCode(v["promotionCode"]) !== v["promotionCode"])
  )
    return null;
  return {
    unitPriceCents: v["unitPriceCents"],
    subtotalCents: v["subtotalCents"],
    discountCents: v["discountCents"],
    totalCents: v["totalCents"],
    feeCents: 0,
    taxMode: "not_calculated",
    currency: "usd",
    promotionCode: v["promotionCode"] as string | null,
  };
}
export function purchasePricingText(p: PurchasePricing): string {
  const money = (cents: number) => `${(cents / 100).toFixed(2)} USD`;
  return `Original purchase pricing:\nTicket subtotal: ${money(p.subtotalCents)}\nDiscount${p.promotionCode ? ` (${p.promotionCode})` : ""}: -${money(p.discountCents)}\nAdded fees: ${money(p.feeCents)}\nTax: not calculated in TEST (not a tax-exemption statement)\nOriginal paid total: ${money(p.totalCents)}\nThis is the original payment, not a balance after refunds. Current ticket status remains authoritative.`;
}
