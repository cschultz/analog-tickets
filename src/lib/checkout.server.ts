/**
 * Server-only helpers for the private staging checkout foundation.
 * Loaded via dynamic import inside route handlers only.
 *
 * The two ledgers are server-owned: no client role has any grant on them, so
 * every read/write here goes through the service-role client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type {
  LinkedAttemptSnapshot,
  PricedAttempt,
  ReservationSnapshot,
  TicketTypeSnapshot,
  WebhookEventStatus,
} from "@/lib/checkout-core";
import type { AbandonOutcome, FinalizeOutcome } from "@/lib/stripe-webhook-core";
import {
  buildV2ExpiryReleaseArgs,
  buildRetrievedV2ExpiryReleaseArgs,
} from "./checkout-expiry-evidence";
import type { StripeAdapterEnv } from "./stripe-checkout.server";
import type { CheckoutReadTransport } from "./stripe-checkout-lookup.server";
import { parseStripeExpiryEvent } from "./stripe-webhook-core";
import { isUuid } from "./checkout-core";

const ABANDON_OUTCOMES: AbandonOutcome[] = [
  "abandoned",
  "abandoned_released",
  "idempotent_replay",
  "not_abandonable",
  "unknown_attempt",
];

type Admin = SupabaseClient<Database>;

/** Loads the minimum synthetic ticket-type facts needed to price an attempt. */
export async function loadTicketTypeSnapshot(
  admin: Admin,
  ticketTypeId: string,
): Promise<TicketTypeSnapshot | null> {
  const { data, error } = await admin
    .from("ticket_types")
    .select(
      "event_id, is_active, price_cents, currency, max_per_order, quantity_total, quantity_sold, events!inner(is_published)",
    )
    .eq("id", ticketTypeId)
    .maybeSingle();
  if (error || !data) return null;
  const event = (data as unknown as { events: { is_published: boolean } | null }).events;
  return {
    eventId: data.event_id,
    isActive: data.is_active,
    eventPublished: Boolean(event?.is_published),
    priceCents: data.price_cents,
    currency: data.currency,
    maxPerOrder: data.max_per_order,
    quantityTotal: data.quantity_total,
    quantitySold: data.quantity_sold,
  };
}

/**
 * Loose view of the service-role client for staging/proposed columns that
 * the checked-in generated types deliberately do not describe. Keeps the
 * generated types byte-identical to their baseline.
 */
type Row = Record<string, unknown>;
interface LooseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => PromiseLike<{ data: Row[] | null; error: unknown }> & {
        maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
      };
    };
    insert: (values: Row) => {
      select: (columns: string) => {
        maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
      };
    };
  };
}
const loose = (admin: Admin): LooseClient => admin as unknown as LooseClient;

/** Signature verification MUST precede this server helper. Optional test-only
 * fresh GET is disabled unless explicitly provided; no provider POST,
 * repair, schema fallback, legacy promotion or unguarded v2 abandonment. */
