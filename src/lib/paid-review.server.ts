import { evaluateRefundEligibilityAuthorization } from "./refund-eligibility-core";
import { loadCallerMemberships } from "./refund-policy.server";
import {
  PAID_REVIEW_PAGE_SIZE,
  parsePaidReviewInput,
  projectPaidReviewPage,
  type PaidReviewInput,
} from "./paid-review-core";

type Query = PromiseLike<{ data: unknown; error: unknown }> & {
  eq: (key: string, value: string) => Query;
  gt: (key: string, value: string) => Query;
  order: (key: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
};
type Reader = { from: (table: string) => { select: (columns: string) => Query } };

/** One bounded SELECT scoped by the stored attempt relationship BEFORE limit.
 * No provider/customer/payment references, writer, RPC or provider transport.
 */
export async function loadPaidReviewPage(admin: unknown, input: PaidReviewInput) {
  let query = (admin as Reader)
    .from("payment_webhook_events")
    .select(
      "id, created_at, status, failure_category, provider, attempt:checkout_attempts!inner(event_id)",
    )
    .eq("provider", "stripe_test")
    .eq("status", "failed")
    .eq("failure_category", "paid_fulfillment_review")
    .eq("attempt.event_id", input.eventId)
    .order("id", { ascending: true })
    .limit(PAID_REVIEW_PAGE_SIZE + 1);
  if (input.after) query = query.gt("id", input.after);
  const { data, error } = await query;
  if (error) throw new Error("Not available.");
  return projectPaidReviewPage(data, input);
}

/** Only accept a middleware-verified identity and caller-scoped client.
 * Privileged client creation/import happens after actual membership proof.
 */
export async function readAuthorizedPaidReview(args: {
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
    return await loadPaidReviewPage(await args.loadAdmin(), input);
  } catch {
    throw new Error("Not available.");
  }
}
