import { createFileRoute } from "@tanstack/react-router";
import { OrganizerRecords } from "@/components/OrganizerRecords";

export const Route = createFileRoute("/organizer")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Organizer tools — Analog Tickets TEST" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: OrganizerRecords,
});
