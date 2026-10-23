/**
 * Server-only Stripe Checkout Sessions adapter (private staging, synthetic only).
 *
 * This module is server-only by filename (`*.server.ts`) and is never reachable
 * from a browser bundle. It performs NO I/O of its own: every call goes through
 * an injected transport, so all tests run fully offline.
 *
 * Nothing here logs, persists, or returns a provider payload, key, customer
 * identifier, or raw error. Every failure collapses to a generic safe code from
 * `checkout-core`.
 *
 * WIRED BUT UNINVOKED IN THIS PROJECT'S TEST HISTORY: the private
 * `POST /api/public/create-checkout-attempt` route calls this adapter only
 * after strict CORS, test-mode config, bearer auth, input validation, and
 * server-side availability/pricing all succeed, and then returns only a
 * generic redirect body to the caller. No checkout session has been created
 * from this project; the first invocation is a separate, explicitly
 * confirmed operator action.
 */
import type { CheckoutErrorCode } from "@/lib/checkout-core";
import { isUuid } from "@/lib/checkout-core";
import { planSessionDeadline } from "@/lib/checkout-deadline-policy";
import { parseStoredPriceQuote, type TestPriceQuote } from "./promotion-pricing-core";

/** Current test-mode API conventions used by this adapter. */
export const STRIPE_API_URL = "https://api.stripe.com/v1/checkout/sessions";
export const STRIPE_API_VERSION = "2026-07-29.dahlia";
/** Fixed generic prefix; the identifier gains a random 8-letter suffix per request. */
export const STRIPE_INTEGRATION_PREFIX = "staging-checkout";
export const STRIPE_REQUEST_TIMEOUT_MS = 15_000;

/* ------------------------------ configuration ----------------------------- */

export interface StripeAdapterEnv {
  PAYMENTS_TEST_MODE?: string | undefined;
  PAYMENT_PROVIDER?: string | undefined;
  STRIPE_TEST_RESTRICTED_KEY?: string | undefined;
  STAGING_ALLOWED_ORIGIN?: string | undefined;
}

export interface StripeAdapterConfig {
  restrictedKey: string;
  origin: string;
}

const TEST_KEY_PREFIX = "rk_test_";

/**
 * Fail-closed test-only boundary. Anything missing, malformed, or live-looking
 * yields the generic `configuration` code and makes no outbound attempt.
 */
export function resolveStripeAdapterConfig(
  env: StripeAdapterEnv,
): StripeAdapterConfig | CheckoutErrorCode {
  if ((env.PAYMENTS_TEST_MODE ?? "").trim().toLowerCase() !== "true") return "configuration";
  if ((env.PAYMENT_PROVIDER ?? "").trim() !== "stripe_test") return "configuration";

  const key = (env.STRIPE_TEST_RESTRICTED_KEY ?? "").trim();
  if (!key.startsWith(TEST_KEY_PREFIX)) return "configuration";
  if (key.length < TEST_KEY_PREFIX.length + 16) return "configuration";
  if (/live/i.test(key)) return "configuration";

  const origin = normalizeStagingOrigin(env.STAGING_ALLOWED_ORIGIN);
  if (!origin) return "configuration";

  return { restrictedKey: key, origin };
}

/** Only an exact https staging origin (no path, query, credentials, or wildcard). */
export function normalizeStagingOrigin(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw || raw === "*") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

/** Server-controlled return URLs; the caller never supplies a URL. */
export function buildReturnUrls(origin: string): { successUrl: string; cancelUrl: string } {
  return {
    successUrl: `${origin}/checkout/complete`,
    cancelUrl: `${origin}/checkout/cancelled`,
  };
}

/* -------------------------------- transport ------------------------------- */

export interface StripeTransportRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export interface StripeTransportResponse {
  status: number;
  body: string;
}

/** Injected transport: the adapter never touches `fetch` itself. */
export type StripeTransport = (req: StripeTransportRequest) => Promise<StripeTransportResponse>;

/* ------------------------------ request shaping --------------------------- */

/** Server-owned priced input only. No customer PII of any kind. */
export interface StripeSessionInput {
  /** Opaque server-side correlation value (not a customer identifier). */
  clientReferenceId: string;
  productLabel: string;
  unitAmountCents: number;
  currency: string;
  quantity: number;
  /** Loaded/validated by trusted server code, never accepted from browser JSON. */
  priceQuote?: TestPriceQuote;
}

