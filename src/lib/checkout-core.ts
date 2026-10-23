/**
 * Pure, dependency-free logic for the private staging checkout foundation.
 *
 * Scope: synthetic staging only. Nothing here calls a payment provider,
 * stores a payload, logs, or returns raw backend errors, row contents,
 * identifiers, or secrets. Every failure collapses to a generic safe code.
 */

export type CheckoutErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_available"
  | "configuration"
  | "server_error";

export const CHECKOUT_ERROR_STATUS: Record<CheckoutErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid_request: 400,
  not_available: 409,
  configuration: 503,
  server_error: 500,
};

/** Generic, non-revealing messages. Never include backend or schema text. */
export const CHECKOUT_ERROR_MESSAGE: Record<CheckoutErrorCode, string> = {
  unauthorized: "Authentication required.",
  forbidden: "Not permitted.",
  invalid_request: "Invalid request.",
  not_available: "Not available.",
  configuration: "Service unavailable.",
  server_error: "Service unavailable.",
};

export const MAX_CHECKOUT_QUANTITY = 10;
export const WEBHOOK_TOLERANCE_SECONDS = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/* ----------------------------- configuration ----------------------------- */

export interface CheckoutEnv {
  PAYMENTS_TEST_MODE?: string | undefined;
  PAYMENT_PROVIDER?: string | undefined;
  STRIPE_TEST_WEBHOOK_SECRET?: string | undefined;
}

export interface CheckoutConfig {
  provider: string;
}

/**
 * Fail-closed: a pending checkout attempt may only be created when a
 * test-mode provider is explicitly configured. Anything missing, blank, or
 * not literally `true` yields `configuration`.
 */
export function resolveCheckoutConfig(env: CheckoutEnv): CheckoutConfig | CheckoutErrorCode {
  const testMode = (env.PAYMENTS_TEST_MODE ?? "").trim().toLowerCase();
  if (testMode !== "true") return "configuration";
  const provider = (env.PAYMENT_PROVIDER ?? "").trim();
  if (!provider) return "configuration";
  if (!/^[a-z0-9_]{3,32}$/.test(provider)) return "configuration";
  if (!provider.includes("test")) return "configuration";
  return { provider };
}

/** Fail-closed webhook config: a verification secret must be present. */
export function resolveWebhookConfig(env: CheckoutEnv): { secret: string } | CheckoutErrorCode {
  const base = resolveCheckoutConfig(env);
  if (typeof base === "string") return base;
  const secret = (env.STRIPE_TEST_WEBHOOK_SECRET ?? "").trim();
  if (secret.length < 16) return "configuration";
  return { secret };
}

/* ------------------------------- validation ------------------------------ */

export interface CheckoutAttemptInput {
  ticketTypeId: string;
  quantity: number;
  /** Optional confirmed pre-payment hold this attempt must be linked to. */
  reservationId?: string;
  /** Explicit recovery of the caller's existing linked attempt; never creates one. */
  resume?: true;
}

export function parseCheckoutInput(body: unknown): CheckoutAttemptInput | CheckoutErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const ticketTypeId = raw["ticketTypeId"];
  const quantity = raw["quantity"];
  const reservationId = raw["reservationId"];
  const resume = raw["resume"];
  if (resume !== undefined && resume !== false && resume !== true) return "invalid_request";
  if (!isUuid(ticketTypeId)) return "invalid_request";
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_CHECKOUT_QUANTITY
  ) {
    return "invalid_request";
  }
  if (reservationId === undefined || reservationId === null)
    return resume === true ? "invalid_request" : { ticketTypeId, quantity };
  if (!isUuid(reservationId)) return "invalid_request";
  return { ticketTypeId, quantity, reservationId, ...(resume === true ? { resume: true } : {}) };
}

/* --------------------------- reservation correlation ---------------------- */

/** Server-loaded correlation facts; owner ID stays server-side. No contact/provider payload. */
export interface ReservationSnapshot {
  ownerUserId: string | null;
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  status: string;
  expiresAt: string;
}

/** One existing attempt already pointing at the same hold. */
export interface LinkedAttemptSnapshot {
  id: string;
  userId: string;
  status: string;
}

export type ReservationCorrelation =
  { ok: true; existingAttemptId: string | null } | { ok: false; code: CheckoutErrorCode };

/**
 * Fail-closed correlation check performed before any provider work.
 *
 * A hold may back a new attempt only when it exists, is still `confirmed`,
 * has not lapsed, matches the requested synthetic tier/event/quantity and
 * server-derived amount, is not owned by another synthetic user, and has no
 * failed, completed, abandoned or unknown-status attempt. A legacy failure does
 * not prove no provider session exists. A pending attempt owned by the same caller
 * is reported back as a replay only if no settled attempt also exists, so no
 * second session is ever created.
 */
