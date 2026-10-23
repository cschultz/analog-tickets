/**
 * Gate 87 — server-only wrapper around the atomic per-ticket reversal routine.
 *
 * The routine `public.reverse_refunded_tickets` is SECURITY INVOKER with an
 * empty search_path, revoked from PUBLIC/anon/authenticated and granted only to
 * `service_role`, so this module is reachable exclusively from trusted server
 * code holding the service-role client. No browser route, server function, or
 * UI exposes it, and it performs no provider call of any kind.
 *
 * Generated Supabase types deliberately stay at their baseline, so the RPC is
 * reached through a narrow loose-typed view, as elsewhere in private staging.
 */
import {
  isReversalOutcome,
  parseReversalRequest,
  type ReversalOutcome,
} from "@/lib/refund-reversal-core";

interface LooseRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

export interface ReversalResult {
  outcome: ReversalOutcome;
  refundId: string | null;
  ticketsReversed: number;
  restocked: number;
}

function readRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

/**
 * Reverses a distinct set of issued, refundable-at-issue tickets belonging to
 * one paid, correlated synthetic test payment. Everything — the ledger entry,
 * the ticket voiding, and the restock — happens in the routine's single
 * transaction, or not at all.
 */
export async function reverseRefundedTickets(
  admin: unknown,
  input: unknown,
): Promise<ReversalResult> {
  const parsed = parseReversalRequest(input);
  if (typeof parsed === "string") {
    return { outcome: parsed, refundId: null, ticketsReversed: 0, restocked: 0 };
  }

  const { data, error } = await (admin as LooseRpcClient).rpc("reverse_refunded_tickets", {
    p_ticket_ids: parsed.ticketIds,
    p_payment_intent_id: parsed.paymentIntentId,
    p_provider_refund_reference: parsed.providerRefundReference,
  });

  if (error) {
    // Generic, non-disclosing failure: an invariant breach aborts the whole
    // transaction, so no partial reversal can survive it.
    return { outcome: "invalid_selection", refundId: null, ticketsReversed: 0, restocked: 0 };
  }

  const row = readRow(data);
  const outcome = row?.["outcome"];
  if (!isReversalOutcome(outcome)) {
    return { outcome: "invalid_selection", refundId: null, ticketsReversed: 0, restocked: 0 };
  }

  const refundId = row?.["refund_id"];
  return {
    outcome,
    refundId: typeof refundId === "string" ? refundId : null,
    ticketsReversed: Number(row?.["tickets_reversed"] ?? 0) || 0,
    restocked: Number(row?.["restocked"] ?? 0) || 0,
  };
}
