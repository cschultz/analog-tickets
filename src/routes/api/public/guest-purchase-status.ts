import { createFileRoute } from "@tanstack/react-router";
import { handleGuestPurchaseStatus } from "@/lib/guest-purchase-status-http";
async function handle({ request }: { request: Request }) {
  return handleGuestPurchaseStatus(request, {
    enabled: process.env["GUEST_CHECKOUT_SANDBOX_MODE"],
    testMode: process.env["PAYMENTS_TEST_MODE"],
    provider: process.env["PAYMENT_PROVIDER"],
    allowedOrigin: process.env["STAGING_ALLOWED_ORIGIN"],
    authenticate: async (token) => {
      const { createUserClient, resolveUserId } = await import("@/lib/transfer-otp.server");
      return resolveUserId(createUserClient(token), token);
    },
    load: async (owner, cart) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { loadGuestPurchaseStatus } = await import("@/lib/guest-purchase-status.server");
      return loadGuestPurchaseStatus(
        supabaseAdmin as unknown as import("@/lib/guest-checkout-lookup.server").GuestLookupClient,
        owner,
        cart,
        process.env["PROMOTION_PRICING_SANDBOX_MODE"] === "true"
          ? (supabaseAdmin as unknown as import("@/lib/guest-promo.server").PromoRpcClient)
          : undefined,
      );
    },
  });
}
export const Route = createFileRoute("/api/public/guest-purchase-status")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
