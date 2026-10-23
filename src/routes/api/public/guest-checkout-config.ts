import { createFileRoute } from "@tanstack/react-router";
import { guestCheckoutConfigResponse } from "@/lib/guest-checkout-config";
export const Route = createFileRoute("/api/public/guest-checkout-config")({
  server: { handlers: { GET: () => guestCheckoutConfigResponse(process.env) } },
});
