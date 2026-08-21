import { useState, useEffect, useMemo } from "react";
import {
  Send, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  SkipForward, 
  Eye, 
  Edit,
  Users,
  Mail,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/RichTextEditor";
import MergeFieldToolbar from "./MergeFieldToolbar";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardDescription, 
  AdminCardHeader, 
  AdminCardTitle,
  AdminButton,
  AdminEmptyState,
  AdminInput,
  AdminScrollArea,
  AdminLabel
} from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";

// Mobile-specific components for focused email experience
import { MobileEmailRecipientsSummary } from "./MobileEmailRecipientsSummary";
import { MobileEmailSettings } from "./MobileEmailSettings";
import { MobileEmailComposer } from "./MobileEmailComposer";
import { MobileEmailActions } from "./MobileEmailActions";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface ArtistOffer {
  performance_date: string | null;
  set_time: string | null;
  stage: string | null;
  set_length_minutes: number | null;
  offer_amount: number | null;
  guest_list_count: number | null;
  venue_name: string | null;
}

interface ArtistContact {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  role: string;
}

interface Artist {
  id: string;
  name: string;
  contacts: ArtistContact[];
  offer?: ArtistOffer | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
}

interface EventDetails {
  title: string;
  event_date: string;
  venue_name: string;
}

interface ArtistEmailStatus {
  sent: boolean;
  skipped: boolean;
  sentAt?: string;
}

interface IndividualArtistEmailerProps {
  eventId?: string;
}

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  agent: "Agent",
  marketing: "Marketing",
  publicist: "Publicist",
  tour_manager: "Tour Manager",
  artist_direct: "Artist Direct",
  label_rep: "Label Rep",
  other: "Other",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
}

