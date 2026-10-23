/** Synthetic-only guest checkout foundation. SQL draft is not installed automatically. */
import { createFileRoute } from "@tanstack/react-router";
import { handleGuestCart } from "@/lib/guest-checkout-cart-http";

async function handle(request: Request) {
  return handleGuestCart(request, {
    enabled: process.env["GUEST_CHECKOUT_SANDBOX_MODE"],
    testMode: process.env["PAYMENTS_TEST_MODE"],
    provider: process.env["PAYMENT_PROVIDER"],
    allowedOrigin: process.env["STAGING_ALLOWED_ORIGIN"],
    authenticate: async (token) => {
      const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
      return resolveUserId(createUserClient(token), token);
    },
    prepare: async (owner, input) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { prepareGuestCart } = await import("@/lib/guest-checkout-cart.server");
      return prepareGuestCart(supabaseAdmin, owner, input);
    },
  });
}
export const Route = createFileRoute("/api/public/prepare-guest-cart")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
