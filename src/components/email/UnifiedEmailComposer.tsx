import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminBadge,
  AdminSelect,
  AdminSelectItem,
  AdminScrollArea,
  AdminCollapsible,
  AdminCollapsibleContent,
  AdminCollapsibleTrigger,
  AdminTabs,
  AdminTabsContent,
  AdminTabsList,
  AdminTabsTrigger,
} from "@/components/admin";
import { Separator } from "@/components/ui/separator";
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
  Settings,
  ChevronDown,
  Zap,
  Search
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/RichTextEditor";
import { EmailSuccessAnimation } from "@/components/email/EmailSuccessAnimation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { FromSenderSelect } from "@/components/pipeline/modules/FromSenderSelect";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

// Types for all supported entity types
export type EntityType = "artist" | "vendor" | "artisan" | "volunteer" | "partner" | "winecamp";

interface EntityContact {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  role?: string;
}

interface Entity {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
  contacts: EntityContact[];
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
}

interface EventDetails {
  title: string;
  event_date: string | null;
  venue_name: string | null;
}

interface EntityEmailStatus {
  sent: boolean;
  skipped: boolean;
  sentAt?: string;
}

interface UnifiedEmailComposerProps {
  entityType: EntityType;
  eventId?: string;
}

// Merge fields per entity type
const MERGE_FIELDS: Record<EntityType, Array<{ key: string; label: string }>> = {
  artist: [
    { key: "{{artist_name}}", label: "Artist Name" },
    { key: "{{contact_name}}", label: "Contact Full Name" },
    { key: "{{contact_first_name}}", label: "Contact First Name" },
    { key: "{{contact_last_name}}", label: "Contact Last Name" },
    { key: "{{contact_role}}", label: "Contact Role" },
    { key: "{{performance_date}}", label: "Performance Date" },
    { key: "{{set_time}}", label: "Set Time" },
    { key: "{{stage}}", label: "Stage" },
    { key: "{{offer_amount}}", label: "Offer Amount" },
    { key: "{{event_name}}", label: "Event Name" },
    { key: "{{event_dates}}", label: "Event Dates" },
    { key: "{{venue_name}}", label: "Venue Name" },
  ],
  vendor: [
    { key: "{{name}}", label: "Vendor Name" },
    { key: "{{contact_first_name}}", label: "Contact First Name" },
    { key: "{{contact_last_name}}", label: "Contact Last Name" },
    { key: "{{company}}", label: "Company" },
    { key: "{{email}}", label: "Email" },
    { key: "{{event_name}}", label: "Event Name" },
    { key: "{{event_date}}", label: "Event Date" },
  ],
  artisan: [
    { key: "{{name}}", label: "Artisan Name" },
    { key: "{{contact_first_name}}", label: "Contact First Name" },
    { key: "{{contact_last_name}}", label: "Contact Last Name" },
    { key: "{{business_name}}", label: "Business Name" },
    { key: "{{booth_number}}", label: "Booth Number" },
    { key: "{{event_name}}", label: "Event Name" },
    { key: "{{event_date}}", label: "Event Date" },
  ],
  volunteer: [
    { key: "{{name}}", label: "Volunteer Name" },
    { key: "{{first_name}}", label: "First Name" },
    { key: "{{last_name}}", label: "Last Name" },
    { key: "{{email}}", label: "Email" },
    { key: "{{shift}}", label: "Shift" },
    { key: "{{check_in_location}}", label: "Check-in Location" },
    { key: "{{event_name}}", label: "Event Name" },
    { key: "{{event_date}}", label: "Event Date" },
  ],
  partner: [
    { key: "{{name}}", label: "Partner Name" },
    { key: "{{contact_first_name}}", label: "Contact First Name" },
    { key: "{{contact_last_name}}", label: "Contact Last Name" },
    { key: "{{company}}", label: "Company" },
    { key: "{{tier}}", label: "Partnership Tier" },
    { key: "{{event_name}}", label: "Event Name" },
    { key: "{{event_date}}", label: "Event Date" },
  ],
  winecamp: [
    { key: "{{name}}", label: "Name" },
    { key: "{{contact_first_name}}", label: "Contact First Name" },
    { key: "{{contact_last_name}}", label: "Contact Last Name" },
    { key: "{{company}}", label: "Company Name" },
    { key: "{{category}}", label: "Category" },
    { key: "{{event_name}}", label: "Event Name" },
    { key: "{{event_date}}", label: "Event Date" },
  ],
};

