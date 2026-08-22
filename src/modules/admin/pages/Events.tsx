import { EventManager } from "@/components/EventManager";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Calendar } from "lucide-react";

export default function EventsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Event Management"
        subtitle="Create and manage your events"
        icon={Calendar}
      />
      <EventManager />
    </div>
  );
}
