import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "./require-supabase-auth.server";
import type { OrganizerOrderDetailResult } from "./organizer-order-detail-core";

export const getOrganizerOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => data)
  .handler(async ({ data, context }): Promise<OrganizerOrderDetailResult> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { readOrganizerOrderDetail } = await import("./organizer-order-detail.server");
    return readOrganizerOrderDetail({
      input: data,
      userClient: context.supabase,
      userId: context.userId,
      env: {
        PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
        PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
        PROMOTION_PRICING_SANDBOX_MODE: process.env["PROMOTION_PRICING_SANDBOX_MODE"],
      },
      loadRefundClient: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return supabaseAdmin;
      },
    });
  });
