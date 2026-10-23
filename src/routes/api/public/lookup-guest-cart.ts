import { createFileRoute } from "@tanstack/react-router";
import { handleGuestLookup } from "@/lib/guest-checkout-lookup-http";
async function handle({ request }: { request: Request }) {
  return handleGuestLookup(request, {
    enabled: process.env["GUEST_CHECKOUT_SANDBOX_MODE"],
    testMode: process.env["PAYMENTS_TEST_MODE"],
    provider: process.env["PAYMENT_PROVIDER"],
    allowedOrigin: process.env["STAGING_ALLOWED_ORIGIN"],
    authenticate: async (token) => {
      const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
      return resolveUserId(createUserClient(token), token);
    },
    lookup: async (owner, cart) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { lookupGuestCart } = await import("@/lib/guest-checkout-lookup.server");
      return lookupGuestCart(
        supabaseAdmin as unknown as import("@/lib/guest-checkout-lookup.server").GuestLookupClient,
        owner,
        cart,
      );
    },
  });
}
export const Route = createFileRoute("/api/public/lookup-guest-cart")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
