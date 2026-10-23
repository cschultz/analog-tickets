/**
 * Gate 163 — pure, dependency-free inventory of the fields and writer paths
 * that can (or cannot) authoritatively correlate an order, an order line, a
 * checkout attempt, and the internal payment webhook ledger.
 *
 * Static capability inventory only. Nothing here reads or writes a row, runs
 * an RPC, contacts a provider, proposes a migration, backfill, or repair, or
 * grants any authority. Every entry is backed by source or migration evidence,
 * never by observed staging data.
 *
 * Privacy contract — this module carries only table and column names, writer
 * file paths, fixed classification codes, and prose. It never carries customer
 * identity, contact addresses, order/payment/provider identifiers, webhook
 * payloads, tokens, credentials, hosts, URLs, or raw record identifiers.
 */

/** Fixed capability classes. */
export type CapabilityClass = "authoritative" | "contextual_only" | "absent" | "unknown";

/** How a linkage is (or is not) carried in the schema. */
export type LinkageMechanism =
  | "foreign_key"
  | "writer_assigned_column"
  | "provider_echoed_field"
  | "shared_attribute"
  | "none";

/** Whether the carrying column is guaranteed to hold a value. */
export type PopulationGuarantee = "always" | "when_payment_correlated" | "never" | "unknown";

export interface CorrelationLinkage {
  /** Stable machine code for this linkage. */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly mechanism: LinkageMechanism;
  /** Carrying column, or `null` when nothing carries the linkage. */
  readonly column: string | null;
  /** Source or migration evidence: repository paths only. */
  readonly evidence: readonly string[];
  readonly populated: PopulationGuarantee;
  /** Exact prerequisites for authoritative future correlation. */
  readonly prerequisites: readonly string[];
}

export const CAPABILITY_AUTHORITY_NOTICE =
  "Static capability inventory only. It is evidence of what the schema and writers can express — " +
  "not approval, not a migration proposal, not authority to change schema, writers, data, or providers.";

/**
 * Deterministic classification. A linkage is authoritative only when a
 * declared column carries it and a writer can populate it; a linkage inferred
 * from shared attributes is contextual only; a linkage nothing carries is
 * absent; anything resting on an unmade decision is unknown.
 */
export function classifyLinkage(linkage: CorrelationLinkage): CapabilityClass {
  if (linkage.mechanism === "none" || linkage.populated === "never") return "absent";
  if (linkage.populated === "unknown") return "unknown";
  if (linkage.mechanism === "shared_attribute") return "contextual_only";
  if (!linkage.column) return "unknown";
  return "authoritative";
}

