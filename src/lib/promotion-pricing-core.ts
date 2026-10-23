/**
 * Offline TEST pricing contract. No provider, database, credentials or I/O.
 * Call ONLY with server-loaded tier/promotion facts; validation is not authority.
 * This does not reserve redemptions or enable discounted checkout. Persistence,
 * atomic redemption and paid-webhook/refund wiring must precede activation.
 */
import { isUuid, MAX_CHECKOUT_QUANTITY } from "./checkout-core";

export const MAX_QUOTE_CENTS = 99_999_999;
export const MIN_PAID_QUOTE_CENTS = 50;

export type Promotion = Readonly<{
  id: string;
  version: number;
  code: string;
  eventId: string;
  ticketTypeId: string | null;
  enabled: boolean;
  startsAtMs: number;
  expiresAtMs: number;
  discount:
    | Readonly<{ kind: "fixed"; amountCents: number; currency: "usd" }>
    | Readonly<{ kind: "percentage"; basisPoints: number }>;
}>;

export type DiscountSnapshot = Readonly<{
  promotionId: string;
  promotionVersion: number;
  code: string;
  kind: "fixed" | "percentage";
  /** Fixed minor units or percentage basis points, not a floating-point rate. */
  value: number;
}>;

export type TicketPriceAllocation = Readonly<{
  /** Persist this ordinal with the issued ticket. Never recalculate from ID order. */
  ordinal: number;
  subtotalCents: number;
  discountCents: number;
  paidCents: number;
}>;

export type TestPriceQuote = Readonly<{
  version: 1;
  quoteId: string;
  eventId: string;
  ticketTypeId: string;
  currency: "usd";
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  /** v1 adds no fees and does not calculate tax; zero is not a tax exemption. */
  feeCents: 0;
  taxMode: "not_calculated";
  totalCents: number;
  createdAtMs: number;
  expiresAtMs: number;
  discount: DiscountSnapshot | null;
  tickets: readonly TicketPriceAllocation[];
}>;

export type PricingFailure =
  "invalid_pricing" | "promotion_unavailable" | "unsupported_currency" | "unsupported_paid_total";

export type QuoteResult = { ok: true; quote: TestPriceQuote } | { ok: false; code: PricingFailure };

/** Case-insensitive ASCII codes only; no Unicode lookalikes or embedded space. */
export function normalizePromotionCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Validate before case conversion: Unicode ß must not turn into the code SS.
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(trimmed) ? trimmed.toUpperCase() : null;
}

const timestamp = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
const cents = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUOTE_CENTS;

export function createTestPriceQuote(input: {
  quoteId: string;
  eventId: string;
  ticketTypeId: string;
  currency: string;
  unitPriceCents: number;
  quantity: number;
  nowMs: number;
  /** Existing hold deadline; the quote must never outlive it. */
  holdExpiresAtMs: number;
  /** Submitted code, not a submitted amount. null means no promotion requested. */
  code: string | null;
  /** Server-selected, versioned record, not the request body. */
  promotion: Promotion | null;
}): QuoteResult {
  if (
    !isUuid(input.quoteId) ||
    !isUuid(input.eventId) ||
    !isUuid(input.ticketTypeId) ||
    !cents(input.unitPriceCents) ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > MAX_CHECKOUT_QUANTITY ||
    !timestamp(input.nowMs) ||
    !timestamp(input.holdExpiresAtMs) ||
    input.holdExpiresAtMs <= input.nowMs
  )
    return { ok: false, code: "invalid_pricing" };
  // Explicitly bounded USD-only first slice. No accidental currency exponent assumptions.
  if (input.currency !== "usd") return { ok: false, code: "unsupported_currency" };
  const subtotalCents = input.unitPriceCents * input.quantity;
  if (!cents(subtotalCents)) return { ok: false, code: "invalid_pricing" };
  let discountCents = 0;
  const expiresAtMs = input.holdExpiresAtMs;
  let discount: DiscountSnapshot | null = null;
  if (input.code !== null) {
    const code = normalizePromotionCode(input.code);
    const p = input.promotion;
    if (
      !code ||
      !p ||
      p.enabled !== true ||
      !isUuid(p.id) ||
      !Number.isSafeInteger(p.version) ||
      p.version < 1 ||
      normalizePromotionCode(p.code) !== code ||
      p.eventId !== input.eventId ||
      (p.ticketTypeId !== null && p.ticketTypeId !== input.ticketTypeId) ||
      !timestamp(p.startsAtMs) ||
      !timestamp(p.expiresAtMs) ||
      p.startsAtMs > input.nowMs ||
      p.expiresAtMs <= input.nowMs ||
      p.expiresAtMs <= p.startsAtMs
    )
      return { ok: false, code: "promotion_unavailable" };
    const d = p.discount;
    let value: number;
    if (d?.kind === "fixed") {
      if (d.currency !== "usd" || !cents(d.amountCents) || d.amountCents < 1)
        return { ok: false, code: "promotion_unavailable" };
      value = d.amountCents;
      discountCents = Math.min(value, subtotalCents);
    } else if (d?.kind === "percentage") {
      if (!Number.isInteger(d.basisPoints) || d.basisPoints < 1 || d.basisPoints > 10_000)
        return { ok: false, code: "promotion_unavailable" };
      value = d.basisPoints;
      // Floor once at order level. Integer arithmetic avoids binary-float rounding.
      discountCents = Number((BigInt(subtotalCents) * BigInt(value)) / 10_000n);
    } else return { ok: false, code: "promotion_unavailable" };
    // Offer dates decide eligibility for a NEW quote. Once accepted, the
    // immutable price is held until the existing inventory hold ends.
    discount = Object.freeze({
      promotionId: p.id,
      promotionVersion: p.version,
      code,
      kind: d.kind,
      value,
    });
  } else if (input.promotion !== null) {
    // No silent application of an unrelated server lookup result.
    return { ok: false, code: "invalid_pricing" };
  }
  const totalCents = subtotalCents - discountCents;
  // Free/near-free orders need a separate issuance path, not a fake paid event.
  if (totalCents < MIN_PAID_QUOTE_CENTS) return { ok: false, code: "unsupported_paid_total" };
  const base = Math.floor(discountCents / input.quantity);
  const remainder = discountCents % input.quantity;
  const tickets = Object.freeze(
    Array.from({ length: input.quantity }, (_, ordinal) => {
      const ticketDiscount = base + (ordinal < remainder ? 1 : 0);
      return Object.freeze({
        ordinal,
        subtotalCents: input.unitPriceCents,
        discountCents: ticketDiscount,
        paidCents: input.unitPriceCents - ticketDiscount,
      });
    }),
  );
  return {
    ok: true,
    quote: Object.freeze({
      version: 1,
      quoteId: input.quoteId,
      eventId: input.eventId,
      ticketTypeId: input.ticketTypeId,
      currency: "usd",
      quantity: input.quantity,
      unitPriceCents: input.unitPriceCents,
      subtotalCents,
      discountCents,
      feeCents: 0,
      taxMode: "not_calculated",
      totalCents,
      createdAtMs: input.nowMs,
      expiresAtMs,
      discount,
      tickets,
    }),
  };
}

