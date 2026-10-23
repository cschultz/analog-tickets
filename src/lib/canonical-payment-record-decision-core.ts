/**
 * Gate 164 — pure, dependency-free decision packet for the single future
 * architecture choice: which internal payment field/reference should be the
 * canonical record for correlating an order, a checkout attempt, a refund
 * ledger row, and a webhook receipt record.
 *
 * Decision preparation only. Nothing here selects an option, reads or writes a
 * row, runs an RPC, contacts a provider, uses a credential, proposes a
 * migration for execution, or grants any authority. Every option is stated
 * against the Gate 163 static capability inventory, which is the source of
 * truth for what the schema and writers can express today.
 *
 * Privacy contract — this module carries only table and column names, fixed
 * option codes, repository paths, and prose. It never carries customer
 * identity, contact addresses, order/payment/provider identifiers, provider
 * brand literals, payloads, tokens, credentials, hosts, URLs, or raw examples.
 */

import {
  PAYMENT_CORRELATION_LINKAGES,
  summarizeCapability,
  type CapabilityClass,
} from "@/lib/payment-correlation-capability-core";

export const DECISION_PACKET_NOTICE =
  "Decision preparation only. This packet presents options and their consequences — it does not " +
  "select an option, add schema or writers, propose a migration for execution, change data, " +
  "contact a provider, use credentials, or create a user interface.";

/** The single question this packet exists to put in front of a decider. */
export const DECISION_QUESTION =
  "Which internal payment reference should be canonical for correlating an order, a checkout " +
  "attempt, a refund ledger row, and a webhook receipt record?";

/** Fixed option codes. No option is preferred, ranked, or selected here. */
export type OptionId =
  | "order_carries_payment_reference"
  | "order_line_carries_payment_reference"
  | "order_carries_attempt_reference"
  | "dedicated_correlation_table"
  | "status_quo_no_canonical_field";

/** How much of the correlation gap an option would close, stated structurally. */
export type CoverageClass = "closes_gap" | "partially_closes_gap" | "leaves_gap_open";

/** Effect on records that already exist, stated without proposing any repair. */
export type BackfillImplication =
  | "no_historical_effect"
  | "historical_rows_stay_uncorrelated"
  | "historical_rows_would_need_a_separately_approved_decision";

export interface DecisionOption {
  readonly id: OptionId;
  /** Plain-language shape of the option. */
  readonly shape: string;
  /** Where the canonical reference would live, or `null` for the status quo. */
  readonly carrier: string | null;
  readonly coverage: CoverageClass;
  /** What this option would make provable that is not provable today. */
  readonly makesProvable: readonly string[];
  /** What this option would still not solve. */
  readonly doesNotSolve: readonly string[];
  /** Compatibility with the current line-item model and existing writers. */
  readonly compatibility: readonly string[];
  readonly backfill: BackfillImplication;
  /** Security and privacy considerations raised by the option. */
  readonly privacy: readonly string[];
  /** Minimum separate approvals required before any later implementation. */
  readonly approvals: readonly string[];
  /** Repository evidence backing the option's premises. */
  readonly evidence: readonly string[];
}

const COMMON_EVIDENCE = [
  "docs/STAGING_GATE163_PAYMENT_CORRELATION_CAPABILITY.md",
  "src/lib/payment-correlation-capability-core.ts",
] as const;

