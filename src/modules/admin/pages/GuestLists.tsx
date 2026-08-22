import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminButton } from "@/components/admin";
import { Users, Gift } from "lucide-react";
import CompTicketsTable from "@/components/admin/CompTicketsTable";
import IssueCompTicket from "@/components/admin/IssueCompTicket";
import { useQueryClient } from "@tanstack/react-query";

export default function GuestListsPage() {
  const [compDialogOpen, setCompDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <AdminPageHeader
          title="Guest Lists"
          subtitle="Issue and manage comp tickets for artists, staff, and VIPs"
          icon={Users}
        />
        <AdminButton variant="admin" onClick={() => setCompDialogOpen(true)} className="gap-2 shrink-0">
          <Gift className="h-4 w-4" />
          Issue Comp Ticket
        </AdminButton>
      </div>

      <CompTicketsTable />

      <IssueCompTicket
        open={compDialogOpen}
        onClose={() => setCompDialogOpen(false)}
        onSuccess={() => {
          setCompDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["comp-tickets"] });
        }}
      />
    </div>
  );
}
