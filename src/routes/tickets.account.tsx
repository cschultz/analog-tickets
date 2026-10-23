import { createFileRoute } from "@tanstack/react-router";
import { CheckoutShell } from "@/components/CheckoutShell";
import { GuestAccountPanel } from "@/components/GuestAccountPanel";
export const Route = createFileRoute("/tickets/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Saved TEST tickets" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: () => (
    <CheckoutShell
      title="Your saved TEST purchases"
      steps={["Details", "Payment", "Tickets"]}
      currentStep="Tickets"
    >
      <GuestAccountPanel />
    </CheckoutShell>
  ),
});
