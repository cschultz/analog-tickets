/**
 * Gate 93 — pure, dependency-free logic for the private staging authenticated
 * refund *command*.
 *
 * Nothing here performs I/O. It owns: request parsing, the all-eligible
 * selection rule, and the mapping from Gate 88 coordinator outcomes to
 * non-sensitive result codes. No provider detail, ledger state, payment
 * reference, amount, or raw error is ever representable in the result.
 */
import {
  evaluateRefundEligibility,
  isUuid,
  type RefundEligibilityResult,
} from "@/lib/refund-eligibility-core";
import { MAX_REVERSAL_SELECTION } from "@/lib/refund-reversal-core";
import type { RefundOutcome } from "@/lib/refund-coordinator-core";

export { evaluateRefundEligibility };

/** Hard ceiling on one command selection; mirrors the Gate 87 SQL routine. */
export const MAX_REFUND_COMMAND_SELECTION = MAX_REVERSAL_SELECTION;

/** Every code the command can return. Generic and non-enumerating by design. */
export const REFUND_COMMAND_CODES = [
  "refunded",
  "already_refunded",
  "in_progress",
  "ineligible_selection",
  "unauthorized",
  "forbidden",
  "invalid_request",
  "server_error",
] as const;

export type RefundCommandCode = (typeof REFUND_COMMAND_CODES)[number];

export const REFUND_COMMAND_MESSAGE: Record<RefundCommandCode, string> = {
  refunded: "Refund completed.",
  already_refunded: "Already refunded.",
  in_progress: "Refund already in progress.",
  ineligible_selection: "Selection is not refundable.",
  unauthorized: "Authentication required.",
  forbidden: "Not permitted.",
  invalid_request: "Invalid request.",
  server_error: "Service unavailable.",
};

export interface RefundCommandInput {
  eventId: string;
  ticketIds: string[];
}

/**
 * Accepts `{ eventId, ticketIds[] }` and nothing else. Any client-supplied
 * amount, price, payment, provider, order, refundability, or customer field is
 * ignored: those facts are only ever re-derived server-side.
 */
export function parseRefundCommandInput(
  body: unknown,
): RefundCommandInput | "invalid_request" {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const eventId = raw["eventId"];
  const ticketIds = raw["ticketIds"];
  if (!isUuid(eventId)) return "invalid_request";
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) return "invalid_request";
  if (ticketIds.length > MAX_REFUND_COMMAND_SELECTION) return "invalid_request";
  if (!ticketIds.every(isUuid)) return "invalid_request";
  return { eventId, ticketIds: Array.from(new Set(ticketIds as string[])) };
}

/**
 * The command refunds all-or-nothing. Unknown, cross-event, checked-in,
 * nonrefundable, and non-issued tickets collapse to one generic denial, so a
 * caller can never distinguish "does not exist" from "not refundable".
 */
export function isSelectionRefundable(results: RefundEligibilityResult[]): boolean {
  return results.length > 0 && results.every((result) => result.eligible);
}

/** Coordinator outcome -> caller-visible code. Nothing sensitive survives. */
export function mapCoordinatorOutcome(outcome: RefundOutcome): RefundCommandCode {
  switch (outcome) {
    case "refunded":
      return "refunded";
    case "idempotent_replay":
      return "already_refunded";
    case "attempt_in_progress":
      return "in_progress";
    case "invalid_selection":
    case "invalid_payment_reference":
    case "duplicate_ticket_ids":
    case "ineligible_selection":
      return "ineligible_selection";
    // Provider failure, misconfiguration, a prior failed attempt, and any
    // reconciliation-needed state are all opaque: no detail, and no retry hint
    // that could drive a second provider call.
    default:
      return "server_error";
  }
}

export interface RefundCommandResult {
  ok: boolean;
  code: RefundCommandCode;
  /** Count only; never an amount, reference, or provider payload. */
  ticketsRefunded: number;
}

export function commandResult(code: RefundCommandCode, ticketsRefunded = 0): RefundCommandResult {
  return { ok: code === "refunded", code, ticketsRefunded };
}
