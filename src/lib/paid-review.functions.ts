import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./require-supabase-auth.server";
import { parsePaidReviewInput } from "./paid-review-core";

export const listUnfulfilledPaidReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parsePaidReviewInput)
  .handler(async ({ data, context }) => {
    const { readAuthorizedPaidReview } = await import("./paid-review.server");
    return readAuthorizedPaidReview({
      input: data,
      userId: context.userId,
      userClient: context.supabase,
      enabled:
        process.env["PAID_REVIEW_SANDBOX_MODE"] === "true" &&
        process.env["PAYMENTS_TEST_MODE"] === "true",
      loadAdmin: async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin,
    });
  });
