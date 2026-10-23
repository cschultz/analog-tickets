/**
 * Gate 166 — pure, static preflight for a *future* additive link between the
 * internal webhook ledger and the checkout attempt a delivery concerns.
 *
 * Design preparation only. Nothing here reads a database, calls a provider,
 * performs I/O, or is imported by any route, writer, or browser module. It
 * carries no identifier, address, host, credential, or provider brand literal.
 */

export const PREFLIGHT_AUTHORITY_NOTICE =
  "design preflight only: no schema, writer, data, route, grant or provider change is " +
  "made or authorised here; implementation requires separate explicit approval";

/** Availability of a durable attempt reference at the moment of receipt. */
export type CorrelationAvailability = "available" | "unavailable";

export interface ReceiverBranch {
  /** Stable internal branch name, not a provider event literal. */
  readonly branch: "completion" | "expiry" | "refund_candidate" | "unsupported";
  /** Is our own opaque attempt id present in the verified payload? */
  readonly attemptReferenceAtReceipt: CorrelationAvailability;
  /** Where the branch writes its ledger row. */
  readonly ledgerWriters: readonly string[];
  /** Terminal ledger statuses this branch can record. */
  readonly ledgerStatuses: readonly string[];
}

export const RECEIVER_BRANCHES: readonly ReceiverBranch[] = [
  {
    branch: "completion",
    attemptReferenceAtReceipt: "available",
    ledgerWriters: ["recordWebhookEvent", "markWebhookEventStatus"],
    ledgerStatuses: ["processed"],
  },
  {
    branch: "expiry",
    attemptReferenceAtReceipt: "available",
    ledgerWriters: ["recordWebhookEvent", "markWebhookEventStatus"],
    ledgerStatuses: ["processed", "ignored"],
  },
  {
    branch: "refund_candidate",
    attemptReferenceAtReceipt: "unavailable",
    ledgerWriters: ["recordWebhookEvent"],
    ledgerStatuses: ["processed", "ignored"],
  },
  {
    branch: "unsupported",
    attemptReferenceAtReceipt: "unavailable",
    ledgerWriters: [],
    ledgerStatuses: [],
  },
];

/**
 * Deterministic: a durable attempt reference may be recorded on a ledger row
 * only for branches that already parse our own opaque attempt id out of the
 * verified body. Nothing is ever inferred, looked up, or guessed.
 */
export function decideLedgerCorrelation(branch: ReceiverBranch): {
  readonly record: boolean;
  readonly reason:
    | "attempt_reference_present_in_verified_payload"
    | "no_attempt_reference_at_receipt"
    | "branch_writes_no_ledger_row";
} {
  if (branch.ledgerWriters.length === 0) {
    return { record: false, reason: "branch_writes_no_ledger_row" };
  }
  if (branch.attemptReferenceAtReceipt === "available") {
    return { record: true, reason: "attempt_reference_present_in_verified_payload" };
  }
  return { record: false, reason: "no_attempt_reference_at_receipt" };
}

/** The single minimal-change candidate this preflight puts forward. */
export const MINIMAL_CHANGE_CANDIDATE = {
  placement: "public.payment_webhook_events.checkout_attempt_id",
  type: "uuid",
  nullable: true,
  hasDefault: false,
  foreignKey: "public.checkout_attempts(id)",
  onDelete: "RESTRICT",
  onUpdate: "RESTRICT",
  unique: false,
  uniqueRationale:
    "many deliveries may legitimately concern one attempt, so uniqueness would be wrong here",
  idempotencyKeyUnchanged: true,
  idempotencyKey: "external_event_id",
  writerBoundary:
    "set once, inside the existing service-role ledger insert, from the already-parsed attempt id",
  updatePathAdded: false,
  whenUnavailable: "leave null and change nothing else about the delivery",
  historicalRows: "remain null; no backfill and no repair path",
  browserExposure: "none; the ledger has no browser grant and no policy",
  behaviourChange: "none: no status, acknowledgement body, retry, or effect changes",
  requiresProviderOriginDelivery: false,
} as const;

/** Questions this preflight cannot answer from source and schema alone. */
export const UNKNOWNS: readonly string[] = [
  "whether a ledger row should also be written for branches that currently write none",
  "which provider account and mode a stored reference belongs to",
  "whether historical ledger rows will ever need a correlation, and under whose authority",
  "whether an operator-facing reconciliation surface will read this link",
];
