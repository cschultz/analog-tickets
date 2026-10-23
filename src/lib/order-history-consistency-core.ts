/**
 * Gate 161 — pure, dependency-free historical-consistency diagnostic for one
 * synthetic order, compared against its first-class line items, issued
 * tickets, and the refund ledger.
 *
 * Diagnostic only. Nothing here (or in any module importing it) writes a row,
 * runs an RPC, infers a missing amount, proposes a transition, or authorises a
 * repair. A finding is an observation that a human may look at; it is neither
 * approval nor authority to change historical data (see Gate 155).
 *
 * Privacy contract — the projection carries only a deterministic correlation
 * pseudonym, the order's own lifecycle status, deterministic classification
 * and explanation codes. It never carries customer identity, contact
 * addresses, order/payment/provider identifiers, tokens, credentials, hosts,
 * or raw errors.
 */

import { lineReference } from "@/lib/line-drift-report-core";

/** Order lifecycle states this contract recognises. Anything else is unknown. */
const KNOWN_STATUSES = ["pending", "paid", "cancelled", "refunded"] as const;
export type KnownOrderStatus = (typeof KNOWN_STATUSES)[number];

/** Facts read from the database. Counts and sums only — never identity. */
export interface OrderHistoryFacts {
  /** `public.orders.id`; pseudonymised before it ever leaves this module. */
  orderId: string;
  status: string;
  totalCents: number;
  currency: string | null;
  lineCount: number;
  lineQuantityTotal: number;
  lineAmountCents: number;
  issuedTicketCount: number;
  refundLedgerRowCount: number;
}

/** Safe explanation codes. No free text, no raw values, no repair guidance. */
export type OrderConsistencyCode =
  | "unknown_order_state"
  | "incomplete_order_facts"
  | "paid_order_without_line_evidence"
  | "line_total_does_not_match_order_total"
  | "issued_tickets_do_not_match_line_quantity"
  | "refunded_order_without_refund_ledger_evidence"
  | "refund_ledger_evidence_without_refunded_status"
  | "open_order_with_fulfilment_evidence";

/** Ordered by diagnostic precedence; the first present code classifies. */
const CODE_PRECEDENCE: OrderConsistencyCode[] = [
  "unknown_order_state",
  "incomplete_order_facts",
  "refunded_order_without_refund_ledger_evidence",
  "refund_ledger_evidence_without_refunded_status",
  "paid_order_without_line_evidence",
  "line_total_does_not_match_order_total",
  "issued_tickets_do_not_match_line_quantity",
  "open_order_with_fulfilment_evidence",
];

export type OrderConsistencyClassification = "consistent" | OrderConsistencyCode;

/** The only fields this contract ever returns. */
export interface OrderConsistencyFinding {
  orderRef: string;
  status: KnownOrderStatus | "unknown";
  classification: OrderConsistencyClassification;
  codes: OrderConsistencyCode[];
  reviewRequired: boolean;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Classifies one order deterministically. Infers nothing. */
export function diagnoseOrderHistory(facts: OrderHistoryFacts): OrderConsistencyFinding {
  const codes: OrderConsistencyCode[] = [];
  const known = (KNOWN_STATUSES as readonly string[]).includes(facts.status);
  const status: KnownOrderStatus | "unknown" = known
    ? (facts.status as KnownOrderStatus)
    : "unknown";
  if (!known) codes.push("unknown_order_state");

  const factsComplete =
    isCount(facts.totalCents) &&
    isCount(facts.lineCount) &&
    isCount(facts.lineQuantityTotal) &&
    isCount(facts.lineAmountCents) &&
    isCount(facts.issuedTicketCount) &&
    isCount(facts.refundLedgerRowCount) &&
    typeof facts.currency === "string" &&
    facts.currency.length > 0;
  if (!factsComplete) codes.push("incomplete_order_facts");

  if (known && factsComplete) {
    const settled = status === "paid" || status === "refunded";
    if (status === "refunded" && facts.refundLedgerRowCount === 0)
      codes.push("refunded_order_without_refund_ledger_evidence");
    if (status !== "refunded" && facts.refundLedgerRowCount > 0)
      codes.push("refund_ledger_evidence_without_refunded_status");
    if (settled && facts.lineCount === 0) codes.push("paid_order_without_line_evidence");
    if (facts.lineCount > 0 && facts.lineAmountCents !== facts.totalCents)
      codes.push("line_total_does_not_match_order_total");
    if (facts.lineCount > 0 && facts.issuedTicketCount !== facts.lineQuantityTotal)
      codes.push("issued_tickets_do_not_match_line_quantity");
    if (!settled && (facts.lineCount > 0 || facts.issuedTicketCount > 0))
      codes.push("open_order_with_fulfilment_evidence");
  }

  const classification: OrderConsistencyClassification =
    CODE_PRECEDENCE.find((code) => codes.includes(code)) ?? "consistent";

  return {
    orderRef: lineReference(facts.orderId),
    status,
    classification,
    codes,
    reviewRequired: codes.length > 0,
  };
}

export interface OrderHistoryDiagnosticSummary {
  orderCount: number;
  reviewRequiredCount: number;
  byClassification: Record<string, number>;
  byCode: Record<string, number>;
  byStatus: Record<string, number>;
}

export function summarizeOrderHistory(
  findings: OrderConsistencyFinding[],
): OrderHistoryDiagnosticSummary {
  const byClassification: Record<string, number> = {};
  const byCode: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let reviewRequiredCount = 0;
  for (const finding of findings) {
    byClassification[finding.classification] = (byClassification[finding.classification] ?? 0) + 1;
    byStatus[finding.status] = (byStatus[finding.status] ?? 0) + 1;
    for (const code of finding.codes) byCode[code] = (byCode[code] ?? 0) + 1;
    if (finding.reviewRequired) reviewRequiredCount += 1;
  }
  return {
    orderCount: findings.length,
    reviewRequiredCount,
    byClassification,
    byCode,
    byStatus,
  };
}

/** Diagnoses many orders. Ordering is left to the caller. */
export function buildOrderHistoryDiagnostic(orders: OrderHistoryFacts[]): {
  findings: OrderConsistencyFinding[];
  summary: OrderHistoryDiagnosticSummary;
} {
  const findings = orders.map(diagnoseOrderHistory);
  return { findings, summary: summarizeOrderHistory(findings) };
}

/**
 * Explicit, machine-readable disclaimer carried alongside every run: findings
 * are observations, never approval or authority to repair historical data.
 */
export const DIAGNOSTIC_AUTHORITY_NOTICE =
  "diagnostic only: findings are observations and are neither approval nor authority to repair historical data";
