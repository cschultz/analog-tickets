import { isUuid } from "./refund-policy-core";
import { PAID_REVIEW_PAGE_SIZE, type PaidReviewInput } from "./paid-review-core";

export interface DelayedFailureCase {
  caseId: string;
  recordedAt: string;
}
export interface DelayedFailurePage {
  cases: DelayedFailureCase[];
  next: string | null;
}

/** Do not return provider ids, attempt ids or joined rows to the browser. */
export function projectDelayedFailurePage(
  raw: unknown,
  input: PaidReviewInput,
): DelayedFailurePage {
  if (!Array.isArray(raw) || raw.length > PAID_REVIEW_PAGE_SIZE + 1)
    throw new Error("Not available.");
  const cases: DelayedFailureCase[] = [];
  let previous = input.after ?? "";
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Not available.");
    const row = value as Record<string, unknown>;
    const attempt = row["attempt"] as Record<string, unknown> | null;
    if (
      !isUuid(row["id"]) ||
      typeof row["created_at"] !== "string" ||
      !Number.isFinite(Date.parse(row["created_at"])) ||
      row["provider"] !== "stripe_test" ||
      row["status"] !== "ignored" ||
      row["event_type"] !== "checkout.session.async_payment_failed" ||
      !attempt ||
      Array.isArray(attempt) ||
      attempt["event_id"] !== input.eventId
    )
      throw new Error("Not available.");
    const id = (row["id"] as string).toLowerCase();
    if (id <= previous) throw new Error("Not available.");
    previous = id;
    cases.push({ caseId: id, recordedAt: new Date(row["created_at"]).toISOString() });
  }
  const visible = cases.slice(0, PAID_REVIEW_PAGE_SIZE);
  return {
    cases: visible,
    next: cases.length > PAID_REVIEW_PAGE_SIZE ? visible.at(-1)!.caseId : null,
  };
}
