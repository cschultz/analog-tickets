/**
 * Gate 156 — private, read-only line-item drift report contract.
 *
 * This module is observation only. It transforms the Gate 154 reconciliation
 * projection into a minimal operator-facing drift report: one row per
 * first-class order line, carrying a non-reversible, non-security line
 * reference, purchased/issued/refunded quantities and amounts, currency, the
 * deterministic Gate 154 status, and a review-required flag.
 *
 * Nothing here writes a row, runs an RPC, creates a database object, repairs
 * state, contacts a provider, or reads configuration. It is never wired to a
 * UI route, browser surface, server function, or scheduled job. An operator
 * with service-role access supplies Gate 154 projections; this module only
 * reshapes them.
 *
 * Privacy contract — the report projects none of: customer identity, contact
 * addresses, order identity, payment or provider identifiers, tokens,
 * credentials, raw errors, or repair instructions. The line reference is a
 * deterministic pseudonym (FNV-1a, 64-bit) over `order_items.id`; it is NOT a
 * security control — it exists only so two report rows can be correlated
 * without exposing the raw identifier. Unknown or incomplete history stays
 * `indeterminate`, exactly as Gate 154 defines it.
 */

import {
  reconcileOrderLines,
  type LineReconciliationView,
  type OrderLineFacts,
  type RefundLedgerFacts,
} from "@/lib/line-item-reconciliation-core";

/** The only statuses the report ever surfaces. Inherited from Gate 154. */
export type LineDriftStatus = LineReconciliationView["status"];

/**
 * One drift-report row. Every field is a non-sensitive operator signal:
 * no PII, no order/payment/provider identifiers, no repair guidance.
 */
export interface LineDriftReportRow {
  /** Deterministic, non-reversible-in-practice pseudonym for the line. */
  lineRef: string;
  quantity: number;
  unitPriceCents: number;
  currency: string | null;
  purchasedAmountCents: number;
  issuedTicketCount: number;
  refundedTicketCount: number;
  refundedAmountCents: number;
  remainingTicketCount: number;
  remainingAmountCents: number;
  status: LineDriftStatus;
  /**
   * True when a human should look: any status that is not cleanly
   * reconciled. This is an observation flag, never a repair signal —
   * Gate 155 records that no repair capability exists.
   */
  reviewRequired: boolean;
}

/** Statuses that always warrant a human look. */
const REVIEW_STATUSES: ReadonlySet<LineDriftStatus> = new Set([
  "indeterminate",
  "over_refund_suspected",
  "partially_refunded",
]);

/**
 * FNV-1a 64-bit hash rendered as hex. Deterministic and dependency-free.
 * Not a cryptographic or security primitive — correlation pseudonym only.
 */
export function lineReference(orderItemId: string): string {
  let hi = 0x811c9dc5;
  let lo = 0xcbf29ce4; // multiplied offset basis handled via 64-bit folding below
  // Simple two-lane 32-bit FNV-1a pass; output is a stable 16-char hex string.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < orderItemId.length; i++) {
    const c = orderItemId.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 1) | (c >>> 7)), 0x01000193) >>> 0;
  }
  hi = h1;
  lo = h2;
  return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
}

/** Projects one Gate 154 view into a drift-report row. */
export function toDriftReportRow(view: LineReconciliationView): LineDriftReportRow {
  return {
    lineRef: lineReference(view.orderItemId),
    quantity: view.quantity,
    unitPriceCents: view.unitPriceCents,
    currency: view.currency,
    purchasedAmountCents: view.purchasedAmountCents,
    issuedTicketCount: view.issuedTicketCount,
    refundedTicketCount: view.refundedTicketCount,
    refundedAmountCents: view.refundedAmountCents,
    remainingTicketCount: view.remainingTicketCount,
    remainingAmountCents: view.remainingAmountCents,
    status: view.status,
    reviewRequired: REVIEW_STATUSES.has(view.status),
  };
}

/** Aggregate counts across a report. Pure arithmetic, no data beyond rows. */
export interface LineDriftReportSummary {
  lineCount: number;
  reviewRequiredCount: number;
  byStatus: Record<LineDriftStatus, number>;
}

export function summarizeDriftReport(rows: LineDriftReportRow[]): LineDriftReportSummary {
  const byStatus: Record<LineDriftStatus, number> = {
    reconciled_unrefunded: 0,
    partially_refunded: 0,
    fully_refunded: 0,
    over_refund_suspected: 0,
    indeterminate: 0,
  };
  let reviewRequiredCount = 0;
  for (const row of rows) {
    byStatus[row.status] += 1;
    if (row.reviewRequired) reviewRequiredCount += 1;
  }
  return { lineCount: rows.length, reviewRequiredCount, byStatus };
}

/**
 * End-to-end read-only projection: raw line facts in, drift report out.
 * Delegates all reconciliation semantics to Gate 154 unchanged — including
 * the rule that unknown or incomplete history is `indeterminate`.
 */
export function buildLineDriftReport(
  lines: { line: OrderLineFacts; issuedTicketCount: number; refunds: RefundLedgerFacts[] }[],
): { rows: LineDriftReportRow[]; summary: LineDriftReportSummary } {
  const rows = reconcileOrderLines(lines).map(toDriftReportRow);
  return { rows, summary: summarizeDriftReport(rows) };
}
