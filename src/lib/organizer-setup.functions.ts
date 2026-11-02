import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "./require-supabase-auth.server";
import type { SetupResult } from "./organizer-setup-core";

export const getOrganizerSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => data)
  .handler(async ({ data, context }): Promise<SetupResult> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { readOrganizerSetup } = await import("./organizer-setup.server");
    return readOrganizerSetup({
      input: data,
      userId: context.userId,
      userClient: context.supabase,
      readEnvironment: () => ({
        PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
        PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
        STRIPE_TEST_RESTRICTED_KEY: process.env["STRIPE_TEST_RESTRICTED_KEY"],
        STAGING_ALLOWED_ORIGIN: process.env["STAGING_ALLOWED_ORIGIN"],
        STRIPE_TEST_WEBHOOK_SECRET: process.env["STRIPE_TEST_WEBHOOK_SECRET"],
        MAILTRAP_TESTING_MODE: process.env["MAILTRAP_TESTING_MODE"],
        MAILTRAP_API_TOKEN: process.env["MAILTRAP_API_TOKEN"],
        MAILTRAP_ACCOUNT_ID: process.env["MAILTRAP_ACCOUNT_ID"],
        MAILTRAP_INBOX_ID: process.env["MAILTRAP_INBOX_ID"],
        MAILTRAP_FROM_ADDRESS: process.env["MAILTRAP_FROM_ADDRESS"],
        MAILTRAP_RECIPIENT_DOMAIN: process.env["MAILTRAP_RECIPIENT_DOMAIN"],
        GUEST_CHECKOUT_SANDBOX_MODE: process.env["GUEST_CHECKOUT_SANDBOX_MODE"],
        GUEST_RECOVERY_SANDBOX_MODE: process.env["GUEST_RECOVERY_SANDBOX_MODE"],
        PROMOTION_PRICING_SANDBOX_MODE: process.env["PROMOTION_PRICING_SANDBOX_MODE"],
      }),
      loadAdmin: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return supabaseAdmin;
      },
    });
  });
