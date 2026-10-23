/** Pure verification of one independently retrieved test-mode refund. */
import { isPaymentCorrelationReference, isRefundReference } from "@/lib/refund-reversal-core";

export interface ExpectedRefundStatus {
  refundReference: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
}

export type ObservedRefundStatus =
  "pending" | "requires_action" | "succeeded" | "failed" | "canceled";

export type RefundStatusVerification =
  { verified: true; status: ObservedRefundStatus } | { verified: false };

/** Verify correlation without retaining or returning the provider payload. */
export function verifyRetrievedRefund(
  httpStatus: number,
  body: string,
  expected: ExpectedRefundStatus,
): RefundStatusVerification {
  if (
    httpStatus !== 200 ||
    body.length > 65_536 ||
    !isRefundReference(expected.refundReference) ||
    !isPaymentCorrelationReference(expected.paymentIntentId) ||
    !Number.isSafeInteger(expected.amountCents) ||
    expected.amountCents <= 0 ||
    !/^[a-z]{3}$/.test(expected.currency)
  ) {
    return { verified: false };
  }

  let object: unknown;
  try {
    object = JSON.parse(body);
  } catch {
    return { verified: false };
  }
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return { verified: false };
  }
  const refund = object as Record<string, unknown>;
  if (
    refund["object"] !== "refund" ||
    refund["livemode"] === true ||
    refund["id"] !== expected.refundReference ||
    refund["payment_intent"] !== expected.paymentIntentId ||
    refund["amount"] !== expected.amountCents ||
    refund["currency"] !== expected.currency
  ) {
    return { verified: false };
  }
  const status = refund["status"];
  if (
    status !== "pending" &&
    status !== "requires_action" &&
    status !== "succeeded" &&
    status !== "failed" &&
    status !== "canceled"
  ) {
    return { verified: false };
  }
  return { verified: true, status };
}