export async function reconcileSignedCheckoutExpiry(
  admin: Admin,
  verifiedEvent: unknown,
  attemptId: string,
  nowMs = Date.now(),
  freshRecovery?: {
    enabled: string | undefined;
    promotionEnabled?: string | undefined;
    env: StripeAdapterEnv;
    loadTransport: () => Promise<CheckoutReadTransport>;
    now?: () => number;
  },
): Promise<{ outcome: AbandonOutcome; released: number }> {
  const noop = { outcome: "not_abandonable" as const, released: 0 };
  const failed = { outcome: "error" as const, released: 0 };
  const parsed = parseStripeExpiryEvent(verifiedEvent);
  if (typeof parsed === "string" || parsed.attemptId !== attemptId) return noop;
  try {
    if (freshRecovery?.promotionEnabled === "true") {
      const { reconcileSignedPricedExpiry } = await import("./quoted-expiry-dispatch.server");
      const quoted = await reconcileSignedPricedExpiry({
        client: admin as unknown as import("./guest-promo.server").PromoRpcClient,
        enabled: freshRecovery.promotionEnabled,
        env: freshRecovery.env,
        loadTransport: freshRecovery.loadTransport,
        now: freshRecovery.now ?? Date.now,
        verifiedEvent,
        attemptId,
      });
      // Missing/invalid quote schema fails closed, never falls through to the
      // full-price hold-only release. Only an explicit legacy row returns null.
      if (quoted !== null) return quoted;
    }
    const version = await loose(admin)
      .from("checkout_attempts")
      .select("id,status,provider_request_version")
      .eq("id", attemptId)
      .maybeSingle();
    if (version.error || !version.data || version.data["id"] !== attemptId) return failed;
    if (version.data["status"] !== "pending") return noop;
    const v = version.data["provider_request_version"];
    if (v === null || v === 1) return abandonExpiredCheckoutAttempt(admin, attemptId);
    if (v !== 2) return failed;
    const result = await loose(admin)
      .from("checkout_attempts")
      .select(
        "id,user_id,reservation_id,event_id,ticket_type_id,quantity,unit_price_cents,amount_cents,currency,provider,status,provider_request_version,provider_expires_at_seconds,created_at,payment_intent_id",
      )
      .eq("id", attemptId)
      .maybeSingle();
    if (result.error || !result.data || result.data["id"] !== attemptId) return failed;
    const a = result.data;
    if (typeof a["reservation_id"] !== "string") return noop;
    const holdResult = await loose(admin)
      .from("inventory_reservations")
      .select("id,owner_user_id,event_id,ticket_type_id,quantity,status,expires_at")
      .eq("id", a["reservation_id"])
      .maybeSingle();
    if (holdResult.error || !holdResult.data) return failed;
    const h = holdResult.data;
    const str = (r: Row, key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
    const num = (r: Row, key: string) => (typeof r[key] === "number" ? (r[key] as number) : NaN);
    const attemptFacts = {
      id: str(a, "id"),
      userId: str(a, "user_id"),
      reservationId: str(a, "reservation_id"),
      eventId: str(a, "event_id"),
      ticketTypeId: str(a, "ticket_type_id"),
      quantity: num(a, "quantity"),
      unitPriceCents: num(a, "unit_price_cents"),
      amountCents: num(a, "amount_cents"),
      currency: str(a, "currency"),
      provider: str(a, "provider"),
      status: str(a, "status"),
      providerRequestVersion: num(a, "provider_request_version"),
      providerExpiresAtSeconds: num(a, "provider_expires_at_seconds"),
      createdAt: str(a, "created_at"),
      // Missing/expanded values stay non-null and therefore cannot authorize release.
      paymentIntentId: a["payment_intent_id"] === null ? null : str(a, "payment_intent_id"),
    };
    const holdFacts = {
      id: str(h, "id"),
      ownerUserId: str(h, "owner_user_id"),
      eventId: str(h, "event_id"),
      ticketTypeId: str(h, "ticket_type_id"),
      quantity: num(h, "quantity"),
      status: str(h, "status"),
      expiresAt: str(h, "expires_at"),
    };
    let args = buildV2ExpiryReleaseArgs(verifiedEvent, attemptFacts, holdFacts, nowMs);
    if (!args && freshRecovery?.enabled === "true") {
      const root = verifiedEvent as Record<string, unknown>;
      const session = (root["data"] as { object: Record<string, unknown> }).object;
      const created = root["created"];
      const holdMs = Date.parse(holdFacts.expiresAt);
      const fraction = /\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/.exec(holdFacts.expiresAt)?.[1];
      const holdCeilingMs = holdMs + (fraction && /[1-9]/.test(fraction.slice(3)) ? 1 : 0);
      // Keep a too-early delivery retryable without reading the provider or
      // terminally recording ignored before the full immutable hold deadline.
      if (Number.isSafeInteger(nowMs) && holdCeilingMs > nowMs) return failed;
      // Only timestamp-stale/early otherwise-exact signed expiry observations
      // may initiate recovery. This local validation tuple is discarded, never
      // used as refreshed event evidence. The independent exact GET supplies it.
      if (
        typeof created !== "number" ||
        !Number.isSafeInteger(created) ||
        created <= 0 ||
        created * 1000 > nowMs ||
        typeof session["created"] !== "number" ||
        session["created"] > created ||
        !buildRetrievedV2ExpiryReleaseArgs(session, attemptFacts, holdFacts, nowMs, nowMs)
      )
        return noop;
      const { readFreshStripeTestExpiry } = await import("./stripe-expiry-read.server");
      args = await readFreshStripeTestExpiry({
        env: freshRecovery.env,
        serverSessionId: session["id"] as string,
        attempt: attemptFacts,
        hold: holdFacts,
        transport: await freshRecovery.loadTransport(),
        now: freshRecovery.now ?? Date.now,
      });
      // Unknown GET must remain retryable rather than terminal ignored ledger.
      if (!args) return failed;
      const latestAttempt = await loose(admin)
        .from("checkout_attempts")
        .select(
          "id,user_id,reservation_id,event_id,ticket_type_id,quantity,unit_price_cents,amount_cents,currency,provider,status,provider_request_version,provider_expires_at_seconds,created_at,payment_intent_id",
        )
        .eq("id", attemptId)
        .maybeSingle();
      const latestHold = await loose(admin)
        .from("inventory_reservations")
        .select("id,owner_user_id,event_id,ticket_type_id,quantity,status,expires_at")
        .eq("id", attemptFacts.reservationId)
        .maybeSingle();
      // Compare every selected field, including precise timestamps and explicit
      // null intent, independent of JSON property order. SQL still locks/rechecks.
      const same = (before: Row, after: Row | null) =>
        after !== null &&
        Object.keys(before).every(
          (key) => Object.hasOwn(after, key) && Object.is(before[key], after[key]),
        ) &&
        Object.keys(before).length === Object.keys(after).length;
      if (latestAttempt.error || latestHold.error) return failed;
      if (!same(a, latestAttempt.data) || !same(h, latestHold.data)) return failed;
      const clock = (freshRecovery.now ?? Date.now)();
      const observed = Date.parse(args.p_observed_at);
      if (!Number.isSafeInteger(clock) || clock < observed || clock - observed > 300_000)
        return failed;
    }
    if (!args) return noop;
    const rpc = admin as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    const { data, error } = await rpc.rpc("release_expired_v2_checkout_attempt", { ...args });
    if (error || !Array.isArray(data) || data.length !== 1) return failed;
    const row = data[0] as Row | null;
    if (!row || typeof row !== "object") return failed;
    const outcome = row["outcome"],
      released = row["released"];
    if (outcome === "released" && released === 1)
      return { outcome: "abandoned_released", released: 1 };
    if (released !== 0) return failed;
    if (outcome === "idempotent_replay") return { outcome: "idempotent_replay", released: 0 };
    if (
      [
        "invalid_evidence",
        "unknown_attempt",
        "mismatch",
        "payment_protected",
        "other_attempt_protected",
        "not_releasable",
        "not_due_or_stale",
      ].includes(outcome as string)
    )
      return noop;
    return failed;
  } catch {
    return failed;
  }
}

/** V2 read-only recovery facts, matched to the already owner-verified hold.
 * No legacy promotion, repair, insertion, fallback projection or pricing refresh. */
export async function loadPendingDeadlineCheckoutForRecovery(
  admin: Admin,
  args: {
    attemptId: string;
    userId: string;
    reservationId: string;
    eventId: string;
    ticketTypeId: string;
    quantity: number;
    holdExpiresAt: string;
  },
  now: () => number = Date.now,
): Promise<import("./stripe-checkout-lookup.server").CheckoutLookupFacts | null> {
  const { data, error } = await loose(admin)
    .from("checkout_attempts")
    .select(
      "id,user_id,reservation_id,event_id,ticket_type_id,quantity,unit_price_cents,amount_cents,currency,provider,status,provider_request_version,provider_expires_at_seconds,created_at",
    )
    .eq("id", args.attemptId)
    .maybeSingle();
  if (
    error ||
    !data ||
    data["id"] !== args.attemptId ||
    data["user_id"] !== args.userId ||
    data["reservation_id"] !== args.reservationId ||
    data["event_id"] !== args.eventId ||
    data["ticket_type_id"] !== args.ticketTypeId ||
    data["quantity"] !== args.quantity ||
    data["status"] !== "pending" ||
    data["provider"] !== "stripe_test" ||
    data["provider_request_version"] !== 2
  )
    return null;
  const unit = data["unit_price_cents"],
    amount = data["amount_cents"],
    currency = data["currency"],
    expiry = data["provider_expires_at_seconds"];
  const created = Date.parse(asString(data["created_at"])),
    hold = Date.parse(args.holdExpiresAt),
    clock = now();
  if (
    !Number.isSafeInteger(clock) ||
    !Number.isFinite(created) ||
    created > clock ||
    !Number.isFinite(hold) ||
    !Number.isSafeInteger(expiry) ||
    typeof expiry !== "number" ||
    expiry !== Math.floor(hold / 1000) ||
    expiry <= Math.floor(created / 1000) ||
    expiry - Math.floor(created / 1000) > 86400 ||
    typeof unit !== "number" ||
    !Number.isSafeInteger(unit) ||
    unit < 50 ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount !== unit * args.quantity ||
    typeof currency !== "string" ||
    !/^[a-z]{3}$/.test(currency)
  )
    return null;
  return {
    attemptId: args.attemptId,
    requestVersion: 2,
    createdAtSeconds: Math.floor(created / 1000),
    expiresAtSeconds: expiry,
    amountCents: amount,
    currency,
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Loads the minimal facts needed to correlate one pre-payment hold. */
export async function loadReservationSnapshot(
  admin: Admin,
  reservationId: string,
): Promise<ReservationSnapshot | null> {
  const { data, error } = await loose(admin)
    .from("inventory_reservations")
    .select("owner_user_id, event_id, ticket_type_id, quantity, status, expires_at")
    .eq("id", reservationId)
    .maybeSingle();
  if (error || !data) return null;
  const quantity = data["quantity"];
  return {
    ownerUserId: typeof data["owner_user_id"] === "string" ? data["owner_user_id"] : null,
    eventId: asString(data["event_id"]),
    ticketTypeId: asString(data["ticket_type_id"]),
    quantity: typeof quantity === "number" ? quantity : -1,
    status: asString(data["status"]),
    expiresAt: asString(data["expires_at"]),
  };
}

/** Lists every attempt already linked to one hold (coarse fields only). */
export async function loadAttemptsForReservation(
  admin: Admin,
  reservationId: string,
): Promise<LinkedAttemptSnapshot[] | null> {
  const { data, error } = await loose(admin)
    .from("checkout_attempts")
    .select("id, user_id, status")
    .eq("reservation_id", reservationId);
  if (error || !data) return null;
  return data.map((row) => ({
    id: asString(row["id"]),
    userId: asString(row["user_id"]),
    status: asString(row["status"]),
  }));
}

/** Creates exactly one pending attempt and returns its opaque id. */
export async function insertCheckoutAttempt(
  admin: Admin,
  row: {
    userId: string;
    eventId: string;
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
    currency: string;
    provider: string;
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from("checkout_attempts")
    .insert({
      user_id: row.userId,
      event_id: row.eventId,
      ticket_type_id: row.ticketTypeId,
      quantity: row.quantity,
      unit_price_cents: row.unitPriceCents,
      amount_cents: row.amountCents,
      currency: row.currency,
      provider: row.provider,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

/**
 * Linked variant: the database uniqueness guards on a hold's pending or
 * settled attempt make the insert the concurrency gate. The caller must
 * re-read on a conflict to distinguish a pending replay from a settled hold.
 */
export async function insertLinkedCheckoutAttempt(
  admin: Admin,
  row: {
    userId: string;
    eventId: string;
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
    currency: string;
    provider: string;
    reservationId: string;
    /** New server-owned v2 requests only; never retrofit an existing attempt. */
    providerExpiresAtSeconds?: number;
  },
): Promise<{ id: string } | { conflict: true } | null> {
  if (
    row.providerExpiresAtSeconds !== undefined &&
    (!Number.isSafeInteger(row.providerExpiresAtSeconds) || row.providerExpiresAtSeconds <= 0)
  )
    return null;
  const { data, error } = await loose(admin)
    .from("checkout_attempts")
    .insert({
      user_id: row.userId,
      event_id: row.eventId,
      ticket_type_id: row.ticketTypeId,
      quantity: row.quantity,
      unit_price_cents: row.unitPriceCents,
      amount_cents: row.amountCents,
      currency: row.currency,
      provider: row.provider,
      status: "pending",
      reservation_id: row.reservationId,
      provider_request_version: row.providerExpiresAtSeconds === undefined ? 1 : 2,
      ...(row.providerExpiresAtSeconds === undefined
        ? {}
        : {
            provider_expires_at_seconds: row.providerExpiresAtSeconds,
          }),
    })
    .select("id")
    .maybeSingle();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { conflict: true };
    return null;
  }
  if (!data) return null;
  const id = asString(data["id"]);
  return id ? { id } : null;
}

/** Never retrofit idempotency onto legacy attempts; all facts stay server-side. */
export async function loadPendingCheckoutForRecovery(
  admin: Admin,
  args: {
    attemptId: string;
    userId: string;
    reservationId: string;
    eventId: string;
    ticketTypeId: string;
    quantity: number;
  },
): Promise<PricedAttempt | null> {
  const { data, error } = await loose(admin)
    .from("checkout_attempts")
    .select(
      "id,user_id,reservation_id,event_id,ticket_type_id,quantity,unit_price_cents,amount_cents,currency,provider,status,provider_request_version,created_at",
    )
    .eq("id", args.attemptId)
    .maybeSingle();
  if (
    error ||
    !data ||
    data["id"] !== args.attemptId ||
    data["user_id"] !== args.userId ||
    data["reservation_id"] !== args.reservationId ||
    data["event_id"] !== args.eventId ||
    data["ticket_type_id"] !== args.ticketTypeId ||
    data["quantity"] !== args.quantity ||
    data["status"] !== "pending" ||
    data["provider"] !== "stripe_test" ||
    data["provider_request_version"] !== 1
  )
    return null;
  const unit = data["unit_price_cents"],
    amount = data["amount_cents"],
    currency = data["currency"];
  const created = Date.parse(asString(data["created_at"])),
    age = Date.now() - created;
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age >= 23 * 60 * 60 * 1000 ||
    typeof unit !== "number" ||
    !Number.isSafeInteger(unit) ||
    unit < 50 ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount !== unit * args.quantity ||
    typeof currency !== "string" ||
    !/^[a-z]{3}$/.test(currency)
  )
    return null;
  return { eventId: args.eventId, unitPriceCents: unit, amountCents: amount, currency };
}

/**
 * Moves a just-created server-owned attempt to a generic terminal state.
 * Never touches orders, tickets, or inventory.
 */
export async function markCheckoutAttemptStatus(
  admin: Admin,
  attemptId: string,
  status: "failed" | "abandoned",
): Promise<boolean> {
  const { error } = await admin
    .from("checkout_attempts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", attemptId);
  return !error;
}

/**
 * Loads server-only status and immutable paid-amount facts for webhook correlation.
 * These facts are never returned by the route; no user/contact/session data is read.
 */
export async function loadCheckoutAttemptStatus(
  admin: Admin,
  attemptId: string,
  pricingEnabled = false,
): Promise<{
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  provider: string;
  priceQuoteId?: string | null;
} | null> {
  if (pricingEnabled) {
    const { data, error } = await loose(admin)
      .from("checkout_attempts")
      .select("id, status, amount_cents, currency, provider, price_quote_id")
      .eq("id", attemptId)
      .maybeSingle();
    if (
      error ||
      !data ||
      data["id"] !== attemptId ||
      typeof data["status"] !== "string" ||
      typeof data["amount_cents"] !== "number" ||
      !Number.isSafeInteger(data["amount_cents"]) ||
      typeof data["currency"] !== "string" ||
      typeof data["provider"] !== "string" ||
      (data["price_quote_id"] !== null && !isUuid(data["price_quote_id"]))
    )
      return null;
    return {
      id: attemptId,
      status: data["status"],
      amountCents: data["amount_cents"],
      currency: data["currency"],
      provider: data["provider"],
      priceQuoteId: data["price_quote_id"] as string | null,
    };
  }
  const { data, error } = await admin
    .from("checkout_attempts")
    .select("id, status, amount_cents, currency, provider")
    .eq("id", attemptId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    status: data.status,
    amountCents: data.amount_cents,
    currency: data.currency,
    provider: data.provider,
  };
}

/**
 * Reconciliation only: moves exactly one *pending* attempt to `completed`.
 * The `status = pending` predicate makes replays and concurrent deliveries
 * no-ops, and the `id` predicate makes it impossible to touch another row.
 * Creates no order or ticket and changes no inventory.
 */
export async function completePendingCheckoutAttempt(
  admin: Admin,
  attemptId: string,
): Promise<{ updated: boolean; error: boolean }> {
  const { data, error } = await admin
    .from("checkout_attempts")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("status", "pending")
    .select("id");
  if (error) return { updated: false, error: true };
  return { updated: (data?.length ?? 0) > 0, error: false };
}

export async function findWebhookEvent(
  admin: Admin,
  externalEventId: string,
): Promise<{ status: WebhookEventStatus } | null> {
  const { data, error } = await admin
    .from("payment_webhook_events")
    .select("status")
    .eq("external_event_id", externalEventId)
    .maybeSingle();
  if (error || !data) return null;
  return { status: data.status as WebhookEventStatus };
}

/**
 * Gate 167: `checkoutAttemptId` is the OPTIONAL internal correlation the
 * caller already validated on this very delivery. It is written in the same
 * INSERT as the ledger row, so a row and its correlation appear together or
 * not at all. When the caller has no such reference the column stays NULL —
 * correlation is never inferred from provider event, payment or refund ids,
 * nor from any shared attribute. Only a unique-constraint race is an
 * idempotent duplicate, and only when the event id can be read back. Other
 * insert failures must reach the route's generic error response so the
 * provider can retry.
 */
export async function recordWebhookEvent(
  admin: Admin,
  row: {
    provider: string;
    externalEventId: string;
    eventType: string;
    status: WebhookEventStatus;
    checkoutAttemptId?: string | null;
  },
): Promise<boolean> {
  const { error } = await admin.from("payment_webhook_events").insert({
    provider: row.provider,
    external_event_id: row.externalEventId,
    event_type: row.eventType,
    status: row.status,
    processed_at: row.status === "processed" ? new Date().toISOString() : null,
    checkout_attempt_id: row.checkoutAttemptId ?? null,
  });
  if (!error) return true;
  // This table also has a generated primary key. A unique violation by itself
  // does not prove the provider event was already recorded.
  if (error.code === "23505" && (await findWebhookEvent(admin, row.externalEventId))) {
    return false;
  }
  throw new Error("Webhook event could not be recorded");
}

export async function markWebhookEventStatus(
  admin: Admin,
  externalEventId: string,
  status: WebhookEventStatus,
): Promise<boolean> {
  const { error } = await admin
    .from("payment_webhook_events")
    .update({
      status,
      processed_at: status === "processed" ? new Date().toISOString() : null,
    })
    .eq("external_event_id", externalEventId);
  return !error;
}

/** Signature/test-mode/attempt-money validation MUST precede this helper.
 * Persist only opaque event/attempt references and a fixed review category.
 * Never marks fulfillment, changes inventory, saves raw payloads or refunds.
 * Duplicate read-back verifies the exact tuple; CAS cannot demote a terminal
 * ledger row. Storage failures must remain retryable rather than disappear.
 */
export async function recordUnfulfilledPaidReview(
  admin: Admin,
  row: { externalEventId: string; eventType: string; checkoutAttemptId: string },
): Promise<void> {
  const category = "paid_fulfillment_review";
  const values = {
    provider: "stripe_test",
    external_event_id: row.externalEventId,
    event_type: row.eventType,
    checkout_attempt_id: row.checkoutAttemptId,
    status: "failed",
    failure_category: category,
    processed_at: null,
  };
  const { error } = await admin.from("payment_webhook_events").insert(values);
  if (!error) return;
  if (error.code !== "23505") throw new Error("Paid review could not be recorded");
  const found = await admin
    .from("payment_webhook_events")
    .select("status, provider, event_type, checkout_attempt_id, failure_category")
    .eq("external_event_id", row.externalEventId)
    .maybeSingle();
  const existing = found.data;
  if (
    found.error ||
    !existing ||
    existing.provider !== values.provider ||
    existing.event_type !== values.event_type ||
    existing.checkout_attempt_id !== values.checkout_attempt_id ||
    (existing.status !== "received" && existing.status !== "failed")
  )
    throw new Error("Paid review could not be recorded");
  if (existing.status === "failed" && existing.failure_category === category) return;
  const updated = await admin
    .from("payment_webhook_events")
    .update({ status: "failed", failure_category: category, processed_at: null })
    .eq("external_event_id", row.externalEventId)
    .eq("provider", values.provider)
    .eq("event_type", values.event_type)
    .eq("checkout_attempt_id", values.checkout_attempt_id)
    .eq("status", existing.status)
    .select("id");
  if (updated.error || updated.data?.length !== 1)
    throw new Error("Paid review could not be recorded");
}

/**
 * Atomic staging abandonment: marks exactly one *pending* attempt `abandoned`
 * and returns its linked *confirmed* pre-payment reservation capacity exactly
 * once. Replays and non-pending attempts are no-ops inside the routine.
 * Creates no order or ticket, and never touches another attempt.
 *
 * The routine is SECURITY INVOKER and granted only to `service_role`.
 */
export async function abandonExpiredCheckoutAttempt(
  admin: Admin,
  attemptId: string,
): Promise<{ outcome: AbandonOutcome; released: number }> {
  try {
    const { data, error } = await (
      admin as unknown as {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("abandon_expired_checkout_attempt", { p_attempt_id: attemptId });
    if (error) return { outcome: "error", released: 0 };
    const row = Array.isArray(data) ? data[0] : data;
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const outcome = record?.["outcome"];
    const released = record?.["released"];
    if (typeof outcome !== "string") return { outcome: "error", released: 0 };
    if (!ABANDON_OUTCOMES.includes(outcome as AbandonOutcome)) {
      return { outcome: "error", released: 0 };
    }
    return {
      outcome: outcome as AbandonOutcome,
      released: typeof released === "number" && released > 0 ? released : 0,
    };
  } catch {
    return { outcome: "error", released: 0 };
  }
}

const FINALIZE_OUTCOMES: FinalizeOutcome[] = [
  "finalized",
  "idempotent_replay",
  "unlinked",
  "not_finalizable",
  "unknown_attempt",
];

/**
 * Atomic staging paid finalization: moves exactly one *pending* linked attempt
 * to `completed` and, in the same transaction, issues exactly the confirmed
 * hold's order, order line, and tickets. The paid hold is deliberately left
 * `confirmed`, so no inventory is returned. Replays and every non-pending or
 * mismatched attempt are no-ops inside the routine.
 *
 * The routine is SECURITY INVOKER and granted only to `service_role`.
 */
export async function finalizePaidCheckoutAttempt(
  admin: Admin,
  attemptId: string,
): Promise<{ outcome: FinalizeOutcome; ticketsIssued: number }> {
  try {
    const { data, error } = await (
      admin as unknown as {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("finalize_paid_checkout_attempt", { p_attempt_id: attemptId });
    if (error) return { outcome: "error", ticketsIssued: 0 };
    const row = Array.isArray(data) ? data[0] : data;
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const outcome = record?.["outcome"];
    const issued = record?.["tickets_issued"];
    if (typeof outcome !== "string" || !FINALIZE_OUTCOMES.includes(outcome as FinalizeOutcome)) {
      return { outcome: "error", ticketsIssued: 0 };
    }
    return {
      outcome: outcome as FinalizeOutcome,
      ticketsIssued: typeof issued === "number" && issued > 0 ? issued : 0,
    };
  } catch {
    return { outcome: "error", ticketsIssued: 0 };
  }
}

/**
 * Gate 86: persists the opaque Stripe **test-mode** PaymentIntent id on one
 * already-correlated attempt, for a future per-ticket refund gate.
 *
 * Correlation only. The write is guarded by the attempt id *and* by the column
 * still being empty, so repeated deliveries are no-ops and no other attempt or
 * row can be touched. Orders, tickets, holds, capacity, and eligibility
 * snapshots are untouched. A unique index makes a reference collision a
 * benign failure rather than a cross-correlation.
 */
export async function recordAttemptPaymentCorrelation(
  admin: Admin,
  attemptId: string,
  paymentIntentId: string,
): Promise<boolean> {
  const { error } = await (
    admin as unknown as {
      from: (table: string) => {
        update: (values: Row) => {
          eq: (
            column: string,
            value: unknown,
          ) => {
            is: (column: string, value: null) => PromiseLike<{ error: unknown }>;
          };
        };
      };
    }
  )
    .from("checkout_attempts")
    .update({ payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
    .eq("id", attemptId)
    .is("payment_intent_id", null);
  return !error;
}
