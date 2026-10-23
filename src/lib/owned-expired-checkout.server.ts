/** Server-owned expiry recovery draft. The caller MUST
 * verify identity before supplying verifiedUserId; no client claims/facts/IDs
 * are trusted except an opaque reservation selector. No provider event is
 * created or rewritten and no webhook ledger is accessed. */
import { isUuid } from "./checkout-core";
import {
  buildRetrievedV2ExpiryReleaseArgs,
  type ExpiryAttemptFacts,
  type ExpiryHoldFacts,
} from "./checkout-expiry-evidence";
import {
  lookupStripeTestCheckout,
  type CheckoutReadTransport,
} from "./stripe-checkout-lookup.server";
import { readFreshStripeTestExpiry } from "./stripe-expiry-read.server";
import { resolveStripeAdapterConfig, type StripeAdapterEnv } from "./stripe-checkout.server";

type Row = Record<string, unknown>;
interface Query extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq: (key: string, value: unknown) => Query;
  limit: (n: number) => Query;
  maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
}
export interface ExpiredRecoveryAdmin {
  from: (table: string) => { select: (columns: string) => Query };
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}
export type OwnedExpiryRecoveryResult = { status: "released" | "already_released" | "unresolved" };
const unresolved: OwnedExpiryRecoveryResult = { status: "unresolved" };
const ATTEMPT_COLUMNS =
  "id,user_id,reservation_id,event_id,ticket_type_id,quantity,unit_price_cents,amount_cents,currency,provider,status,provider_request_version,provider_expires_at_seconds,created_at,payment_intent_id";
