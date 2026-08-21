import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminButton,
  AdminBadge,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminTableEmpty,
  AdminCheckbox,
} from "@/components/admin";
import { Users, Send, Loader2, Check, Clock, Mail, Copy, Link } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  created_at: string;
  notified_at: string | null;
  registration_id: string | null;
  token?: string | null;
}

export function LodgingWaitlistCard() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: waitlist, isLoading } = useAuthQuery({
    queryKey: ["accommodation-waitlist"],
    queryFn: async () => {
      // Get active event
      const { data: event } = await supabase
        .from("event_details")
        .select("id")
        .eq("is_active", true)
        .single();

      if (!event) return [];

      const { data, error } = await (supabase as any)
        .from("accommodation_waitlist")
        .select("id, name, email, created_at, notified_at, registration_id")
        .eq("event_id", event.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Fetch tokens for invited entries
      const waitlistData = (data || []) as WaitlistEntry[];
      const invitedEmails = waitlistData
        .filter(w => w.notified_at)
        .map(w => w.email);
      
      if (invitedEmails.length > 0) {
        const { data: tokens } = await (supabase as any)
          .from("lodging_invite_tokens")
          .select("email, token")
          .in("email", invitedEmails);
        
        const tokenMap = new Map<string, string>(tokens?.map((t: any) => [t.email, t.token]) || []);
        waitlistData.forEach(w => {
          w.token = tokenMap.get(w.email) ?? null;
        });
      }
      
      return waitlistData;
    },
    staleTime: 30 * 1000,
  });

  const copyInviteUrl = (token: string, name: string) => {
    const url = `https://example.org/accommodations/invite?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success(`Copied invite URL for ${name}`);
  };

  const sendInvitesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { waitlistIds: ids },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["accommodation-waitlist"] });
      setSelectedIds([]);
      toast.success(`Sent ${data.sent} invite${data.sent !== 1 ? "s" : ""}`);
      if (data.errors?.length) {
        toast.error(`${data.errors.length} failed to send`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send invites");
    },
  });

  const sendAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { sendToAll: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["accommodation-waitlist"] });
      toast.success(`Sent ${data.sent} invite${data.sent !== 1 ? "s" : ""}`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send invites");
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const unnotified = waitlist?.filter((w) => !w.notified_at) || [];
    if (selectedIds.length === unnotified.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(unnotified.map((w) => w.id));
    }
  };

  const handleSendSelected = () => {
    if (selectedIds.length === 0) {
      toast.error("Select entries to send invites to");
      return;
    }
    if (confirm(`Send invites to ${selectedIds.length} guest${selectedIds.length !== 1 ? "s" : ""}?`)) {
      sendInvitesMutation.mutate(selectedIds);
    }
  };

  const handleSendAll = () => {
    const unnotifiedCount = waitlist?.filter((w) => !w.notified_at).length || 0;
    if (unnotifiedCount === 0) {
      toast.error("No uninvited guests on waitlist");
      return;
    }
    if (confirm(`Send invites to all ${unnotifiedCount} uninvited guest${unnotifiedCount !== 1 ? "s" : ""}?`)) {
      sendAllMutation.mutate();
    }
  };

  const unnotifiedCount = waitlist?.filter((w) => !w.notified_at).length || 0;
  const notifiedCount = waitlist?.filter((w) => w.notified_at).length || 0;

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
          Loading waitlist...
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            <AdminCardTitle className="text-base font-semibold">
              Accommodation Waitlist
            </AdminCardTitle>
            <AdminBadge intent="neutral">{waitlist?.length || 0}</AdminBadge>
          </div>
          <div className="flex items-center gap-2">
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={handleSendSelected}
              disabled={selectedIds.length === 0 || sendInvitesMutation.isPending}
            >
              {sendInvitesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Send Selected ({selectedIds.length})
            </AdminButton>
            <AdminButton
              size="sm"
              onClick={handleSendAll}
              disabled={unnotifiedCount === 0 || sendAllMutation.isPending}
            >
              {sendAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Mail className="h-4 w-4 mr-1" />
              )}
              Send All ({unnotifiedCount})
            </AdminButton>
          </div>
        </div>
        <AdminCardDescription className="text-xs">
          {notifiedCount} invited, {unnotifiedCount} pending
        </AdminCardDescription>
      </AdminCardHeader>

      <AdminCardContent>
        {!waitlist?.length ? (
          <AdminTable>
            <AdminTableBody>
              <AdminTableEmpty
                title="No waitlist entries"
                description="Guests who request lodging will appear here"
              />
            </AdminTableBody>
          </AdminTable>
        ) : (
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead className="w-10">
                  <AdminCheckbox
                    checked={selectedIds.length === unnotifiedCount && unnotifiedCount > 0}
                    onCheckedChange={toggleSelectAll}
                    disabled={unnotifiedCount === 0}
                  />
                </AdminTableHead>
                <AdminTableHead>Name</AdminTableHead>
                <AdminTableHead>Email</AdminTableHead>
                <AdminTableHead>Joined</AdminTableHead>
                <AdminTableHead className="text-center">Status</AdminTableHead>
                <AdminTableHead className="w-10"></AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {waitlist.map((entry) => (
                <AdminTableRow key={entry.id} className={entry.notified_at ? "opacity-60" : ""}>
                  <AdminTableCell>
                    <AdminCheckbox
                      checked={selectedIds.includes(entry.id)}
                      onCheckedChange={() => toggleSelect(entry.id)}
                      disabled={!!entry.notified_at}
                    />
                  </AdminTableCell>
                  <AdminTableCell className="font-medium">{entry.name}</AdminTableCell>
                  <AdminTableCell>{entry.email}</AdminTableCell>
                  <AdminTableCell>
                    {format(new Date(entry.created_at), "MMM d, yyyy")}
                  </AdminTableCell>
                  <AdminTableCell className="text-center">
                    {entry.notified_at ? (
                      <AdminBadge intent="success">
                        <Check className="h-3 w-3 mr-1" />
                        Invited
                      </AdminBadge>
                    ) : (
                      <AdminBadge intent="warning">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </AdminBadge>
                    )}
                  </AdminTableCell>
                  <AdminTableCell>
                    {entry.token && (
                      <AdminButton
                        variant="adminGhost"
                        size="sm"
                        onClick={() => copyInviteUrl(entry.token!, entry.name)}
                        title="Copy invite URL"
                      >
                        <Link className="h-4 w-4" />
                      </AdminButton>
                    )}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
