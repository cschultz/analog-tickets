import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./require-supabase-auth.server";
import { parsePaidReviewInput } from "./paid-review-core";

export const listDelayedPaymentFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parsePaidReviewInput)
  .handler(async ({ data, context }) => {
    const { readAuthorizedDelayedFailure } = await import("./delayed-failure-review.server");
    return readAuthorizedDelayedFailure({
      input: data,
      userId: context.userId,
      userClient: context.supabase,
      enabled:
        process.env["DELAYED_FAILURE_REVIEW_SANDBOX_MODE"] === "true" &&
        process.env["PAYMENTS_TEST_MODE"] === "true",
      loadAdmin: async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin,
    });
  });
