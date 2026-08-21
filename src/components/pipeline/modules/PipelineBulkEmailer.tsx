import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { usePipeline } from "../PipelineContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
  X,
  FileText,
  SendHorizonal,
  AlertTriangle,
  Info,
  Ban,
  ArrowUpDown,
  Trash2,
  TestTube,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/RichTextEditor";
import { EmailSuccessAnimation } from "@/components/email/EmailSuccessAnimation";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin/AdminSheet";
import {
  AdminButton,
  AdminBadge,
  AdminInput,
  AdminScrollArea,
  AdminEmptyState,
  AdminTooltip,
} from "@/components/admin";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogDescription,
  AdminDialogFooter,
} from "@/components/admin/AdminDialog";
import { AdminViewToggle } from "@/components/admin/AdminViewToggle";
import { CreateTemplateDrawer } from "./CreateTemplateDrawer";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface PipelineBulkEmailerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
}

interface RecordContact {
  id: string;
  name: string;
  email: string;
  role?: string;
  is_primary?: boolean;
}

interface PipelineRecord {
  id: string;
  name: string;
  email?: string | null;
  company_name?: string;
  business_name?: string;
  contacts: RecordContact[];
  lastEmailedAt?: string | null;
  isSuppressed?: boolean;
}

interface RecordEmailStatus {
  sent: boolean;
  skipped: boolean;
  sentAt?: string;
}

// Available merge fields for the helper UI
const MERGE_FIELDS = [
  { field: "{{name}}", description: "Full name" },
  { field: "{{first_name}}", description: "First name only" },
  { field: "{{company}}", description: "Company/business name" },
  { field: "{{contact_name}}", description: "Primary contact name" },
  { field: "{{contact_first_name}}", description: "Primary contact first name" },
  { field: "{{contact_email}}", description: "Primary contact email" },
  { field: "{{event_name}}", description: "Event title" },
  { field: "{{event_date}}", description: "Event date" },
  { field: "{{venue_name}}", description: "Venue name" },
];

