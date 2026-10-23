/**
 * Gate 154 — pure, dependency-free reconciliation of one first-class order
 * line against issued tickets and the refund ledger.
 *
 * Read-only by construction. Nothing here (or in any module that imports it)
 * writes a row, runs an RPC, repairs state, or contacts a payment provider.
 * It answers exactly one question — "for this order line, do the purchased
 * quantity, the issued tickets, and the refund ledger agree?" — and projects
 * no customer, contact address, order, payment, or provider identifier.
 *
 * The reconciliation is deliberately *not* exposed as a database view. See
 * docs/STAGING_GATE154_LINE_ITEM_RECONCILIATION.md for the access preflight
 * and the exact reason a physical view is deferred.
 */

/** Immutable purchase facts, read from `public.order_items`. */
export interface OrderLineFacts {
  /** `public.order_items.id` — the sole first-class line identity. */
  orderItemId: string;
  quantity: number;
  unitPriceCents: number;
  currency: string | null;
}

/** One `public.ticket_refunds` row associated with the line. */
export interface RefundLedgerFacts {
  ticketCount: number;
  amountCents: number | null;
  currency: string | null;
}

/**
 * Deterministic reconciliation outcome.
 *
 * `indeterminate` is the safe status: it is returned for unknown, incomplete,
 * or internally inconsistent history and never implies that a repair is due.
 * `over_refund_suspected` is an observation only — no recovery is triggered.
 */
export type LineReconciliationStatus =
  | "reconciled_unrefunded"
  | "partially_refunded"
  | "fully_refunded"
  | "over_refund_suspected"
  | "indeterminate";

/** The only fields this contract ever returns. No PII, no payment identifiers. */
export interface LineReconciliationView {
  orderItemId: string;
  quantity: number;
  unitPriceCents: number;
  currency: string | null;
  purchasedAmountCents: number;
  issuedTicketCount: number;
  refundRecordCount: number;
  refundedTicketCount: number;
  refundedAmountCents: number;
  remainingTicketCount: number;
  remainingAmountCents: number;
  status: LineReconciliationStatus;
}

const isFiniteInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const clampNonNegative = (value: number): number => (value > 0 ? value : 0);

/**
 * Reconciles one line. Totals are always non-negative; ambiguity always
 * resolves to `indeterminate` rather than to a refundable amount.
 */
export function reconcileOrderLine(args: {
  line: OrderLineFacts;
  issuedTicketCount: number;
  refunds: RefundLedgerFacts[];
}): LineReconciliationView {
  const { line, refunds } = args;
  const issuedTicketCount = clampNonNegative(
    isFiniteInt(args.issuedTicketCount) ? args.issuedTicketCount : 0,
  );

  const quantity = isFiniteInt(line.quantity) ? line.quantity : -1;
  const unitPriceCents = isFiniteInt(line.unitPriceCents) ? line.unitPriceCents : -1;
  const currency = typeof line.currency === "string" && line.currency ? line.currency : null;

  let indeterminate = quantity <= 0 || unitPriceCents < 0 || currency === null;

  let refundedTicketCount = 0;
  let refundedAmountCents = 0;
  for (const refund of refunds) {
    // A ledger row without an amount, without a currency, or in a different
    // currency is unverifiable history: the line cannot be reconciled.
    if (!isFiniteInt(refund.ticketCount) || refund.ticketCount < 0) indeterminate = true;
    if (!isFiniteInt(refund.amountCents) || (refund.amountCents ?? -1) < 0) indeterminate = true;
    if (refund.currency === null || refund.currency !== currency) indeterminate = true;
    refundedTicketCount += isFiniteInt(refund.ticketCount) ? clampNonNegative(refund.ticketCount) : 0;
    refundedAmountCents += isFiniteInt(refund.amountCents)
      ? clampNonNegative(refund.amountCents)
      : 0;
  }

  const purchasedAmountCents = clampNonNegative(quantity) * clampNonNegative(unitPriceCents);

  // Issuance must exactly match the purchased quantity, otherwise the line's
  // history is incomplete (partially issued, or issued before backfill).
  if (issuedTicketCount !== clampNonNegative(quantity)) indeterminate = true;

  const overRefunded =
    refundedTicketCount > clampNonNegative(quantity) || refundedAmountCents > purchasedAmountCents;

  let status: LineReconciliationStatus;
  if (overRefunded) status = "over_refund_suspected";
  else if (indeterminate) status = "indeterminate";
  else if (refundedTicketCount === 0 && refundedAmountCents === 0) status = "reconciled_unrefunded";
  else if (refundedTicketCount === quantity && refundedAmountCents === purchasedAmountCents)
    status = "fully_refunded";
  else status = "partially_refunded";

  return {
    orderItemId: line.orderItemId,
    quantity: clampNonNegative(quantity),
    unitPriceCents: clampNonNegative(unitPriceCents),
    currency,
    purchasedAmountCents,
    issuedTicketCount,
    refundRecordCount: refunds.length,
    refundedTicketCount,
    refundedAmountCents,
    remainingTicketCount: clampNonNegative(clampNonNegative(quantity) - refundedTicketCount),
    remainingAmountCents: clampNonNegative(purchasedAmountCents - refundedAmountCents),
    status,
  };
}

/** Reconciles many lines, newest identity ordering left to the caller. */
export function reconcileOrderLines(
  lines: {
    line: OrderLineFacts;
    issuedTicketCount: number;
    refunds: RefundLedgerFacts[];
  }[],
): LineReconciliationView[] {
  return lines.map(reconcileOrderLine);
}

/**
 * The non-executable reconciliation query contract.
 *
 * This string is documentation, not a migration and not a runtime statement:
 * no module executes it, and it creates no database object. An operator with
 * service-role access runs it manually in the private SQL editor.
 */
export const LINE_ITEM_RECONCILIATION_QUERY_CONTRACT = `
-- Gate 154 — read-only. Creates nothing. Grants nothing. Writes nothing.
-- Run manually with service-role access; never exposed through the Data API.
select
  oi.id                                         as order_item_id,
  oi.quantity                                   as quantity,
  oi.unit_price_cents                           as unit_price_cents,
  o.currency                                    as currency,
  oi.quantity * oi.unit_price_cents             as purchased_amount_cents,
  coalesce(t.issued_ticket_count, 0)            as issued_ticket_count,
  coalesce(r.refund_record_count, 0)            as refund_record_count,
  coalesce(r.refunded_ticket_count, 0)          as refunded_ticket_count,
  coalesce(r.refunded_amount_cents, 0)          as refunded_amount_cents,
  greatest(oi.quantity - coalesce(r.refunded_ticket_count, 0), 0)
                                                as remaining_ticket_count,
  greatest(oi.quantity * oi.unit_price_cents - coalesce(r.refunded_amount_cents, 0), 0)
                                                as remaining_amount_cents
from public.order_items oi
join public.orders o on o.id = oi.order_id
left join (
  select order_item_id, count(*)::int as issued_ticket_count
  from public.tickets
  where order_item_id is not null
  group by order_item_id
) t on t.order_item_id = oi.id
left join (
  select
    order_item_id,
    count(*)::int as refund_record_count,
    sum(ticket_count)::int as refunded_ticket_count,
    sum(coalesce(amount_cents, 0))::int as refunded_amount_cents
  from public.ticket_refunds
  where order_item_id is not null
  group by order_item_id
) r on r.order_item_id = oi.id
order by oi.id;
`.trim();
