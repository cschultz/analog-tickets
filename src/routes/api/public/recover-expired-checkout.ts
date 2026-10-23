import { createFileRoute } from "@tanstack/react-router";
import { handleOwnedExpiryRecovery } from "@/lib/owned-expiry-http-core";

async function handle({ request }: { request: Request }) {
  return handleOwnedExpiryRecovery(request, {
    enabled: process.env["OWNED_CHECKOUT_EXPIRY_RECOVERY_SANDBOX_MODE"],
    testMode: process.env["PAYMENTS_TEST_MODE"],
    provider: process.env["PAYMENT_PROVIDER"],
    allowedOrigin: process.env["STAGING_ALLOWED_ORIGIN"],
    authenticate: async (token) => {
      const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
      return resolveUserId(createUserClient(token), token);
    },
    recover: async (reservationId, verifiedUserId) => {
      const { recoverOwnedExpiredCheckout } = await import("@/lib/owned-expired-checkout.server");
      return recoverOwnedExpiredCheckout({
        enabled: process.env["OWNED_CHECKOUT_EXPIRY_RECOVERY_SANDBOX_MODE"],
        verifiedUserId,
        reservationId,
        env: {
          PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
          PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
          STRIPE_TEST_RESTRICTED_KEY: process.env["STRIPE_TEST_RESTRICTED_KEY"],
          STAGING_ALLOWED_ORIGIN: process.env["STAGING_ALLOWED_ORIGIN"],
        },
        loadAdmin: async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Draft RPC is not in captured hosted schema types; no migration is applied.
          return supabaseAdmin as unknown as import("@/lib/owned-expired-checkout.server").ExpiredRecoveryAdmin;
        },
        loadTransport: async () => {
          const { createStripeCheckoutReadTransport } =
            await import("@/lib/stripe-transport.server");
          return createStripeCheckoutReadTransport();
        },
      });
    },
  });
}

export const Route = createFileRoute("/api/public/recover-expired-checkout")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
