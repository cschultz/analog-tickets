import { evaluateRefundEligibilityAuthorization } from "./refund-eligibility-core";
import { loadCallerMemberships } from "./refund-policy.server";
import {
  PAID_REVIEW_PAGE_SIZE,
  parsePaidReviewInput,
  type PaidReviewInput,
} from "./paid-review-core";
import { projectDelayedFailurePage } from "./delayed-failure-review-core";

type Query = PromiseLike<{ data: unknown; error: unknown }> & {
  eq: (key: string, value: string) => Query;
  gt: (key: string, value: string) => Query;
  order: (key: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
};
type Reader = { from: (table: string) => { select: (columns: string) => Query } };

/** Privileged but read-only; the stored attempt's event is scoped before limit. */
export async function loadDelayedFailurePage(admin: unknown, input: PaidReviewInput) {
  let query = (admin as Reader)
    .from("payment_webhook_events")
    .select(
      "id, created_at, status, event_type, provider, attempt:checkout_attempts!inner(event_id)",
    )
    .eq("provider", "stripe_test")
    .eq("status", "ignored")
    .eq("event_type", "checkout.session.async_payment_failed")
    .eq("attempt.event_id", input.eventId)
    .order("id", { ascending: true })
    .limit(PAID_REVIEW_PAGE_SIZE + 1);
  if (input.after) query = query.gt("id", input.after);
  const { data, error } = await query;
  if (error) throw new Error("Not available.");
  return projectDelayedFailurePage(data, input);
}

/** Caller-scoped membership proof precedes the privileged client import. */
export async function readAuthorizedDelayedFailure(args: {
  input: unknown;
  userId: string;
  userClient: unknown;
  loadAdmin: () => Promise<unknown>;
  enabled: boolean;
}) {
  try {
    if (!args.enabled || !args.userId) throw new Error("Not available.");
    const input = parsePaidReviewInput(args.input);
    const memberships = await loadCallerMemberships(args.userClient, input.eventId);
    if (
      !evaluateRefundEligibilityAuthorization({
        memberships,
        eventId: input.eventId,
        userId: args.userId,
      }).ok
    )
      throw new Error("Not available.");
    return await loadDelayedFailurePage(await args.loadAdmin(), input);
  } catch {
    throw new Error("Not available.");
  }
}