export function evaluateReservationCorrelation(args: {
  reservation: ReservationSnapshot | null;
  linkedAttempts: LinkedAttemptSnapshot[];
  requested: { ticketTypeId: string; eventId: string; quantity: number; amountCents: number };
  unitPriceCents: number;
  userId: string;
  nowMs: number;
}): ReservationCorrelation {
  const { reservation, requested } = args;
  if (!reservation) return { ok: false, code: "not_available" };
  // A hold's owner is bound at creation, not inferred from later attempts.
  // Fail closed on legacy/null/malformed owners, including no-attempt first use.
  if (!isUuid(reservation.ownerUserId) || !isUuid(args.userId)) {
    return { ok: false, code: "not_available" };
  }
  if (reservation.ownerUserId.toLowerCase() !== args.userId.toLowerCase()) {
    return { ok: false, code: "forbidden" };
  }
  if (reservation.status !== "confirmed") return { ok: false, code: "not_available" };

  const expiresAtMs = Date.parse(reservation.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= args.nowMs) {
    return { ok: false, code: "not_available" };
  }

  if (
    reservation.ticketTypeId !== requested.ticketTypeId ||
    reservation.eventId !== requested.eventId ||
    reservation.quantity !== requested.quantity
  ) {
    return { ok: false, code: "invalid_request" };
  }
  if (args.unitPriceCents * reservation.quantity !== requested.amountCents) {
    return { ok: false, code: "invalid_request" };
  }

  for (const attempt of args.linkedAttempts) {
    if (attempt.userId !== args.userId) return { ok: false, code: "forbidden" };
  }
  if (args.linkedAttempts.some((attempt) => attempt.status !== "pending"))
    return { ok: false, code: "not_available" };
  const live = args.linkedAttempts.find((attempt) => attempt.status === "pending");
  if (live) return { ok: true, existingAttemptId: live.id };
  return { ok: true, existingAttemptId: null };
}

/**
 * Canonical safe replay body: an attempt already exists for this hold, so no
 * second provider session was created. Exposes no URL, id, or provider data.
 */
export function checkoutExistingAttemptBody(): Record<string, unknown> {
  return { ok: true, status: "existing_attempt" };
}

export interface TicketTypeSnapshot {
  eventId: string;
  isActive: boolean;
  eventPublished: boolean;
  priceCents: number;
  currency: string;
  maxPerOrder: number;
  quantityTotal: number | null;
  quantitySold: number;
}

export interface PricedAttempt {
  eventId: string;
  unitPriceCents: number;
  amountCents: number;
  currency: string;
}

/** Validates a requested synthetic ticket type and prices the attempt. */
export function evaluateTicketType(
  snapshot: TicketTypeSnapshot | null,
  quantity: number,
): PricedAttempt | CheckoutErrorCode {
  if (!snapshot) return "not_available";
  if (!snapshot.isActive || !snapshot.eventPublished) return "not_available";
  if (quantity > snapshot.maxPerOrder) return "invalid_request";
  if (snapshot.quantityTotal !== null) {
    const remaining = snapshot.quantityTotal - snapshot.quantitySold;
    if (remaining < quantity) return "not_available";
  }
  return {
    eventId: snapshot.eventId,
    unitPriceCents: snapshot.priceCents,
    amountCents: snapshot.priceCents * quantity,
    currency: snapshot.currency,
  };
}

/** Price a held allocation without demanding the same capacity a second time.
 * All inputs are server-loaded. Correlation must pass before granting credit.
 * The adjusted snapshot is in-memory only; no inventory is released or sold.
 */
export function evaluateReservedTicketType(args: {
  snapshot: TicketTypeSnapshot | null;
  reservation: ReservationSnapshot | null;
  linkedAttempts: LinkedAttemptSnapshot[];
  ticketTypeId: string;
  quantity: number;
  userId: string;
  nowMs: number;
}): { priced: PricedAttempt; existingAttemptId: string | null } | CheckoutErrorCode {
  const { snapshot, quantity } = args;
  if (!snapshot) return "not_available";
  const correlation = evaluateReservationCorrelation({
    reservation: args.reservation,
    linkedAttempts: args.linkedAttempts,
    requested: {
      ticketTypeId: args.ticketTypeId,
      eventId: snapshot.eventId,
      quantity,
      amountCents: snapshot.priceCents * quantity,
    },
    unitPriceCents: snapshot.priceCents,
    userId: args.userId,
    nowMs: args.nowMs,
  });
  if (!correlation.ok) return correlation.code;
  // A confirmed allocation must already be represented in sold inventory.
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    !Number.isSafeInteger(snapshot.quantitySold) ||
    snapshot.quantitySold < quantity ||
    (snapshot.quantityTotal !== null &&
      (!Number.isSafeInteger(snapshot.quantityTotal) ||
        snapshot.quantityTotal < snapshot.quantitySold))
  )
    return "not_available";
  const priced = evaluateTicketType(
    { ...snapshot, quantitySold: snapshot.quantitySold - quantity },
    quantity,
  );
  if (typeof priced === "string") return priced;
  return { priced, existingAttemptId: correlation.existingAttemptId };
}

