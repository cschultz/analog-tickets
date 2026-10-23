import { createFileRoute } from "@tanstack/react-router";
import { handleRecoveredPass } from "@/lib/guest-recovery-pass-http";
async function handle({ request }: { request: Request }) {
  const { guestRecoveryRuntime } = await import("@/lib/guest-recovery-runtime.server");
  const runtime = guestRecoveryRuntime();
  return handleRecoveredPass(request, {
    ...runtime,
    enabled: runtime.enabled && process.env["ATTENDEE_PASS_SANDBOX_MODE"] === "true",
    inspect: async (id, owner) => {
      const { inspectOwnerPass } = await import("@/lib/owner-pass.server");
      return inspectOwnerPass(id, owner);
    },
    issue: async (id, owner, expected) => {
      const { createOwnerPass } = await import("@/lib/owner-pass.server");
      return createOwnerPass(id, owner, expected);
    },
  });
}
export const Route = createFileRoute("/api/public/guest-recovery-pass")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
