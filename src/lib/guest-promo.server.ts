/** Trusted TEST orchestration. SQL owns prices/limits; injected transports own all provider I/O. */
import { isUuid } from "./checkout-core";
import { planSessionDeadline } from "./checkout-deadline-policy";
import { parseStoredPriceQuote, type TestPriceQuote } from "./promotion-pricing-core";
import {
  parsePricePreview,
  promoFailure,
  type PromoInput,
  type PromoResult,
  type PricePreview,
} from "./guest-promo-core";
import {
  createStripeCheckoutSession,
  resolveStripeAdapterConfig,
  type StripeAdapterEnv,
  type StripeTransport,
} from "./stripe-checkout.server";
import {
  lookupStripeTestCheckout,
  type CheckoutReadTransport,
} from "./stripe-checkout-lookup.server";

export interface PromoRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
interface Context {
  quote: TestPriceQuote;
  attemptId: string | null;
  attemptStatus: string | null;
  createdAtSeconds: number | null;
  deadline: number | null;
  reservationStatus: string;
  holdExpiresAt: string;
  paymentAttached: boolean;
  releaseRecorded: boolean;
}
async function one(
  client: PromoRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const result = await client.rpc(name, args);
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1) return null;
  const row = result.data[0];
  return row && typeof row === "object" && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}
