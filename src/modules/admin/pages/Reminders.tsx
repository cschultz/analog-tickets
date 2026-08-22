import { EventRemindersManager } from "@/components/EventRemindersManager";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Bell } from "lucide-react";

export default function RemindersPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Event Reminders"
        subtitle="Configure automated event reminders"
        icon={Bell}
      />
      <EventRemindersManager />
    </div>
  );
}
