import { createFileRoute } from "@tanstack/react-router";
import { handleOwnerPass } from "@/lib/owner-pass-core";

async function handle({ request }: { request: Request }) {
  return handleOwnerPass(request, {
    enabled: process.env["ATTENDEE_PASS_SANDBOX_MODE"],
    allowedOrigin: process.env["STAGING_ALLOWED_ORIGIN"],
    authenticate: async (token) => {
      const { authenticateTicketOwner } = await import("@/lib/owner-tickets.server");
      return authenticateTicketOwner(token);
    },
    inspect: async (ticket, owner) => {
      const { inspectOwnerPass } = await import("@/lib/owner-pass.server");
      return inspectOwnerPass(ticket, owner);
    },
    issue: async (ticket, owner, expected) => {
      const { createOwnerPass } = await import("@/lib/owner-pass.server");
      return createOwnerPass(ticket, owner, expected);
    },
  });
}
export const Route = createFileRoute("/api/public/owner-pass")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
