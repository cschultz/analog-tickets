import { createFileRoute } from "@tanstack/react-router";
import { handleGuestRecovery } from "@/lib/guest-recovery-http";
async function handle({ request }: { request: Request }) {
  const { guestRecoveryRuntime } = await import("@/lib/guest-recovery-runtime.server");
  return handleGuestRecovery(request, "redeem", guestRecoveryRuntime());
}
export const Route = createFileRoute("/api/public/guest-recovery-redeem")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