export async function previewGuestPrice(
  client: PromoRpcClient,
  input: Extract<PromoInput, { action: "preview" }>,
): Promise<PromoResult<PricePreview>> {
  try {
    const row = await one(client, "preview_ticket_price", {
      p_tier: input.ticketTypeId,
      p_quantity: input.quantity,
      p_code: input.code,
    });
    if (!row) return { ok: false, code: "server_error" };
    if (row["outcome"] !== "ready") return { ok: false, code: promoFailure(row["outcome"]) };
    const value = parsePricePreview(row["preview"]);
    return value &&
      value.ticketTypeId === input.ticketTypeId &&
      value.quantity === input.quantity &&
      value.code === input.code
      ? { ok: true, value }
      : { ok: false, code: "server_error" };
  } catch {
    return { ok: false, code: "server_error" };
  }
}
export async function readPricedCart(
  client: PromoRpcClient,
  owner: string,
  cartId: string,
): Promise<Context | null> {
  if (!isUuid(owner) || !isUuid(cartId)) return null;
  try {
    const row = await one(client, "read_priced_guest_cart", { p_owner: owner, p_cart: cartId });
    const quote = parseStoredPriceQuote(row?.["snapshot"]);
    if (!row || !quote) return null;
    const id = row["attempt_id"],
      status = row["attempt_status"],
      deadline = row["provider_deadline"];
    const created =
      typeof row["attempt_created_at"] === "string" ? Date.parse(row["attempt_created_at"]) : NaN;
    if (typeof row["reservation_status"] !== "string") return null;
    const holdExpiresAt = row["reservation_expires_at"];
    const paymentAttached = row["payment_attached"];
    const releaseRecorded = row["release_recorded"];
    if (
      typeof holdExpiresAt !== "string" ||
      !Number.isFinite(Date.parse(holdExpiresAt)) ||
      Date.parse(holdExpiresAt) < quote.expiresAtMs ||
      typeof paymentAttached !== "boolean" ||
      typeof releaseRecorded !== "boolean" ||
      (releaseRecorded &&
        (row["reservation_status"] !== "released" ||
          paymentAttached ||
          (id !== null && status !== "abandoned")))
    )
      return null;
    if (id === null)
      return status === null &&
        deadline === null &&
        row["attempt_created_at"] === null &&
        !paymentAttached
        ? {
            quote,
            attemptId: null,
            attemptStatus: null,
            createdAtSeconds: null,
            deadline: null,
            reservationStatus: row["reservation_status"],
            holdExpiresAt,
            paymentAttached,
            releaseRecorded,
          }
        : null;
    if (
      !isUuid(id) ||
      typeof status !== "string" ||
      !["pending", "completed", "abandoned", "failed"].includes(status) ||
      !Number.isFinite(created) ||
      created < quote.createdAtMs ||
      typeof deadline !== "number" ||
      deadline !== Math.floor(quote.expiresAtMs / 1000) ||
      deadline <= Math.floor(created / 1000)
    )
      return null;
    return {
      quote,
      attemptId: id,
      attemptStatus: status,
      createdAtSeconds: Math.floor(created / 1000),
      deadline,
      reservationStatus: row["reservation_status"],
      holdExpiresAt,
      paymentAttached,
      releaseRecorded,
    };
  } catch {
    return null;
  }
}
export async function preparePricedCart(
  client: PromoRpcClient,
  owner: string,
  input: Extract<PromoInput, { action: "prepare" }>,
): Promise<PromoResult<TestPriceQuote>> {
  if (!isUuid(owner)) return { ok: false, code: "unauthorized" };
  try {
    const row = await one(client, "prepare_priced_guest_cart", {
      p_owner: owner,
      p_cart: input.cart.cartId,
      p_tier: input.cart.ticketTypeId,
      p_quantity: input.cart.quantity,
      p_name: input.cart.contact.name,
      p_email: input.cart.contact.email,
      p_code: input.code,
      p_revision: input.revision,
    });
    if (!row) return { ok: false, code: "server_error" };
    if (row["outcome"] !== "ready") return { ok: false, code: promoFailure(row["outcome"]) };
    const context = await readPricedCart(client, owner, input.cart.cartId);
    return context &&
      context.quote.quoteId === row["quote_id"] &&
      context.quote.ticketTypeId === input.cart.ticketTypeId &&
      context.quote.quantity === input.cart.quantity &&
      (context.quote.discount?.code ?? null) === input.code
      ? { ok: true, value: context.quote }
      : { ok: false, code: "server_error" };
  } catch {
    return { ok: false, code: "server_error" };
  }
}
type PayValue = { status: "redirect"; redirectUrl: string } | { status: "complete" | "released" };
export async function payPricedCart(options: {
  client: PromoRpcClient;
  owner: string;
  cartId: string;
  resume: boolean;
  env: StripeAdapterEnv;
  transport: StripeTransport;
  readTransport: CheckoutReadTransport;
  now?: () => number;
}): Promise<PromoResult<PayValue>> {
  const { client, owner, cartId } = options,
    now = options.now ?? Date.now;
  if (!isUuid(owner) || !isUuid(cartId)) return { ok: false, code: "invalid_request" };
  if (typeof resolveStripeAdapterConfig(options.env) === "string")
    return { ok: false, code: "configuration" };
  let created = false,
    attemptId: string | null = null,
    transportEntered = false;
  const release = async (
    state: "start_window_closed" | "request_never_sent",
    id: string | null = null,
  ) => {
    const result = await one(client, "release_priced_guest_cart", {
      p_owner: owner,
      p_cart: cartId,
      p_state: state,
      ...(id ? { p_attempt: id } : {}),
    });
    return result?.["outcome"] === "released" || result?.["outcome"] === "already_released";
  };
  const stop = async (
    code: import("./guest-promo-core").PromoErrorCode,
  ): Promise<PromoResult<PayValue>> => {
    // Only the one newly-created dispatcher can prove this. A transport that
    // was entered is uncertain even if it threw before returning any response.
    if (created && attemptId && !transportEntered) {
      try {
        if (await release("request_never_sent", attemptId))
          return { ok: true, value: { status: "released" } };
      } catch {
        /* Keep the reference on an unconfirmed release. */
      }
    }
    return { ok: false, code };
  };
  try {
    const before = await readPricedCart(client, owner, cartId);
    if (!before) return { ok: false, code: "not_available" };
    if (before.releaseRecorded) return { ok: true, value: { status: "released" } };
    if (before.attemptStatus === "completed") return { ok: true, value: { status: "complete" } };
    if (
      before.attemptId === null &&
      planSessionDeadline({
        requestVersion: 2,
        holdExpiresAt: new Date(before.quote.expiresAtMs).toISOString(),
        nowMs: now(),
      }) === null
    ) {
      return (await release("start_window_closed"))
        ? { ok: true, value: { status: "released" } }
        : { ok: false, code: "not_available" };
    }
    if (!options.resume) {
      const begin = await one(client, "begin_priced_guest_payment", {
        p_owner: owner,
        p_cart: cartId,
      });
      if (
        !begin ||
        !["created", "existing"].includes(String(begin["outcome"])) ||
        !isUuid(begin["attempt_id"])
      )
        return (await release("start_window_closed"))
          ? { ok: true, value: { status: "released" } }
          : { ok: false, code: "not_available" };
      created = begin["outcome"] === "created";
      attemptId = begin["attempt_id"];
    }
    const context = await readPricedCart(client, owner, cartId);
    if (!context || !context.attemptId || (attemptId !== null && context.attemptId !== attemptId))
      return stop("not_available");
    if (context.attemptStatus === "completed") return { ok: true, value: { status: "complete" } };
    if (
      context.attemptStatus !== "pending" ||
      context.paymentAttached ||
      context.reservationStatus !== "confirmed" ||
      context.quote.expiresAtMs <= now() ||
      context.createdAtSeconds === null ||
      context.deadline === null
    )
      return stop("not_available");
    if (created) {
      const result = await createStripeCheckoutSession({
        env: options.env,
        transport: async (request) => {
          transportEntered = true;
          return options.transport(request);
        },
        now,
        requestIdentity: context.attemptId,
        input: {
          clientReferenceId: context.attemptId,
          productLabel: "TEST festival tickets",
          unitAmountCents: context.quote.unitPriceCents,
          currency: context.quote.currency,
          quantity: context.quote.quantity,
          priceQuote: context.quote,
        },
        deadlineContract: {
          requestVersion: 2,
          holdExpiresAt: new Date(context.quote.expiresAtMs).toISOString(),
          expiresAtSeconds: context.deadline,
        },
      });
      if (!result.ok) return stop(result.code);
      const latest = await readPricedCart(client, owner, cartId);
      if (JSON.stringify(latest) !== JSON.stringify(context) || context.quote.expiresAtMs <= now())
        return { ok: false, code: "not_available" };
      return { ok: true, value: { status: "redirect", redirectUrl: result.result.redirectUrl } };
    }
    const observed = await lookupStripeTestCheckout({
      env: options.env,
      transport: options.readTransport,
      now,
      visibilityGrace: true,
      facts: {
        attemptId: context.attemptId,
        requestVersion: 2,
        createdAtSeconds: context.createdAtSeconds,
        expiresAtSeconds: context.deadline,
        amountCents: context.quote.totalCents,
        currency: context.quote.currency,
        priceQuoteId: context.quote.quoteId,
      },
    });
    if (observed.status !== "open") return { ok: false, code: "not_available" };
    const latest = await readPricedCart(client, owner, cartId);
    if (JSON.stringify(latest) !== JSON.stringify(context) || context.quote.expiresAtMs <= now())
      return { ok: false, code: "not_available" };
    return { ok: true, value: { status: "redirect", redirectUrl: observed.redirectUrl } };
  } catch {
    return stop("server_error");
  }
}
