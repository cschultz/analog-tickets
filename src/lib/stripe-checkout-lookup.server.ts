/** Read-only recovery adapter. Injected GET transport only; no route, fetch,
 * persistence, payment retry, fulfillment, refund, expiration or release authority.
 * Explicit visibility grace permits one additional bounded read-only scan. */
import {
  STRIPE_API_URL,
  STRIPE_API_VERSION,
  resolveStripeAdapterConfig,
  parseSessionResponse,
  type StripeAdapterEnv,
} from "./stripe-checkout.server";

export interface CheckoutLookupFacts {
  /** Only for saved quote requests; legacy v2 sessions have no quote metadata. */
  priceQuoteId?: string;
  attemptId: string;
  requestVersion: 2;
  createdAtSeconds: number;
  expiresAtSeconds: number;
  amountCents: number;
  currency: string;
}
export interface CheckoutReadRequest {
  url: string;
  method: "GET";
  headers: Record<string, string>;
  timeoutMs: number;
}
export type CheckoutReadTransport = (
  request: CheckoutReadRequest,
) => Promise<{ status: number; body: string }>;
export type CheckoutLookupOutcome =
  | { status: "unresolved" }
  | { status: "open"; redirectUrl: string }
  | { status: "paid_review" }
  // Server-internal discovery reference only. Never serialize this to clients.
  | { status: "expired_unpaid_candidate"; sessionId: string };
const unresolved: CheckoutLookupOutcome = { status: "unresolved" };
const MAX_PAGES = 3,
  PAGE_SIZE = 100,
  MAX_BODY = 512 * 1024;
const sessionId = (id: unknown): id is string =>
  typeof id === "string" && /^cs_test_[A-Za-z0-9]{8,200}$/.test(id);
const record = (raw: unknown): Record<string, unknown> | null =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;

/** Never consumes client facts. The authenticated server caller must load
 * the immutable owner/hold/attempt tuple. Empty/truncated/duplicate lists are
 * unknown, not proof of absence or permission to create/release. */
