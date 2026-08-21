import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminButton, AdminBadge } from "@/components/admin/AdminUI";
import {
  AdminInput,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminCheckbox,
} from "@/components/admin";
import { Search, Send, Home, RefreshCw, Download, Check, Loader2, Mail, Eye, X, UserPlus, MessageSquare, CheckCircle } from "lucide-react";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogFooter, AdminDialogHeader, AdminDialogTitle, AdminLabel } from "@/components/admin";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatTicketType } from "@/lib/utils";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { AdminCard, AdminCardHeader, AdminCardTitle, AdminCardDescription, AdminCardContent, AdminStatCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { FollowUpDrawer } from "@/components/admin/lodging/FollowUpDrawer";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  created_at: string;
  notified_at: string | null;
  registration_id: string | null;
  ticket_type?: string;
  has_booked?: boolean;
}

export default function AccommodationWaitlistPage() {
  const { selectedEventId, isLoading: eventLoading } = useAdminEvent();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewEntry, setPreviewEntry] = useState<WaitlistEntry | null>(null);
  
  // Add to waitlist state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Follow-up drawer state
  const [showFollowUpDrawer, setShowFollowUpDrawer] = useState(false);
  const [followUpEntry, setFollowUpEntry] = useState<WaitlistEntry | null>(null);
  const [isSendingAllFollowUps, setIsSendingAllFollowUps] = useState(false);

  const showLoading = eventLoading || !selectedEventId;

  useEffect(() => {
    if (selectedEventId) {
      fetchWaitlistEntries();
    }
  }, [selectedEventId]);

  useEffect(() => {
    filterEntries();
  }, [searchTerm, entries]);

  const fetchWaitlistEntries = async () => {
    setIsLoading(true);
    try {
      // Fetch from accommodation_waitlist table with registration info
      const { data, error } = await (supabase as any)
        .from("accommodation_waitlist")
        .select(`
          id, name, email, created_at, notified_at, registration_id,
          registrations!accommodation_waitlist_registration_id_fkey(ticket_type)
        `)
        .eq("event_id", selectedEventId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      
      // Get all emails from waitlist entries to check for bookings (lowercase for comparison)
      const emails = (data || []).map((e: any) => e.email.toLowerCase());
      
      // Fetch ALL lodging bookings with valid payment status, then filter client-side
      // This handles case-insensitive email matching (Supabase .in() is case-sensitive)
      const { data: allBookings } = await supabase
        .from("lodging_bookings")
        .select("email")
        .in("payment_status", ["paid", "completed", "comp"]);
      
      // Build a set of booked emails (lowercase) by filtering bookings whose email matches our waitlist
      const bookedEmails = new Set(
        (allBookings || [])
          .filter((b: any) => emails.includes(b.email.toLowerCase()))
          .map((b: any) => b.email.toLowerCase())
      );
      
      // Fetch registrations by email for entries without registration_id link
      // This catches people who paid via custom offers or other flows
      const { data: registrationsByEmail } = await supabase
        .from("registrations")
        .select("email, ticket_type")
        .in("payment_status", ["paid", "completed"])
        .in("email", emails);
      
      // Build a map of email -> ticket_type from registrations
      const emailToTicketType = new Map<string, string>();
      (registrationsByEmail || []).forEach((r: any) => {
        const email = r.email.toLowerCase();
        // Prefer qualifying ticket types (VIP/Crew) over GA
        const existing = emailToTicketType.get(email);
        if (!existing || r.ticket_type?.includes("vip") || r.ticket_type?.includes("krewe")) {
          emailToTicketType.set(email, r.ticket_type);
        }
      });
      
      // Flatten the ticket_type from the join and add booking status
      const formatted = (data || []).map((entry: any) => {
        // First try the FK join, then fall back to email lookup
        const ticketType = entry.registrations?.ticket_type || 
                          emailToTicketType.get(entry.email.toLowerCase()) || 
                          null;
        return {
          ...entry,
          ticket_type: ticketType,
          has_booked: bookedEmails.has(entry.email.toLowerCase()),
        };
      });
      
      setEntries(formatted);
    } catch (error: any) {
      console.error("Error fetching waitlist:", error);
      toast.error("Failed to load waitlist");
    } finally {
      setIsLoading(false);
    }
  };

  const filterEntries = () => {
    let filtered = entries;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(term) ||
          e.email.toLowerCase().includes(term)
      );
    }

    setFilteredEntries(filtered);
  };

  const uninvitedEntries = filteredEntries.filter((e) => !e.notified_at);

  const handleSelectAll = () => {
    if (selectedIds.length === uninvitedEntries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(uninvitedEntries.map((e) => e.id));
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSendSelected = async () => {
    if (selectedIds.length === 0) {
      toast.error("Please select at least one entry");
      return;
    }

    if (!confirm(`Send lodging invites to ${selectedIds.length} guest${selectedIds.length !== 1 ? "s" : ""}?`)) {
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { waitlistIds: selectedIds },
      });

      if (error) throw error;

      toast.success(`Sent ${data.sent} invite${data.sent !== 1 ? "s" : ""}`);
      if (data.errors?.length) {
        toast.error(`${data.errors.length} failed to send`);
      }
      setSelectedIds([]);
      fetchWaitlistEntries();
    } catch (error: any) {
      console.error("Error sending invites:", error);
      toast.error(error.message || "Failed to send invites");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAll = async () => {
    const count = uninvitedEntries.length;
    if (count === 0) {
      toast.error("No uninvited guests on waitlist");
      return;
    }

    if (!confirm(`Send lodging invites to ALL ${count} uninvited guest${count !== 1 ? "s" : ""}?`)) {
      return;
    }

    setIsSendingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { sendToAll: true },
      });

      if (error) throw error;

      toast.success(`Sent ${data.sent} invite${data.sent !== 1 ? "s" : ""}`);
      fetchWaitlistEntries();
    } catch (error: any) {
      console.error("Error sending invites:", error);
      toast.error(error.message || "Failed to send invites");
    } finally {
      setIsSendingAll(false);
    }
  };

  const handleOpenFollowUpDrawer = (entry: WaitlistEntry) => {
    setFollowUpEntry(entry);
    setShowFollowUpDrawer(true);
  };

  const handleSendAllFollowUps = async () => {
    const eligibleEntries = entries.filter(e => e.notified_at && !e.has_booked);
    if (eligibleEntries.length === 0) {
      toast.info("No guests need follow-up emails");
      return;
    }

    if (!confirm(`Send follow-up emails to ${eligibleEntries.length} guest${eligibleEntries.length !== 1 ? "s" : ""} who haven't booked yet?`)) {
      return;
    }

    setIsSendingAllFollowUps(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-lodging-followup", {
        body: { waitlistIds: eligibleEntries.map(e => e.id) },
      });

      if (error) throw error;

      toast.success(`Sent ${data.sent} follow-up email${data.sent !== 1 ? "s" : ""}!`);
      if (data.skipped > 0) {
        toast.info(`${data.skipped} had already booked`);
      }
      fetchWaitlistEntries();
    } catch (error: any) {
      console.error("Error sending follow-ups:", error);
      toast.error(error.message || "Failed to send follow-ups");
    } finally {
      setIsSendingAllFollowUps(false);
    }
  };

  const handlePreviewEmail = async (entry?: WaitlistEntry) => {
    setIsLoadingPreview(true);
    setPreviewEntry(entry || null);
    try {
      // Fetch the email template settings
      const { data: settings } = await supabase
        .from("lodging_settings")
        .select("invite_email_subject, invite_email_body")
        .limit(1)
        .maybeSingle();
      
      // Call the preview endpoint with optional entry data for personalization
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { 
          isPreview: true,
          previewName: entry?.name,
          previewEmail: entry?.email,
        },
      });
      
      if (error) throw error;
      
      setPreviewSubject(settings?.invite_email_subject || "Your Exclusive Lodging Invitation");
      setPreviewHtml(data.html);
      setShowPreview(true);
    } catch (error: any) {
      console.error("Error loading preview:", error);
      toast.error(error.message || "Failed to load preview");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleAddToWaitlist = async () => {
    if (!addName.trim() || !addEmail.trim()) {
      toast.error("Please enter both name and email");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(addEmail.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsAdding(true);
    try {
      // Check if already on waitlist
      const { data: existing } = await supabase
        .from("accommodation_waitlist")
        .select("id")
        .eq("email", addEmail.trim().toLowerCase())
        .eq("event_id", selectedEventId)
        .maybeSingle();

      if (existing) {
        toast.error("This email is already on the waitlist");
        setIsAdding(false);
        return;
      }

      // Add to waitlist
      const { error: insertError } = await supabase
        .from("accommodation_waitlist")
        .insert({
          name: addName.trim(),
          email: addEmail.trim().toLowerCase(),
          event_id: selectedEventId,
        });

      if (insertError) throw insertError;

      toast.success(`${addName.trim()} added to waitlist`);
      setShowAddDialog(false);
      setAddName("");
      setAddEmail("");
      fetchWaitlistEntries();
    } catch (error: any) {
      toast.error(error.message || "Failed to add to waitlist");
    } finally {
      setIsAdding(false);
    }
  };

  const exportToCSV = () => {
    const headers = ["Position", "Name", "Email", "Ticket Type", "Joined Date", "Invited At", "Booked"];
    const rows = filteredEntries.map((e, index) => [
      index + 1,
      e.name,
      e.email,
      e.ticket_type ? formatTicketType(e.ticket_type) : "",
      format(new Date(e.created_at), "MMM d, yyyy h:mm a"),
      e.notified_at ? format(new Date(e.notified_at), "MMM d, yyyy h:mm a") : "",
      e.has_booked ? "Yes" : "No",
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accommodation-waitlist-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const totalCount = entries.length;
  const invitedCount = entries.filter((e) => e.notified_at).length;
  const pendingCount = entries.filter((e) => !e.notified_at).length;
  const bookedCount = entries.filter((e) => e.has_booked).length;
  const invitedNotBookedCount = entries.filter((e) => e.notified_at && !e.has_booked).length;

  if (showLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Accommodation Waitlist"
          subtitle="Ticket holders who opted in for accommodation notifications"
          icon={Home}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-primary))]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Accommodation Waitlist"
        subtitle="Ticket holders who opted in for accommodation notifications"
        icon={Home}
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={fetchWaitlistEntries}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </AdminButton>
            <AdminButton variant="adminOutline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </AdminButton>
            <AdminButton variant="admin" size="sm" onClick={() => setShowAddDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add to Waitlist
            </AdminButton>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total on Waitlist"
          value={totalCount}
          icon={Home}
        />
        <AdminStatCard
          label="Invited"
          value={invitedCount}
          icon={Check}
        />
        <AdminStatCard
          label="Booked"
          value={bookedCount}
          icon={CheckCircle}
        />
        <AdminStatCard
          label="Needs Follow-up"
          value={invitedNotBookedCount}
          icon={MessageSquare}
        />
      </div>

      {/* Actions */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle>Send Lodging Invites</AdminCardTitle>
          <AdminCardDescription>
            Send tokenized invite links so guests can select and book accommodations
          </AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              <AdminInput
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <AdminButton
              variant="adminOutline"
              onClick={() => handlePreviewEmail()}
              disabled={isLoadingPreview}
            >
              {isLoadingPreview ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              Preview Email
            </AdminButton>
            <AdminButton
              variant="adminOutline"
              onClick={handleSendSelected}
              disabled={selectedIds.length === 0 || isSending}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Selected ({selectedIds.length})
            </AdminButton>
            <AdminButton
              onClick={handleSendAll}
              disabled={pendingCount === 0 || isSendingAll}
            >
              {isSendingAll ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Send All ({pendingCount})
            </AdminButton>
            {invitedNotBookedCount > 0 && (
              <AdminButton
                variant="adminOutline"
                onClick={handleSendAllFollowUps}
                disabled={isSendingAllFollowUps}
              >
                {isSendingAllFollowUps ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Send All Follow-ups ({invitedNotBookedCount})
              </AdminButton>
            )}
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Email Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto shadow-xl">
            <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-900">Email Preview</h3>
                {previewEntry && (
                  <p className="text-sm text-gray-500">
                    To: {previewEntry.name} &lt;{previewEntry.email}&gt;
                  </p>
                )}
              </div>
              <AdminButton variant="adminOutline" size="sm" onClick={() => setShowPreview(false)}>
                <X className="h-4 w-4" />
              </AdminButton>
            </div>
            <div className="p-4">
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> This is a preview only. The invite link shown below is a sample and will not work. 
                  A real tokenized link will be generated when you send the actual email.
                </p>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                <strong>Subject:</strong> {previewSubject}
              </p>
              <div
                className="border rounded-lg p-4 bg-gray-50"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <AdminCard>
        <AdminCardContent className="p-0">
          <div className="overflow-x-auto">
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead className="w-12">
                    <AdminCheckbox
                      checked={uninvitedEntries.length > 0 && selectedIds.length === uninvitedEntries.length}
                      onCheckedChange={handleSelectAll}
                      disabled={uninvitedEntries.length === 0}
                    />
                  </AdminTableHead>
                  <AdminTableHead className="w-16">#</AdminTableHead>
                  <AdminTableHead>Name</AdminTableHead>
                  <AdminTableHead>Email</AdminTableHead>
                  <AdminTableHead>Ticket Type</AdminTableHead>
                  <AdminTableHead>Joined Date</AdminTableHead>
                  <AdminTableHead className="text-center">Invite Status</AdminTableHead>
                  <AdminTableHead className="text-center">Booked</AdminTableHead>
                  <AdminTableHead className="w-28 text-right">Actions</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {isLoading ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={9} className="text-center py-8">
                      Loading...
                    </AdminTableCell>
                  </AdminTableRow>
                ) : filteredEntries.length === 0 ? (
                  <AdminTableRow>
                    <AdminTableCell colSpan={9} className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
                      No entries on accommodation waitlist
                    </AdminTableCell>
                  </AdminTableRow>
                ) : (
                  filteredEntries.map((entry, index) => (
                    <AdminTableRow key={entry.id} className={entry.has_booked ? "" : entry.notified_at ? "" : ""}>
                      <AdminTableCell>
                        <AdminCheckbox
                          checked={selectedIds.includes(entry.id)}
                          onCheckedChange={() => handleSelectOne(entry.id)}
                          disabled={!!entry.notified_at}
                        />
                      </AdminTableCell>
                      <AdminTableCell className="font-medium text-[hsl(var(--admin-text-muted))]">
                        {index + 1}
                      </AdminTableCell>
                      <AdminTableCell className="font-medium">{entry.name}</AdminTableCell>
                      <AdminTableCell>{entry.email}</AdminTableCell>
                      <AdminTableCell>
                        {entry.ticket_type ? (
                          <AdminBadge intent="neutral">
                            {formatTicketType(entry.ticket_type)}
                          </AdminBadge>
                        ) : (
                          <span className="text-[hsl(var(--admin-text-muted))] text-sm">—</span>
                        )}
                      </AdminTableCell>
                      <AdminTableCell>
                        {format(new Date(entry.created_at), "MMM d, yyyy")}
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        {entry.notified_at ? (
                          <AdminBadge intent="success">
                            <Check className="h-3 w-3 mr-1" />
                            Invited {format(new Date(entry.notified_at), "MMM d")}
                          </AdminBadge>
                        ) : (
                          <AdminBadge intent="warning">
                            Pending
                          </AdminBadge>
                        )}
                      </AdminTableCell>
                      <AdminTableCell className="text-center">
                        {entry.has_booked ? (
                          <AdminBadge intent="success">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Booked
                          </AdminBadge>
                        ) : entry.notified_at ? (
                          <AdminBadge intent="warning">
                            Not Yet
                          </AdminBadge>
                        ) : (
                          <span className="text-[hsl(var(--admin-text-muted))] text-sm">—</span>
                        )}
                      </AdminTableCell>
                      <AdminTableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!entry.notified_at && (
                            <AdminButton
                              variant="adminGhost"
                              size="sm"
                              onClick={() => handlePreviewEmail(entry)}
                              title={`Preview email for ${entry.name}`}
                            >
                              <Eye className="h-4 w-4" />
                            </AdminButton>
                          )}
                          {entry.notified_at && !entry.has_booked && (
                            <AdminButton
                              variant="adminOutline"
                              size="sm"
                              onClick={() => handleOpenFollowUpDrawer(entry)}
                              title={`Send follow-up to ${entry.name}`}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Follow-up
                            </AdminButton>
                          )}
                        </div>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))
                )}
              </AdminTableBody>
            </AdminTable>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Add to Waitlist Dialog */}
      <AdminDialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Add to Waitlist</AdminDialogTitle>
            <AdminDialogDescription>
              Manually add someone to the accommodation waitlist
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <AdminLabel htmlFor="add-name">Name *</AdminLabel>
              <AdminInput
                id="add-name"
                placeholder="Full name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <AdminLabel htmlFor="add-email">Email *</AdminLabel>
              <AdminInput
                id="add-email"
                type="email"
                placeholder="email@example.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
              />
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </AdminButton>
            <AdminButton onClick={handleAddToWaitlist} disabled={isAdding}>
              {isAdding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add to Waitlist
                </>
              )}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Follow-up Email Drawer */}
      <FollowUpDrawer
        open={showFollowUpDrawer}
        onOpenChange={setShowFollowUpDrawer}
        entry={followUpEntry}
        onSuccess={fetchWaitlistEntries}
      />
    </div>
  );
}