const ENTITY_LABELS: Record<EntityType, { singular: string; plural: string }> = {
  artist: { singular: "Artist", plural: "Artists" },
  vendor: { singular: "Vendor", plural: "Vendors" },
  artisan: { singular: "Artisan", plural: "Artisans" },
  volunteer: { singular: "Volunteer", plural: "Volunteers" },
  partner: { singular: "Partner", plural: "Partners" },
  winecamp: { singular: "WineCamp", plural: "WineCamp" },
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

export default function UnifiedEmailComposer({ entityType, eventId }: UnifiedEmailComposerProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const isMobile = useIsMobile();
  
  // Template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [baseSubject, setBaseSubject] = useState("");
  const [baseBody, setBaseBody] = useState("");
  
  // Current entity editing
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSubject, setCurrentSubject] = useState("");
  const [currentBody, setCurrentBody] = useState("");
  
  // Settings
  const [ccEmails, setCcEmails] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(!isMobile);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromUserId, setFromUserId] = useState("");
  
  // Status tracking
  const [entityStatuses, setEntityStatuses] = useState<Map<string, EntityEmailStatus>>(new Map());
  
  // View mode
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  
  // Success animation
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSentCount, setLastSentCount] = useState(0);

  const labels = ENTITY_LABELS[entityType];
  const mergeFields = MERGE_FIELDS[entityType];

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId, entityType]);

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

      // Fetch entities based on type
      let entitiesData: Entity[] = [];

      if (entityType === "artist") {
        const { data: artistsData } = await supabase
          .from("artists")
          .select("id, name")
          .eq("event_id", eventId)
          .order("name");

        const { data: contactsData } = await supabase
          .from("artist_contacts")
          .select("*")
          .in("artist_id", artistsData?.map(a => a.id) || []);

        entitiesData = artistsData?.map(artist => ({
          ...artist,
          contacts: contactsData?.filter(c => c.artist_id === artist.id).map(c => ({
            id: c.id,
            name: c.name,
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email,
            role: c.role,
          })) || [],
        })).filter(a => a.contacts.length > 0) || [];

      } else if (entityType === "vendor") {
        const { data } = await supabase
          .from("vendors")
          .select("id, name, company_name, email")
          .eq("event_id", eventId)
          .not("email", "is", null)
          .order("name");
        
        entitiesData = data?.map(v => ({
          id: v.id,
          name: v.name,
          email: v.email,
          company: v.company_name,
          contacts: [{ id: v.id, name: v.name, email: v.email! }],
        })) || [];

      } else if (entityType === "artisan") {
        const { data } = await supabase
          .from("artisans")
          .select("id, name, business_name, email")
          .eq("event_id", eventId)
          .not("email", "is", null)
          .order("name");
        
        entitiesData = data?.map(a => ({
          id: a.id,
          name: a.name,
          email: a.email,
          company: a.business_name,
          contacts: [{ id: a.id, name: a.name, email: a.email! }],
        })) || [];

      } else if (entityType === "volunteer") {
        const { data } = await supabase
          .from("volunteer_interests")
          .select("id, name, email")
          .not("email", "is", null)
          .order("name");
        
        entitiesData = data?.map(v => ({
          id: v.id,
          name: v.name,
          email: v.email,
          contacts: [{ id: v.id, name: v.name, email: v.email }],
        })) || [];

      } else if (entityType === "partner") {
        const { data } = await supabase
          .from("partners")
          .select("id, name, company_name, email")
          .eq("event_id", eventId)
          .not("email", "is", null)
          .order("name");
        
        entitiesData = data?.map(p => ({
          id: p.id,
          name: p.name,
          email: p.email,
          company: p.company_name,
          contacts: [{ id: p.id, name: p.name, email: p.email! }],
        })) || [];

      } else if (entityType === "winecamp") {
        const { data: attendeesData } = await supabase
          .from("winecamp_attendees")
          .select("id, name, email")
          .eq("event_id", eventId)
          .order("name");

        entitiesData = attendeesData?.filter(a => a.email).map(a => ({
          id: a.id,
          name: a.name,
          email: a.email,
          company: null,
          contacts: [{ id: a.id, name: a.name, email: a.email! }],
        })) || [];
      }

      setEntities(entitiesData);

      // Fetch templates
      if (entityType === "artist") {
        const { data: templatesData } = await supabase
          .from("artist_email_templates")
          .select("id, name, subject, body_html")
          .or(`event_id.eq.${eventId},event_id.is.null`)
          .order("name");
        setTemplates(templatesData || []);
      } else if (entityType === "winecamp") {
        const { data: templatesData } = await supabase
          .from("production_email_templates")
          .select("id, name, subject, body_html")
          .filter("target_type", "eq", "winery")
          .or(`event_id.eq.${eventId},event_id.is.null`)
          .order("name");
        setTemplates(templatesData || []);
      } else {
        const { data: templatesData } = await supabase
          .from("production_email_templates")
          .select("id, name, subject, body_html")
          .eq("target_type", entityType as "artisan" | "vendor" | "volunteer")
          .or(`event_id.eq.${eventId},event_id.is.null`)
          .order("name");
        setTemplates(templatesData || []);
      }

      // Load CC and Reply-To settings
      const { data: settings } = await supabase
        .from("email_settings")
        .select("*")
        .single();

      if (settings) {
        // Set CC emails
        const ccField = `${entityType}_cc_emails` as keyof typeof settings;
        const typeCcEmails = (settings as any)[ccField];
        if (typeCcEmails && Array.isArray(typeCcEmails) && typeCcEmails.length > 0) {
          setCcEmails(typeCcEmails.join(", "));
        } else if (settings.default_cc_emails) {
          setCcEmails((settings.default_cc_emails as string[]).join(", "));
        }
        
        // Set Reply-To email based on entity type
        if (entityType === "artist") {
          const talentEmail = settings.talent_from_email as string | null;
          if (talentEmail) {
            setReplyToEmail(talentEmail);
          }
        } else {
          // For vendors, artisans, volunteers, partners - use production email
          const productionEmail = settings.production_from_email as string | null;
          if (productionEmail) {
            setReplyToEmail(productionEmail);
          }
        }
      }
    } catch (error: any) {
      toast.error("Failed to fetch data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter entities by search
  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entities;
    const q = searchQuery.toLowerCase();
    return entities.filter(e => 
      e.name.toLowerCase().includes(q) ||
      e.company?.toLowerCase().includes(q) ||
      e.contacts.some(c => c.email.toLowerCase().includes(q))
    );
  }, [entities, searchQuery]);

  const currentEntity = filteredEntities[currentIndex];

  // Replace merge fields with actual data
  const replaceMergeFields = (text: string, entity: Entity): string => {
    const contact = entity.contacts[0];
    let result = text;
    
    // Get first name - use stored first_name or fall back to parsing from name
    const contactFirstName = contact?.first_name || contact?.name?.split(' ')[0] || "";
    const contactLastName = contact?.last_name || contact?.name?.split(' ').slice(1).join(' ') || "";
    
    // Common replacements
    result = result.replace(/\{\{name\}\}/gi, entity.name || `[${labels.singular} Name]`);
    result = result.replace(/\{\{first_name\}\}/gi, contactFirstName || "[First Name]");
    result = result.replace(/\{\{last_name\}\}/gi, contactLastName || "[Last Name]");
    result = result.replace(/\{\{contact_first_name\}\}/gi, contactFirstName || "[First Name]");
    result = result.replace(/\{\{contact_last_name\}\}/gi, contactLastName || "[Last Name]");
    result = result.replace(/\{\{company\}\}/gi, entity.company || "[Company]");
    result = result.replace(/\{\{business_name\}\}/gi, entity.company || "[Business Name]");
    result = result.replace(/\{\{email\}\}/gi, contact?.email || "[Email]");
    result = result.replace(/\{\{event_name\}\}/gi, eventDetails?.title || "[Event Name]");
    result = result.replace(/\{\{event_date\}\}/gi, formatDate(eventDetails?.event_date) || "[Event Date]");
    result = result.replace(/\{\{event_dates\}\}/gi, formatEventDates(eventDetails?.event_date) || "[Event Dates]");
    result = result.replace(/\{\{venue_name\}\}/gi, eventDetails?.venue_name || "[Venue Name]");
    
    // Artist-specific
    if (entityType === "artist") {
      result = result.replace(/\{\{artist_name\}\}/gi, entity.name || "[Artist Name]");
      result = result.replace(/\{\{contact_name\}\}/gi, contact?.name || "[Contact Name]");
      result = result.replace(/\{\{contact_role\}\}/gi, contact?.role || "[Role]");
    }
    
    return result;
  };

  // Preview content with merge fields resolved
  const previewSubject = useMemo(() => {
    if (!currentEntity) return currentSubject;
    return replaceMergeFields(currentSubject, currentEntity);
  }, [currentSubject, currentEntity, eventDetails]);

  const previewBody = useMemo(() => {
    if (!currentEntity) return currentBody;
    return replaceMergeFields(currentBody, currentEntity);
  }, [currentBody, currentEntity, eventDetails]);

  // When template is selected
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

  // Navigate between entities
  const goToEntity = (index: number) => {
    if (index >= 0 && index < filteredEntities.length) {
      setCurrentIndex(index);
      setCurrentSubject(baseSubject);
      setCurrentBody(baseBody);
      setViewMode("edit");
    }
  };

  const handleInsertField = (field: string) => {
    setCurrentBody(prev => prev + field);
  };

  const findNextUnsent = (fromIndex: number): number => {
    for (let i = fromIndex + 1; i < filteredEntities.length; i++) {
      const status = entityStatuses.get(filteredEntities[i].id);
      if (!status?.sent && !status?.skipped) return i;
    }
    for (let i = 0; i < fromIndex; i++) {
      const status = entityStatuses.get(filteredEntities[i].id);
      if (!status?.sent && !status?.skipped) return i;
    }
    return -1;
  };

  // Send to current entity
  const handleSendOne = async () => {
    if (!currentEntity || !eventId) return;
    
    if (!currentSubject.trim() || !currentBody.trim()) {
      toast.error("Subject and body are required");
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const ccList = ccEmails.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes("@"));

      if (entityType === "artist") {
        const response = await supabase.functions.invoke("send-artist-email", {
          body: {
            eventId,
            subject: currentSubject,
            bodyHtml: currentBody,
            artistIds: [currentEntity.id],
            targetRoles: null,
            ccEmails: ccList,
            replyTo: replyToEmail || undefined,
            fromUserId: fromUserId || undefined,
          },
        });
        if (response.error) throw response.error;
      } else {
        const response = await supabase.functions.invoke("send-production-email", {
          body: {
            eventId,
            targetType: entityType,
            subject: currentSubject,
            bodyHtml: currentBody,
            recipientIds: [currentEntity.id],
            ccEmails: ccList,
            fromUserId: fromUserId || undefined,
          },
        });
        if (response.error) throw response.error;
      }

      setEntityStatuses(prev => {
        const next = new Map(prev);
        next.set(currentEntity.id, { sent: true, skipped: false, sentAt: new Date().toISOString() });
        return next;
      });

      toast.success(`Email sent to ${currentEntity.name}`);

      const nextUnsent = findNextUnsent(currentIndex);
      if (nextUnsent !== -1) {
        goToEntity(nextUnsent);
      }
    } catch (error: any) {
      toast.error("Failed to send: " + error.message);
    } finally {
      setSending(false);
    }
  };

  // Skip current entity
  const handleSkip = () => {
    if (!currentEntity) return;
    
    setEntityStatuses(prev => {
      const next = new Map(prev);
      next.set(currentEntity.id, { sent: false, skipped: true });
      return next;
    });

    const nextUnsent = findNextUnsent(currentIndex);
    if (nextUnsent !== -1) {
      goToEntity(nextUnsent);
    }
  };

  // Send all remaining
  const handleSendAllRemaining = async () => {
    if (!eventId || !baseSubject.trim() || !baseBody.trim()) {
      toast.error("Please select a template first");
      return;
    }

    const remaining = filteredEntities.filter(e => {
      const status = entityStatuses.get(e.id);
      return !status?.sent && !status?.skipped;
    });

    if (remaining.length === 0) {
      toast.info("No remaining recipients");
      return;
    }

    const confirmed = window.confirm(`Send email to ${remaining.length} remaining ${remaining.length === 1 ? labels.singular.toLowerCase() : labels.plural.toLowerCase()}?`);
    if (!confirmed) return;

    setSendingAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const ccList = ccEmails.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes("@"));
      const remainingIds = remaining.map(e => e.id);

      if (entityType === "artist") {
        const response = await supabase.functions.invoke("send-artist-email", {
          body: {
            eventId,
            subject: baseSubject,
            bodyHtml: baseBody,
            artistIds: remainingIds,
            targetRoles: null,
            ccEmails: ccList,
            replyTo: replyToEmail || undefined,
            fromUserId: fromUserId || undefined,
          },
        });
        if (response.error) throw response.error;
      } else {
        const response = await supabase.functions.invoke("send-production-email", {
          body: {
            eventId,
            targetType: entityType,
            subject: baseSubject,
            bodyHtml: baseBody,
            recipientIds: remainingIds,
            ccEmails: ccList,
            fromUserId: fromUserId || undefined,
          },
        });
        if (response.error) throw response.error;
      }

      // Mark all as sent
      setEntityStatuses(prev => {
        const next = new Map(prev);
        remaining.forEach(e => {
          next.set(e.id, { sent: true, skipped: false, sentAt: new Date().toISOString() });
        });
        return next;
      });

      setLastSentCount(remaining.length);
      setShowSuccess(true);
    } catch (error: any) {
      toast.error("Failed to send: " + error.message);
    } finally {
      setSendingAll(false);
    }
  };

  // Stats
  const sentCount = Array.from(entityStatuses.values()).filter(s => s.sent).length;
  const skippedCount = Array.from(entityStatuses.values()).filter(s => s.skipped).length;
  const remainingCount = filteredEntities.length - sentCount - skippedCount;

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <p className="text-[hsl(var(--admin-text-muted))] text-center">Please select an event first.</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (loading) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <div className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-accent))] border-t-transparent rounded-full" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (entities.length === 0) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <p className="text-[hsl(var(--admin-text-muted))] text-center">No {labels.plural.toLowerCase()} with email addresses found.</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <>
      <EmailSuccessAnimation 
        show={showSuccess}
        recipientCount={lastSentCount}
        onComplete={() => setShowSuccess(false)}
      />

      <div className="space-y-4">
        {/* Header with Send All button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Email {labels.plural}</h2>
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">
              {sentCount} sent • {skippedCount} skipped • {remainingCount} remaining
            </p>
          </div>
          <AdminButton
            variant="admin"
            onClick={handleSendAllRemaining}
            disabled={sendingAll || remainingCount === 0 || !baseSubject.trim()}
            className="gap-2"
          >
            {sendingAll ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                Sending...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Send All Remaining ({remainingCount})
              </>
            )}
          </AdminButton>
        </div>

        <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "lg:grid-cols-4")}>
          {/* Sidebar - Entity list */}
          <AdminCard className={isMobile ? "" : "lg:col-span-1"}>
            <AdminCardHeader className="pb-3">
              <AdminCardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                {labels.plural}
              </AdminCardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </AdminCardHeader>
            <AdminCardContent className="p-0">
              <AdminScrollArea className={isMobile ? "h-[200px]" : "h-[400px]"}>
                <div className="space-y-1 p-2">
                  {filteredEntities.map((entity, index) => {
                    const status = entityStatuses.get(entity.id);
                    const isCurrent = index === currentIndex;
                    
                    return (
                      <button
                        key={entity.id}
                        onClick={() => goToEntity(index)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                          "hover:bg-[hsl(var(--admin-hover))] flex items-center gap-2",
                          isCurrent && "bg-[hsl(var(--admin-accent-muted))] border border-[hsl(var(--admin-accent))]/20",
                          status?.sent && "opacity-60"
                        )}
                      >
                        {status?.sent ? (
                          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--admin-success))] shrink-0" />
                        ) : status?.skipped ? (
                          <SkipForward className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0" />
                        )}
                        <div className="truncate flex-1">
                          <div className="truncate font-medium">{entity.name}</div>
                          {entity.company && (
                            <div className="text-xs text-[hsl(var(--admin-text-muted))] truncate">{entity.company}</div>
                          )}
                        </div>
                        {entity.contacts.length > 1 && (
                          <AdminBadge intent="neutral" className="text-xs shrink-0">
                            {entity.contacts.length}
                          </AdminBadge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </AdminScrollArea>
            </AdminCardContent>
          </AdminCard>

          {/* Main content area */}
          <div className={cn("space-y-4", isMobile ? "" : "lg:col-span-3")}>
            {/* Settings */}
            <AdminCollapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <AdminCard>
                <AdminCollapsibleTrigger className="w-full">
                  <AdminCardHeader className="cursor-pointer hover:bg-[hsl(var(--admin-hover))] transition-colors py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        <AdminCardTitle className="text-base">Settings & Template</AdminCardTitle>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", settingsOpen && "rotate-180")} />
                    </div>
                  </AdminCardHeader>
                </AdminCollapsibleTrigger>
                <AdminCollapsibleContent>
                  <AdminCardContent className="pt-0">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-2">
                        <FromSenderSelect
                          pipelineType={entityType}
                          value={fromUserId}
                          onChange={setFromUserId}
                        />
                      </div>
                      <div className="space-y-2">
                        <AdminLabel>Email Template</AdminLabel>
                        <AdminSelect value={selectedTemplateId} onValueChange={handleTemplateSelect}>
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
                        <AdminLabel>Reply-To</AdminLabel>
                        <AdminInput
                          value={replyToEmail}
                          onChange={(e) => setReplyToEmail(e.target.value)}
                          placeholder="replies@example.com"
                        />
                      </div>
                    </div>
                    
                    {/* Merge fields */}
                    <div className="mt-4">
                      <AdminLabel className="text-sm text-[hsl(var(--admin-text-muted))]">Insert merge field:</AdminLabel>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {mergeFields.map(field => (
                          <AdminBadge
                            key={field.key}
                            intent="neutral"
                            className="cursor-pointer hover:bg-[hsl(var(--admin-hover))] transition-colors"
                            onClick={() => handleInsertField(field.key)}
                          >
                            {field.label}
                          </AdminBadge>
                        ))}
                      </div>
                    </div>
                  </AdminCardContent>
                </AdminCollapsibleContent>
              </AdminCard>
            </AdminCollapsible>

            {/* Email editor */}
            {currentEntity && (
              <AdminCard>
                <AdminCardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <AdminCardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Email to {currentEntity.name}
                      </AdminCardTitle>
                      <AdminCardDescription className="mt-1">
                        To: {currentEntity.contacts.map(c => c.email).join(", ")}
                      </AdminCardDescription>
                    </div>
                    <div className="flex items-center gap-1">
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
                        <AdminLabel>Message</AdminLabel>
                        <RichTextEditor content={currentBody} onChange={setCurrentBody} />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-hover))]">
                        <div className="text-sm text-[hsl(var(--admin-text-muted))] mb-1">Subject:</div>
                        <div className="font-medium">{previewSubject}</div>
                      </div>
                      <div className="p-4 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-hover))]">
                        <div className="text-sm text-[hsl(var(--admin-text-muted))] mb-2">Message:</div>
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewBody) }}
                        />
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Action buttons */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <AdminButton
                        variant="adminOutline"
                        size="sm"
                        onClick={() => goToEntity(currentIndex - 1)}
                        disabled={currentIndex === 0}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </AdminButton>
                      <AdminButton
                        variant="adminOutline"
                        size="sm"
                        onClick={() => goToEntity(currentIndex + 1)}
                        disabled={currentIndex === filteredEntities.length - 1}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </AdminButton>
                      <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                        {currentIndex + 1} of {filteredEntities.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AdminButton
                        variant="ghost"
                        onClick={handleSkip}
                        disabled={sending || entityStatuses.get(currentEntity.id)?.sent}
                      >
                        <SkipForward className="h-4 w-4 mr-1" />
                        Skip
                      </AdminButton>
                      <AdminButton
                        variant="admin"
                        onClick={handleSendOne}
                        disabled={sending || !currentSubject.trim() || !currentBody.trim() || entityStatuses.get(currentEntity.id)?.sent}
                      >
                        {sending ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                            Sending...
                          </>
                        ) : entityStatuses.get(currentEntity.id)?.sent ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Sent
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-1" />
                            Send
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
      </div>
    </>
  );
}