/* --------------------------- provider session input ----------------------- */

/** Generic, non-identifying product label sent to the provider. */
export const CHECKOUT_PRODUCT_LABEL = "Staging ticket";

/** Structural mirror of the server-only adapter input (no server import here). */
export interface ProviderSessionInput {
  clientReferenceId: string;
  productLabel: string;
  unitAmountCents: number;
  currency: string;
  quantity: number;
}

/**
 * Builds provider input from server-owned values only: the opaque ledger
 * attempt id is the client reference, and pricing comes from the server-side
 * evaluation, never from the caller.
 */
export function buildProviderSessionInput(args: {
  attemptId: string;
  priced: PricedAttempt;
  quantity: number;
}): ProviderSessionInput {
  return {
    clientReferenceId: args.attemptId,
    productLabel: CHECKOUT_PRODUCT_LABEL,
    unitAmountCents: args.priced.unitPriceCents,
    currency: args.priced.currency.trim().toLowerCase(),
    quantity: args.quantity,
  };
}

/** Success body for a wired provider redirect: URL plus a generic state only. */
export function checkoutRedirectBody(redirectUrl: string): Record<string, unknown> {
  return { ok: true, status: "redirect", redirectUrl };
}

/* -------------------------- webhook verification ------------------------- */

export interface WebhookHeaderParts {
  timestamp: number;
  signatures: string[];
}

/** Parses a `t=<unix>,v1=<hex>` style signature header. */
export function parseSignatureHeader(header: string | null | undefined): WebhookHeaderParts | null {
  if (typeof header !== "string" || !header.trim()) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    if (key.trim() === "t") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed > 0) timestamp = parsed;
    } else if (key.trim() === "v1" && /^[0-9a-f]{64}$/i.test(value.trim())) {
      signatures.push(value.trim().toLowerCase());
    }
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeWebhookSignature(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return toHex(sig);
}

/** Constant-time-ish comparison of equal-length hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies a provider signature. Fails closed on anything unexpected. */
export async function verifyWebhookSignature(options: {
  secret: string;
  header: string | null | undefined;
  rawBody: string;
  nowSeconds: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const parts = parseSignatureHeader(options.header);
  if (!parts) return false;
  const tolerance = options.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(options.nowSeconds - parts.timestamp) > tolerance) return false;
  const expected = await computeWebhookSignature(options.secret, parts.timestamp, options.rawBody);
  return parts.signatures.some((candidate) => safeEqualHex(candidate, expected));
}

/* ------------------------- webhook event ledgering ----------------------- */

export type WebhookEventStatus = "received" | "processed" | "ignored" | "failed";

export interface WebhookEventInput {
  externalEventId: string;
  eventType: string;
}

export function parseWebhookEvent(body: unknown): WebhookEventInput | CheckoutErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const id = raw["id"];
  const type = raw["type"];
  if (typeof id !== "string" || !/^[A-Za-z0-9_.-]{6,128}$/.test(id)) return "invalid_request";
  if (typeof type !== "string" || !/^[A-Za-z0-9_.]{3,64}$/.test(type)) return "invalid_request";
  return { externalEventId: id, eventType: type };
}

/** Terminal states are never re-processed. */
export function isTerminalStatus(status: WebhookEventStatus): boolean {
  return status === "processed" || status === "ignored";
}

export interface IdempotencyDecision {
  action: "insert" | "process" | "skip";
  nextStatus: WebhookEventStatus;
  duplicate: boolean;
}

/**
 * Idempotent recording: a brand-new external event is inserted, a
 * previously-recorded non-terminal event is retried, and a terminal event is
 * acknowledged without a second write.
 */
export function decideIdempotency(
  existing: { status: WebhookEventStatus } | null,
): IdempotencyDecision {
  if (!existing) return { action: "insert", nextStatus: "received", duplicate: false };
  if (isTerminalStatus(existing.status)) {
    return { action: "skip", nextStatus: existing.status, duplicate: true };
  }
  return { action: "process", nextStatus: "processed", duplicate: true };
}

/** Allowed status transitions for a webhook-event ledger row. */
export function canTransition(from: WebhookEventStatus, to: WebhookEventStatus): boolean {
  if (from === to) return false;
  if (isTerminalStatus(from)) return false;
  if (from === "received") return to === "processed" || to === "ignored" || to === "failed";
  if (from === "failed") return to === "processed" || to === "ignored";
  return false;
}

/* -------------------------------- responses ------------------------------ */

export function checkoutErrorResponse(
  code: CheckoutErrorCode,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: CHECKOUT_ERROR_MESSAGE[code], code }), {
    status: CHECKOUT_ERROR_STATUS[code],
    headers: { "content-type": "application/json", ...headers },
  });
}

export function checkoutJsonResponse(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Collapses any thrown value to a generic safe code; never inspects it. */
export function normalizeCheckoutFailure(_error: unknown): CheckoutErrorCode {
  return "server_error";
}
