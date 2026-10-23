import { createFileRoute } from "@tanstack/react-router";
import { TicketRecovery } from "@/components/ticket-recovery-page";

export const Route = createFileRoute("/my-tickets")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Analog Tickets — Private TEST tickets" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: TicketRecovery,
});
