/**
 * Gate 93 — server-only orchestration for the authenticated refund command.
 *
 * Order is fixed: the caller's membership must already have been proven with
 * THEIR RLS-scoped session (`authorizeRefundCommand`) before any privileged
 * read happens here. Eligibility is then re-derived from the database, the one
 * coherent paid payment correlation is resolved server-side, and the request is
 * delegated to the Gate 88 coordinator — the only component allowed to contact
 * Stripe or to run the Gate 87 reversal routine.
 *
 * This module never calls a provider, never runs an RPC, and never writes.
 */
import {
  commandResult,
  evaluateRefundEligibility,
  isSelectionRefundable,
  mapCoordinatorOutcome,
  parseRefundCommandInput,
  type RefundCommandResult,
} from "@/lib/refund-command-core";
import {
  evaluateRefundEligibilityAuthorization,
  type EligibilityTicketFacts,
} from "@/lib/refund-eligibility-core";
import type { StripeRefundEnv } from "@/lib/stripe-refund.server";
import type { StripeTransport } from "@/lib/stripe-checkout.server";

type Row = Record<string, unknown>;

interface LooseFilter extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq: (column: string, value: unknown) => LooseFilter;
  in: (column: string, values: unknown[]) => LooseFilter;
  maybeSingle: () => PromiseLike<{ data: Row | null; error: unknown }>;
}

interface LooseReadClient {
  from: (table: string) => { select: (columns: string) => LooseFilter };
}

const loose = (client: unknown): LooseReadClient => client as LooseReadClient;
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Ticket facts the command needs: eligibility facts plus internal linkage. */
export interface CommandTicketFacts extends EligibilityTicketFacts {
  orderId: string;
  ticketTypeId: string;
}

export async function loadCommandTicketFacts(
  admin: unknown,
  eventId: string,
  ticketIds: string[],
): Promise<CommandTicketFacts[] | null> {
  const { data, error } = await loose(admin)
    .from("tickets")
    .select("id, event_id, status, refundable_at_issue, checked_in_at, order_id, ticket_type_id")
    .eq("event_id", eventId)
    .in("id", ticketIds);
  if (error || !data) return null;
  return data.map((row) => ({
    id: str(row["id"]),
    eventId: str(row["event_id"]),
    status: str(row["status"]),
    refundableAtIssue: row["refundable_at_issue"],
    checkedIn: row["checked_in_at"] != null,
    orderId: str(row["order_id"]),
    ticketTypeId: str(row["ticket_type_id"]),
  }));
}

/**
 * Resolves the single opaque payment correlation covering the whole selection.
 * Returns null unless every selected ticket sits on one order and one tier, and
 * exactly one completed test-mode attempt correlates to that order.
 */
export async function resolveCommandPaymentIntent(
  admin: unknown,
  tickets: CommandTicketFacts[],
): Promise<string | null> {
  if (tickets.length === 0) return null;
  const orderIds = new Set(tickets.map((t) => t.orderId));
  const tierIds = new Set(tickets.map((t) => t.ticketTypeId));
  if (orderIds.size !== 1 || tierIds.size !== 1) return null;
  const orderId = tickets[0]!.orderId;
  const ticketTypeId = tickets[0]!.ticketTypeId;
  if (!orderId || !ticketTypeId) return null;

  const order = await loose(admin)
    .from("orders")
    .select("id, status, user_id, event_id, checkout_attempt_id")
    .eq("id", orderId)
    .maybeSingle();
  if (order.error || !order.data) return null;
  if (str(order.data["status"]) !== "paid") return null;
  const linkedAttemptId = str(order.data["checkout_attempt_id"]);
  if (!linkedAttemptId || str(order.data["id"]) !== orderId) return null;

  const attempts = await loose(admin)
    .from("checkout_attempts")
    .select("payment_intent_id")
    .eq("id", linkedAttemptId)
    .eq("event_id", str(order.data["event_id"]))
    .eq("user_id", str(order.data["user_id"]))
    .eq("ticket_type_id", ticketTypeId)
    .eq("status", "completed")
    .eq("provider", "stripe_test");
  if (attempts.error || !attempts.data) return null;

  return attempts.data.length === 1 ? str(attempts.data[0]?.["payment_intent_id"]) || null : null;
}

/**
 * Membership gate. `memberships` MUST have been read with the caller's own
 * RLS-scoped client. `box_office` and every other role are denied.
 */
export function authorizeRefundCommand(args: {
  memberships: Parameters<typeof evaluateRefundEligibilityAuthorization>[0]["memberships"];
  eventId: string;
  userId: string;
}): { ok: true } | { ok: false; code: "forbidden" | "server_error" } {
  const decision = evaluateRefundEligibilityAuthorization(args);
  if (decision.ok) return { ok: true };
  return { ok: false, code: decision.code === "server_error" ? "server_error" : "forbidden" };
}

export interface AuthorizedRefundCommandOptions {
  /** Service-role client. Only reached AFTER authorization succeeds. */
  admin: unknown;
  env: StripeRefundEnv;
  transport: StripeTransport;
  input: unknown;
  /** Injected only so tests can prove delegation; defaults to Gate 88. */
  coordinator?: (options: {
    admin: unknown;
    env: StripeRefundEnv;
    transport: StripeTransport;
    input: { ticketIds: string[]; paymentIntentId: string };
  }) => Promise<{ outcome: string; ticketsReversed: number }>;
}

/**
 * Runs the command for an ALREADY-AUTHORIZED organizer/admin caller.
 */
export async function executeAuthorizedRefundCommand(
  options: AuthorizedRefundCommandOptions,
): Promise<RefundCommandResult> {
  const parsed = parseRefundCommandInput(options.input);
  if (typeof parsed === "string") return commandResult(parsed);

  const tickets = await loadCommandTicketFacts(options.admin, parsed.eventId, parsed.ticketIds);
  if (!tickets) return commandResult("server_error");

  const results = evaluateRefundEligibility({
    eventId: parsed.eventId,
    ticketIds: parsed.ticketIds,
    tickets,
  });
  if (!isSelectionRefundable(results)) return commandResult("ineligible_selection");

  const selected = tickets.filter((t) => parsed.ticketIds.includes(t.id));
  const paymentIntentId = await resolveCommandPaymentIntent(options.admin, selected);
  if (!paymentIntentId) return commandResult("ineligible_selection");

  const coordinator =
    options.coordinator ??
    (async (args) => {
      const { coordinateTestRefund } = await import("@/lib/refund-coordinator.server");
      return coordinateTestRefund(args);
    });

  let outcome: { outcome: string; ticketsReversed: number };
  try {
    outcome = await coordinator({
      admin: options.admin,
      env: options.env,
      transport: options.transport,
      input: { ticketIds: parsed.ticketIds, paymentIntentId },
    });
  } catch {
    return commandResult("server_error");
  }

  const code = mapCoordinatorOutcome(outcome.outcome as never);
  return commandResult(code, code === "refunded" ? outcome.ticketsReversed : 0);
}
