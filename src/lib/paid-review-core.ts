import { isUuid } from "./refund-policy-core";

export const PAID_REVIEW_PAGE_SIZE = 50;
export interface PaidReviewInput {
  eventId: string;
  after?: string;
}
export interface PaidReviewCase {
  caseId: string;
  recordedAt: string;
}
export interface PaidReviewPage {
  cases: PaidReviewCase[];
  next: string | null;
}

/** In-memory only. Account/event/unmount invalidation prevents late responses
 * from displaying another context's records; repeated submits are suppressed.
 */
export class PaidReviewRequestGuard {
  private revision = 0;
  private pending = false;
  get version() {
    return this.revision;
  }
  invalidate() {
    this.revision++;
    this.pending = false;
  }
  current(version: number) {
    return version === this.revision;
  }
  begin(): number | null {
    if (this.pending) return null;
    this.pending = true;
    return ++this.revision;
  }
  finish(version: number) {
    if (this.current(version)) this.pending = false;
  }
}
export function parsePaidReviewInput(raw: unknown): PaidReviewInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Not available.");
  const input = raw as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => key !== "eventId" && key !== "after") ||
    !isUuid(input["eventId"]) ||
    (input["after"] !== undefined && !isUuid(input["after"]))
  )
    throw new Error("Not available.");
  return {
    eventId: (input["eventId"] as string).toLowerCase(),
    ...(input["after"] ? { after: (input["after"] as string).toLowerCase() } : {}),
  };
}

/** Validate every returned row, including the lookahead. Never turn malformed
 * or foreign-event results into a reassuring empty queue. Drop all extra data.
 */
export function projectPaidReviewPage(raw: unknown, input: PaidReviewInput): PaidReviewPage {
  if (!Array.isArray(raw) || raw.length > PAID_REVIEW_PAGE_SIZE + 1)
    throw new Error("Not available.");
  const cases: PaidReviewCase[] = [];
  let previous = input.after ?? "";
  for (const value of raw) {
    if (!value || typeof value !== "object") throw new Error("Not available.");
    const row = value as Record<string, unknown>;
    const attempt = row["attempt"] as Record<string, unknown> | null;
    if (
      !isUuid(row["id"]) ||
      typeof row["created_at"] !== "string" ||
      !Number.isFinite(Date.parse(row["created_at"])) ||
      row["provider"] !== "stripe_test" ||
      row["status"] !== "failed" ||
      row["failure_category"] !== "paid_fulfillment_review" ||
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
