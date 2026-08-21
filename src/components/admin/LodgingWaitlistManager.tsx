import { useState, useMemo } from "react";
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
  AdminInput,
  AdminBadge,
  AdminEmptyState,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin";
import { AdminCheckbox, AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { 
  Users, 
  Mail, 
  Search, 
  CheckCircle2, 
  Clock, 
  Send,
  Eye,
  Loader2,
  ChevronRight,
  ChevronLeft,
  MailCheck,
  UserPlus
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  created_at: string;
  notified_at: string | null;
  registration_id: string | null;
}

type WizardStep = "select" | "preview" | "send";

export function LodgingWaitlistManager() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [wizardStep, setWizardStep] = useState<WizardStep>("select");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewGuest, setPreviewGuest] = useState<WaitlistEntry | null>(null);
  
  // Add to waitlist state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const { data: waitlist = [], isLoading } = useAuthQuery({
    queryKey: ["lodging-waitlist-manager"],
    queryFn: async () => {
      const { data: activeEvent } = await supabase
        .from("event_details")
        .select("id")
        .eq("is_active", true)
        .maybeSingle();

      if (!activeEvent) return [];

      const { data, error } = await supabase
        .from("accommodation_waitlist")
        .select("*")
        .eq("event_id", activeEvent.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as WaitlistEntry[];
    },
    staleTime: 30 * 1000,
  });

  const filteredWaitlist = useMemo(() => {
    if (!searchTerm) return waitlist;
    const term = searchTerm.toLowerCase();
    return waitlist.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) ||
        entry.email.toLowerCase().includes(term)
    );
  }, [waitlist, searchTerm]);

  const pendingGuests = useMemo(
    () => filteredWaitlist.filter((e) => !e.notified_at),
    [filteredWaitlist]
  );

  const notifiedGuests = useMemo(
    () => filteredWaitlist.filter((e) => e.notified_at),
    [filteredWaitlist]
  );

  const selectedPendingCount = useMemo(
    () => [...selectedIds].filter((id) => pendingGuests.some((g) => g.id === id)).length,
    [selectedIds, pendingGuests]
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(pendingGuests.map((g) => g.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handlePreviewGuest = async (guest: WaitlistEntry) => {
    setPreviewGuest(guest);
    try {
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { 
          isPreview: true, 
          previewName: guest.name, 
          previewEmail: guest.email 
        },
      });
      if (error) throw error;
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject);
      setShowPreviewDialog(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to load preview");
    }
  };

  const handleProceedToPreview = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one guest");
      return;
    }
    
    // Load a sample preview
    const firstGuest = pendingGuests.find((g) => selectedIds.has(g.id));
    if (firstGuest) {
      try {
        const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
          body: { 
            isPreview: true, 
            previewName: firstGuest.name, 
            previewEmail: firstGuest.email 
          },
        });
        if (error) throw error;
        setPreviewHtml(data.html);
        setPreviewSubject(data.subject);
        setWizardStep("preview");
      } catch (error: any) {
        toast.error(error.message || "Failed to load preview");
      }
    }
  };

  const handleSendInvites = async () => {
    const guestsToInvite = pendingGuests.filter((g) => selectedIds.has(g.id));
    if (guestsToInvite.length === 0) return;

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-lodging-invites", {
        body: { waitlistIds: [...selectedIds] },
      });

      if (error) throw error;
      
      toast.success(`Sent ${data.sentCount || guestsToInvite.length} invitation${guestsToInvite.length > 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["lodging-waitlist-manager"] });
      setSelectedIds(new Set());
      setWizardStep("select");
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitations");
    } finally {
      setIsSending(false);
    }
  };

  const handleAddToWaitlist = async () => {
    if (!addName.trim() || !addEmail.trim()) {
      toast.error("Please enter both name and email");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(addEmail.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsAdding(true);
    try {
      // Get active event
      const { data: activeEvent, error: eventError } = await supabase
        .from("event_details")
        .select("id")
        .eq("is_active", true)
        .maybeSingle();

      if (eventError || !activeEvent) {
        throw new Error("No active event found");
      }

      // Check if already on waitlist
      const { data: existing } = await supabase
        .from("accommodation_waitlist")
        .select("id")
        .eq("email", addEmail.trim().toLowerCase())
        .eq("event_id", activeEvent.id)
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
          event_id: activeEvent.id,
        });

      if (insertError) throw insertError;

      toast.success(`${addName.trim()} added to waitlist`);
      queryClient.invalidateQueries({ queryKey: ["lodging-waitlist-manager"] });
      setShowAddDialog(false);
      setAddName("");
      setAddEmail("");
    } catch (error: any) {
      toast.error(error.message || "Failed to add to waitlist");
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Wizard Steps Indicator */}
      <AdminCard>
        <AdminCardContent className="py-4">
          <div className="flex items-center justify-center gap-4">
            {["select", "preview", "send"].map((step, idx) => {
              const isActive = wizardStep === step;
              const isPast = 
                (wizardStep === "preview" && step === "select") ||
                (wizardStep === "send" && (step === "select" || step === "preview"));
              
              return (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`
                      h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium
                      ${isActive 
                        ? "bg-[hsl(var(--admin-accent))] text-white" 
                        : isPast 
                          ? "bg-[hsl(var(--admin-success))] text-white"
                          : "bg-[hsl(var(--admin-surface))] text-[hsl(var(--admin-text-muted))] border border-[hsl(var(--admin-border))]"
                      }
                    `}
                  >
                    {isPast ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                  </div>
                  <span className={`text-sm ${isActive ? "font-medium" : "text-[hsl(var(--admin-text-muted))]"}`}>
                    {step === "select" ? "Select Guests" : step === "preview" ? "Preview" : "Confirm & Send"}
                  </span>
                  {idx < 2 && (
                    <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-subtle))] mx-2" />
                  )}
                </div>
              );
            })}
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Step Content */}
      {wizardStep === "select" && (
        <AdminCard>
          <AdminCardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminCardTitle className="text-base">Pending Invitations</AdminCardTitle>
                <AdminBadge intent="neutral" size="sm">{pendingGuests.length}</AdminBadge>
              </div>
              <div className="flex items-center gap-2">
                <AdminButton 
                  variant="adminOutline"
                  onClick={() => setShowAddDialog(true)}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Add to Waitlist
                </AdminButton>
                <AdminButton 
                  onClick={handleProceedToPreview}
                  disabled={selectedIds.size === 0}
                >
                  Continue
                  <ChevronRight className="h-4 w-4 ml-1" />
                </AdminButton>
              </div>
            </div>
            <AdminCardDescription className="text-xs">
              Select guests to send lodging invitations. Each will receive a unique tokenized link.
            </AdminCardDescription>
          </AdminCardHeader>
          <AdminCardContent>
            {/* Search & Select All */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <AdminCheckbox
                  checked={selectedIds.size === pendingGuests.length && pendingGuests.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                  Select All ({selectedPendingCount} selected)
                </span>
              </div>
            </div>

            {pendingGuests.length === 0 ? (
              <AdminEmptyState
                icon={<MailCheck className="h-10 w-10" />}
                title="No pending invitations"
                description="All waitlist guests have been invited"
              />
            ) : (
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    <AdminTableHead className="w-12" />
                    <AdminTableHead>Name</AdminTableHead>
                    <AdminTableHead>Email</AdminTableHead>
                    <AdminTableHead>Joined</AdminTableHead>
                    <AdminTableHead className="w-12" />
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {pendingGuests.map((guest) => (
                    <AdminTableRow key={guest.id}>
                      <AdminTableCell>
                        <AdminCheckbox
                          checked={selectedIds.has(guest.id)}
                          onCheckedChange={() => handleToggle(guest.id)}
                        />
                      </AdminTableCell>
                      <AdminTableCell className="font-medium">{guest.name}</AdminTableCell>
                      <AdminTableCell className="text-[hsl(var(--admin-text-muted))]">
                        {guest.email}
                      </AdminTableCell>
                      <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                        {format(new Date(guest.created_at), "MMM d, yyyy")}
                      </AdminTableCell>
                      <AdminTableCell>
                        <AdminButton
                          variant="adminGhost"
                          size="sm"
                          onClick={() => handlePreviewGuest(guest)}
                        >
                          <Eye className="h-4 w-4" />
                        </AdminButton>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            )}

            {/* Previously Notified Section */}
            {notifiedGuests.length > 0 && (
              <div className="mt-6 pt-6 border-t border-[hsl(var(--admin-border))]">
                <h4 className="text-sm font-medium text-[hsl(var(--admin-text-muted))] mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Previously Invited ({notifiedGuests.length})
                </h4>
                <div className="space-y-2">
                  {notifiedGuests.slice(0, 5).map((guest) => (
                    <div 
                      key={guest.id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-[hsl(var(--admin-surface))]"
                    >
                      <div>
                        <span className="text-sm font-medium">{guest.name}</span>
                        <span className="text-sm text-[hsl(var(--admin-text-muted))] ml-2">
                          {guest.email}
                        </span>
                      </div>
                      <AdminBadge intent="success" size="sm">
                        Invited {format(new Date(guest.notified_at!), "MMM d")}
                      </AdminBadge>
                    </div>
                  ))}
                  {notifiedGuests.length > 5 && (
                    <p className="text-xs text-[hsl(var(--admin-text-muted))] text-center">
                      + {notifiedGuests.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </AdminCardContent>
        </AdminCard>
      )}

      {wizardStep === "preview" && (
        <AdminCard>
          <AdminCardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminCardTitle className="text-base">Preview Email</AdminCardTitle>
              </div>
              <div className="flex items-center gap-2">
                <AdminButton variant="adminOutline" onClick={() => setWizardStep("select")}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </AdminButton>
                <AdminButton onClick={() => setWizardStep("send")}>
                  Continue
                  <ChevronRight className="h-4 w-4 ml-1" />
                </AdminButton>
              </div>
            </div>
            <AdminCardDescription>
              Review how the email will appear. Each guest will receive their own unique invite link.
            </AdminCardDescription>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="rounded-lg border border-[hsl(var(--admin-border))] overflow-hidden">
              <div className="bg-[hsl(var(--admin-surface))] px-4 py-3 border-b border-[hsl(var(--admin-border))]">
                <p className="text-sm">
                  <span className="text-[hsl(var(--admin-text-muted))]">Subject:</span>{" "}
                  <span className="font-medium">{previewSubject}</span>
                </p>
              </div>
              <div 
                className="p-4 bg-white"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
              />
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-3 text-center">
              ⚠️ This is a preview. The actual invite link will be unique for each recipient.
            </p>
          </AdminCardContent>
        </AdminCard>
      )}

      {wizardStep === "send" && (
        <AdminCard>
          <AdminCardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              <AdminCardTitle className="text-base">Confirm & Send</AdminCardTitle>
            </div>
            <AdminCardDescription>
              You're about to send invitations to {selectedPendingCount} guest{selectedPendingCount !== 1 ? "s" : ""}.
            </AdminCardDescription>
          </AdminCardHeader>
          <AdminCardContent className="space-y-4">
            <div className="rounded-lg bg-[hsl(var(--admin-surface))] p-4">
              <h4 className="text-sm font-medium mb-2">Recipients ({selectedPendingCount})</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {pendingGuests
                  .filter((g) => selectedIds.has(g.id))
                  .map((guest) => (
                    <div key={guest.id} className="text-sm flex items-center gap-2">
                      <Mail className="h-3 w-3 text-[hsl(var(--admin-text-muted))]" />
                      <span>{guest.name}</span>
                      <span className="text-[hsl(var(--admin-text-muted))]">({guest.email})</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <AdminButton variant="adminOutline" onClick={() => setWizardStep("preview")}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </AdminButton>
              <AdminButton 
                onClick={handleSendInvites} 
                disabled={isSending}
                className="flex-1"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send {selectedPendingCount} Invitation{selectedPendingCount !== 1 ? "s" : ""}
                  </>
                )}
              </AdminButton>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Individual Preview Dialog */}
      <AdminDialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <AdminDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>
              Email Preview for {previewGuest?.name}
            </AdminDialogTitle>
            <AdminDialogDescription>
              This shows how the email will appear to this specific guest
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="rounded-lg border border-[hsl(var(--admin-border))] overflow-hidden">
            <div className="bg-[hsl(var(--admin-surface))] px-4 py-3 border-b border-[hsl(var(--admin-border))]">
              <p className="text-sm">
                <span className="text-[hsl(var(--admin-text-muted))]">To:</span>{" "}
                <span>{previewGuest?.email}</span>
              </p>
              <p className="text-sm">
                <span className="text-[hsl(var(--admin-text-muted))]">Subject:</span>{" "}
                <span className="font-medium">{previewSubject}</span>
              </p>
            </div>
            <div 
              className="p-4 bg-white"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }}
            />
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mt-4">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> This is a preview only. The invite link shown is a sample and will not work.
              A real tokenized link will be generated when you send the actual email.
            </p>
          </div>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setShowPreviewDialog(false)}>
              Close
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Add to Waitlist Dialog */}
      <AdminDialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Add to Accommodations Waitlist</AdminDialogTitle>
            <AdminDialogDescription>
              Manually add someone to the waitlist so you can send them a lodging invite.
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <AdminLabel htmlFor="add-name">Name</AdminLabel>
              <AdminInput
                id="add-name"
                placeholder="Enter their name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <AdminLabel htmlFor="add-email">Email</AdminLabel>
              <AdminInput
                id="add-email"
                type="email"
                placeholder="Enter their email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
              />
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton 
              variant="adminOutline" 
              onClick={() => {
                setShowAddDialog(false);
                setAddName("");
                setAddEmail("");
              }}
            >
              Cancel
            </AdminButton>
            <AdminButton onClick={handleAddToWaitlist} disabled={isAdding}>
              {isAdding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
    </div>
  );
}
