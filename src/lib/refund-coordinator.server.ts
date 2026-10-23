/**
 * Gate 88 — server-only Stripe test-mode refund coordinator.
 *
 * Order of operations is fixed and fail-closed:
 *   1. parse the request (opaque references only);
 *   2. consult the durable coordination ledger — a known key never re-contacts
 *      Stripe;
 *   3. prove eligibility server-side from the database (issued, refundable at
 *      issue, not checked in, one coherent paid + correlated payment);
 *   4. claim the ledger row and every selected ticket atomically as `pending`;
 *   5. create ONE test-mode Stripe refund with that stable idempotency key;
 *   6. verify the returned refund is non-live and belongs to the expected
 *      payment intent for the exact amount;
 *   7. only then run the Gate 87 atomic service-role reversal/restock routine.
 *
 * If Stripe succeeds but the internal reversal cannot complete, the ledger is
 * left in `reconciliation_needed` and Stripe is never retried blindly. If
 * eligibility fails, no provider call is made and no state changes at all.
 *
 * There is no route, UI, or client entry point: the only caller is trusted
 * server code holding the service-role client.
 */
import {
  buildRefundIdempotencyKey,
  classifyLedgerState,
  computeRefundAmountCents,
  parseRefundRequest,
  type LedgerState,
  type RefundOutcome,
} from "@/lib/refund-coordinator-core";
import { evaluateReversalEligibility, type ReversalTicketFacts } from "@/lib/refund-reversal-core";
import { reverseRefundedTickets } from "@/lib/refund-reversal.server";
import { createStripeTestRefund, type StripeRefundEnv } from "@/lib/stripe-refund.server";
import { isUuid } from "./checkout-core";
import type { StripeTransport } from "@/lib/stripe-checkout.server";

type Row = Record<string, unknown>;

interface LooseQuery extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  eq: (column: string, value: unknown) => LooseQuery;
  in: (column: string, values: unknown[]) => LooseQuery;
  maybeSingle: () => PromiseLike<{ data: Row | null; error: unknown }>;
}