export function PipelineBulkEmailer({ isOpen, onClose }: PipelineBulkEmailerProps) {
  const { config, stages } = usePipeline();
  const { selectedEventId } = useAdminEvent();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const entityType = config?.slug as "vendor" | "artisan" | "partner" | "volunteer" | "artist";
  const contactsTable = entityType === "artist" ? "artist_contacts" : `${entityType}_contacts`;
  const entityTable = entityType === "artist" ? "artists" : `${entityType}s`;

  // State
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [baseSubject, setBaseSubject] = useState("");
  const [baseBody, setBaseBody] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSubject, setCurrentSubject] = useState("");
  const [currentBody, setCurrentBody] = useState("");
  const [additionalCcEmails, setAdditionalCcEmails] = useState<string[]>([]); // External CC emails
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [recordStatuses, setRecordStatuses] = useState<Map<string, RecordEmailStatus>>(new Map());
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [showSendAllConfirm, setShowSendAllConfirm] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllProgress, setSendAllProgress] = useState({ current: 0, total: 0 });
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showMergeFields, setShowMergeFields] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  
  // Contact assignments per record: { recordId: { contactId: 'to' | 'cc' | 'excluded' } }
  const [contactAssignments, setContactAssignments] = useState<Map<string, Map<string, 'to' | 'cc' | 'excluded'>>>(new Map());

  // Fetch records with contacts
  const { data: records = [], isLoading: recordsLoading } = useAuthQuery({
    queryKey: ["pipeline-bulk-email-records", entityType, selectedEventId],
    queryFn: async (): Promise<PipelineRecord[]> => {
      if (!selectedEventId) return [];

      let mainRecords: any[] = [];
      let contacts: any[] = [];

      // Fetch based on entity type
      if (entityType === "vendor") {
        const { data, error } = await supabase
          .from("vendors")
          .select("id, name, email, company_name")
          .eq("event_id", selectedEventId)
          .order("name");
        if (error) throw error;
        mainRecords = data || [];
        
        if (mainRecords.length > 0) {
          const { data: contactData } = await supabase
            .from("vendor_contacts")
            .select("*")
            .in("vendor_id", mainRecords.map((r) => r.id));
          contacts = contactData || [];
        }
      } else if (entityType === "artisan") {
        const { data, error } = await supabase
          .from("artisans")
          .select("id, name, email, business_name")
          .eq("event_id", selectedEventId)
          .order("name");
        if (error) throw error;
        mainRecords = data || [];
        
        if (mainRecords.length > 0) {
          const { data: contactData } = await supabase
            .from("artisan_contacts")
            .select("*")
            .in("artisan_id", mainRecords.map((r) => r.id));
          contacts = contactData || [];
        }
      } else if (entityType === "partner") {
        const { data, error } = await supabase
          .from("partners")
          .select("id, name, email, company_name")
          .eq("event_id", selectedEventId)
          .order("name");
        if (error) throw error;
        mainRecords = data || [];
        
        if (mainRecords.length > 0) {
          const { data: contactData } = await supabase
            .from("partner_contacts")
            .select("*")
            .in("partner_id", mainRecords.map((r) => r.id));
          contacts = contactData || [];
        }
      } else if (entityType === "artist") {
        const { data, error } = await supabase
          .from("artists")
          .select("id, name")
          .eq("event_id", selectedEventId)
          .order("name");
        if (error) throw error;
        mainRecords = data || [];
        
        if (mainRecords.length > 0) {
          const { data: contactData } = await supabase
            .from("artist_contacts")
            .select("*")
            .in("artist_id", mainRecords.map((r) => r.id));
          contacts = contactData || [];
        }
      } else if (entityType === "volunteer") {
        const { data, error } = await supabase
          .from("volunteers")
          .select("id, name, email, phone, role")
          .eq("event_id", selectedEventId)
          .order("name");
        if (error) throw error;
        mainRecords = data || [];
        // Volunteers don't have a separate contacts table — email is on the record itself.
        // We synthesize a contact entry from the volunteer's own email so the rest of the
        // pipeline emailer logic works uniformly.
        contacts = mainRecords
          .filter((v: any) => v.email)
          .map((v: any) => ({
            id: `vol-${v.id}`,
            volunteer_id: v.id,
            name: v.name,
            email: v.email,
            role: v.role || "volunteer",
            is_primary: true,
          }));
      } else {
        return [];
      }

      if (!mainRecords.length) return [];

      // Combine and filter to only records with email/contacts
      const entityIdKey = `${entityType}_id`;
      
      // Fetch recent email logs (last 24 hours) for these records
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentEmails } = await supabase
        .from("production_email_recipients")
        .select("target_id, sent_at")
        .eq("target_type", entityType)
        .in("target_id", mainRecords.map((r: any) => r.id))
        .gte("sent_at", twentyFourHoursAgo)
        .order("sent_at", { ascending: false });
      
      // Create map of target_id -> last email time
      const lastEmailMap = new Map<string, string>();
      (recentEmails || []).forEach((e: any) => {
        if (!lastEmailMap.has(e.target_id)) {
          lastEmailMap.set(e.target_id, e.sent_at);
        }
      });

      // Get all contact emails to check suppression
      const allEmails = mainRecords
        .flatMap((r) => {
          const recordContacts = contacts.filter((c: any) => c[entityIdKey] === r.id);
          return [r.email, ...recordContacts.map((c: any) => c.email)].filter(Boolean);
        });
      
      // Check suppressed emails (bounces + unsubscribes)
      const suppressedSet = new Set<string>();
      if (allEmails.length > 0) {
        const { data: bounces } = await supabase
          .from("email_bounces")
          .select("email")
          .eq("bounce_type", "hard")
          .in("email", allEmails);
        bounces?.forEach((b) => suppressedSet.add(b.email.toLowerCase()));
        
        const { data: unsubscribes } = await supabase
          .from("email_unsubscribes")
          .select("email")
          .in("email", allEmails);
        unsubscribes?.forEach((u) => suppressedSet.add(u.email.toLowerCase()));
      }

      const recordsWithContacts: PipelineRecord[] = mainRecords
        .map((record) => {
          const recordContacts = contacts
            .filter((c: any) => c[entityIdKey] === record.id)
            .map((c: any) => ({
              id: c.id,
              name: c.name,
              email: c.email,
              role: c.role,
              is_primary: c.is_primary,
            }));
          
          const primaryEmail = recordContacts[0]?.email || record.email;
          const isSuppressed = primaryEmail ? suppressedSet.has(primaryEmail.toLowerCase()) : false;
          
          return {
            id: record.id,
            name: record.name,
            email: record.email,
            company_name: record.company_name,
            business_name: record.business_name,
            contacts: recordContacts,
            lastEmailedAt: lastEmailMap.get(record.id) || null,
            isSuppressed,
          };
        })
        .filter((r) => r.email || r.contacts.length > 0);

      return recordsWithContacts;
    },
    enabled: !!config && !!selectedEventId && isOpen,
  });

  // Fetch templates - use artist_email_templates for artists, production_email_templates for others
  // For artists, filter to only show templates with audience='artist'
  const { data: templates = [] } = useAuthQuery({
    queryKey: ["pipeline-email-templates", entityType, selectedEventId],
    queryFn: async () => {
      if (entityType === "artist") {
        // Artists use the artist_email_templates table - filter by audience
        // Include templates for this event OR global templates (event_id is null)
        const { data, error } = await supabase
          .from("artist_email_templates")
          .select("id, name, subject, body_html, category, audience, event_id, created_at, updated_at")
          .eq("audience", "artist")
          .or(selectedEventId 
            ? `event_id.eq.${selectedEventId},event_id.is.null`
            : `event_id.is.null`
          )
          .order("name", { ascending: true });

        if (error) throw error;
        return (data || []).map(t => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body_html: t.body_html,
          target_type: "artist" as const,
          event_id: t.event_id,
          created_at: t.created_at,
          updated_at: t.updated_at,
        })) as EmailTemplate[];
      } else {
        // Other entity types use production_email_templates
        const query = supabase
          .from("production_email_templates")
          .select("*")
          .eq("target_type", entityType)
          .order("created_at", { ascending: false });

        if (selectedEventId) {
          query.or(`event_id.eq.${selectedEventId},event_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as EmailTemplate[];
      }
    },
    enabled: !!entityType && isOpen,
  });

  // Fetch event details for merge fields
  const { data: eventDetails } = useAuthQuery({
    queryKey: ["event-details", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return null;
      const { data, error } = await supabase
        .from("event_details")
        .select("title, event_date, venue_name")
        .eq("id", selectedEventId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId && isOpen,
  });

  // Fetch email settings
  const { data: emailSettings } = useAuthQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_settings").select("*").single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: isOpen,
  });

  // Initialize additional CC from settings
  useEffect(() => {
    if (emailSettings) {
      const defaultCc = emailSettings.default_cc_emails as string[] | null;
      if (defaultCc?.length) {
        setAdditionalCcEmails(defaultCc);
      }
    }
  }, [emailSettings]);

  const currentRecord = records[currentIndex];

  // Contact assignment helpers (depend on currentRecord)
  const currentContactAssignments = useMemo(() => {
    if (!currentRecord) return new Map<string, 'to' | 'cc' | 'excluded'>();
    return contactAssignments.get(currentRecord.id) || new Map();
  }, [currentRecord?.id, contactAssignments]);

  const setContactAssignment = (contactId: string, assignment: 'to' | 'cc' | 'excluded') => {
    if (!currentRecord) return;
    
    const currentAssignments = contactAssignments.get(currentRecord.id) || new Map();
    const newAssignments = new Map(currentAssignments);
    
    // If setting to 'to', move current 'to' to 'cc'
    if (assignment === 'to') {
      newAssignments.forEach((val, key) => {
        if (val === 'to') newAssignments.set(key, 'cc');
      });
    }
    
    newAssignments.set(contactId, assignment);
    setContactAssignments(prev => new Map(prev).set(currentRecord.id, newAssignments));
  };

  const getToContacts = () => {
    if (!currentRecord) return [];
    return currentRecord.contacts.filter(c => currentContactAssignments.get(c.id) === 'to');
  };

  const getCcContacts = () => {
    if (!currentRecord) return [];
    return currentRecord.contacts.filter(c => currentContactAssignments.get(c.id) === 'cc');
  };

  // Initialize contact assignments when current record changes or contacts load
  useEffect(() => {
    if (currentRecord && currentRecord.contacts.length > 0) {
      const existingAssignment = contactAssignments.get(currentRecord.id);
      // Initialize if no assignment exists or if it's stale (contacts changed)
      if (!existingAssignment || existingAssignment.size !== currentRecord.contacts.length) {
        // Initialize: primary contact or first as 'to', rest as 'cc'
        const newAssignment = new Map<string, 'to' | 'cc' | 'excluded'>();
        const primaryContact = currentRecord.contacts.find(c => c.is_primary) || currentRecord.contacts[0];
        currentRecord.contacts.forEach((contact) => {
          // Preserve existing assignment if available
          const existing = existingAssignment?.get(contact.id);
          newAssignment.set(contact.id, existing || (contact.id === primaryContact?.id ? 'to' : 'cc'));
        });
        setContactAssignments(prev => new Map(prev).set(currentRecord.id, newAssignment));
      }
    }
  }, [currentRecord?.id, currentRecord?.contacts.length]);

  // Replace merge fields - use the contact assigned as 'to' (primary) for contact-specific fields
  const replaceMergeFields = (text: string, record: PipelineRecord): string => {
    // Get the primary contact (assigned as 'to') for this record
    const recordAssignment = contactAssignments.get(record.id);
    const primaryContact = record.contacts.find(c => recordAssignment?.get(c.id) === 'to') 
      || record.contacts.find(c => c.is_primary) 
      || record.contacts[0];
    
    // Parse contact first/last name
    const contactFirstName = primaryContact?.name?.split(" ")[0] || "";
    const contactLastName = primaryContact?.name?.split(" ").slice(1).join(" ") || "";
    
    let result = text;
    result = result.replace(/\{\{name\}\}/gi, record.name || "[Name]");
    result = result.replace(/\{\{first_name\}\}/gi, record.name?.split(" ")[0] || "[First Name]");
    result = result.replace(/\{\{company\}\}/gi, record.company_name || record.business_name || "[Company]");
    result = result.replace(/\{\{business_name\}\}/gi, record.business_name || "[Business Name]");
    // Contact-specific fields use the primary contact
    result = result.replace(/\{\{contact_name\}\}/gi, primaryContact?.name || record.name || "[Contact Name]");
    result = result.replace(/\{\{contact_first_name\}\}/gi, contactFirstName || "[First Name]");
    result = result.replace(/\{\{contact_last_name\}\}/gi, contactLastName || "[Last Name]");
    result = result.replace(/\{\{contact_email\}\}/gi, primaryContact?.email || record.email || "[Email]");
    result = result.replace(/\{\{event_name\}\}/gi, eventDetails?.title || "[Event Name]");
    result = result.replace(/\{\{event_date\}\}/gi, eventDetails?.event_date || "[Event Date]");
    result = result.replace(/\{\{venue_name\}\}/gi, eventDetails?.venue_name || "[Venue Name]");
    return result;
  };

  const previewSubject = useMemo(() => {
    if (!currentRecord) return currentSubject;
    return replaceMergeFields(currentSubject, currentRecord);
  }, [currentSubject, currentRecord, eventDetails]);

  const previewBody = useMemo(() => {
    if (!currentRecord) return currentBody;
    return replaceMergeFields(currentBody, currentRecord);
  }, [currentBody, currentRecord, eventDetails]);

  // Template selection
  const handleTemplateSelect = (templateId: string) => {
    if (templateId === "__create_new__") {
      setShowCreateTemplate(true);
      return;
    }
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setBaseSubject(template.subject);
      setBaseBody(template.body_html);
      setCurrentSubject(template.subject);
      setCurrentBody(template.body_html);
    }
  };

  // Template created callback - select the new template
  const handleTemplateCreated = (templateId: string) => {
    queryClient.invalidateQueries({ queryKey: ["pipeline-email-templates", entityType, selectedEventId] });
    setSelectedTemplateId(templateId);
  };

  // Navigation
  const goToRecord = (index: number) => {
    if (index >= 0 && index < records.length) {
      setCurrentIndex(index);
      setCurrentSubject(baseSubject);
      setCurrentBody(baseBody);
      setViewMode("edit");
    }
  };

  const findNextUnsent = (startIndex: number): number => {
    for (let i = startIndex; i < records.length; i++) {
      const status = recordStatuses.get(records[i].id);
      if (!status?.sent && !status?.skipped) return i;
    }
    return -1;
  };

  // Send email
  const handleSend = async () => {
    if (!currentRecord) return;
    if (!previewSubject.trim() || !previewBody.trim()) {
      toast.error("Subject and message are required");
      return;
    }

    const recipientEmail = currentRecord.contacts[0]?.email || currentRecord.email;
    if (!recipientEmail) {
      toast.error("No email address for this record");
      return;
    }

    setSending(true);
    try {
      // Combine CC contacts + additional external CC emails
      const toEmails = getToContacts().map(c => c.email);
      const ccContactEmails = getCcContacts().map(c => c.email);
      const allCcEmails = [...ccContactEmails, ...additionalCcEmails];

      const { error } = await supabase.functions.invoke("send-production-email", {
        body: {
          eventId: selectedEventId,
          targetType: entityType,
          subject: previewSubject,
          bodyHtml: previewBody,
          recipientIds: [currentRecord.id],
          toEmails,
          ccEmails: allCcEmails,
        },
      });

      if (error) throw error;

      setRecordStatuses((prev) => new Map(prev).set(currentRecord.id, { sent: true, skipped: false, sentAt: new Date().toISOString() }));
      toast.success(`Email sent to ${currentRecord.name}`);

      // Auto-advance to next unsent
      const nextIndex = findNextUnsent(currentIndex + 1);
      if (nextIndex >= 0) {
        setTimeout(() => goToRecord(nextIndex), 500);
      }
    } catch (error: any) {
      console.error("Send error:", error);
      toast.error(error.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  // Skip current record
  const handleSkip = () => {
    if (!currentRecord) return;
    setRecordStatuses((prev) => new Map(prev).set(currentRecord.id, { sent: false, skipped: true }));
    const nextIndex = findNextUnsent(currentIndex + 1);
    if (nextIndex >= 0) {
      goToRecord(nextIndex);
    } else if (currentIndex < records.length - 1) {
      goToRecord(currentIndex + 1);
    }
  };

  // Get all unsent records (excluding suppressed)
  const getUnsentRecords = () => {
    return records.filter((r) => {
      const status = recordStatuses.get(r.id);
      return !status?.sent && !status?.skipped && !r.isSuppressed;
    });
  };

  // Send test email to yourself
  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Please enter a test email address");
      return;
    }
    if (!previewSubject.trim() || !previewBody.trim()) {
      toast.error("Subject and message are required");
      return;
    }

    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke("send-production-email", {
        body: {
          eventId: selectedEventId,
          targetType: entityType,
          subject: `[TEST] ${previewSubject}`,
          bodyHtml: previewBody,
          testEmail: testEmail.trim(), // Send to test email instead
        },
      });

      if (error) throw error;
      toast.success(`Test email sent to ${testEmail}`);
    } catch (error: any) {
      console.error("Test send error:", error);
      toast.error(error.message || "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };

  // Send all remaining emails
  const handleSendAll = async () => {
    const unsentRecords = getUnsentRecords();
    if (unsentRecords.length === 0) {
      toast.info("No remaining emails to send");
      return;
    }

    if (!baseSubject.trim() || !baseBody.trim()) {
      toast.error("Please select a template or enter subject and message first");
      return;
    }

    setSendingAll(true);
    setSendAllProgress({ current: 0, total: unsentRecords.length });
    setShowSendAllConfirm(false);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < unsentRecords.length; i++) {
      const record = unsentRecords[i];
      setSendAllProgress({ current: i + 1, total: unsentRecords.length });

      const recipientEmail = record.contacts[0]?.email || record.email;
      if (!recipientEmail) {
        setRecordStatuses((prev) => new Map(prev).set(record.id, { sent: false, skipped: true }));
        continue;
      }

      // Replace merge fields for this record
      const subject = replaceMergeFields(baseSubject, record);
      const body = replaceMergeFields(baseBody, record);

      try {
        // For bulk send, use the contact assignments for this record
        const recordAssignments = contactAssignments.get(record.id);
        const toEmails = record.contacts
          .filter(c => recordAssignments?.get(c.id) === 'to')
          .map(c => c.email);
        const ccContactEmails = record.contacts
          .filter(c => recordAssignments?.get(c.id) === 'cc')
          .map(c => c.email);
        const allCcEmails = [...ccContactEmails, ...additionalCcEmails];

        const { error } = await supabase.functions.invoke("send-production-email", {
          body: {
            eventId: selectedEventId,
            targetType: entityType,
            subject,
            bodyHtml: body,
            recipientIds: [record.id],
            toEmails,
            ccEmails: allCcEmails,
          },
        });

        if (error) throw error;

        setRecordStatuses((prev) => new Map(prev).set(record.id, { sent: true, skipped: false, sentAt: new Date().toISOString() }));
        successCount++;
      } catch (error: any) {
        console.error(`Failed to send to record ${record.id}:`, error);
        failCount++;
      }

      // Small delay to avoid rate limiting
      if (i < unsentRecords.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    setSendingAll(false);
    setSendAllProgress({ current: 0, total: 0 });

    if (failCount === 0) {
      toast.success(`All ${successCount} emails sent successfully!`);
      setShowSuccess(true);
    } else {
      toast.warning(`Sent ${successCount} emails, ${failCount} failed`);
    }
  };

  const handleClose = () => {
    setSelectedTemplateId("");
    setBaseSubject("");
    setBaseBody("");
    setCurrentSubject("");
    setCurrentBody("");
    setCurrentIndex(0);
    setRecordStatuses(new Map());
    setViewMode("edit");
    setSendingAll(false);
    setSendAllProgress({ current: 0, total: 0 });
    onClose();
  };

  // Counts
  const sentCount = Array.from(recordStatuses.values()).filter((s) => s.sent).length;
  const skippedCount = Array.from(recordStatuses.values()).filter((s) => s.skipped).length;
  const remainingCount = records.length - sentCount - skippedCount;
  const currentStatus = currentRecord ? recordStatuses.get(currentRecord.id) : null;

  if (!config) return null;

  return (
    <>
      <EmailSuccessAnimation show={showSuccess} recipientCount={1} onComplete={() => setShowSuccess(false)} />

      <AdminSheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <AdminSheetContent side="right" className="w-full sm:max-w-4xl p-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-bg))]">
            <div className="mb-3">
              <AdminSheetTitle className="text-base">
                Send Emails to {config.name_plural}
              </AdminSheetTitle>
              <AdminSheetDescription className="text-xs">
                Step through each record, preview, edit, and send individually
              </AdminSheetDescription>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-[hsl(var(--admin-muted)/0.3)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[hsl(var(--admin-success))] transition-all duration-300"
                  style={{ width: `${records.length ? (sentCount / records.length) * 100 : 0}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-xs shrink-0">
                <span className="flex items-center gap-1 text-[hsl(var(--admin-success))]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {sentCount} sent
                </span>
                <span className="flex items-center gap-1 text-[hsl(var(--admin-muted-foreground))]">
                  <SkipForward className="w-3.5 h-3.5" />
                  {skippedCount} skipped
                </span>
                <span className="flex items-center gap-1 text-[hsl(var(--admin-foreground))]">
                  <Clock className="w-3.5 h-3.5" />
                  {remainingCount} remaining
                </span>
              </div>
            </div>
          </div>

          {recordsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[hsl(var(--admin-primary))] border-t-transparent" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center space-y-2">
                <Users className="w-8 h-8 mx-auto text-[hsl(var(--admin-muted-foreground))]" />
                <p className="text-sm font-medium text-[hsl(var(--admin-foreground))]">
                  No {config.name_plural.toLowerCase()} with email addresses
                </p>
                <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                  Add contacts with email addresses to send emails
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Sidebar: Record List */}
              <div className="w-56 shrink-0 border-r border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-bg))] flex flex-col">
                <div className="p-3 border-b border-[hsl(var(--admin-border))] space-y-2">
                  <p className="text-xs font-medium text-[hsl(var(--admin-muted-foreground))]">
                    {records.length} {config.name_plural.toLowerCase()}
                  </p>
                  {records.length > 5 && (
                    <AdminInput
                      placeholder="Search..."
                      value={sidebarSearch}
                      onChange={(e) => setSidebarSearch(e.target.value)}
                      className="h-7 text-xs"
                    />
                  )}
                </div>
                <AdminScrollArea className="flex-1">
                  <div className="p-2 space-y-0.5">
                    {records
                      .filter((r) => !sidebarSearch || r.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
                      .map((record) => {
                        const index = records.findIndex((r) => r.id === record.id);
                        const status = recordStatuses.get(record.id);
                        const isActive = index === currentIndex;
                        const recentlyEmailed = record.lastEmailedAt;
                        
                        return (
                          <AdminTooltip
                            key={record.id}
                            content={
                              record.isSuppressed
                                ? "Email suppressed (bounced or unsubscribed)"
                                : recentlyEmailed
                                ? `Last emailed: ${new Date(recentlyEmailed).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`
                                : undefined
                            }
                          >
                            <button
                              type="button"
                              onClick={() => goToRecord(index)}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-md transition-all text-sm",
                                "hover:bg-[hsl(var(--admin-card-hover))]",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--admin-ring))]",
                                isActive && "bg-[hsl(var(--admin-primary)/0.1)]",
                                record.isSuppressed && "opacity-50"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {record.isSuppressed ? (
                                  <Ban className="w-3.5 h-3.5 shrink-0 text-[hsl(var(--admin-error))]" />
                                ) : status?.sent ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[hsl(var(--admin-success))]" />
                                ) : status?.skipped ? (
                                  <SkipForward className="w-3.5 h-3.5 shrink-0 text-[hsl(var(--admin-muted-foreground))]" />
                                ) : (
                                  <Mail className="w-3.5 h-3.5 shrink-0 text-[hsl(var(--admin-muted-foreground))]" />
                                )}
                                <span
                                  className={cn(
                                    "truncate flex-1",
                                    isActive
                                      ? "text-[hsl(var(--admin-primary))] font-medium"
                                      : status?.sent
                                      ? "text-[hsl(var(--admin-muted-foreground))] line-through"
                                      : status?.skipped || record.isSuppressed
                                      ? "text-[hsl(var(--admin-muted-foreground))]"
                                      : "text-[hsl(var(--admin-foreground))]"
                                  )}
                                >
                                  {record.name}
                                </span>
                                {recentlyEmailed && !record.isSuppressed && (
                                  <Clock className="w-3 h-3 shrink-0 text-[hsl(var(--admin-warning))]" />
                                )}
                              </div>
                            </button>
                          </AdminTooltip>
                        );
                      })}
                  </div>
                </AdminScrollArea>
              </div>

              {/* Main Content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {currentRecord && (
                  <>
                    {/* Current Record Header */}
                    <div className="p-4 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[hsl(var(--admin-primary)/0.1)] flex items-center justify-center">
                            <span className="text-sm font-semibold text-[hsl(var(--admin-primary))]">
                              {currentRecord.name?.charAt(0)?.toUpperCase() || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-[hsl(var(--admin-foreground))]">
                              {currentRecord.name}
                            </p>
                            <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                              {currentRecord.contacts[0]?.email || currentRecord.email || "No email"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* View Toggle */}
                          <AdminViewToggle
                            value={viewMode}
                            onValueChange={(val) => setViewMode(val as "edit" | "preview")}
                            options={[
                              { value: "edit", label: "Edit", icon: <Edit className="w-3.5 h-3.5" /> },
                              { value: "preview", label: "Preview", icon: <Eye className="w-3.5 h-3.5" /> },
                            ]}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Template & Settings - Compact layout */}
                    <div className="px-4 py-3 border-b border-[hsl(var(--admin-border))] space-y-2">
                      {/* Template select with "Create New" option */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <AdminSelect
                            value={selectedTemplateId}
                            onValueChange={handleTemplateSelect}
                            placeholder="Select template..."
                          >
                            <AdminSelectItem value="__create_new__" className="text-[hsl(var(--admin-primary))] border-b border-[hsl(var(--admin-border))]">
                              + Create New Template
                            </AdminSelectItem>
                            {templates.map((t) => (
                              <AdminSelectItem key={t.id} value={t.id}>
                                {t.name}
                              </AdminSelectItem>
                            ))}
                          </AdminSelect>
                        </div>
                        <AdminInput
                          value={additionalCcEmails.join(", ")}
                          onChange={(e) => setAdditionalCcEmails(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                          placeholder="Additional CC emails..."
                          className="text-xs w-48"
                        />
                      </div>
                      
                      {/* Compact Recipients - Single line with To/CC inline */}
                      {currentRecord && currentRecord.contacts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-[hsl(var(--admin-muted-foreground))] font-medium">To:</span>
                          {getToContacts().map((contact) => (
                            <span
                              key={contact.id}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[hsl(var(--admin-primary)/0.1)] text-[hsl(var(--admin-foreground))]"
                            >
                              {contact.name}
                              {contact.role && <span className="text-[hsl(var(--admin-muted-foreground))]">({contact.role})</span>}
                              <button
                                type="button"
                                onClick={() => setContactAssignment(contact.id, 'cc')}
                                className="p-0.5 hover:bg-[hsl(var(--admin-primary)/0.2)] rounded"
                                title="Move to CC"
                              >
                                <ArrowUpDown className="w-2.5 h-2.5 text-[hsl(var(--admin-muted-foreground))]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setContactAssignment(contact.id, 'excluded')}
                                className="p-0.5 hover:bg-[hsl(var(--admin-error)/0.2)] rounded"
                                title="Exclude"
                              >
                                <Trash2 className="w-2.5 h-2.5 text-[hsl(var(--admin-error))]" />
                              </button>
                            </span>
                          ))}
                          {getToContacts().length === 0 && (
                            <span className="text-[hsl(var(--admin-muted-foreground))] italic">None</span>
                          )}

                          {(getCcContacts().length > 0 || additionalCcEmails.length > 0) && (
                            <>
                              <span className="text-[hsl(var(--admin-border))]">|</span>
                              <span className="text-[hsl(var(--admin-muted-foreground))] font-medium">CC:</span>
                              {getCcContacts().map((contact) => (
                                <span
                                  key={contact.id}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-foreground))]"
                                >
                                  {contact.name}
                                  {contact.role && <span className="text-[hsl(var(--admin-muted-foreground))]">({contact.role})</span>}
                                  <button
                                    type="button"
                                    onClick={() => setContactAssignment(contact.id, 'to')}
                                    className="p-0.5 hover:bg-[hsl(var(--admin-primary)/0.2)] rounded"
                                    title="Move to To"
                                  >
                                    <ArrowUpDown className="w-2.5 h-2.5 text-[hsl(var(--admin-muted-foreground))]" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setContactAssignment(contact.id, 'excluded')}
                                    className="p-0.5 hover:bg-[hsl(var(--admin-error)/0.2)] rounded"
                                    title="Exclude"
                                  >
                                    <Trash2 className="w-2.5 h-2.5 text-[hsl(var(--admin-error))]" />
                                  </button>
                                </span>
                              ))}
                              {additionalCcEmails.map((email, idx) => (
                                <span
                                  key={`ext-${idx}`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[hsl(var(--admin-muted)/0.3)] border-dashed border border-[hsl(var(--admin-border))] text-[hsl(var(--admin-muted-foreground))]"
                                >
                                  {email}
                                  <button
                                    type="button"
                                    onClick={() => setAdditionalCcEmails(prev => prev.filter((_, i) => i !== idx))}
                                    className="p-0.5 hover:bg-[hsl(var(--admin-error)/0.2)] rounded"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              ))}
                            </>
                          )}

                          {/* Excluded - collapsed */}
                          {currentRecord.contacts.filter(c => currentContactAssignments.get(c.id) === 'excluded').length > 0 && (
                            <>
                              <span className="text-[hsl(var(--admin-border))]">|</span>
                              <span className="text-[hsl(var(--admin-muted-foreground))] text-[10px]">
                                +{currentRecord.contacts.filter(c => currentContactAssignments.get(c.id) === 'excluded').length} excluded
                              </span>
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Merge Fields Helper & Test Email */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <AdminButton
                            variant="adminGhost"
                            size="sm"
                            onClick={() => setShowMergeFields(!showMergeFields)}
                            className="h-7 text-xs"
                          >
                            <Info className="w-3.5 h-3.5 mr-1" />
                            Merge Fields
                          </AdminButton>
                          {records.some((r) => r.isSuppressed) && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[hsl(var(--admin-warning))] border border-[hsl(var(--admin-warning))] bg-[hsl(var(--admin-warning)/0.1)]">
                              <Ban className="w-3 h-3" />
                              {records.filter((r) => r.isSuppressed).length} suppressed
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <AdminInput
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="your@email.com"
                            className="h-7 text-xs w-40"
                          />
                          <AdminButton
                            variant="adminOutline"
                            size="sm"
                            onClick={handleSendTest}
                            disabled={sendingTest || !currentSubject.trim() || !currentBody.trim()}
                            className="h-7"
                          >
                            {sendingTest ? (
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-current border-t-transparent" />
                            ) : (
                              <>
                                <TestTube className="w-3.5 h-3.5 mr-1" />
                                Test
                              </>
                            )}
                          </AdminButton>
                        </div>
                      </div>
                      
                      {/* Merge Fields Reference */}
                      {showMergeFields && (
                        <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]">
                          <p className="text-xs font-medium text-[hsl(var(--admin-foreground))] mb-2">
                            Available Merge Fields
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {MERGE_FIELDS.map((mf) => (
                              <div key={mf.field} className="flex items-center gap-2 text-xs">
                                <code className="px-1.5 py-0.5 rounded bg-[hsl(var(--admin-muted))] text-[hsl(var(--admin-primary))] font-mono">
                                  {mf.field}
                                </code>
                                <span className="text-[hsl(var(--admin-muted-foreground))]">{mf.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Email Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {viewMode === "edit" ? (
                        <>
                          <div>
                            <AdminLabel className="text-xs">Subject</AdminLabel>
                            <AdminInput
                              value={currentSubject}
                              onChange={(e) => setCurrentSubject(e.target.value)}
                              placeholder="Email subject..."
                            />
                          </div>
                          <div className="flex-1">
                            <AdminLabel className="text-xs">Message</AdminLabel>
                            <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
                              <RichTextEditor content={currentBody} onChange={setCurrentBody} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <AdminCard className="bg-[hsl(var(--admin-surface))]">
                          <AdminCardContent className="p-4 space-y-4">
                            <div>
                              <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mb-1">Subject</p>
                              <p className="font-medium text-[hsl(var(--admin-foreground))]">{previewSubject}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mb-1">Message</p>
                              <div
                                className="prose prose-sm max-w-none text-[hsl(var(--admin-foreground))]"
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewBody) }}
                              />
                            </div>
                          </AdminCardContent>
                        </AdminCard>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-bg))]">
                      {sendingAll ? (
                        <div className="flex items-center justify-center gap-3 py-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-[hsl(var(--admin-primary))] border-t-transparent" />
                          <span className="text-sm text-[hsl(var(--admin-foreground))]">
                            Sending {sendAllProgress.current} of {sendAllProgress.total}...
                          </span>
                          <div className="flex-1 max-w-xs h-1.5 bg-[hsl(var(--admin-muted)/0.3)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[hsl(var(--admin-primary))] transition-all duration-300"
                              style={{ width: `${sendAllProgress.total ? (sendAllProgress.current / sendAllProgress.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          {/* Navigation */}
                          <div className="flex items-center gap-2">
                            <AdminButton
                              variant="adminOutline"
                              size="sm"
                              onClick={() => goToRecord(currentIndex - 1)}
                              disabled={currentIndex === 0}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </AdminButton>
                            <span className="text-xs text-[hsl(var(--admin-muted-foreground))] tabular-nums">
                              {currentIndex + 1} / {records.length}
                            </span>
                            <AdminButton
                              variant="adminOutline"
                              size="sm"
                              onClick={() => goToRecord(currentIndex + 1)}
                              disabled={currentIndex === records.length - 1}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </AdminButton>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <AdminButton
                              variant="adminGhost"
                              size="sm"
                              onClick={handleSkip}
                              disabled={currentStatus?.sent || currentStatus?.skipped}
                            >
                              <SkipForward className="w-4 h-4 mr-1" />
                              Skip
                            </AdminButton>
                            <AdminButton
                              variant="admin"
                              size="sm"
                              onClick={handleSend}
                              disabled={sending || currentStatus?.sent || !currentSubject.trim() || !currentBody.trim()}
                            >
                              {sending ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                  Sending...
                                </>
                              ) : currentStatus?.sent ? (
                                <>
                                  <Check className="w-4 h-4 mr-1" />
                                  Sent
                                </>
                              ) : (
                                <>
                                  <Send className="w-4 h-4 mr-1" />
                                  Send
                                </>
                              )}
                            </AdminButton>
                            {remainingCount > 1 && (
                              <AdminButton
                                variant="adminOutline"
                                size="sm"
                                onClick={() => setShowSendAllConfirm(true)}
                                disabled={!baseSubject.trim() || !baseBody.trim()}
                                title="Send to all remaining recipients"
                              >
                                <SendHorizonal className="w-4 h-4 mr-1" />
                                Send All ({remainingCount})
                              </AdminButton>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </AdminSheetContent>
      </AdminSheet>

      {/* Send All Confirmation Dialog */}
      <AdminDialog open={showSendAllConfirm} onOpenChange={setShowSendAllConfirm}>
        <AdminDialogContent className="max-w-md">
          <AdminDialogHeader>
            <AdminDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[hsl(var(--admin-warning))]" />
              Confirm Send All
            </AdminDialogTitle>
            <AdminDialogDescription>
              You are about to send {remainingCount} email{remainingCount !== 1 ? "s" : ""} using the current template. 
              Each email will be personalized with merge fields. This action cannot be undone.
            </AdminDialogDescription>
          </AdminDialogHeader>
          
          <div className="py-4 space-y-3">
            <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]">
              <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mb-1">Subject</p>
              <p className="text-sm font-medium text-[hsl(var(--admin-foreground))]">{baseSubject || "(No subject)"}</p>
            </div>
            <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
              Tip: Use "Step through" mode to review each email before sending if you want to customize messages individually.
            </p>
          </div>

          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setShowSendAllConfirm(false)}>
              Cancel
            </AdminButton>
            <AdminButton variant="admin" onClick={handleSendAll}>
              <SendHorizonal className="w-4 h-4 mr-1" />
              Send All {remainingCount} Emails
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Create Template Drawer */}
      <CreateTemplateDrawer
        isOpen={showCreateTemplate}
        onClose={() => setShowCreateTemplate(false)}
        entityType={entityType}
        initialSubject={currentSubject}
        initialBody={currentBody}
        onTemplateCreated={handleTemplateCreated}
      />
    </>
  );
}
