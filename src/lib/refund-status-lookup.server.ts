/**
 * Server-only, read-only status lookup for an existing pending test refund.
 * No route, provider creation call, ticket writer, or ledger update is wired.
 */
import { isUuid } from "@/lib/checkout-core";
import { STRIPE_REFUNDS_URL } from "@/lib/refund-coordinator-core";
import { resolveStripeRefundKey, type StripeRefundEnv } from "@/lib/stripe-refund.server";
import { STRIPE_API_VERSION, type StripeTransportResponse } from "@/lib/stripe-checkout.server";
import { isPaymentCorrelationReference, isRefundReference } from "@/lib/refund-reversal-core";
import { verifyRetrievedRefund, type ObservedRefundStatus } from "@/lib/refund-status-lookup-core";

interface LookupQuery {
  eq: (
    column: string,
    value: unknown,
  ) => {
    maybeSingle: () => PromiseLike<{
      data: Record<string, unknown> | null;
      error: unknown;
    }>;
  };
}
interface LookupClient {
  from: (table: string) => { select: (columns: string) => LookupQuery };
}

export interface StripeRefundLookupRequest {
  url: string;
  method: "GET";
  headers: Record<string, string>;
  timeoutMs: number;
}
export type StripeRefundLookupTransport = (
  request: StripeRefundLookupRequest,
) => Promise<StripeTransportResponse>;

export type RefundStatusLookupResult =
  | { outcome: "not_available" | "configuration" | "unverified" }
  | { outcome: "observed"; status: ObservedRefundStatus };

/**
 * The sole input is an internal ledger UUID. All provider correlations come
 * from the service-role row, never from a caller. An observed status does not
 * authorize ticket reversal: a separate reviewed recovery decision is needed.
 */
export async function lookupPendingTestRefundStatus(options: {
  admin: unknown;
  env: StripeRefundEnv;
  transport: StripeRefundLookupTransport;
  coordinationAttemptId: unknown;
}): Promise<RefundStatusLookupResult> {
  if (!isUuid(options.coordinationAttemptId)) return { outcome: "not_available" };
  let data: Record<string, unknown> | null;
  let error: unknown;
  try {
    const admin = options.admin as LookupClient;
    const ledger = await admin
      .from("refund_coordination_attempts")
      .select(
        "id, state, failure_reason, provider_refund_reference, payment_intent_id, amount_cents, currency",
      )
      .eq("id", options.coordinationAttemptId)
      .maybeSingle();
    ({ data, error } = ledger);
  } catch {
    return { outcome: "unverified" };
  }
  if (error) return { outcome: "unverified" };
  if (!data) return { outcome: "not_available" };
  if (
    data["id"] !== options.coordinationAttemptId ||
    data["state"] !== "reconciliation_needed" ||
    data["failure_reason"] !== "provider_pending"
  ) {
    return { outcome: "not_available" };
  }

  const reference = data["provider_refund_reference"];
  if (
    !isRefundReference(reference) ||
    !isPaymentCorrelationReference(data["payment_intent_id"]) ||
    !Number.isSafeInteger(data["amount_cents"]) ||
    (data["amount_cents"] as number) <= 0 ||
    typeof data["currency"] !== "string" ||
    !/^[a-z]{3}$/.test(data["currency"])
  ) {
    return { outcome: "unverified" };
  }
  const key = resolveStripeRefundKey(options.env);
  if (!key) return { outcome: "configuration" };

  let response: StripeTransportResponse;
  try {
    response = await options.transport({
      url: `${STRIPE_REFUNDS_URL}/${reference}`,
      method: "GET",
      headers: { authorization: `Bearer ${key}`, "stripe-version": STRIPE_API_VERSION },
      timeoutMs: 20_000,
    });
  } catch {
    return { outcome: "unverified" };
  }

  if (!response || typeof response.status !== "number" || typeof response.body !== "string") {
    return { outcome: "unverified" };
  }
  const verdict = verifyRetrievedRefund(response.status, response.body, {
    refundReference: reference,
    paymentIntentId: data["payment_intent_id"] as string,
    amountCents: data["amount_cents"] as number,
    currency: data["currency"] as string,
  });
  return verdict.verified
    ? { outcome: "observed", status: verdict.status }
    : { outcome: "unverified" };
}