export async function lookupStripeTestCheckout(options: {
  env: StripeAdapterEnv;
  facts: CheckoutLookupFacts;
  transport: CheckoutReadTransport;
  now?: () => number;
  /** One bounded GET-only grace read for a newly created session not yet listed. */
  visibilityGrace?: boolean;
  diagnose?: (
    reason:
      | "candidate_not_visible"
      | "visibility_wait"
      | "provider_read_failed"
      | "provider_read_rejected"
      | "invalid_facts"
      | "invalid_list"
      | "ambiguous_list"
      | "invalid_session"
      | "unpaid_state_unknown"
      | "deadline_closed",
  ) => void;
}): Promise<CheckoutLookupOutcome> {
  const config = resolveStripeAdapterConfig(options.env),
    f = options.facts;
  const now = options.now ?? Date.now;
  const initialNow = now();
  // Leave time for the route's final ownership/deadline recheck and browser timeout.
  const deadline = Date.now() + 9000;
  if (
    typeof config === "string" ||
    f.requestVersion !== 2 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(f.attemptId) ||
    !Number.isSafeInteger(initialNow) ||
    !Number.isSafeInteger(f.createdAtSeconds) ||
    f.createdAtSeconds <= 0 ||
    f.createdAtSeconds * 1000 > initialNow ||
    !Number.isSafeInteger(f.expiresAtSeconds) ||
    f.expiresAtSeconds <= f.createdAtSeconds ||
    f.expiresAtSeconds - f.createdAtSeconds > 86400 ||
    !Number.isSafeInteger(f.amountCents) ||
    f.amountCents < 50 ||
    !/^[a-z]{3}$/.test(f.currency) ||
    (f.priceQuoteId !== undefined &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(f.priceQuoteId))
  ) {
    options.diagnose?.("invalid_facts");
    return unresolved;
  }

  // Query only the original creation interval, never contacts or customer IDs.
  // Local/provider clock uncertainty can cause omission: omission stays unknown.
  const headers = {
    authorization: `Bearer ${config.restrictedKey}`,
    "stripe-version": STRIPE_API_VERSION,
  };
  const read = async (url: string) => {
    const timeoutMs = Math.min(5000, deadline - Date.now());
    if (timeoutMs <= 0) throw new Error("Read budget exhausted");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let response: { status: number; body: string };
    try {
      response = await Promise.race([
        options.transport({ url, method: "GET", headers, timeoutMs }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Read timed out")), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (
      response.status !== 200 ||
      typeof response.body !== "string" ||
      response.body.length > MAX_BODY
    ) {
      options.diagnose?.("provider_read_rejected");
      return null;
    }
    return record(JSON.parse(response.body));
  };
  async function scan(allowGrace: boolean): Promise<CheckoutLookupOutcome> {
    let cursor: string | null = null,
      candidate: string | null = null,
      complete = false;
    const seen = new Set<string>();
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(STRIPE_API_URL);
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("created[gte]", String(f.createdAtSeconds));
        url.searchParams.set("created[lte]", String(f.expiresAtSeconds));
        if (cursor) url.searchParams.set("starting_after", cursor);
        const list = await read(url.toString());
        if (
          !list ||
          list["object"] !== "list" ||
          list["url"] !== "/v1/checkout/sessions" ||
          !Array.isArray(list["data"]) ||
          list["data"].length > PAGE_SIZE ||
          typeof list["has_more"] !== "boolean"
        ) {
          options.diagnose?.("invalid_list");
          return unresolved;
        }
        for (const raw of list["data"]) {
          const s = record(raw),
            id = s?.["id"];
          if (
            !s ||
            !sessionId(id) ||
            seen.has(id) ||
            s["object"] !== "checkout.session" ||
            s["livemode"] !== false ||
            !Number.isSafeInteger(s["created"]) ||
            (s["created"] as number) < f.createdAtSeconds ||
            (s["created"] as number) > f.expiresAtSeconds
          ) {
            options.diagnose?.("invalid_list");
            return unresolved;
          }
          seen.add(id);
          if (s["client_reference_id"] === f.attemptId) {
            if (candidate) {
              options.diagnose?.("ambiguous_list");
              return unresolved;
            }
            candidate = id;
          }
          cursor = id;
        }
        if (list["has_more"] === false) {
          complete = true;
          break;
        }
        if (list["data"].length === 0) {
          options.diagnose?.("invalid_list");
          return unresolved;
        }
      }
      if (!complete) {
        options.diagnose?.("invalid_list");
        return unresolved;
      }
      if (!candidate) {
        // Absence is never permission to create a replacement. Only a complete,
        // valid list for a very recent attempt gets one delayed read-only scan.
        const age = now() - f.createdAtSeconds * 1000;
        if (allowGrace && age >= 0 && age <= 30000 && deadline - Date.now() > 1000) {
          options.diagnose?.("visibility_wait");
          await new Promise((resolve) => setTimeout(resolve, 750));
          return scan(false);
        }
        options.diagnose?.("candidate_not_visible");
        return unresolved;
      }
      // List is discovery only. Always retrieve the exact unique candidate again.
      const s = await read(`${STRIPE_API_URL}/${encodeURIComponent(candidate)}`);
      if (
        !s ||
        s["id"] !== candidate ||
        s["object"] !== "checkout.session" ||
        s["client_reference_id"] !== f.attemptId ||
        s["livemode"] !== false ||
        s["mode"] !== "payment" ||
        s["expires_at"] !== f.expiresAtSeconds ||
        s["amount_total"] !== f.amountCents ||
        s["currency"] !== f.currency ||
        (f.priceQuoteId !== undefined &&
          record(s["metadata"])?.["analog_price_quote"] !== f.priceQuoteId) ||
        !Number.isSafeInteger(s["created"]) ||
        (s["created"] as number) < f.createdAtSeconds ||
        (s["created"] as number) > f.expiresAtSeconds
      ) {
        options.diagnose?.("invalid_session");
        return unresolved;
      }
      // Paid observation needs exact local recheck/reconciliation, not auto-issuance.
      if (s["payment_status"] === "paid") return { status: "paid_review" };
      // Do not infer a string/expanded/missing PaymentIntent has stopped processing.
      if (s["payment_status"] !== "unpaid" || s["payment_intent"] !== null) {
        options.diagnose?.("unpaid_state_unknown");
        return unresolved;
      }
      const readNow = now();
      if (!Number.isSafeInteger(readNow)) return unresolved;
      if (s["status"] === "expired" && f.expiresAtSeconds * 1000 <= readNow)
        return { status: "expired_unpaid_candidate", sessionId: candidate };
      if (s["status"] !== "open" || f.expiresAtSeconds * 1000 <= readNow) {
        options.diagnose?.("deadline_closed");
        return unresolved;
      }
      const parsed = parseSessionResponse(
        200,
        JSON.stringify({ url: s["url"], expires_at: s["expires_at"] }),
      );
      if (!parsed.ok) options.diagnose?.("invalid_session");
      return parsed.ok ? { status: "open", redirectUrl: parsed.result.redirectUrl } : unresolved;
    } catch {
      options.diagnose?.("provider_read_failed");
      return unresolved;
    }
  }
  return scan(options.visibilityGrace === true);
}