function formatEventDates(eventDate: string | null): string {
  if (!eventDate) return "";
  const start = new Date(eventDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return `${start.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" })}-${end.getDate()}, ${end.getFullYear()}`;
}

export default function IndividualArtistEmailer({ eventId }: IndividualArtistEmailerProps) {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const isMobile = useIsMobile();
  
  // Template selection (applies to all)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [baseSubject, setBaseSubject] = useState("");
  const [baseBody, setBaseBody] = useState("");
  
  // Current artist editing
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSubject, setCurrentSubject] = useState("");
  const [currentBody, setCurrentBody] = useState("");
  
  // CC and Reply-To settings
  const [ccEmails, setCcEmails] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(!isMobile);
  
  // Status tracking
  const [artistStatuses, setArtistStatuses] = useState<Map<string, ArtistEmailStatus>>(new Map());
  
  // View mode
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId]);

  const fetchData = async () => {
    if (!eventId) return;
    
    setLoading(true);
    try {
      // Fetch event details
      const { data: eventData } = await supabase
        .from("event_details")
        .select("title, event_date, venue_name")
        .eq("id", eventId)
        .single();

      if (eventData) {
        setEventDetails(eventData);
      }

      // Fetch artists with contacts
      const { data: artistsData, error: artistsError } = await supabase
        .from("artists")
        .select("id, name")
        .eq("event_id", eventId)
        .order("name");

      if (artistsError) throw artistsError;

      const { data: contactsData } = await supabase
        .from("artist_contacts")
        .select("*")
        .in("artist_id", artistsData?.map(a => a.id) || []);

      const { data: offersData } = await supabase
        .from("artist_offers")
        .select("artist_id, performance_date, set_time, stage, set_length_minutes, offer_amount, guest_list_count, venue_name")
        .eq("event_id", eventId)
        .in("artist_id", artistsData?.map(a => a.id) || []);

      // Only include artists that have contacts
      const artistsWithContacts = artistsData?.map(artist => ({
        ...artist,
        contacts: contactsData?.filter(c => c.artist_id === artist.id) || [],
        offer: offersData?.find(o => o.artist_id === artist.id) || null,
      })).filter(a => a.contacts.length > 0) || [];

      setArtists(artistsWithContacts);

      // Fetch templates
      const { data: templatesData } = await supabase
        .from("artist_email_templates")
        .select("*")
        .or(`event_id.eq.${eventId},event_id.is.null`)
        .order("name");

      setTemplates(templatesData || []);

      // Load email settings for artist-specific CC and reply-to
      const { data: settings, error: settingsError } = await supabase
        .from("email_settings")
        .select("artist_cc_emails, default_cc_emails, talent_from_email")
        .single();

      console.log("[artist-emailer] Email settings loaded", { found: !!settings, failed: !!settingsError });

      if (settings) {
        // Use artist-specific CC if available, fallback to default
        const artistCc = settings.artist_cc_emails as string[] | null;
        if (artistCc && artistCc.length > 0) {
          setCcEmails(artistCc.join(", "));
        } else if (settings.default_cc_emails) {
          const ccArray = settings.default_cc_emails as string[];
          setCcEmails(ccArray.join(", "));
        }
        
        // Pre-populate reply-to from talent email setting
        const talentEmail = settings.talent_from_email as string | null;
        console.log("[artist-emailer] Reply-to default", { configured: !!talentEmail });
        if (talentEmail) {
          setReplyToEmail(talentEmail);
        }
      }
    } catch (error: any) {
      toast.error("Failed to fetch data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const currentArtist = artists[currentIndex];

  // Replace merge fields with actual data
  const replaceMergeFields = (text: string, artist: Artist): string => {
    const contact = artist.contacts[0];
    const offer = artist.offer;
    
    // Get first/last name from stored fields or parse from name
    const contactFirstName = contact?.first_name || contact?.name?.split(' ')[0] || "";
    const contactLastName = contact?.last_name || contact?.name?.split(' ').slice(1).join(' ') || "";
    
    let result = text;
    result = result.replace(/\{\{artist_name\}\}/gi, artist.name || "[Artist Name]");
    result = result.replace(/\{\{contact_name\}\}/gi, contact?.name || "[Contact Name]");
    result = result.replace(/\{\{contact_first_name\}\}/gi, contactFirstName || "[First Name]");
    result = result.replace(/\{\{contact_last_name\}\}/gi, contactLastName || "[Last Name]");
    result = result.replace(/\{\{contact_role\}\}/gi, ROLE_LABELS[contact?.role] || contact?.role || "[Role]");
    result = result.replace(/\{\{performance_date\}\}/gi, formatDate(offer?.performance_date) || "[Performance Date]");
    result = result.replace(/\{\{set_time\}\}/gi, offer?.set_time || "[Set Time]");
    result = result.replace(/\{\{stage\}\}/gi, offer?.stage || "[Stage]");
    result = result.replace(/\{\{set_length\}\}/gi, offer?.set_length_minutes ? `${offer.set_length_minutes} min` : "[Set Length]");
    result = result.replace(/\{\{offer_amount\}\}/gi, offer?.offer_amount ? `$${offer.offer_amount.toLocaleString()}` : "[Offer Amount]");
    result = result.replace(/\{\{guest_list\}\}/gi, offer?.guest_list_count?.toString() || "[Guest List]");
    result = result.replace(/\{\{event_name\}\}/gi, eventDetails?.title || "[Event Name]");
    result = result.replace(/\{\{event_dates\}\}/gi, formatEventDates(eventDetails?.event_date) || "[Event Dates]");
    result = result.replace(/\{\{venue_name\}\}/gi, offer?.venue_name || eventDetails?.venue_name || "[Venue Name]");
    return result;
  };

  // Preview content with merge fields resolved
  const previewSubject = useMemo(() => {
    if (!currentArtist) return currentSubject;
    return replaceMergeFields(currentSubject, currentArtist);
  }, [currentSubject, currentArtist, eventDetails]);

  const previewBody = useMemo(() => {
    if (!currentArtist) return currentBody;
    return replaceMergeFields(currentBody, currentArtist);
  }, [currentBody, currentArtist, eventDetails]);

  // When template is selected, set base content
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setBaseSubject(template.subject);
      setBaseBody(template.body_html);
      setCurrentSubject(template.subject);
      setCurrentBody(template.body_html);
    }
  };

  // Navigate between artists
  const goToArtist = (index: number) => {
    if (index >= 0 && index < artists.length) {
      setCurrentIndex(index);
      // Reset to base template content (or keep customizations?)
      setCurrentSubject(baseSubject);
      setCurrentBody(baseBody);
      setViewMode("edit");
    }
  };

  // Send email to current artist
  const handleSend = async () => {
    if (!currentArtist || !eventId) return;
    
    if (!currentSubject.trim() || !currentBody.trim()) {
      toast.error("Subject and body are required");
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Parse CC emails
      const ccList = ccEmails
        .split(/[,;\s]+/)
        .map(e => e.trim())
        .filter(e => e.includes("@"));

      const response = await supabase.functions.invoke("send-artist-email", {
        body: {
          eventId,
          subject: currentSubject,
          bodyHtml: currentBody,
          artistIds: [currentArtist.id],
          targetRoles: null, // Send to all contacts for this artist
          ccEmails: ccList,
          replyTo: replyToEmail || undefined,
        },
      });

      if (response.error) throw response.error;

      // Mark as sent
      setArtistStatuses(prev => {
        const next = new Map(prev);
        next.set(currentArtist.id, { sent: true, skipped: false, sentAt: new Date().toISOString() });
        return next;
      });

      toast.success(`Email sent to ${currentArtist.name}'s team`);

      // Auto-advance to next unsent artist
      const nextUnsent = findNextUnsent(currentIndex);
      if (nextUnsent !== -1) {
        goToArtist(nextUnsent);
      }
    } catch (error: any) {
      toast.error("Failed to send: " + error.message);
    } finally {
      setSending(false);
    }
  };

  // Skip current artist
  const handleSkip = () => {
    if (!currentArtist) return;
    
    setArtistStatuses(prev => {
      const next = new Map(prev);
      next.set(currentArtist.id, { sent: false, skipped: true });
      return next;
    });

    const nextUnsent = findNextUnsent(currentIndex);
    if (nextUnsent !== -1) {
      goToArtist(nextUnsent);
    }
  };

  const findNextUnsent = (fromIndex: number): number => {
    for (let i = fromIndex + 1; i < artists.length; i++) {
      const status = artistStatuses.get(artists[i].id);
      if (!status?.sent && !status?.skipped) {
        return i;
      }
    }
    // Wrap around
    for (let i = 0; i < fromIndex; i++) {
      const status = artistStatuses.get(artists[i].id);
      if (!status?.sent && !status?.skipped) {
        return i;
      }
    }
    return -1;
  };

  const handleInsertField = (tag: string) => {
    setCurrentBody(prev => prev + tag);
  };

  // Stats
  const sentCount = Array.from(artistStatuses.values()).filter(s => s.sent).length;
  const skippedCount = Array.from(artistStatuses.values()).filter(s => s.skipped).length;
  const remainingCount = artists.length - sentCount - skippedCount;

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <AdminEmptyState 
            icon={<Mail className="h-7 w-7 text-[hsl(var(--admin-text-muted))]" />}
            title="No event selected"
            description="Please select an event to send individual emails."
          />
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (loading) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <div className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-border))] border-t-[hsl(var(--admin-text-muted))] rounded-full" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (artists.length === 0) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <AdminEmptyState 
            icon={<Users className="h-7 w-7 text-[hsl(var(--admin-text-muted))]" />}
            title="No artists with contacts"
            description="Add contacts to your artists to send individual emails."
          />
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <div className={cn(isMobile ? "flex flex-col h-[calc(100vh-120px)] pb-20" : "pb-0")}>
      {/* Mobile layout - Calm, focused, step-based flow */}
      {isMobile ? (
        <div className="flex flex-col flex-1 min-h-0">
          {/* STEP 1: Recipients Summary (compact, tap to expand) */}
          <MobileEmailRecipientsSummary
            artists={artists}
            currentIndex={currentIndex}
            artistStatuses={artistStatuses}
            onSelectArtist={goToArtist}
            sentCount={sentCount}
            remainingCount={remainingCount}
          />

          {/* STEP 2: Settings (collapsed by default) */}
          <MobileEmailSettings
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onTemplateChange={handleTemplateSelect}
            ccEmails={ccEmails}
            onCcChange={setCcEmails}
            replyToEmail={replyToEmail}
            onReplyToChange={setReplyToEmail}
            onInsertField={handleInsertField}
          />

          {/* STEP 3: Message Composer (primary focus, full-width, minimal chrome) */}
          {currentArtist && (
            <MobileEmailComposer
              subject={currentSubject}
              onSubjectChange={setCurrentSubject}
              body={currentBody}
              onBodyChange={setCurrentBody}
              previewSubject={previewSubject}
              previewBody={previewBody}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              recipientContacts={currentArtist.contacts}
            />
          )}

          {/* ACTIONS: Single primary CTA, secondary in overflow */}
          <MobileEmailActions
            onSend={handleSend}
            onSkip={handleSkip}
            onPrevious={() => goToArtist(currentIndex - 1)}
            onNext={() => goToArtist(currentIndex + 1)}
            currentIndex={currentIndex}
            totalCount={artists.length}
            sending={sending}
            isSent={artistStatuses.get(currentArtist?.id || "")?.sent || false}
            disabled={!currentSubject.trim() || !currentBody.trim()}
          />
        </div>
      ) : (
        /* Desktop layout - streamlined grid */
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Left sidebar - Artist list */}
          <AdminCard className="lg:col-span-1">
            <AdminCardHeader className="pb-3">
              <AdminCardTitle className="text-base">Artists</AdminCardTitle>
              <AdminCardDescription className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--admin-success))]" />
                  {sentCount} sent
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--admin-text-muted))]" />
                  {skippedCount} skipped
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--admin-warning))]" />
                  {remainingCount} pending
                </span>
              </AdminCardDescription>
            </AdminCardHeader>
            <AdminCardContent className="p-0">
              <AdminScrollArea className="h-[500px]">
                <div className="space-y-0.5 p-2">
                  {artists.map((artist, index) => {
                    const status = artistStatuses.get(artist.id);
                    const isCurrent = index === currentIndex;
                    
                    return (
                      <button
                        key={artist.id}
                        onClick={() => goToArtist(index)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                          "hover:bg-[hsl(var(--admin-hover))] flex items-center gap-2",
                          isCurrent && "bg-[hsl(var(--admin-hover))] ring-1 ring-[hsl(var(--admin-border-strong))]",
                          status?.sent && "opacity-50"
                        )}
                      >
                        {status?.sent ? (
                          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--admin-success))] shrink-0" />
                        ) : status?.skipped ? (
                          <SkipForward className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0" />
                        )}
                        <span className="truncate text-[hsl(var(--admin-text))]">{artist.name}</span>
                        <span className="ml-auto text-xs text-[hsl(var(--admin-text-muted))] shrink-0">
                          {artist.contacts.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </AdminScrollArea>
            </AdminCardContent>
          </AdminCard>

          {/* Main content area */}
          <div className="lg:col-span-3 space-y-4">
            {/* Settings bar */}
            <AdminCard>
              <AdminCardContent className="py-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <AdminLabel>Email Template</AdminLabel>
                    <AdminSelect value={selectedTemplateId} onValueChange={handleTemplateSelect} placeholder="Select template...">
                      {templates.map(t => (
                        <AdminSelectItem key={t.id} value={t.id}>{t.name}</AdminSelectItem>
                      ))}
                    </AdminSelect>
                  </div>
                  <div className="space-y-2">
                    <AdminLabel>CC Your Team</AdminLabel>
                    <AdminInput
                      value={ccEmails}
                      onChange={(e) => setCcEmails(e.target.value)}
                      placeholder="email1@team.com, email2@team.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <AdminLabel>Reply-To Email</AdminLabel>
                    <AdminInput
                      value={replyToEmail}
                      onChange={(e) => setReplyToEmail(e.target.value)}
                      placeholder="replies@example.org"
                    />
                  </div>
                </div>
              </AdminCardContent>
            </AdminCard>

            {/* Current artist email editor */}
            {currentArtist && (
              <AdminCard>
                <AdminCardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <AdminCardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-[hsl(var(--admin-text-muted))]" />
                        Email to {currentArtist.name}
                      </AdminCardTitle>
                      <AdminCardDescription className="mt-1">
                        <span className="flex items-center gap-2 flex-wrap">
                          <Users className="h-3 w-3" />
                          {currentArtist.contacts.map((c, i) => (
                            <span key={c.id}>
                              {c.name} ({ROLE_LABELS[c.role] || c.role})
                              {i < currentArtist.contacts.length - 1 && ", "}
                            </span>
                          ))}
                        </span>
                      </AdminCardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <AdminButton
                        variant={viewMode === "edit" ? "admin" : "adminOutline"}
                        size="sm"
                        onClick={() => setViewMode("edit")}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </AdminButton>
                      <AdminButton
                        variant={viewMode === "preview" ? "admin" : "adminOutline"}
                        size="sm"
                        onClick={() => setViewMode("preview")}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </AdminButton>
                    </div>
                  </div>
                </AdminCardHeader>
                <AdminCardContent className="space-y-4">
                  {viewMode === "edit" ? (
                    <>
                      <div className="space-y-2">
                        <AdminLabel>Subject</AdminLabel>
                        <AdminInput
                          value={currentSubject}
                          onChange={(e) => setCurrentSubject(e.target.value)}
                          placeholder="Email subject..."
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <AdminLabel>Message</AdminLabel>
                          <MergeFieldToolbar onInsertField={handleInsertField} />
                        </div>
                        <RichTextEditor content={currentBody} onChange={setCurrentBody} />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-hover))]">
                        <div className="text-sm text-[hsl(var(--admin-text-muted))] mb-1">Subject:</div>
                        <div className="font-medium text-[hsl(var(--admin-text))]">{previewSubject}</div>
                      </div>
                      <div className="p-4 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-hover))]">
                        <div className="text-sm text-[hsl(var(--admin-text-muted))] mb-2">Message:</div>
                        <div 
                          className="prose prose-sm max-w-none text-[hsl(var(--admin-text))]"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewBody) }}
                        />
                      </div>
                      <div className="p-3 bg-[hsl(var(--admin-hover))] rounded-lg text-sm border border-[hsl(var(--admin-border))]">
                        <div className="font-medium text-[hsl(var(--admin-text))] mb-1">Recipients:</div>
                        <div className="text-[hsl(var(--admin-text-secondary))]">
                          <strong>To:</strong> {currentArtist.contacts[0]?.email}
                          {currentArtist.contacts.length > 1 && (
                            <>
                              <br />
                              <strong>CC:</strong> {currentArtist.contacts.slice(1).map(c => c.email).join(", ")}
                            </>
                          )}
                          {ccEmails && (
                            <>
                              <br />
                              <strong>Team CC:</strong> {ccEmails}
                            </>
                          )}
                          {replyToEmail && (
                            <>
                              <br />
                              <strong>Reply-To:</strong> {replyToEmail}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-[hsl(var(--admin-border))]" />

                  {/* Action buttons */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AdminButton
                        variant="adminOutline"
                        size="sm"
                        onClick={() => goToArtist(currentIndex - 1)}
                        disabled={currentIndex === 0}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </AdminButton>
                      <AdminButton
                        variant="adminOutline"
                        size="sm"
                        onClick={() => goToArtist(currentIndex + 1)}
                        disabled={currentIndex === artists.length - 1}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </AdminButton>
                      <span className="text-sm text-[hsl(var(--admin-text-muted))] ml-2">
                        {currentIndex + 1} of {artists.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AdminButton
                        variant="adminGhost"
                        onClick={handleSkip}
                        disabled={sending || artistStatuses.get(currentArtist.id)?.sent}
                      >
                        <SkipForward className="h-4 w-4 mr-1" />
                        Skip
                      </AdminButton>
                      <AdminButton
                        variant="admin"
                        onClick={handleSend}
                        disabled={sending || !currentSubject.trim() || !currentBody.trim() || artistStatuses.get(currentArtist.id)?.sent}
                      >
                        {sending ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                            Sending...
                          </>
                        ) : artistStatuses.get(currentArtist.id)?.sent ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Sent
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-1" />
                            Send to {currentArtist.name}
                          </>
                        )}
                      </AdminButton>
                    </div>
                  </div>
                </AdminCardContent>
              </AdminCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
