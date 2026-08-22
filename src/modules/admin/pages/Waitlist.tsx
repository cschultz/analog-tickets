import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminStatCard,
} from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable, AdminTableBody, AdminTableCell, AdminTableHead, AdminTableHeader, AdminTableRow, AdminButton, AdminBadge, AdminInput } from "@/components/admin/AdminUI";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogFooter, AdminDialogHeader, AdminDialogTitle } from "@/components/admin/AdminDialog";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { toast } from "sonner";
import { Trash2, Search, Bell, Users, RefreshCw, Send, Gift, Loader2, Mail, Clock } from "lucide-react";
import { format } from "date-fns";
import { formatTicketType } from "@/lib/utils";
import { usePublishedEvent } from "@/hooks/usePublishedEvent";
import { EmailPreviewModal } from "@/components/admin/EmailPreviewModal";

interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  ticket_type: string;
  created_at: string;
  notified_at: string | null;
}

export default function AdminWaitlist() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [notifyingType, setNotifyingType] = useState<string | null>(null);
  
  // Upgrade offer modal state
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [upgradePrice, setUpgradePrice] = useState("350");
  const [sendingOffer, setSendingOffer] = useState(false);
  
  // Confirm dialog states
  const [confirmDinnerParty, setConfirmDinnerParty] = useState(false);
  const [confirmPartyOnly, setConfirmPartyOnly] = useState(false);
  
  const { data: event } = usePublishedEvent();

  // Auth-gated waitlist query
  const { data: entries = [], isLoading: loading, refetch: fetchWaitlist } = useAuthQuery({
    queryKey: ["waitlist-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_waitlist')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WaitlistEntry[];
    },
    staleTime: 60 * 1000,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this person from the waitlist?")) return;
    
    const { error } = await supabase
      .from('ticket_waitlist')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error("Failed to remove from waitlist");
    } else {
      toast.success("Removed from waitlist");
      fetchWaitlist();
    }
  };

  const handleMarkNotified = async (id: string) => {
    const { error } = await supabase
      .from('ticket_waitlist')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error("Failed to update");
    } else {
      toast.success("Marked as notified");
      fetchWaitlist();
    }
  };

  const handleNotifyAll = async (ticketType: string) => {
    setNotifyingType(ticketType);
    try {
      const { data, error } = await supabase.functions.invoke('notify-waitlist', {
        body: { ticket_type: ticketType }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Notified ${data.notified} people on the waitlist`);
        if (data.failed > 0) {
          toast.warning(`${data.failed} emails failed to send`);
        }
        fetchWaitlist();
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err) {
      console.error("Error notifying waitlist:", err);
      toast.error("Failed to send notifications");
    } finally {
      setNotifyingType(null);
      setConfirmDinnerParty(false);
      setConfirmPartyOnly(false);
    }
  };

  const handleOpenUpgradeModal = (entry: WaitlistEntry) => {
    setSelectedEntry(entry);
    setUpgradePrice("350");
    setUpgradeModalOpen(true);
  };

  const handleSendUpgradeOffer = async () => {
    if (!selectedEntry || !event) {
      toast.error("Missing required information");
      return;
    }

    const priceInCents = Math.round(parseFloat(upgradePrice) * 100);
    if (isNaN(priceInCents) || priceInCents <= 0) {
      toast.error("Please enter a valid price");
      return;
    }

    setSendingOffer(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-waitlist-upgrade-offer', {
        body: {
          waitlist_entry_id: selectedEntry.id,
          price_in_cents: priceInCents,
          event_id: event.id
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Upgrade offer sent to ${selectedEntry.email}`);
        setUpgradeModalOpen(false);
        fetchWaitlist();
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err) {
      console.error("Error sending upgrade offer:", err);
      toast.error("Failed to send upgrade offer");
    } finally {
      setSendingOffer(false);
    }
  };

  const filteredEntries = entries.filter(entry =>
    entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.ticket_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dinnerPartyCount = entries.filter(e => e.ticket_type === 'dinner_party').length;
  const dinnerPartyPending = entries.filter(e => e.ticket_type === 'dinner_party' && !e.notified_at).length;
  const partyOnlyCount = entries.filter(e => e.ticket_type === 'party_only').length;
  const partyOnlyPending = entries.filter(e => e.ticket_type === 'party_only' && !e.notified_at).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Ticket Waitlist"
        subtitle="Manage people waiting for sold out ticket types"
        icon={Clock}
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <AdminStatCard label="Total Waitlist" value={entries.length} icon={Users} />
        <AdminCard>
          <AdminCardHeader>
            <div className="flex items-center justify-between w-full">
              <AdminCardTitle className="text-sm">Dinner + Party</AdminCardTitle>
              <Bell className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            </div>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="text-2xl font-bold">{dinnerPartyCount}</div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">{dinnerPartyPending} not yet notified</p>
            {dinnerPartyPending > 0 && (
              <AdminButton size="sm" className="mt-3 w-full" disabled={notifyingType === 'dinner_party'} onClick={() => setConfirmDinnerParty(true)}>
                <Send className="h-4 w-4 mr-2" />
                {notifyingType === 'dinner_party' ? 'Sending...' : 'Notify All'}
              </AdminButton>
            )}
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader>
            <div className="flex items-center justify-between w-full">
              <AdminCardTitle className="text-sm">Party Only</AdminCardTitle>
              <Bell className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            </div>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="text-2xl font-bold">{partyOnlyCount}</div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">{partyOnlyPending} not yet notified</p>
            {partyOnlyPending > 0 && (
              <AdminButton size="sm" className="mt-3 w-full" disabled={notifyingType === 'party_only'} onClick={() => setConfirmPartyOnly(true)}>
                <Send className="h-4 w-4 mr-2" />
                {notifyingType === 'party_only' ? 'Sending...' : 'Notify All'}
              </AdminButton>
            )}
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Confirm Dialogs */}
      <AdminConfirmDialog
        open={confirmDinnerParty}
        onOpenChange={setConfirmDinnerParty}
        title="Send Waitlist Notifications?"
        description={`This will send an email to ${dinnerPartyPending} people on the Dinner + Party waitlist, letting them know tickets are now available.`}
        onConfirm={() => handleNotifyAll('dinner_party')}
        actionLabel="Send Notifications"
        isLoading={notifyingType === 'dinner_party'}
      />
      <AdminConfirmDialog
        open={confirmPartyOnly}
        onOpenChange={setConfirmPartyOnly}
        title="Send Waitlist Notifications?"
        description={`This will send an email to ${partyOnlyPending} people on the Party Only waitlist, letting them know tickets are now available.`}
        onConfirm={() => handleNotifyAll('party_only')}
        actionLabel="Send Notifications"
        isLoading={notifyingType === 'party_only'}
      />

      {/* Search and Actions */}
      <AdminCard>
        <AdminCardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between w-full">
            <div>
              <AdminCardTitle>Waitlist Entries</AdminCardTitle>
              <AdminCardDescription>
                People waiting for tickets to become available
              </AdminCardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <AdminButton variant="outline" size="icon" onClick={() => fetchWaitlist()}>
                <RefreshCw className="h-4 w-4" />
              </AdminButton>
            </div>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
              {searchQuery ? "No matching entries found" : "No one on the waitlist yet"}
            </div>
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Name</AdminTableHead>
                  <AdminTableHead>Email</AdminTableHead>
                  <AdminTableHead>Ticket Type</AdminTableHead>
                  <AdminTableHead>Signed Up</AdminTableHead>
                  <AdminTableHead>Status</AdminTableHead>
                  <AdminTableHead className="text-right">Actions</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {filteredEntries.map((entry) => (
                  <AdminTableRow key={entry.id}>
                    <AdminTableCell className="font-medium">{entry.name}</AdminTableCell>
                    <AdminTableCell>{entry.email}</AdminTableCell>
                    <AdminTableCell>
                      <AdminBadge intent="neutral">
                        {formatTicketType(entry.ticket_type)}
                      </AdminBadge>
                    </AdminTableCell>
                    <AdminTableCell>
                      {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                    </AdminTableCell>
                    <AdminTableCell>
                      {entry.notified_at ? (
                        <AdminBadge intent="neutral">
                          Notified {format(new Date(entry.notified_at), 'MMM d')}
                        </AdminBadge>
                      ) : (
                        <AdminBadge intent="info">Waiting</AdminBadge>
                      )}
                    </AdminTableCell>
                    <AdminTableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <EmailPreviewModal
                          type="waitlist_confirmation"
                          name={entry.name}
                          email={entry.email}
                          ticketType={entry.ticket_type}
                          trigger={
                            <AdminButton variant="ghost" size="icon" title="Preview Confirmation Email">
                              <Mail className="h-4 w-4" />
                            </AdminButton>
                          }
                        />
                        {entry.ticket_type === 'dinner_party' && !entry.notified_at && (
                          <AdminButton size="sm" onClick={() => handleOpenUpgradeModal(entry)} className="gap-1">
                            <Gift className="h-4 w-4" />
                            Send Offer
                          </AdminButton>
                        )}
                        {!entry.notified_at && (
                          <AdminButton variant="outline" size="sm" onClick={() => handleMarkNotified(entry.id)}>
                            <Bell className="h-4 w-4 mr-1" />
                            Mark Notified
                          </AdminButton>
                        )}
                        <AdminButton variant="ghost" size="icon" onClick={() => handleDelete(entry.id)}>
                          <Trash2 className="h-4 w-4 text-[hsl(var(--admin-error))]" />
                        </AdminButton>
                      </div>
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* Upgrade Offer Modal */}
      <AdminDialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Send Dinner + Party Offer</AdminDialogTitle>
            <AdminDialogDescription>
              Send {selectedEntry?.name} a personalized checkout link to purchase a Dinner + Party ticket.
            </AdminDialogDescription>
          </AdminDialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <AdminLabel className="text-[hsl(var(--admin-text-muted))]">Name</AdminLabel>
                <p className="font-medium">{selectedEntry?.name}</p>
              </div>
              <div>
                <AdminLabel className="text-[hsl(var(--admin-text-muted))]">Email</AdminLabel>
                <p className="font-medium">{selectedEntry?.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <AdminLabel htmlFor="price">Ticket Price ($)</AdminLabel>
              <AdminInput
                id="price"
                type="number"
                min="0"
                step="1"
                value={upgradePrice}
                onChange={(e) => setUpgradePrice(e.target.value)}
                placeholder="350"
              />
              <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                They'll receive an email with a checkout link for a Dinner + Party ticket at this price.
              </p>
            </div>
          </div>

          <AdminDialogFooter>
            <AdminButton variant="outline" onClick={() => setUpgradeModalOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton onClick={handleSendUpgradeOffer} disabled={sendingOffer || !event}>
              {sendingOffer ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Gift className="h-4 w-4 mr-2" />
                  Send Offer
                </>
              )}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}
