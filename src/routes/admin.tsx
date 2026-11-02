import { createFileRoute } from "@tanstack/react-router";
import { OrganizerRecords } from "@/components/OrganizerRecords";
export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Administration — Analog Tickets TEST" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: () => <OrganizerRecords initialSection="dashboard" />,
});
