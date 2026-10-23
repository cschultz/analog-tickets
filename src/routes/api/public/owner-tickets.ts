import { createFileRoute } from "@tanstack/react-router";
import { handleOwnerTickets } from "@/lib/owner-tickets-core";

async function handle({ request }: { request: Request }) {
  return handleOwnerTickets(request, {
    enabled: process.env["ATTENDEE_RECOVERY_SANDBOX_MODE"],
    allowedOrigin: process.env["STAGING_ALLOWED_ORIGIN"],
    authenticate: async (token) => {
      const { authenticateTicketOwner } = await import("@/lib/owner-tickets.server");
      return authenticateTicketOwner(token);
    },
    load: async (token, ownerId, offset) => {
      const { loadOwnerTickets } = await import("@/lib/owner-tickets.server");
      return loadOwnerTickets(token, ownerId, offset);
    },
  });
}

export const Route = createFileRoute("/api/public/owner-tickets")({
  server: { handlers: { OPTIONS: handle, POST: handle } },
});
