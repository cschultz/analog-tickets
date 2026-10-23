/**
 * Pure, dependency-free logic for the private signed-in checkout probe page
 * (synthetic staging only). Transport and session access are injected so every
 * test runs fully offline — nothing here ever contacts a payment provider.
 *
 * Never renders, logs, persists, or returns a bearer token, Stripe key,
 * provider payload, session/customer/payment identifier, raw error, or PII.
 * All failures collapse to generic safe categories.
 */

/** Staging-only synthetic fixture: active synthetic standard ticket type. */
export const STAGING_STANDARD_TICKET_TYPE_ID = "5eed0000-0000-4000-8000-0000000000b1";
export const CHECKOUT_PROBE_QUANTITY = 1;
/** Same-origin relative path; the page never accepts a caller-supplied URL. */
export const CHECKOUT_ENDPOINT_PATH = "/api/public/create-checkout-attempt";
export const CHECKOUT_PROBE_TIMEOUT_MS = 15_000;

export type CheckoutProbeOutcomeKind = "redirect" | "denied" | "rejected" | "unavailable";

export interface CheckoutProbeOutcome {
  kind: CheckoutProbeOutcomeKind;
  /** Generic, non-revealing label. Never backend or provider text. */
  message: string;
  /** Present only for a redirect outcome; an https provider-hosted URL. */
  redirectUrl: string | null;
}

export const CHECKOUT_PROBE_MESSAGES: Record<CheckoutProbeOutcomeKind, string> = {
  redirect: "Checkout session prepared. Continue manually to the hosted test checkout.",
  denied: "Not authorized. Sign in again and retry.",
  rejected: "Request rejected.",
  unavailable: "Service unavailable.",
};

/** Fixed request body: one synthetic standard ticket, quantity 1 only. */
export function buildCheckoutProbeBody(): { ticketTypeId: string; quantity: number } {
  return { ticketTypeId: STAGING_STANDARD_TICKET_TYPE_ID, quantity: CHECKOUT_PROBE_QUANTITY };
}

/** Extracts a safe redirect URL: an https absolute URL string only. */
export function extractRedirectUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const url = (payload as Record<string, unknown>)["redirectUrl"];
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  if (url.length > 2048) return null;
  return url;
}

/** Normalizes any HTTP status + payload to a generic safe outcome. */
export function normalizeCheckoutResponse(status: number, payload: unknown): CheckoutProbeOutcome {
  if (status >= 200 && status < 300) {
    const redirectUrl = extractRedirectUrl(payload);
    if (redirectUrl) {
      return { kind: "redirect", message: CHECKOUT_PROBE_MESSAGES.redirect, redirectUrl };
    }
    return { kind: "unavailable", message: CHECKOUT_PROBE_MESSAGES.unavailable, redirectUrl: null };
  }
  if (status === 401 || status === 403) {
    return { kind: "denied", message: CHECKOUT_PROBE_MESSAGES.denied, redirectUrl: null };
  }
  if (status === 400 || status === 409 || status === 422) {
    return { kind: "rejected", message: CHECKOUT_PROBE_MESSAGES.rejected, redirectUrl: null };
  }
  return { kind: "unavailable", message: CHECKOUT_PROBE_MESSAGES.unavailable, redirectUrl: null };
}

export type CheckoutProbeFetch = (
  path: string,
  init: { headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export type CheckoutProbeTokenSource = () => Promise<string | null>;

/**
 * Runs exactly one ordinary request to the same-origin checkout endpoint.
 * The bearer token is passed only in the Authorization header of that single
 * request and is never stored, returned, or included in the outcome.
 */
export async function runCheckoutProbe(options: {
  fetchImpl: CheckoutProbeFetch;
  getToken: CheckoutProbeTokenSource;
  timeoutMs?: number;
}): Promise<CheckoutProbeOutcome> {
  const token = await options.getToken();
  if (!token) {
    return { kind: "denied", message: CHECKOUT_PROBE_MESSAGES.denied, redirectUrl: null };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? CHECKOUT_PROBE_TIMEOUT_MS);
  try {
    const response = await options.fetchImpl(CHECKOUT_ENDPOINT_PATH, {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildCheckoutProbeBody()),
      signal: controller.signal,
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return normalizeCheckoutResponse(response.status, payload);
  } catch {
    return { kind: "unavailable", message: CHECKOUT_PROBE_MESSAGES.unavailable, redirectUrl: null };
  } finally {
    clearTimeout(timer);
  }
}