export function validateSessionInput(input: StripeSessionInput): CheckoutErrorCode | null {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.clientReferenceId)) return "invalid_request";
  if (!/^[A-Za-z0-9 ._-]{1,120}$/.test(input.productLabel)) return "invalid_request";
  if (
    !Number.isSafeInteger(input.unitAmountCents) ||
    input.unitAmountCents < (input.priceQuote ? 0 : 50) ||
    !Number.isSafeInteger(input.unitAmountCents * input.quantity)
  ) {
    return "invalid_request";
  }
  if (!/^[a-z]{3}$/.test(input.currency)) return "invalid_request";
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10) {
    return "invalid_request";
  }
  if (input.priceQuote !== undefined) {
    const quote = parseStoredPriceQuote(input.priceQuote);
    if (
      !quote ||
      quote.quantity !== input.quantity ||
      quote.unitPriceCents !== input.unitAmountCents ||
      quote.currency !== input.currency
    )
      return "invalid_request";
  }
  return null;
}

/**
 * Hosted, one-time Checkout Session form body.
 * Uses Checkout Sessions (not Charges/PaymentIntents/Sources) and deliberately
 * omits `payment_method_types` so the provider's dashboard settings apply.
 * Hosted Checkout is the default `ui_mode`, so the parameter is omitted for
 * compatibility with the current Stripe API version.
 */
/**
 * Random non-identifying 8-letter lowercase suffix. Generated per call (never
 * at module scope) and contains no user, project, event, org, or secret data.
 */
export function generateIdentifierSuffix(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(97 + (b % 26));
  return out;
}

export function buildIntegrationIdentifier(): string {
  return `${STRIPE_INTEGRATION_PREFIX}-${generateIdentifierSuffix()}`;
}

export function buildSessionForm(
  input: StripeSessionInput,
  urls: { successUrl: string; cancelUrl: string },
  integrationIdentifier: string,
): URLSearchParams {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", urls.successUrl);
  form.set("cancel_url", urls.cancelUrl);
  form.set("client_reference_id", input.clientReferenceId);
  form.set("integration_identifier", integrationIdentifier);
  form.set("line_items[0][quantity]", String(input.quantity));
  form.set("line_items[0][price_data][currency]", input.currency);
  form.set("line_items[0][price_data][unit_amount]", String(input.unitAmountCents));
  form.set("line_items[0][price_data][product_data][name]", input.productLabel);
  if (input.priceQuote) {
    const groups = new Map<number, number>();
    for (const ticket of input.priceQuote.tickets)
      groups.set(ticket.paidCents, (groups.get(ticket.paidCents) ?? 0) + 1);
    let index = 0;
    for (const [paid, count] of groups) {
      form.set(`line_items[${index}][quantity]`, String(count));
      form.set(`line_items[${index}][price_data][currency]`, input.currency);
      form.set(`line_items[${index}][price_data][unit_amount]`, String(paid));
      form.set(`line_items[${index}][price_data][product_data][name]`, input.productLabel);
      index++;
    }
    form.set("metadata[analog_price_quote]", input.priceQuote.quoteId);
  }
  return form;
}

