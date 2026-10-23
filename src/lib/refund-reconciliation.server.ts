/**
 * Gate 89 — server-only reads/notes on the Gate 88 refund coordination ledger.
 *
 * Only two operations exist: look up at most one coordination record for an
 * opaque correlation pair, and durably flag an already provider-refunded
 * record as needing reconciliation. There is no create, no delete, no ticket
 * or inventory write, and no provider call reachable from this module. Every
 * caller is trusted server code holding the service-role client.
 */
import type { RefundCoordinationRecord } from "@/lib/refund-webhook-core";

type Row = Record<string, unknown>;

interface LooseQuery extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq: (column: string, value: unknown) => LooseQuery;
  limit: (count: number) => LooseQuery;
}

interface LooseClient {
  from: (table: string) => {
    select: (columns: string) => LooseQuery;
    update: (values: Row) => {
      eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => PromiseLike<{ error: unknown }> };
    };
  };
}

const TABLE = "refund_coordination_attempts";
const COLUMNS = "id, state, payment_intent_id, provider_refund_reference";

const loose = (client: unknown) => client as LooseClient;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function toRecord(row: Row): RefundCoordinationRecord {
  const reference = row["provider_refund_reference"];
  return {
    id: str(row["id"]),
    state: str(row["state"]),
    paymentIntentId: str(row["payment_intent_id"]),
    providerRefundReference: typeof reference === "string" ? reference : null,
  };
}

/**
 * Resolves the single coordination record a refund delivery can belong to.
 *
 * The refund reference is preferred because it is the strongest correlation.
 * Falling back to the payment reference is only allowed when it identifies
 * exactly one record; anything ambiguous resolves to `null` (treated as an
 * unknown event, never as a match).
 */
export async function loadRefundCoordinationRecord(
  admin: unknown,
  correlation: { paymentIntentId: string; refundReference: string },
): Promise<RefundCoordinationRecord | null> {
  const client = loose(admin);

  const byRefund = await client
    .from(TABLE)
    .select(COLUMNS)
    .eq("provider_refund_reference", correlation.refundReference)
    .limit(2);
  if (byRefund.error) return null;
  const refundRows = byRefund.data ?? [];
  if (refundRows.length === 1) return toRecord(refundRows[0]!);
  if (refundRows.length > 1) return null;

  const byIntent = await client
    .from(TABLE)
    .select(COLUMNS)
    .eq("payment_intent_id", correlation.paymentIntentId)
    .limit(2);
  if (byIntent.error) return null;
  const intentRows = byIntent.data ?? [];
  return intentRows.length === 1 ? toRecord(intentRows[0]!) : null;
}

/**
 * Marks a record that Stripe says was refunded, but whose internal reversal is
 * unproven, as `reconciliation_needed`. Guarded to the `provider_refunded`
 * state so a reversed or failed record can never be rewritten by a delivery,
 * and so repeated deliveries are naturally idempotent.
 */
export async function flagRefundReconciliationNeeded(
  admin: unknown,
  recordId: string,
): Promise<boolean> {
  const { error } = await loose(admin)
    .from(TABLE)
    .update({
      state: "reconciliation_needed",
      failure_reason: "webhook_unreconciled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("state", "provider_refunded");
  return !error;
}