export const CANONICAL_PAYMENT_DECISION_OPTIONS: readonly DecisionOption[] = [
  {
    id: "order_carries_payment_reference",
    shape:
      "The order carries the canonical payment reference, written by the finalization routine at " +
      "issuance and never repointed afterwards.",
    carrier: "public.orders (a payment reference column)",
    coverage: "closes_gap",
    makesProvable: [
      "an order can be tied authoritatively to a payment reference",
      "an order and a refund ledger row can be compared on the same reference",
      "a refunded order with no refund ledger row becomes a provable inconsistency rather than an uncorroborated one",
    ],
    doesNotSolve: [
      "which provider account and mode a reference belongs to remains undetermined",
      "a webhook receipt row still points at nothing internal",
      "an attempt that never completes still carries no reference",
    ],
    compatibility: [
      "additive to the existing line-item model; no existing column changes meaning",
      "one writer path, the finalization routine, would become responsible for the value",
      "readers that ignore the column keep working unchanged",
    ],
    backfill: "historical_rows_would_need_a_separately_approved_decision",
    privacy: [
      "a provider reference on the order widens what an order-scoped read can expose",
      "the column would need the same service-role-only treatment the refund ledger already has",
      "no client grant should follow from this decision",
    ],
    approvals: [
      "a provider decision naming the canonical payment field of record",
      "separately approved schema mutation authority",
      "separately approved writer mutation authority",
      "a separately approved decision covering records that already exist",
    ],
    evidence: [...COMMON_EVIDENCE, "src/integrations/supabase/types.ts"],
  },
  {
    id: "order_line_carries_payment_reference",
    shape:
      "The order line carries the canonical payment reference, matching the first-class line-item " +
      "identity already used by tickets and refund ledger rows.",
    carrier: "public.order_items (a payment reference column)",
    coverage: "closes_gap",
    makesProvable: [
      "a line, its tickets, its refund ledger rows, and a payment reference all sit on one identity",
      "partial refunds can be reasoned about per line without an order-level join",
    ],
    doesNotSolve: [
      "which provider account and mode a reference belongs to remains undetermined",
      "a webhook receipt row still points at nothing internal",
      "an order spanning several lines has no single order-level reference unless one is derived",
    ],
    compatibility: [
      "aligns with the existing line-identity model used by tickets and the refund ledger",
      "repeats the same reference across every line of one payment, so uniqueness cannot be assumed per row",
      "additive; no existing column changes meaning",
    ],
    backfill: "historical_rows_would_need_a_separately_approved_decision",
    privacy: [
      "spreads a provider reference across more rows than the order-level option",
      "service-role-only treatment would be required on the carrying column",
    ],
    approvals: [
      "a provider decision naming the canonical payment field of record",
      "separately approved schema mutation authority",
      "separately approved writer mutation authority",
      "a separately approved decision covering records that already exist",
    ],
    evidence: [...COMMON_EVIDENCE, "docs/STAGING_GATE159_LINE_ITEM_RELEASE_READINESS.md"],
  },
  {
    id: "order_carries_attempt_reference",
    shape:
      "The order carries a durable reference to the checkout attempt that produced it, and the " +
      "attempt remains the only holder of the payment reference.",
    carrier: "public.orders (a checkout attempt reference column)",
    coverage: "partially_closes_gap",
    makesProvable: [
      "an order can be tied authoritatively to the attempt that produced it",
      "an order reaches a payment reference indirectly whenever the attempt was correlated",
    ],
    doesNotSolve: [
      "an attempt whose completion delivery never arrived still carries no payment reference, so the order still reaches none",
      "the correlation is one hop long and fails silently when the hop is empty",
      "a webhook receipt row still points at nothing internal",
    ],
    compatibility: [
      "smallest schema surface of the carrying options: one reference column on the order",
      "reuses the attempt column that already exists rather than duplicating a provider value",
      "every reader would need the join, so reporting code grows rather than shrinks",
    ],
    backfill: "historical_rows_stay_uncorrelated",
    privacy: [
      "keeps the provider reference confined to the attempt record, the narrowest exposure of the carrying options",
      "an internal attempt reference is not a provider secret, but remains service-role-only material",
    ],
    approvals: [
      "separately approved schema mutation authority",
      "separately approved writer mutation authority",
      "a recorded decision on provider-origin delivery, without which the hop stays frequently empty",
    ],
    evidence: [...COMMON_EVIDENCE, "src/lib/checkout.server.ts"],
  },
  {
    id: "dedicated_correlation_table",
    shape:
      "A dedicated correlation record holds the payment reference alongside references to the order, " +
      "the attempt, and the webhook receipt row, and no existing table gains a payment column.",
    carrier: "a dedicated correlation record",
    coverage: "closes_gap",
    makesProvable: [
      "every internal record involved in one payment can be reached from a single row",
      "a webhook receipt row gains an internal correlation for the first time",
      "correlation history can be appended to without changing the meaning of any existing table",
    ],
    doesNotSolve: [
      "which provider account and mode a reference belongs to remains undetermined",
      "nothing is correlated unless a writer creates the correlation record at the right moment",
      "it adds a table whose absence is silent rather than a column whose absence is visible",
    ],
    compatibility: [
      "no existing column changes meaning and no existing writer changes its current output",
      "the largest new surface of the options: one table, its access rules, and at least two writer paths",
      "correlation quality depends entirely on writer discipline at issuance and at receipt",
    ],
    backfill: "historical_rows_stay_uncorrelated",
    privacy: [
      "concentrates provider references in one place, which is easier to restrict and easier to over-expose",
      "would require service-role-only access rules from the outset and no client grant",
    ],
    approvals: [
      "a provider decision naming the canonical payment field of record",
      "separately approved schema mutation authority",
      "separately approved writer mutation authority",
      "a separately approved access-rule decision for the new record class",
    ],
    evidence: [...COMMON_EVIDENCE, "src/routes/api/public/payment-webhook.ts"],
  },
  {
    id: "status_quo_no_canonical_field",
    shape:
      "No canonical payment reference is introduced; correlation stays where it is today, and " +
      "order-level payment questions remain unanswerable by design.",
    carrier: null,
    coverage: "leaves_gap_open",
    makesProvable: [],
    doesNotSolve: [
      "an order cannot be tied to a payment, to its attempt, or to a webhook receipt row",
      "a refunded order without refund ledger evidence stays uncorroborated for ever",
      "operator reconciliation has no authoritative basis to work from",
    ],
    compatibility: [
      "zero change, zero risk, and zero new writer responsibility",
      "keeps the current privacy surface exactly as audited",
    ],
    backfill: "no_historical_effect",
    privacy: [
      "narrowest possible exposure: no additional provider reference is stored anywhere",
    ],
    approvals: ["a recorded decision to accept the gap, so it is deliberate rather than unnoticed"],
    evidence: [...COMMON_EVIDENCE, "docs/STAGING_GATE162_REFUND_EVIDENCE_CROSS_CHECK.md"],
  },
] as const;