export function buildSessionHeaders(restrictedKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${restrictedKey}`,
    "content-type": "application/x-www-form-urlencoded",
    "stripe-version": STRIPE_API_VERSION,
  };
}

/* --------------------------------- result --------------------------------- */

/** Minimum opaque result a later fulfillment slice needs. Nothing is persisted. */
export interface StripeSessionResult {
  redirectUrl: string;
  expiresAtSeconds: number | null;
}

export type StripeSessionOutcome =
  { ok: true; result: StripeSessionResult } | { ok: false; code: CheckoutErrorCode };

/** Accepts only a well-formed hosted Checkout URL; anything else is malformed. */
export function parseSessionResponse(status: number, body: string): StripeSessionOutcome {
  if (status !== 200) return { ok: false, code: status >= 500 ? "server_error" : "not_available" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, code: "server_error" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, code: "server_error" };
  const raw = parsed as Record<string, unknown>;
  const url = raw["url"];
  if (typeof url !== "string") return { ok: false, code: "server_error" };
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ok: false, code: "server_error" };
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "checkout.stripe.com" ||
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.port && parsedUrl.port !== "443")
  ) {
    return { ok: false, code: "server_error" };
  }
  // Stripe-hosted Checkout URLs can carry an opaque #fid fragment. Preserve it
  // verbatim for the browser; it is not a return URL or an authorization fact.
  const expires = raw["expires_at"];
  return {
    ok: true,
    result: {
      redirectUrl: parsedUrl.toString(),
      expiresAtSeconds: typeof expires === "number" && Number.isFinite(expires) ? expires : null,
    },
  };
}

/* --------------------------------- adapter -------------------------------- */

/**
 * Prepares and sends one hosted Checkout Session request through the injected
 * transport. Blocks before any transport call when configuration or input is
 * invalid, and normalizes every provider/network/malformed failure.
 */
export async function createStripeCheckoutSession(options: {
  env: StripeAdapterEnv;
  input: StripeSessionInput;
  transport: StripeTransport;
  /** Server-generated UUID for new recovery-capable linked attempts only. */
  requestIdentity?: string;
  /** Version-2 contract: server-owned immutable facts, never client input.
   * New creation only. A later recovery path must retrieve/reconcile first;
   * this adapter does not retry or extend a deadline after its creation window.
   */
  deadlineContract?: { requestVersion: 2; holdExpiresAt: string; expiresAtSeconds: number };
  now?: () => number;
}): Promise<StripeSessionOutcome> {
  const config = resolveStripeAdapterConfig(options.env);
  if (typeof config === "string") return { ok: false, code: config };

  const invalid = validateSessionInput(options.input);
  if (invalid) return { ok: false, code: invalid };
  const input = {
    ...options.input,
    ...(options.input.priceQuote !== undefined
      ? { priceQuote: parseStoredPriceQuote(options.input.priceQuote)! }
      : {}),
  };
  if (
    options.requestIdentity !== undefined &&
    (!isUuid(options.requestIdentity) || options.requestIdentity !== input.clientReferenceId)
  )
    return { ok: false, code: "invalid_request" };

  const deadline = options.deadlineContract;
  const now = options.now ?? Date.now;
  if (
    input.priceQuote &&
    (!deadline ||
      deadline.expiresAtSeconds !== Math.floor(input.priceQuote.expiresAtMs / 1000) ||
      Date.parse(deadline.holdExpiresAt) !== input.priceQuote.expiresAtMs ||
      input.priceQuote.createdAtMs > now() ||
      input.priceQuote.expiresAtMs <= now())
  )
    return { ok: false, code: "invalid_request" };
  if (
    deadline !== undefined &&
    (!deadline || typeof deadline !== "object" || Array.isArray(deadline))
  )
    return { ok: false, code: "invalid_request" };
  if (deadline) {
    const planned = planSessionDeadline({
      requestVersion: deadline.requestVersion,
      holdExpiresAt: deadline.holdExpiresAt,
      nowMs: now(),
    });
    if (!options.requestIdentity || planned === null || planned !== deadline.expiresAtSeconds)
      return { ok: false, code: "invalid_request" };
  }

  const urls = buildReturnUrls(config.origin);
  // UUID randomness supplies a stable eight-letter label suffix across retries.
  const identifier = options.requestIdentity
    ? `${STRIPE_INTEGRATION_PREFIX}-${options.requestIdentity
        .slice(0, 8)
        .toLowerCase()
        .split("")
        .map((x) => String.fromCharCode(97 + parseInt(x, 16)))
        .join("")}`
    : buildIntegrationIdentifier();
  const form = buildSessionForm(input, urls, identifier);
  if (deadline) form.set("expires_at", String(deadline.expiresAtSeconds));
  const headers = buildSessionHeaders(config.restrictedKey);
  if (options.requestIdentity)
    headers["idempotency-key"] =
      `analog-checkout-v${deadline ? 2 : 1}-${options.requestIdentity.toLowerCase()}`;

  let response: StripeTransportResponse;
  try {
    response = await options.transport({
      url: STRIPE_API_URL,
      method: "POST",
      headers,
      body: form.toString(),
      timeoutMs: STRIPE_REQUEST_TIMEOUT_MS,
    });
  } catch {
    // Network/timeout/unknown throw: never inspected, never surfaced.
    return { ok: false, code: "server_error" };
  }

  if (!response || typeof response.status !== "number" || typeof response.body !== "string") {
    return { ok: false, code: "server_error" };
  }
  const outcome = parseSessionResponse(response.status, response.body);
  if (!outcome.ok || !deadline) return outcome;
  // The parsed base response proves JSON shape/URL only, not correlation.
  const raw = JSON.parse(response.body) as Record<string, unknown>;
  const amount = input.priceQuote?.totalCents ?? input.unitAmountCents * input.quantity;
  const responseNow = now();
  if (
    raw["client_reference_id"] !== options.requestIdentity ||
    raw["expires_at"] !== deadline.expiresAtSeconds ||
    raw["amount_total"] !== amount ||
    (input.priceQuote &&
      (!raw["metadata"] ||
        typeof raw["metadata"] !== "object" ||
        (raw["metadata"] as Record<string, unknown>)["analog_price_quote"] !==
          input.priceQuote.quoteId)) ||
    raw["currency"] !== input.currency ||
    raw["livemode"] !== false ||
    raw["mode"] !== "payment" ||
    raw["status"] !== "open" ||
    raw["payment_status"] !== "unpaid" ||
    !Number.isSafeInteger(responseNow) ||
    deadline.expiresAtSeconds * 1000 <= responseNow
  )
    return { ok: false, code: "server_error" };
  return outcome;
}
