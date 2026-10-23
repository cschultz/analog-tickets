import { createFileRoute } from "@tanstack/react-router";
import { handleGuestRecovery } from "@/lib/guest-recovery-http";
async function handle({ request }: { request: Request }) {
  const { guestRecoveryRuntime } = await import("@/lib/guest-recovery-runtime.server");
  return handleGuestRecovery(request, "logout", guestRecoveryRuntime());
}
export const Route = createFileRoute("/api/public/guest-recovery-logout")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