export interface DecisionPacketSummary {
  readonly gate: 164;
  readonly question: string;
  /** Always `null`. This packet prepares a decision; it never makes one. */
  readonly selectedOption: null;
  readonly optionCount: number;
  readonly optionIds: readonly OptionId[];
  readonly byCoverage: Record<CoverageClass, number>;
  /** Gate 163's verdict on order-to-payment correlation, carried forward unchanged. */
  readonly baselineOrderToPaymentCapability: CapabilityClass;
  readonly baselineLinkageCount: number;
  readonly notice: string;
}

export function summarizeDecisionPacket(
  options: readonly DecisionOption[] = CANONICAL_PAYMENT_DECISION_OPTIONS,
): DecisionPacketSummary {
  const byCoverage: Record<CoverageClass, number> = {
    closes_gap: 0,
    partially_closes_gap: 0,
    leaves_gap_open: 0,
  };
  for (const option of options) byCoverage[option.coverage] += 1;
  return {
    gate: 164,
    question: DECISION_QUESTION,
    selectedOption: null,
    optionCount: options.length,
    optionIds: options.map((o) => o.id),
    byCoverage,
    baselineOrderToPaymentCapability: summarizeCapability().orderToPaymentCapability,
    baselineLinkageCount: PAYMENT_CORRELATION_LINKAGES.length,
    notice: DECISION_PACKET_NOTICE,
  };
}

/** Every approval that would be needed under at least one option, de-duplicated and sorted. */
export function requiredApprovals(
  options: readonly DecisionOption[] = CANONICAL_PAYMENT_DECISION_OPTIONS,
): readonly string[] {
  const out = new Set<string>();
  for (const option of options) for (const approval of option.approvals) out.add(approval);
  return [...out].sort();
}

/** Options that would close the order-to-payment gap in full, sorted by id. */
export function optionsClosingTheGap(
  options: readonly DecisionOption[] = CANONICAL_PAYMENT_DECISION_OPTIONS,
): readonly OptionId[] {
  return options
    .filter((o) => o.coverage === "closes_gap")
    .map((o) => o.id)
    .slice()
    .sort();
}