const HOLD_COLUMNS = "id,owner_user_id,event_id,ticket_type_id,quantity,status,expires_at";
const str = (r: Row, key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
const num = (r: Row, key: string) => (typeof r[key] === "number" ? (r[key] as number) : NaN);
const equal = (a: Row, b: Row) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((k) => Object.hasOwn(b, k) && Object.is(a[k], b[k]));
async function load(admin: ExpiredRecoveryAdmin, reservationId: string, owner: string) {
  // Owner scope is applied before reading attempts; no cross-owner discovery.
  const h = await admin
    .from("inventory_reservations")
    .select(HOLD_COLUMNS)
    .eq("id", reservationId)
    .eq("owner_user_id", owner)
    .maybeSingle();
  if (h.error || !h.data || h.data["id"] !== reservationId || h.data["owner_user_id"] !== owner)
    return null;
  // Two rows prove ambiguity. Never silently select the first pending attempt.
  const a = await admin
    .from("checkout_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("reservation_id", reservationId)
    .limit(2);
  if (a.error || !Array.isArray(a.data) || a.data.length !== 1 || !a.data[0]) return null;
  const row = a.data[0];
  const attempt: ExpiryAttemptFacts = {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    reservationId: str(row, "reservation_id"),
    eventId: str(row, "event_id"),
    ticketTypeId: str(row, "ticket_type_id"),
    quantity: num(row, "quantity"),
    unitPriceCents: num(row, "unit_price_cents"),
    amountCents: num(row, "amount_cents"),
    currency: str(row, "currency"),
    provider: str(row, "provider"),
    status: str(row, "status"),
    providerRequestVersion: num(row, "provider_request_version"),
    providerExpiresAtSeconds: num(row, "provider_expires_at_seconds"),
    createdAt: str(row, "created_at"),
    paymentIntentId: row["payment_intent_id"] === null ? null : str(row, "payment_intent_id"),
  };
  const hold: ExpiryHoldFacts = {
    id: str(h.data, "id"),
    ownerUserId: str(h.data, "owner_user_id"),
    eventId: str(h.data, "event_id"),
    ticketTypeId: str(h.data, "ticket_type_id"),
    quantity: num(h.data, "quantity"),
    status: str(h.data, "status"),
    expiresAt: str(h.data, "expires_at"),
  };
  if (attempt.userId !== owner || attempt.reservationId !== reservationId) return null;
  return { attempt, hold, rawAttempt: { ...row }, rawHold: { ...h.data } };
}
/** Off-default server workflow; no new session, pricing refresh, hold extension,
 * legacy fallback, refund, issuance, mail, ledger manufacture or raw output. */
export async function recoverOwnedExpiredCheckout(options: {
  enabled: string | undefined;
  verifiedUserId: string | null;
  reservationId: string;
  env: StripeAdapterEnv;
  loadAdmin: () => Promise<ExpiredRecoveryAdmin>;
  loadTransport: () => Promise<CheckoutReadTransport>;
  now?: () => number;
}): Promise<OwnedExpiryRecoveryResult> {
  if (
    options.enabled !== "true" ||
    !isUuid(options.verifiedUserId) ||
    !isUuid(options.reservationId) ||
    typeof resolveStripeAdapterConfig(options.env) === "string"
  )
    return unresolved;
  const owner = options.verifiedUserId;
  const now = options.now ?? Date.now;
  try {
    const admin = await options.loadAdmin();
    const before = await load(admin, options.reservationId, owner);
    if (!before) return unresolved;
    const { attempt, hold } = before;
    if (attempt.status === "abandoned" && hold.status === "released") {
      // Historical record in a single SQL snapshot, not provider/payment proof.
      // No provider import or write, including after a committed reply was lost.
      const recorded = await admin.rpc("read_owned_expiry_release_record", {
        p_reservation_id: options.reservationId,
        p_owner_user_id: owner,
      });
      if (
        !recorded.error &&
        Array.isArray(recorded.data) &&
        recorded.data.length === 1 &&
        recorded.data[0]?.outcome === "release_recorded"
      )
        return { status: "already_released" };
      return unresolved;
    }
    const clock = now();
    // Local-only preflight probe, not provider evidence. Discard its tuple.
    // Provider evidence always comes from independent discovery + fresh GET.
    if (
      !buildRetrievedV2ExpiryReleaseArgs(
        {
          id: "cs_test_LOCALPREFLIGHT0001",
          object: "checkout.session",
          livemode: false,
          mode: "payment",
          status: "expired",
          payment_status: "unpaid",
          payment_intent: null,
          client_reference_id: attempt.id,
          created: Math.floor(Date.parse(attempt.createdAt) / 1000),
          expires_at: attempt.providerExpiresAtSeconds,
          amount_total: attempt.amountCents,
          currency: attempt.currency,
        },
        attempt,
        hold,
        clock,
        clock,
      )
    )
      return unresolved;
    const transport = await options.loadTransport();
    const discovered = await lookupStripeTestCheckout({
      env: options.env,
      facts: {
        attemptId: attempt.id,
        requestVersion: 2,
        createdAtSeconds: Math.floor(Date.parse(attempt.createdAt) / 1000),
        expiresAtSeconds: attempt.providerExpiresAtSeconds,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
      },
      transport,
      now,
    });
    if (discovered.status !== "expired_unpaid_candidate") return unresolved;
    const args = await readFreshStripeTestExpiry({
      env: options.env,
      serverSessionId: discovered.sessionId,
      attempt,
      hold,
      transport,
      now,
    });
    if (!args) return unresolved;
    const after = await load(admin, options.reservationId, owner);
    if (
      !after ||
      !equal(before.rawAttempt, after.rawAttempt) ||
      !equal(before.rawHold, after.rawHold)
    )
      return unresolved;
    const current = now(),
      observed = Date.parse(args.p_observed_at);
    if (!Number.isSafeInteger(current) || current < observed || current - observed > 300_000)
      return unresolved;
    const result = await admin.rpc("release_owned_expired_v2_checkout_attempt", { ...args });
    if (
      result.error ||
      !Array.isArray(result.data) ||
      result.data.length !== 1 ||
      !result.data[0] ||
      typeof result.data[0] !== "object"
    )
      return unresolved;
    const outcome = result.data[0] as Row;
    if (outcome["outcome"] === "release_recorded" && outcome["released"] === 1)
      return { status: "released" };
    if (outcome["outcome"] === "recorded_replay" && outcome["released"] === 0)
      return { status: "already_released" };
    return unresolved;
  } catch {
    return unresolved;
  }
}
