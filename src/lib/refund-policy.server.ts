/**
 * Server-only helpers for the private staging refundability policy layer.
 *
 * The setting lives on `ticket_types`, which no client role may update, so
 * every write here goes through the service-role client — and only after the
 * caller's admin membership has been proven with their own RLS-scoped session.
 *
 * Columns touched: `ticket_types.is_refundable` and `tickets.refundable_at_issue`.
 * The generated Supabase types deliberately stay at their baseline, so both are
 * reached through a narrow loose-typed view, as elsewhere in staging.
 */
import type { MembershipSnapshot } from "@/lib/refund-policy-core";

type Row = Record<string, unknown>;

interface LooseSelect {
  eq: (column: string, value: unknown) => LooseSelect & {
    maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
  } & PromiseLike<{ data: Row[] | null; error: unknown }>;
}

export interface LooseClient {
  from: (table: string) => {
    select: (columns: string) => LooseSelect;
    update: (values: Row) => {
      eq: (column: string, value: unknown) => PromiseLike<{ error: unknown }>;
    };
  };
}

const loose = (client: unknown): LooseClient => client as LooseClient;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Minimal ticket-type facts needed to authorize and apply a policy change. */
export interface TicketTypePolicySnapshot {
  eventId: string;
  isRefundable: boolean;
}

export async function loadTicketTypePolicy(
  admin: unknown,
  ticketTypeId: string,
): Promise<TicketTypePolicySnapshot | null> {
  const { data, error } = await loose(admin)
    .from("ticket_types")
    .select("event_id, is_refundable")
    .eq("id", ticketTypeId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    eventId: asString(data["event_id"]),
    isRefundable: data["is_refundable"] === true,
  };
}

/**
 * Reads the caller's memberships for one event with THEIR session, never the
 * service-role client, so RLS proves the rows belong to them.
 */
export async function loadCallerMemberships(
  userClient: unknown,
  eventId: string,
): Promise<MembershipSnapshot[] | null> {
  const { data, error } = await loose(userClient)
    .from("event_memberships")
    .select("event_id, user_id, role")
    .eq("event_id", eventId);
  if (error || !data) return null;
  return data.map((row) => ({
    eventId: asString(row["event_id"]),
    userId: asString(row["user_id"]),
    role: asString(row["role"]),
  }));
}

/** Applies the admin setting. Never touches issued tickets or their snapshots. */
export async function updateTicketTypeRefundable(
  admin: unknown,
  ticketTypeId: string,
  isRefundable: boolean,
): Promise<boolean> {
  const { error } = await loose(admin)
    .from("ticket_types")
    .update({ is_refundable: isRefundable })
    .eq("id", ticketTypeId);
  return !error;
}
