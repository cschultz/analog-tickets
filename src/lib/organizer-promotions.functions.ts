import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "./require-supabase-auth.server";
import type { PromotionResult } from "./organizer-promotions-core";
export const organizerPromotions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => value)
  .handler(async ({ data, context }): Promise<PromotionResult> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { manageOrganizerPromotions } = await import("./organizer-promotions.server");
    return manageOrganizerPromotions({
      input: data,
      userId: context.userId,
      userClient: context.supabase,
      env: {
        PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
        PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
        PROMOTION_PRICING_SANDBOX_MODE: process.env["PROMOTION_PRICING_SANDBOX_MODE"],
      },
      loadAdmin: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return supabaseAdmin as unknown as import("./guest-promo.server").PromoRpcClient;
      },
    });
  });
