/**
 * Gate 162 — pure, dependency-free cross-check of a single Gate 161
 * review finding ("order marked refunded with no line-level refund ledger
 * evidence") against internal checkout-attempt and payment-webhook-ledger
 * evidence.
 *
 * Diagnostic only. Nothing here writes a row, runs an RPC, contacts a
 * provider, infers a refund, an amount, or a transition, or authorises any
 * repair. Absence of evidence is reported as absence — never as a conclusion
 * that a refund did or did not occur.
 *
 * Privacy contract — the projection carries only a deterministic correlation
 * pseudonym, the order's lifecycle status, fixed classification/evidence
 * codes, and small non-identifying category counts. It never carries customer
 * identity, contact addresses, order/payment/provider identifiers, webhook
 * payloads, tokens, credentials, hosts, or raw errors.
 */

import { lineReference } from "@/lib/line-drift-report-core";

/** The only Gate 161 classification this cross-check accepts. */
export const ELIGIBLE_GATE161_CLASSIFICATION =
  "refunded_order_without_refund_ledger_evidence" as const;

/** Internal evidence facts. Counts and booleans only — never identity. */
export interface RefundEvidenceFacts {
  /** `public.orders.id`; pseudonymised before it ever leaves this module. */
  orderId: string;
  orderStatus: string;
  /** Classification carried over from the Gate 161 diagnostic. */
  gate161Classification: string;
  refundLedgerRowCount: number;
  /**
   * Attempts sharing this order's buyer, event, and ticket type. This is a
   * weak correlation only: it proves association, never payment identity.
   */
  weaklyCorrelatedAttemptCount: number;
  weaklyCorrelatedAttemptsByStatus: Record<string, number>;
  /** Attempts carrying a payment reference (the only authoritative link). */
  attemptsWithPaymentReferenceCount: number;
  /** Ledger rows that can be authoritatively tied to this order. */
  correlatableWebhookEventCount: number;
  /** Correlatable ledger rows whose category indicates a refund. */
  correlatableRefundWebhookEventCount: number;
}

export type RefundEvidenceCode =
  | "ineligible_finding"
  | "refund_ledger_empty_for_order"
  | "no_attempt_carries_payment_reference"
  | "no_correlatable_webhook_ledger_row"
  | "weakly_correlated_attempts_present"
  | "completed_attempt_present"
  | "correlatable_refund_webhook_event_present";

export type RefundEvidenceClassification =
  | "ineligible_finding"
  | "refund_evidence_present"
  | "authoritative_payment_correlation_absent"
  | "correlated_without_refund_evidence";

export interface RefundEvidenceCrossCheck {
  orderRef: string;
  status: string;
  classification: RefundEvidenceClassification;
  codes: RefundEvidenceCode[];
  weaklyCorrelatedAttemptsByStatus: Record<string, number>;
  reviewRequired: boolean;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Cross-checks one finding deterministically. Infers nothing. */
export function crossCheckRefundEvidence(facts: RefundEvidenceFacts): RefundEvidenceCrossCheck {
  const orderRef = lineReference(facts.orderId);
  const byStatus = facts.weaklyCorrelatedAttemptsByStatus ?? {};

  if (
    facts.gate161Classification !== ELIGIBLE_GATE161_CLASSIFICATION ||
    facts.orderStatus !== "refunded" ||
    !isCount(facts.refundLedgerRowCount) ||
    !isCount(facts.weaklyCorrelatedAttemptCount) ||
    !isCount(facts.attemptsWithPaymentReferenceCount) ||
    !isCount(facts.correlatableWebhookEventCount) ||
    !isCount(facts.correlatableRefundWebhookEventCount)
  ) {
    return {
      orderRef,
      status: typeof facts.orderStatus === "string" ? facts.orderStatus : "unknown",
      classification: "ineligible_finding",
      codes: ["ineligible_finding"],
      weaklyCorrelatedAttemptsByStatus: {},
      reviewRequired: false,
    };
  }

  const codes: RefundEvidenceCode[] = [];
  if (facts.refundLedgerRowCount === 0) codes.push("refund_ledger_empty_for_order");
  if (facts.attemptsWithPaymentReferenceCount === 0)
    codes.push("no_attempt_carries_payment_reference");
  if (facts.correlatableWebhookEventCount === 0) codes.push("no_correlatable_webhook_ledger_row");
  if (facts.weaklyCorrelatedAttemptCount > 0) codes.push("weakly_correlated_attempts_present");
  if ((byStatus["completed"] ?? 0) > 0) codes.push("completed_attempt_present");
  if (facts.correlatableRefundWebhookEventCount > 0)
    codes.push("correlatable_refund_webhook_event_present");

  let classification: RefundEvidenceClassification;
  if (facts.refundLedgerRowCount > 0 || facts.correlatableRefundWebhookEventCount > 0)
    classification = "refund_evidence_present";
  else if (facts.attemptsWithPaymentReferenceCount === 0 || facts.correlatableWebhookEventCount === 0)
    classification = "authoritative_payment_correlation_absent";
  else classification = "correlated_without_refund_evidence";

  return {
    orderRef,
    status: facts.orderStatus,
    classification,
    codes,
    weaklyCorrelatedAttemptsByStatus: { ...byStatus },
    reviewRequired: true,
  };
}

/**
 * Explicit, machine-readable disclaimer carried alongside every run. Absence
 * of evidence is not a finding that a refund is owed, missing, or repairable.
 */
export const CROSS_CHECK_AUTHORITY_NOTICE =
  "diagnostic only: absence of evidence is not proof of a refund, and this cross-check is neither approval nor authority to repair historical data";