/** Only for a validated server-held quote; this is not webhook authentication. */
export function matchesQuotedPayment(
  quote: TestPriceQuote,
  payment: { amountCents: unknown; currency: unknown },
): boolean {
  return (
    Number.isSafeInteger(payment.amountCents) &&
    payment.amountCents === quote.totalCents &&
    payment.currency === quote.currency
  );
}

/**
 * Refund value from the original persisted ordinal allocation, not today's
 * promotion/tier price. Eligibility, already-refunded claims and atomic replay
 * prevention remain the existing coordinator's responsibility.
 */
export function quotedRefundCents(
  quote: TestPriceQuote,
  ordinals: readonly number[],
): number | null {
  if (
    ordinals.length < 1 ||
    ordinals.length > quote.quantity ||
    new Set(ordinals).size !== ordinals.length
  )
    return null;
  let amount = 0;
  for (const ordinal of ordinals) {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= quote.quantity) return null;
    const ticket = quote.tickets[ordinal];
    if (!ticket || ticket.ordinal !== ordinal) return null;
    amount += ticket.paidCents;
  }
  return cents(amount) && amount <= quote.totalCents ? amount : null;
}

/** Validate a persisted snapshot, never today's promotion. Not a source of authority. */
export function parseStoredPriceQuote(value: unknown): TestPriceQuote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const q = value as Record<string, unknown>;
  if (q["version"] !== 1 || q["feeCents"] !== 0 || q["taxMode"] !== "not_calculated") return null;
  const d = q["discount"];
  let promotion: Promotion | null = null;
  if (d !== null) {
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    const discount = d as Record<string, unknown>;
    if (discount["kind"] !== "fixed" && discount["kind"] !== "percentage") return null;
    promotion = {
      id: discount["promotionId"] as string,
      version: discount["promotionVersion"] as number,
      code: discount["code"] as string,
      eventId: q["eventId"] as string,
      ticketTypeId: null,
      enabled: true,
      startsAtMs: 0,
      expiresAtMs: q["expiresAtMs"] as number,
      discount:
        discount["kind"] === "fixed"
          ? { kind: "fixed", amountCents: discount["value"] as number, currency: "usd" }
          : { kind: "percentage", basisPoints: discount["value"] as number },
    };
  }
  const result = createTestPriceQuote({
    quoteId: q["quoteId"] as string,
    eventId: q["eventId"] as string,
    ticketTypeId: q["ticketTypeId"] as string,
    currency: q["currency"] as string,
    unitPriceCents: q["unitPriceCents"] as number,
    quantity: q["quantity"] as number,
    nowMs: q["createdAtMs"] as number,
    holdExpiresAtMs: q["expiresAtMs"] as number,
    code: promotion?.code ?? null,
    promotion,
  });
  if (!result.ok) return null;
  const expected = result.quote;
  for (const key of Object.keys(expected) as (keyof TestPriceQuote)[]) {
    if (key === "tickets" || key === "discount") continue;
    if (q[key] !== expected[key]) return null;
  }
  if (!Array.isArray(q["tickets"]) || q["tickets"].length !== expected.quantity) return null;
  for (let i = 0; i < expected.quantity; i++) {
    const ticket = q["tickets"][i];
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) return null;
    const saved = ticket as Record<string, unknown>,
      wanted = expected.tickets[i]!;
    if (
      Object.keys(wanted).some((key) => saved[key] !== wanted[key as keyof TicketPriceAllocation])
    )
      return null;
  }
  return expected;
}