/** The inventory. Ordered from issuance identity outward to the provider. */
export const PAYMENT_CORRELATION_LINKAGES: readonly CorrelationLinkage[] = [
  {
    id: "order_line_to_order",
    from: "public.order_items",
    to: "public.orders",
    mechanism: "foreign_key",
    column: "order_items.order_id",
    evidence: [
      "supabase/migrations/20260906182918_d2df63aa-5446-4d30-89b2-f6f51c79fe65.sql",
      "docs/STAGING_GATE159_LINE_ITEM_RELEASE_READINESS.md",
    ],
    populated: "always",
    prerequisites: [],
  },
  {
    id: "ticket_to_order_line",
    from: "public.tickets",
    to: "public.order_items",
    mechanism: "writer_assigned_column",
    column: "tickets.order_item_id",
    evidence: [
      "drizzle/migrations/0000_gate149b_line_item_refund_additive_columns.sql",
      "drizzle/migrations/0004_gate151_line_item_writers.sql",
      "docs/STAGING_GATE153_TRANSFER_LINE_IDENTITY.md",
    ],
    populated: "always",
    prerequisites: [],
  },
  {
    id: "refund_ledger_to_order_line",
    from: "public.ticket_refunds",
    to: "public.order_items",
    mechanism: "writer_assigned_column",
    column: "ticket_refunds.order_item_id",
    evidence: [
      "drizzle/migrations/0000_gate149b_line_item_refund_additive_columns.sql",
      "drizzle/migrations/0004_gate151_line_item_writers.sql",
    ],
    populated: "always",
    prerequisites: [],
  },
  {
    id: "refund_ledger_to_payment",
    from: "public.ticket_refunds",
    to: "provider payment reference",
    mechanism: "writer_assigned_column",
    column: "ticket_refunds.payment_intent_id",
    evidence: ["src/lib/refund-reversal.server.ts", "src/lib/refund-coordinator.server.ts"],
    populated: "always",
    prerequisites: [],
  },
  {
    id: "refund_coordination_to_payment",
    from: "public.refund_coordination_attempts",
    to: "provider payment reference",
    mechanism: "writer_assigned_column",
    column: "refund_coordination_attempts.payment_intent_id",
    evidence: ["src/lib/refund-coordinator.server.ts", "src/lib/refund-reconciliation.server.ts"],
    populated: "always",
    prerequisites: [],
  },
  {
    id: "checkout_attempt_to_payment",
    from: "public.checkout_attempts",
    to: "provider payment reference",
    mechanism: "writer_assigned_column",
    column: "checkout_attempts.payment_intent_id",
    evidence: ["src/lib/checkout.server.ts", "src/routes/api/public/payment-webhook.ts"],
    // Written once, only after a verified completion delivery is processed;
    // an attempt that never completes keeps the column empty for ever.
    populated: "when_payment_correlated",
    prerequisites: [
      "a verified provider completion delivery must actually reach the receiver",
      "the delivery must carry the server-owned attempt reference the receiver expects",
    ],
  },
  {
    id: "checkout_attempt_to_reservation",
    from: "public.checkout_attempts",
    to: "the attempt's inventory hold",
    mechanism: "foreign_key",
    column: "checkout_attempts.reservation_id",
    evidence: ["src/lib/checkout.server.ts"],
    populated: "always",
    prerequisites: [],
  },
  {
    id: "order_to_checkout_attempt",
    from: "public.orders",
    to: "public.checkout_attempts",
    mechanism: "none",
    column: null,
    evidence: [
      "supabase/migrations/20260906182918_d2df63aa-5446-4d30-89b2-f6f51c79fe65.sql",
      "src/integrations/supabase/types.ts",
    ],
    populated: "never",
    prerequisites: [
      "a schema decision to carry a durable attempt reference on the order",
      "a writer decision inside the finalization routine to record it at issuance",
      "separately approved mutation authority before any such change is made",
    ],
  },
  {
    id: "order_to_payment",
    from: "public.orders",
    to: "provider payment reference",
    mechanism: "none",
    column: null,
    evidence: ["src/integrations/supabase/types.ts"],
    populated: "never",
    prerequisites: [
      "a provider decision naming the canonical payment field of record",
      "a schema decision to carry that reference on the order or on its line",
      "a writer decision to record it at finalization rather than after the fact",
      "separately approved mutation authority before any such change is made",
    ],
  },
  {
    id: "webhook_ledger_to_checkout_attempt",
    from: "public.payment_webhook_events",
    to: "public.checkout_attempts",
    mechanism: "none",
    column: null,
    evidence: ["src/lib/checkout.server.ts", "src/lib/stripe-webhook-core.ts"],
    // The attempt reference exists only inside the transient verified payload;
    // the ledger row persists provider, event id, type, and status alone.
    populated: "never",
    prerequisites: [
      "a schema decision to persist a correlation column on the ledger row",
      "a writer decision for the receiver to record it alongside the event id",
      "separately approved mutation authority before any such change is made",
    ],
  },
  {
    id: "webhook_ledger_to_provider_event",
    from: "public.payment_webhook_events",
    to: "provider event reference",
    mechanism: "writer_assigned_column",
    column: "payment_webhook_events.external_event_id",
    evidence: ["src/lib/checkout.server.ts", "src/routes/api/public/payment-webhook.ts"],
    populated: "always",
    prerequisites: [],
  },
  {
    id: "checkout_attempt_to_order_by_attributes",
    from: "public.checkout_attempts",
    to: "public.orders",
    mechanism: "shared_attribute",
    column: null,
    evidence: [
      "src/lib/refund-evidence-cross-check-core.ts",
      "docs/STAGING_GATE162_REFUND_EVIDENCE_CROSS_CHECK.md",
    ],
    populated: "always",
    prerequisites: [
      "shared buyer, event, and ticket type prove association only; they can never prove payment identity",
    ],
  },
  {
    id: "provider_account_and_mode_scope",
    from: "provider payment reference",
    to: "provider account and mode of record",
    mechanism: "provider_echoed_field",
    column: null,
    evidence: ["docs/STAGING_WEBHOOK_DELIVERY_POLICY.md", "docs/STAGING_PROVIDER_INGRESS.md"],
    // No provider-origin delivery has ever been accepted, and no live-mode
    // policy has been decided, so the scope of any reference is undetermined.
    populated: "unknown",
    prerequisites: [
      "a recorded decision on provider-origin delivery for this project",
      "a recorded live-mode policy naming which account and mode are authoritative",
    ],
  },
] as const;

export interface CapabilitySummary {
  readonly total: number;
  readonly byClass: Record<CapabilityClass, number>;
  /** Linkage ids that are authoritative, sorted. */
  readonly authoritativeIds: readonly string[];
  /** Can an order be tied to a payment today, using declared columns only? */
  readonly orderToPaymentCapability: CapabilityClass;
  /** Can an order line be tied to a refund today? */
  readonly lineToRefundCapability: CapabilityClass;
  readonly notice: string;
}

export function summarizeCapability(
  linkages: readonly CorrelationLinkage[] = PAYMENT_CORRELATION_LINKAGES,
): CapabilitySummary {
  const byClass: Record<CapabilityClass, number> = {
    authoritative: 0,
    contextual_only: 0,
    absent: 0,
    unknown: 0,
  };
  const authoritativeIds: string[] = [];
  for (const linkage of linkages) {
    const klass = classifyLinkage(linkage);
    byClass[klass] += 1;
    if (klass === "authoritative") authoritativeIds.push(linkage.id);
  }
  const find = (id: string) => linkages.find((l) => l.id === id) ?? null;
  const orderToPayment = find("order_to_payment");
  const lineToRefund = find("refund_ledger_to_order_line");
  return {
    total: linkages.length,
    byClass,
    authoritativeIds: authoritativeIds.slice().sort(),
    orderToPaymentCapability: orderToPayment ? classifyLinkage(orderToPayment) : "unknown",
    lineToRefundCapability: lineToRefund ? classifyLinkage(lineToRefund) : "unknown",
    notice: CAPABILITY_AUTHORITY_NOTICE,
  };
}

/** Every prerequisite that stands between today and authoritative order-to-payment correlation. */
export function outstandingPrerequisites(
  linkages: readonly CorrelationLinkage[] = PAYMENT_CORRELATION_LINKAGES,
): readonly string[] {
  const out = new Set<string>();
  for (const linkage of linkages) {
    const klass = classifyLinkage(linkage);
    if (klass === "authoritative") continue;
    for (const prerequisite of linkage.prerequisites) out.add(prerequisite);
  }
  return [...out].sort();
}
