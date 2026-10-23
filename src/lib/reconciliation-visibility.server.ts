/**
 * Gate 96 — server-only reader for the reconciliation-needed visibility
 * contract. SELECT only: no update, insert, delete, upsert, RPC, or network
 * call exists in this module, and no provider reference column is projected.
 */
import type { ReconciliationCaseFacts } from "@/lib/reconciliation-visibility-core";
import { RECONCILIATION_VISIBLE_STATES } from "@/lib/reconciliation-visibility-core";

type Row = Record<string, unknown>;

interface LooseFilter extends PromiseLike<{
  data: Row[] | null;
  error: unknown;
  count: number | null;
}> {
  eq: (column: string, value: unknown) => LooseFilter;
  in: (column: string, values: unknown[]) => LooseFilter;
}

export interface LooseReadClient {
  from: (table: string) => {
    select: (columns: string, options?: { count: "exact" }) => LooseFilter;
  };
}

const loose = (client: unknown): LooseReadClient => client as LooseReadClient;
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Loads unresolved ledger rows. The payment intent and provider
 * refund reference columns are deliberately NOT selected, so they cannot leak
 * through this path even by accident.
 */
export async function loadReconciliationCases(
  admin: unknown,
): Promise<ReconciliationCaseFacts[] | null> {
  const { data, error, count } = await loose(admin)
    .from("refund_coordination_attempts")
    .select("id, state, failure_reason, ticket_ids, created_at, updated_at", { count: "exact" })
    .in("state", [...RECONCILIATION_VISIBLE_STATES]);
  // A capped Data API response must never masquerade as "no cases" for an event.
  if (error || !data || count !== data.length) return null;
  return data.map((row) => {
    const ids = row["ticket_ids"];
    const reason = row["failure_reason"];
    return {
      id: str(row["id"]),
      state: str(row["state"]),
      failureReason: typeof reason === "string" ? reason : null,
      ticketIds: Array.isArray(ids) ? ids.map(str).filter(Boolean) : [],
      createdAt: str(row["created_at"]),
      updatedAt: str(row["updated_at"]),
    };
  });
}

/**
 * Resolves which of the candidate ticket ids actually belong to the requested
 * event. This is the ONLY source of case-to-event association; nothing is ever
 * taken from browser input.
 */
export async function loadEventTicketIds(
  admin: unknown,
  eventId: string,
  candidateTicketIds: string[],
): Promise<string[] | null> {
  if (candidateTicketIds.length === 0) return [];
  const { data, error, count } = await loose(admin)
    .from("tickets")
    .select("id", { count: "exact" })
    .eq("event_id", eventId)
    .in("id", candidateTicketIds);
  if (error || !data || count !== data.length) return null;
  return data.map((row) => str(row["id"])).filter(Boolean);
}