interface LooseClient {
  from: (table: string) => {
    select: (columns: string) => LooseQuery;
    insert: (values: Row) => { select: (columns: string) => LooseQuery };
    update: (values: Row) => {
      eq: (
        c: string,
        v: unknown,
      ) => {
        select: (columns: string) => PromiseLike<{ data: Row[] | null; error: unknown }>;
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

const loose = (client: unknown) => client as LooseClient;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

export interface RefundCoordinatorResult {
  outcome: RefundOutcome;
  ticketsReversed: number;
  restocked: number;
  amountCents: number;
  /** Present only once a provider refund has been verified. Opaque. */
  refundReference: string | null;
}

function result(
  outcome: RefundOutcome,
  extra: Partial<RefundCoordinatorResult> = {},
): RefundCoordinatorResult {
  return {
    outcome,
    ticketsReversed: 0,
    restocked: 0,
    amountCents: 0,
    refundReference: null,
    ...extra,
  };
}

export interface RefundCoordinatorOptions {
  /** Service-role client. Never a browser or user-scoped client. */
  admin: unknown;
  env: StripeRefundEnv;
  transport: StripeTransport;
  input: unknown;
}

export async function coordinateTestRefund(
  options: RefundCoordinatorOptions,
): Promise<RefundCoordinatorResult> {
  const parsed = parseRefundRequest(options.input);
  if (typeof parsed === "string") return result(parsed);

  const admin = loose(options.admin);
  const pricingEnabled = options.env.PROMOTION_PRICING_SANDBOX_MODE === "true";
  const idempotencyKey = buildRefundIdempotencyKey(parsed);

  /* ---- 2. durable replay gate: never re-contact Stripe for a known key ---- */
  const existing = await admin
    .from("refund_coordination_attempts")
    .select("id, state")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing.error) return result("reconciliation_needed");
  if (existing.data) {
    const verdict = classifyLedgerState(
      (str(existing.data["state"]) || null) as LedgerState | null,
    );
    if (verdict !== "proceed") return result(verdict);
  }

  /* ---- 3. server-side eligibility, before any provider work -------------- */
  const ticketsRes = await admin
    .from("tickets")
    .select(
      "id, order_id, order_item_id, event_id, ticket_type_id, status, checked_in_at, refundable_at_issue",
    )
    .in("id", parsed.ticketIds);
  if (ticketsRes.error) return result("ineligible_selection");
  const ticketRows = ticketsRes.data ?? [];
  if (ticketRows.length !== parsed.ticketIds.length) return result("ineligible_selection");

  const reversedRes = await admin
    .from("ticket_refund_items")
    .select("ticket_id")
    .in("ticket_id", parsed.ticketIds);
  if (reversedRes.error) return result("ineligible_selection");
  const alreadyReversed = new Set((reversedRes.data ?? []).map((r) => str(r["ticket_id"])));

  const facts: ReversalTicketFacts[] = ticketRows.map((row) => ({
    ticketId: str(row["id"]),
    orderId: str(row["order_id"]),
    eventId: str(row["event_id"]),
    ticketTypeId: str(row["ticket_type_id"]),
    status: str(row["status"]),
    checkedIn: row["checked_in_at"] != null,
    refundableAtIssue: row["refundable_at_issue"] === true,
    alreadyReversed: alreadyReversed.has(str(row["id"])),
  }));

  const orderId = facts[0]?.orderId ?? "";
  const orderRes = await admin
    .from("orders")
    .select(
      "id, status, user_id, event_id, checkout_attempt_id, subtotal_cents, total_cents, currency",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (orderRes.error) return result("ineligible_selection");
  const orderStatus = str(orderRes.data?.["status"]) || null;
  const linkedAttemptId = str(orderRes.data?.["checkout_attempt_id"]);
  if (!linkedAttemptId || str(orderRes.data?.["id"]) !== orderId)
    return result("ineligible_selection");

  const attemptRes = await admin
    .from("checkout_attempts")
    .select(
      "id, status, provider, quantity, unit_price_cents, amount_cents, currency, payment_intent_id, ticket_type_id, user_id, event_id" +
        (pricingEnabled ? ", price_quote_id" : ""),
    )
    .eq("id", linkedAttemptId)
    .eq("payment_intent_id", parsed.paymentIntentId)
    .eq("status", "completed")
    .eq("provider", "stripe_test")
    .maybeSingle();
  if (attemptRes.error) return result("ineligible_selection");
  const attempt = attemptRes.data;
  const quoteId = pricingEnabled ? attempt?.["price_quote_id"] : null;
  if (quoteId !== null && !isUuid(quoteId)) return result("ineligible_selection");

  const correlated =
    attempt &&
    str(attempt["ticket_type_id"]) === (facts[0]?.ticketTypeId ?? "") &&
    str(attempt["user_id"]) === str(orderRes.data?.["user_id"]) &&
    str(attempt["event_id"]) === str(orderRes.data?.["event_id"])
      ? str(attempt["payment_intent_id"])
      : null;

  const eligibility = evaluateReversalEligibility({
    requested: parsed.ticketIds,
    tickets: facts,
    orderStatus,
    correlatedPaymentIntentId: correlated,
    paymentIntentId: parsed.paymentIntentId,
    paidQuantity: num(attempt?.["quantity"]) || 0,
  });
  if (eligibility !== "reversed") return result("ineligible_selection");

  // The provider amount and the reversal ledger must describe the same paid
  // line. Historical or divergent purchase facts cannot safely start a refund.
  const lineRes = await admin
    .from("order_items")
    .select("id, ticket_type_id, quantity, unit_price_cents")
    .eq("order_id", orderId);
  if (lineRes.error || !lineRes.data || lineRes.data.length !== 1)
    return result("ineligible_selection");
  const line = lineRes.data[0]!;
  const lineId = str(line["id"]);
  const lineQuantity = num(line["quantity"]);
  const linePrice = num(line["unit_price_cents"]);
  const orderCurrency = str(orderRes.data?.["currency"]).toLowerCase();
  const attemptCurrency = str(attempt?.["currency"]).toLowerCase();
  if (
    !lineId ||
    str(line["ticket_type_id"]) !== (facts[0]?.ticketTypeId ?? "") ||
    ticketRows.some((row) => str(row["order_item_id"]) !== lineId) ||
    lineQuantity !== num(attempt?.["quantity"]) ||
    linePrice !== num(attempt?.["unit_price_cents"]) ||
    (quoteId === null &&
      (lineQuantity * linePrice !== num(attempt?.["amount_cents"]) ||
        num(orderRes.data?.["subtotal_cents"]) !== num(attempt?.["amount_cents"]))) ||
    num(orderRes.data?.["total_cents"]) !== num(attempt?.["amount_cents"]) ||
    !/^[a-z]{3}$/.test(orderCurrency) ||
    orderCurrency !== attemptCurrency
  )
    return result("ineligible_selection");

  let amount: number | RefundOutcome;
  if (quoteId !== null) {
    try {
      const priced = await admin.rpc("read_quoted_refund_amount", {
        p_attempt: linkedAttemptId,
        p_ticket_ids: parsed.ticketIds,
      });
      const row =
        Array.isArray(priced.data) && priced.data.length === 1 ? (priced.data[0] as Row) : null;
      const selectedAmount = row?.["amount_cents"];
      if (
        priced.error ||
        !row ||
        typeof selectedAmount !== "number" ||
        !Number.isSafeInteger(selectedAmount) ||
        selectedAmount <= 0 ||
        selectedAmount > num(attempt?.["amount_cents"]) ||
        row["currency"] !== orderCurrency
      )
        return result("ineligible_selection");
      amount = selectedAmount;
    } catch {
      return result("ineligible_selection");
    }
  } else {
    amount = computeRefundAmountCents({
      unitPriceCents: linePrice,
      selectedCount: parsed.ticketIds.length,
      paidQuantity: lineQuantity,
    });
  }
  if (typeof amount === "string") return result(amount);

  /* ---- 4. atomic ledger + per-ticket claims (database trigger) ----------- */
  const claim = await admin
    .from("refund_coordination_attempts")
    .insert({
      idempotency_key: idempotencyKey,
      payment_intent_id: parsed.paymentIntentId,
      ticket_ids: parsed.ticketIds,
      ticket_count: parsed.ticketIds.length,
      amount_cents: amount,
      currency: orderCurrency,
      state: "pending",
    })
    .select("id");
  if (claim.error)
    return result(
      // Either this exact key or any overlapping ticket is already claimed.
      // In both cases the trigger aborts the insert before provider contact.
      (claim.error as { code?: unknown }).code === "23505"
        ? "attempt_in_progress"
        : "reconciliation_needed",
    );
  const ledgerId = str((claim.data ?? [])[0]?.["id"]);
  if (!Array.isArray(claim.data) || claim.data.length !== 1 || !ledgerId)
    return result("reconciliation_needed");

  const setState = async (state: LedgerState, patch: Row = {}) => {
    try {
      const updated = await admin
        .from("refund_coordination_attempts")
        .update({ state, ...patch })
        .eq("id", ledgerId)
        .select("id, state, provider_refund_reference, failure_reason");
      const row = updated.data?.[0];
      return (
        updated.error == null &&
        updated.data?.length === 1 &&
        str(row?.["id"]) === ledgerId &&
        row?.["state"] === state &&
        Object.entries(patch).every(([key, value]) => row?.[key] === value)
      );
    } catch {
      return false;
    }
  };

  /* ---- 5/6. one verified test-mode provider refund ----------------------- */
  const provider = await createStripeTestRefund({
    env: options.env,
    paymentIntentId: parsed.paymentIntentId,
    amountCents: amount,
    idempotencyKey,
    transport: options.transport,
  });

  if (!provider.ok) {
    if (provider.code === "provider_failed" || provider.code === "configuration") {
      const recorded = await setState("failed", { failure_reason: provider.code });
      return result(recorded ? provider.code : "reconciliation_needed");
    }
    await setState("reconciliation_needed", { failure_reason: "provider_unverified" });
    return result("reconciliation_needed");
  }

  // A pending provider refund is not a completed refund. Keep the ticket
  // issued and stock unchanged until its final outcome is reconciled; a
  // replay of this request must not create another provider refund.
  if (provider.refund.status !== "succeeded") {
    await setState("reconciliation_needed", {
      provider_refund_reference: provider.refund.reference,
      failure_reason: "provider_pending",
    });
    return result("reconciliation_needed", {
      amountCents: amount,
      refundReference: provider.refund.reference,
    });
  }

  const providerRecorded = await setState("provider_refunded", {
    provider_refund_reference: provider.refund.reference,
  });
  if (!providerRecorded)
    return result("reconciliation_needed", {
      amountCents: amount,
      refundReference: provider.refund.reference,
    });

  /* ---- 7. atomic internal reversal + restock ----------------------------- */
  const reversal = await reverseRefundedTickets(options.admin, {
    ticketIds: parsed.ticketIds,
    paymentIntentId: parsed.paymentIntentId,
    providerRefundReference: provider.refund.reference,
  });

  if (reversal.outcome !== "reversed" && reversal.outcome !== "idempotent_replay") {
    await setState("reconciliation_needed", { failure_reason: reversal.outcome });
    return result("reconciliation_needed", {
      amountCents: amount,
      refundReference: provider.refund.reference,
    });
  }

  const reversalRecorded = await setState("reversed");
  return result(reversalRecorded ? "refunded" : "reconciliation_needed", {
    ticketsReversed: reversal.ticketsReversed,
    restocked: reversal.restocked,
    amountCents: amount,
    refundReference: provider.refund.reference,
  });
}
