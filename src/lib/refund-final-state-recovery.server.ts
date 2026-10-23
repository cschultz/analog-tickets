/**
 * Unwired, server-only recovery for one already-created test refund. It never
 * creates a provider refund and requires an explicit operator invocation.
 * All I/O is injected so acceptance tests can use synthetic local data.
 */
import { isUuid } from "@/lib/checkout-core";
import { STRIPE_REFUNDS_URL } from "@/lib/refund-coordinator-core";
import { parseReversalRequest } from "@/lib/refund-reversal-core";
import { reverseRefundedTickets } from "@/lib/refund-reversal.server";
import { resolveStripeRefundKey, type StripeRefundEnv } from "@/lib/stripe-refund.server";
import { STRIPE_API_VERSION } from "@/lib/stripe-checkout.server";
import { verifyRetrievedRefund } from "@/lib/refund-status-lookup-core";
import type { StripeRefundLookupTransport } from "@/lib/refund-status-lookup.server";

export const REFUND_RECOVERY_CONFIRMATION = "RECONCILE_ONE_EXISTING_TEST_REFUND";

type Row = Record<string, unknown>;
type RecoveryOutcome =
  | "not_available"
  | "configuration"
  | "unverified"
  | "still_pending"
  | "provider_failed"
  | "provider_canceled"
  | "refunded"
  | "reconciliation_needed";

export interface RefundRecoveryResult {
  outcome: RecoveryOutcome;
  ticketsReversed: number;
  restocked: number;
}

type Ledger = {
  id: string;
  state: "reconciliation_needed" | "provider_refunded";
  reference: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  ticketIds: string[];
};

