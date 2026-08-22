import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminStatCard,
} from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminButton, AdminInput } from "@/components/admin/AdminUI";
import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
} from "@/components/admin";
import { Download, Search, Users, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface PreviewSignup {
  id: string;
  email: string;
  first_name: string | null;
  phone: string | null;
  created_at: string;
}

const PreviewSignups = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: signups, isLoading, refetch } = useAuthQuery({
    queryKey: ["preview-signups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("preview_signups")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching preview signups:", error);
        throw error;
      }
      return data as PreviewSignup[];
    },
    staleTime: 60 * 1000,
  });

  const filteredSignups = signups?.filter((signup) =>
    signup.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (signup.first_name && signup.first_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (signup.phone && signup.phone.includes(searchQuery))
  );

  const handleExport = () => {
    if (!signups || signups.length === 0) {
      toast.error("No signups to export");
      return;
    }

    const csvContent = [
      ["First Name", "Email", "Phone", "Signup Date"].join(","),
      ...signups.map((signup) =>
        [
          signup.first_name || "",
          signup.email,
          signup.phone || "",
          format(new Date(signup.created_at), "yyyy-MM-dd HH:mm:ss")
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preview-signups-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Signups exported successfully");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("preview_signups").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete signup");
    } else {
      toast.success("Signup deleted");
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Preview Signups"
        subtitle="May 2026 interest list from /preview page"
        icon={Eye}
        actions={
          <AdminButton variant="admin" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </AdminButton>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AdminStatCard
          label="Total Signups"
          value={signups?.length || 0}
          icon={Users}
        />
      </div>

      <AdminCard>
        <AdminCardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              <AdminInput
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {isLoading ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">Loading...</div>
          ) : filteredSignups?.length === 0 ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">No signups found</div>
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Name</AdminTableHead>
                  <AdminTableHead>Email</AdminTableHead>
                  <AdminTableHead>Phone</AdminTableHead>
                  <AdminTableHead>Signup Date</AdminTableHead>
                  <AdminTableHead className="w-16"></AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {filteredSignups?.map((signup) => (
                  <AdminTableRow key={signup.id}>
                    <AdminTableCell>{signup.first_name || "—"}</AdminTableCell>
                    <AdminTableCell className="font-medium">{signup.email}</AdminTableCell>
                    <AdminTableCell>{signup.phone || "—"}</AdminTableCell>
                    <AdminTableCell>{format(new Date(signup.created_at), "MMM d, yyyy h:mm a")}</AdminTableCell>
                    <AdminTableCell>
                      <AdminButton
                        variant="adminGhost"
                        size="icon"
                        onClick={() => handleDelete(signup.id)}
                        className="text-[hsl(var(--admin-error))] hover:text-[hsl(var(--admin-error))]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </AdminButton>
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCardContent>
      </AdminCard>
    </div>
  );
};

export default PreviewSignups;
