import { createFileRoute } from "@tanstack/react-router";
import { handleGuestRecovery } from "@/lib/guest-recovery-http";
async function handle({ request }: { request: Request }) {
  const { guestRecoveryRuntime } = await import("@/lib/guest-recovery-runtime.server");
  const runtime = guestRecoveryRuntime();
  return handleGuestRecovery(request, "request", {
    ...runtime,
    enabled: runtime.enabled && runtime.mailReady,
  });
}
export const Route = createFileRoute("/api/public/guest-recovery-request")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