interface Query extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq: (column: string, value: unknown) => Query;
  select: (columns: string) => Query;
  maybeSingle: () => PromiseLike<{ data: Row | null; error: unknown }>;
}
interface Admin {
  from: (table: string) => {
    select: (columns: string) => Query;
    update: (values: Row) => Query;
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

const result = (
  outcome: RecoveryOutcome,
  ticketsReversed = 0,
  restocked = 0,
): RefundRecoveryResult => ({
  outcome,
  ticketsReversed,
  restocked,
});

function readLedger(row: Row | null, id: string): Ledger | null {
  if (!row || row["id"] !== id) return null;
  const state = row["state"];
  if (!(
    (state === "reconciliation_needed" && row["failure_reason"] === "provider_pending") ||
    (state === "provider_refunded" && row["failure_reason"] === null)
  ))
    return null;
  const parsed = parseReversalRequest({
    ticketIds: row["ticket_ids"],
    paymentIntentId: row["payment_intent_id"],
    providerRefundReference: row["provider_refund_reference"],
  });
  if (typeof parsed === "string") return null;
  if (
    row["ticket_count"] !== parsed.ticketIds.length ||
    !Number.isSafeInteger(row["amount_cents"]) ||
    (row["amount_cents"] as number) <= 0 ||
    typeof row["currency"] !== "string" ||
    !/^[a-z]{3}$/.test(row["currency"])
  )
    return null;
  return {
    id,
    state,
    reference: parsed.providerRefundReference,
    paymentIntentId: parsed.paymentIntentId,
    amountCents: row["amount_cents"] as number,
    currency: row["currency"],
    ticketIds: parsed.ticketIds,
  };
}

function sameFacts(row: Row | undefined, ledger: Ledger, state: string): boolean {
  return (
    row?.["id"] === ledger.id &&
    row["state"] === state &&
    row["provider_refund_reference"] === ledger.reference &&
    row["payment_intent_id"] === ledger.paymentIntentId &&
    row["amount_cents"] === ledger.amountCents &&
    row["currency"] === ledger.currency &&
    row["ticket_count"] === ledger.ticketIds.length &&
    Array.isArray(row["ticket_ids"]) &&
    JSON.stringify(row["ticket_ids"]) === JSON.stringify(ledger.ticketIds)
  );
}

async function transition(
  admin: Admin,
  ledger: Ledger,
  from: string,
  to: string,
  failureReason: string | null,
): Promise<boolean> {
  try {
    let query = admin
      .from("refund_coordination_attempts")
      .update({ state: to, failure_reason: failureReason })
      .eq("id", ledger.id)
      .eq("state", from)
      .eq("provider_refund_reference", ledger.reference)
      .eq("payment_intent_id", ledger.paymentIntentId)
      .eq("amount_cents", ledger.amountCents)
      .eq("currency", ledger.currency)
      .eq("ticket_count", ledger.ticketIds.length);
    if (from === "reconciliation_needed") query = query.eq("failure_reason", "provider_pending");
    const updated = await query.select(
      "id,state,failure_reason,provider_refund_reference,payment_intent_id,amount_cents,currency,ticket_ids,ticket_count",
    );
    return (
      updated.error == null &&
      updated.data?.length === 1 &&
      sameFacts(updated.data[0], ledger, to) &&
      updated.data[0]?.["failure_reason"] === failureReason
    );
  } catch {
    return false;
  }
}

export async function reconcileExistingTestRefund(options: {
  admin: unknown;
  env: StripeRefundEnv;
  transport: StripeRefundLookupTransport;
  coordinationAttemptId: unknown;
  confirmation: unknown;
}): Promise<RefundRecoveryResult> {
  if (
    options.confirmation !== REFUND_RECOVERY_CONFIRMATION ||
    !isUuid(options.coordinationAttemptId)
  )
    return result("not_available");
  const key = resolveStripeRefundKey(options.env);
  if (!key) return result("configuration");

  const admin = options.admin as Admin;
  let row: Row | null;
  try {
    const read = await admin
      .from("refund_coordination_attempts")
      .select(
        "id,state,failure_reason,provider_refund_reference,payment_intent_id,amount_cents,currency,ticket_ids,ticket_count",
      )
      .eq("id", options.coordinationAttemptId)
      .maybeSingle();
    if (read.error) return result("unverified");
    row = read.data;
  } catch {
    return result("unverified");
  }
  const ledger = readLedger(row, options.coordinationAttemptId);
  if (!ledger) return result("not_available");

  let response: { status: number; body: string };
  try {
    response = await options.transport({
      url: `${STRIPE_REFUNDS_URL}/${ledger.reference}`,
      method: "GET",
      headers: { authorization: `Bearer ${key}`, "stripe-version": STRIPE_API_VERSION },
      timeoutMs: 20_000,
    });
  } catch {
    return result("unverified");
  }
  if (!response || typeof response.status !== "number" || typeof response.body !== "string")
    return result("unverified");
  const verified = verifyRetrievedRefund(response.status, response.body, {
    refundReference: ledger.reference,
    paymentIntentId: ledger.paymentIntentId,
    amountCents: ledger.amountCents,
    currency: ledger.currency,
  });
  if (!verified.verified) return result("unverified");
  if (verified.status === "pending" || verified.status === "requires_action")
    return result("still_pending");

  if (verified.status === "failed" || verified.status === "canceled") {
    if (ledger.state !== "reconciliation_needed") return result("reconciliation_needed");
    const outcome = verified.status === "failed" ? "provider_failed" : "provider_canceled";
    const changed = await transition(admin, ledger, "reconciliation_needed", "failed", outcome);
    return result(changed ? outcome : "reconciliation_needed");
  }

  if (ledger.state === "reconciliation_needed") {
    const claimed = await transition(
      admin,
      ledger,
      "reconciliation_needed",
      "provider_refunded",
      null,
    );
    if (!claimed) return result("reconciliation_needed");
  }

  // The database routine independently checks paid correlation and reverses
  // tickets, ledger and stock atomically. Its idempotent replay is safe after
  // an ambiguous response; no second provider refund is ever requested.
  let reversal;
  try {
    reversal = await reverseRefundedTickets(admin, {
      ticketIds: ledger.ticketIds,
      paymentIntentId: ledger.paymentIntentId,
      providerRefundReference: ledger.reference,
    });
  } catch {
    return result("reconciliation_needed");
  }
  if (reversal.outcome !== "reversed" && reversal.outcome !== "idempotent_replay")
    return result("reconciliation_needed");
  const closed = await transition(admin, ledger, "provider_refunded", "reversed", null);
  return closed
    ? result("refunded", reversal.ticketsReversed, reversal.restocked)
    : result("reconciliation_needed");
}
