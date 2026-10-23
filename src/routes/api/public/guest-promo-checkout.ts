import { createFileRoute } from "@tanstack/react-router";
import { handleGuestPromo } from "@/lib/guest-promo-http";
async function handle(request: Request) {
  return handleGuestPromo(request, {
    enabled: process.env["PROMOTION_PRICING_SANDBOX_MODE"],
    guestEnabled: process.env["GUEST_CHECKOUT_SANDBOX_MODE"],
    env: {
      PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
      PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
      STRIPE_TEST_RESTRICTED_KEY: process.env["STRIPE_TEST_RESTRICTED_KEY"],
      STAGING_ALLOWED_ORIGIN: process.env["STAGING_ALLOWED_ORIGIN"],
    },
    authenticate: async (token) => {
      const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
      return resolveUserId(createUserClient(token), token);
    },
    client: async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin as unknown as import("@/lib/guest-promo.server").PromoRpcClient;
    },
    transport: async (input) => {
      const { createStripeFetchTransport } = await import("@/lib/stripe-transport.server");
      return createStripeFetchTransport()(input);
    },
    readTransport: async (input) => {
      const { createStripeCheckoutReadTransport } = await import("@/lib/stripe-transport.server");
      return createStripeCheckoutReadTransport()(input);
    },
  });
}
export const Route = createFileRoute("/api/public/guest-promo-checkout")({
  server: {
    handlers: { OPTIONS: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
