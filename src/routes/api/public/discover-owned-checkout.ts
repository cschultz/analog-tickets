/** Off-by-default, owner-scoped, read-only private checkout discovery. */
import { createFileRoute } from "@tanstack/react-router";
import { handleOwnedCheckoutDiscovery } from "@/lib/owned-checkout-discovery-http";

async function handle({ request }: { request: Request }) {
  return handleOwnedCheckoutDiscovery(request, {
    enabled: process.env["OWNED_CHECKOUT_DISCOVERY_SANDBOX_MODE"],
    testMode: process.env["PAYMENTS_TEST_MODE"],
    provider: process.env["PAYMENT_PROVIDER"],
    allowedOrigin: process.env["STAGING_ALLOWED_ORIGIN"],
    authenticate: async (token) => {
      const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
      return resolveUserId(createUserClient(token), token);
    },
    discover: async (owner) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { discoverOwnedCheckout } = await import("@/lib/owned-checkout-discovery.server");
      return discoverOwnedCheckout(
        supabaseAdmin as unknown as import("@/lib/owned-checkout-discovery.server").DiscoveryAdmin,
        owner,
      );
    },
  });
}

export const Route = createFileRoute("/api/public/discover-owned-checkout")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
