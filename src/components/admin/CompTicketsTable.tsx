import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
  AdminTableEmpty,
  AdminTableLoading,
  AdminBadge,
  AdminButton,
  AdminSearchInput,
  AdminToolbar,
  AdminToolbarLeft,
} from "@/components/admin";
import { useState } from "react";
import { Gift, Mail, MailX, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface CompTicketsTableProps {
  onRefetch?: () => void;
}

export default function CompTicketsTable({ onRefetch }: CompTicketsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [resending, setResending] = useState<string | null>(null);

  const { data: compTickets, isLoading, refetch } = useAuthQuery({
    queryKey: ["comp-tickets", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("registrations")
        .select("id, name, email, ticket_type, created_at, checked_in, checked_in_at, metadata, order_number")
        .eq("payment_status", "comp")
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 15000,
  });

  const handleResendEmail = async (registrationId: string, name: string) => {
    setResending(registrationId);
    try {
      const { error } = await supabase.functions.invoke("send-ticket-email", {
        body: { registrationId },
      });
      if (error) throw error;
      toast.success(`Confirmation email resent to ${name}`);
    } catch (err: any) {
      if (err?.message?.includes("Rate limit")) {
        toast.error("Please wait before sending another email");
      } else {
        toast.error("Failed to resend email");
      }
    } finally {
      setResending(null);
    }
  };

  const getMetadata = (meta: any) => {
    if (!meta || typeof meta !== "object") return {};
    return meta as Record<string, any>;
  };

  return (
    <div>
      <AdminToolbar>
        <AdminToolbarLeft>
          <AdminSearchInput
            placeholder="Search comp tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        </AdminToolbarLeft>
      </AdminToolbar>

      <AdminTable>
        <AdminTableHeader>
          <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
            <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Guest</AdminTableHead>
            <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden md:table-cell">Email</AdminTableHead>
            <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Type</AdminTableHead>
            <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden lg:table-cell">Comp</AdminTableHead>
            <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden lg:table-cell">Guest Of</AdminTableHead>
            <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Status</AdminTableHead>
            <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Actions</AdminTableHead>
          </AdminTableRow>
        </AdminTableHeader>
        <AdminTableBody>
          {isLoading ? (
            <AdminTableLoading rows={5} cols={7} />
          ) : !compTickets?.length ? (
            <AdminTableEmpty
              icon={<Gift className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />}
              title="No comp tickets issued"
              description="Issue comp tickets using the button above."
            />
          ) : (
            compTickets.map((ticket) => {
              const meta = getMetadata(ticket.metadata);
              const hasEmail = meta.has_email !== false && !ticket.email.includes("@no-email.comp");

              return (
                <AdminTableRow key={ticket.id} className="hover:bg-[hsl(var(--admin-hover))]">
                  <AdminTableCell className="font-medium text-[hsl(var(--admin-text))]">
                    {ticket.name}
                  </AdminTableCell>
                  <AdminTableCell className="hidden md:table-cell text-sm text-[hsl(var(--admin-text-muted))]">
                    {hasEmail ? ticket.email : (
                      <span className="flex items-center gap-1 text-[hsl(var(--admin-warning))]">
                        <MailX className="h-3 w-3" />
                        No email
                      </span>
                    )}
                  </AdminTableCell>
                  <AdminTableCell className="text-sm text-[hsl(var(--admin-text))]">
                    {ticket.ticket_type}
                  </AdminTableCell>
                  <AdminTableCell className="hidden lg:table-cell text-sm text-[hsl(var(--admin-text-muted))]">
                    {meta.comp_type || "—"}
                  </AdminTableCell>
                  <AdminTableCell className="hidden lg:table-cell text-sm text-[hsl(var(--admin-text-muted))]">
                    {meta.guest_of_name ? (
                      <span>
                        {meta.guest_of_name}
                        <span className="text-xs ml-1 text-[hsl(var(--admin-text-muted))]">
                          ({meta.guest_of_type})
                        </span>
                      </span>
                    ) : "—"}
                  </AdminTableCell>
                  <AdminTableCell>
                    {ticket.checked_in ? (
                      <AdminBadge intent="success" showDot>Checked In</AdminBadge>
                    ) : hasEmail ? (
                      <AdminBadge intent="neutral" showDot>Issued</AdminBadge>
                    ) : (
                      <AdminBadge intent="warning" showDot>Door Only</AdminBadge>
                    )}
                  </AdminTableCell>
                  <AdminTableCell>
                    {hasEmail && (
                      <AdminButton
                        size="sm"
                        variant="adminOutline"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleResendEmail(ticket.id, ticket.name)}
                        disabled={resending === ticket.id}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        {resending === ticket.id ? "Sending..." : "Resend"}
                      </AdminButton>
                    )}
                  </AdminTableCell>
                </AdminTableRow>
              );
            })
          )}
        </AdminTableBody>
      </AdminTable>
    </div>
  );
}
