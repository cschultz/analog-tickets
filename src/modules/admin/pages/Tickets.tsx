import { TicketManagement } from "@/components/TicketManagement";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Ticket } from "lucide-react";

export default function TicketsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Ticket Management"
        subtitle="Manage tickets, transfers, and inventory"
        icon={Ticket}
      />
      <TicketManagement />
    </div>
  );
}
