import { createFileRoute } from "@tanstack/react-router";
import { GuestTicketRecovery } from "@/components/GuestTicketRecovery";
export const Route = createFileRoute("/tickets/recover")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your TEST tickets — passwordless access" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: GuestTicketRecovery,
});
