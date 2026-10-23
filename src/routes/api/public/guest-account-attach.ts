import { createFileRoute } from "@tanstack/react-router";
import { handleGuestAccount } from "@/lib/guest-account-http";
async function handle({ request }: { request: Request }) {
  const { guestAccountRuntime } = await import("@/lib/guest-account-runtime.server");
  return handleGuestAccount(request, "attach", guestAccountRuntime());
}
export const Route = createFileRoute("/api/public/guest-account-attach")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
