/**
 * Gate 91 — server-only reader for the private staging refund-eligibility
 * contract. SELECT only: there is no update, insert, delete, RPC, or fetch in
 * this module, and it never reads the refund coordination ledger.
 */
import type { EligibilityTicketFacts } from "@/lib/refund-eligibility-core";

type Row = Record<string, unknown>;

interface LooseFilter extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq: (column: string, value: unknown) => LooseFilter;
  in: (column: string, values: unknown[]) => LooseFilter;
}

export interface LooseReadClient {
  from: (table: string) => { select: (columns: string) => LooseFilter };
}

const loose = (client: unknown): LooseReadClient => client as LooseReadClient;

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Reads the minimum non-PII ticket facts for one event and an explicit id
 * selection. Holder name/email, order id, owner, and every payment or provider
 * column are deliberately not projected.
 */
export async function loadEligibilityTicketFacts(
  admin: unknown,
  eventId: string,
  ticketIds: string[],
): Promise<EligibilityTicketFacts[] | null> {
  const { data, error } = await loose(admin)
    .from("tickets")
    .select("id, event_id, status, refundable_at_issue, checked_in_at")
    .eq("event_id", eventId)
    .in("id", ticketIds);
  if (error || !data) return null;
  return data.map((row) => ({
    id: asString(row["id"]),
    eventId: asString(row["event_id"]),
    status: asString(row["status"]),
    refundableAtIssue: row["refundable_at_issue"],
    checkedIn: row["checked_in_at"] != null,
  }));
}
