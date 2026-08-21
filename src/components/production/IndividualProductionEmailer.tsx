import { useState, useEffect, useMemo } from "react";
import { 
  AdminButton, 
  AdminInput, 
  AdminLabel, 
  AdminBadge, 
  AdminSelect, 
  AdminSelectItem,
  AdminScrollArea 
} from "@/components/admin";
import {
  Send, 
  ChevronLeft, 
  ChevronRight, 
  SkipForward, 
  Eye, 
  Edit,
  Mail,
  CheckCircle2,
  Clock,
  Upload,
  Paperclip,
  X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/RichTextEditor";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle, AdminCardDescription } from "@/components/admin/AdminCard";
import { AdminAvatar } from "@/components/admin/AdminPrimitives";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface Recipient {
  id: string;
  name: string;
  email: string;
  company?: string | null;
  booth_number?: string | null;
  shift?: string | null;
  tier?: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
}

interface EventDetails {
  title: string;
  event_date: string;
}

interface EmailStatus {
  sent: boolean;
  skipped: boolean;
  sentAt?: string;
}

interface Attachment {
  name: string;
  path: string;
  size: number;
}

interface IndividualProductionEmailerProps {
  targetType: "vendor" | "artisan" | "volunteer" | "partner";
  eventId?: string;
}

const TARGET_LABELS: Record<string, string> = {
  vendor: "Vendors",
  artisan: "Artisans",
  volunteer: "Volunteers",
  partner: "Partners",
};

const MERGE_FIELDS: Record<string, string[]> = {
  vendor: ["{{name}}", "{{company}}", "{{email}}", "{{event_name}}", "{{event_date}}"],
  artisan: ["{{name}}", "{{business_name}}", "{{email}}", "{{booth_number}}", "{{event_name}}", "{{event_date}}"],
  volunteer: ["{{name}}", "{{email}}", "{{shift}}", "{{check_in_location}}", "{{event_name}}", "{{event_date}}"],
  partner: ["{{name}}", "{{company}}", "{{email}}", "{{tier}}", "{{event_name}}", "{{event_date}}"],
};

export default function IndividualProductionEmailer({ targetType, eventId }: IndividualProductionEmailerProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  
  // Template selection (applies to all)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [baseSubject, setBaseSubject] = useState("");
  const [baseBody, setBaseBody] = useState("");
  
  // Current recipient editing
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSubject, setCurrentSubject] = useState("");
  const [currentBody, setCurrentBody] = useState("");
  
  // CC and Reply-To settings
  const [ccEmails, setCcEmails] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("team@example.org");
  
  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  
  // Status tracking
  const [recipientStatuses, setRecipientStatuses] = useState<Map<string, EmailStatus>>(new Map());
  
  // View mode
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId, targetType]);

  const fetchData = async () => {
    if (!eventId) return;
    
    setLoading(true);
    try {
      // Fetch event details
      const { data: eventData } = await supabase
        .from("event_details")
        .select("title, event_date")
        .eq("id", eventId)
        .single();

      if (eventData) {
        setEventDetails(eventData);
      }

      // Fetch recipients based on target type
      let recipientsData: Recipient[] = [];
      
      if (targetType === "vendor") {
        const { data, error } = await supabase
          .from("vendors")
          .select("id, name, company_name, email")
          .eq("event_id", eventId)
          .not("email", "is", null)
          .order("name");
        if (error) throw error;
        recipientsData = data?.map(v => ({ id: v.id, name: v.name, email: v.email!, company: v.company_name })) || [];
      } else if (targetType === "artisan") {
        const { data, error } = await supabase
          .from("artisans")
          .select("id, name, business_name, email, booth_number")
          .eq("event_id", eventId)
          .not("email", "is", null)
          .order("name");
        if (error) throw error;
        recipientsData = data?.map(a => ({ id: a.id, name: a.name, email: a.email!, company: a.business_name, booth_number: a.booth_number })) || [];
      } else if (targetType === "volunteer") {
        const { data, error } = await supabase
          .from("volunteer_interests")
          .select("id, name, email, shift_assigned")
          .not("email", "is", null)
          .order("name");
        if (error) throw error;
        recipientsData = data?.map(v => ({ id: v.id, name: v.name, email: v.email, shift: v.shift_assigned })) || [];
      } else if (targetType === "partner") {
        const { data, error } = await supabase
          .from("partners")
          .select("id, name, company_name, email, tier")
          .eq("event_id", eventId)
          .not("email", "is", null)
          .order("name");
        if (error) throw error;
        recipientsData = data?.map(p => ({ id: p.id, name: p.name, email: p.email!, company: p.company_name, tier: p.tier })) || [];
      }

      setRecipients(recipientsData);

      // Fetch templates
      const { data: templatesData } = await supabase
        .from("production_email_templates")
        .select("*")
        .eq("target_type", targetType as any)
        .or(`event_id.eq.${eventId},event_id.is.null`)
        .order("name");

      setTemplates(templatesData || []);

      // Load email settings for default CC
      const { data: settings } = await supabase
        .from("email_settings")
        .select("default_cc_emails")
        .single();

      if (settings?.default_cc_emails) {
        const ccArray = settings.default_cc_emails as string[];
        setCcEmails(ccArray.join(", "));
      }
    } catch (error: any) {
      toast.error("Failed to fetch data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const currentRecipient = recipients[currentIndex];

  // Replace merge fields with actual data
  const replaceMergeFields = (text: string, recipient: Recipient): string => {
    let result = text;
    result = result.replace(/\{\{name\}\}/gi, recipient.name || "[Name]");
    result = result.replace(/\{\{email\}\}/gi, recipient.email || "[Email]");
    result = result.replace(/\{\{company\}\}/gi, recipient.company || "[Company]");
    result = result.replace(/\{\{business_name\}\}/gi, recipient.company || "[Business Name]");
    result = result.replace(/\{\{booth_number\}\}/gi, recipient.booth_number || "[Booth Number]");
    result = result.replace(/\{\{shift\}\}/gi, recipient.shift || "[Shift]");
    result = result.replace(/\{\{tier\}\}/gi, recipient.tier || "[Tier]");
    result = result.replace(/\{\{event_name\}\}/gi, eventDetails?.title || "[Event Name]");
    result = result.replace(/\{\{event_date\}\}/gi, eventDetails?.event_date || "[Event Date]");
    return result;
  };

  // Preview content with merge fields resolved
  const previewSubject = useMemo(() => {
    if (!currentRecipient) return currentSubject;
    return replaceMergeFields(currentSubject, currentRecipient);
  }, [currentSubject, currentRecipient, eventDetails]);

  const previewBody = useMemo(() => {
    if (!currentRecipient) return currentBody;
    return replaceMergeFields(currentBody, currentRecipient);
  }, [currentBody, currentRecipient, eventDetails]);

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

  // Navigate between recipients
  const goToRecipient = (index: number) => {
    if (index >= 0 && index < recipients.length) {
      setCurrentIndex(index);
      // Reset to base template content
      setCurrentSubject(baseSubject);
      setCurrentBody(baseBody);
      setViewMode("edit");
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fileName = `${Date.now()}-${file.name}`;
        const { data, error } = await supabase.storage
          .from("production-documents")
          .upload(`email-attachments/${fileName}`, file);

        if (error) throw error;

        setAttachments(prev => [...prev, {
          name: file.name,
          path: data.path,
          size: file.size,
        }]);
      }
      toast.success("File(s) uploaded");
    } catch (error: any) {
      toast.error("Upload failed: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (path: string) => {
    setAttachments(prev => prev.filter(a => a.path !== path));
  };

  // Send email to current recipient
  const handleSend = async () => {
    if (!currentRecipient || !eventId) return;
    
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

      const response = await supabase.functions.invoke("send-production-email-individual", {
        body: {
          eventId,
          targetType,
          recipientId: currentRecipient.id,
          subject: currentSubject,
          bodyHtml: currentBody,
          ccEmails: ccList,
          replyTo: replyToEmail || "team@example.org",
          attachments: attachments.map(a => ({ name: a.name, path: a.path })),
        },
      });

      if (response.error) throw response.error;

      // Mark as sent
      setRecipientStatuses(prev => {
        const next = new Map(prev);
        next.set(currentRecipient.id, { sent: true, skipped: false, sentAt: new Date().toISOString() });
        return next;
      });

      toast.success(`Email sent to ${currentRecipient.name}`);

      // Auto-advance to next unsent recipient
      const nextUnsent = findNextUnsent(currentIndex);
      if (nextUnsent !== -1) {
        goToRecipient(nextUnsent);
      }
    } catch (error: any) {
      toast.error("Failed to send: " + error.message);
    } finally {
      setSending(false);
    }
  };

  // Skip current recipient
  const handleSkip = () => {
    if (!currentRecipient) return;
    
    setRecipientStatuses(prev => {
      const next = new Map(prev);
      next.set(currentRecipient.id, { sent: false, skipped: true });
      return next;
    });

    const nextUnsent = findNextUnsent(currentIndex);
    if (nextUnsent !== -1) {
      goToRecipient(nextUnsent);
    }
  };

  const findNextUnsent = (fromIndex: number): number => {
    for (let i = fromIndex + 1; i < recipients.length; i++) {
      const status = recipientStatuses.get(recipients[i].id);
      if (!status?.sent && !status?.skipped) {
        return i;
      }
    }
    // Wrap around
    for (let i = 0; i < fromIndex; i++) {
      const status = recipientStatuses.get(recipients[i].id);
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
  const sentCount = Array.from(recipientStatuses.values()).filter(s => s.sent).length;
  const skippedCount = Array.from(recipientStatuses.values()).filter(s => s.skipped).length;
  const remainingCount = recipients.length - sentCount - skippedCount;

  const targetLabel = TARGET_LABELS[targetType] || targetType;

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8">
          <p className="text-[hsl(var(--admin-muted-foreground))] text-center text-sm">Please select an event first.</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (loading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8">
          <div className="flex justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-foreground))] border-t-transparent rounded-full" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (recipients.length === 0) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8">
          <p className="text-[hsl(var(--admin-muted-foreground))] text-center text-sm">
            No {targetLabel.toLowerCase()} with email addresses found for this event.
          </p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {/* Left sidebar - Recipient list */}
      <AdminCard className="lg:col-span-1">
        <AdminCardHeader className="py-3">
          <AdminCardTitle className="text-sm">{targetLabel}</AdminCardTitle>
          <AdminCardDescription>
            {sentCount} sent · {skippedCount} skipped · {remainingCount} remaining
          </AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="p-0">
          <AdminScrollArea className="h-[500px]">
            <div className="space-y-1 p-2">
              {recipients.map((recipient, index) => {
                const status = recipientStatuses.get(recipient.id);
                const isCurrent = index === currentIndex;
                
                return (
                  <button
                    key={recipient.id}
                    onClick={() => goToRecipient(index)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                      "hover:bg-[hsl(var(--admin-surface))] flex items-center gap-3",
                      isCurrent && "bg-[hsl(var(--admin-surface))] ring-1 ring-[hsl(var(--admin-border-strong))]",
                      status?.sent && "opacity-60"
                    )}
                  >
                    {/* Status icon */}
                    <div className="shrink-0">
                      {status?.sent ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : status?.skipped ? (
                        <SkipForward className="h-4 w-4 text-[hsl(var(--admin-muted-foreground))]" />
                      ) : (
                        <Clock className="h-4 w-4 text-[hsl(var(--admin-muted-foreground))]" />
                      )}
                    </div>
                    
                    {/* Avatar */}
                    <AdminAvatar name={recipient.name} type={targetType} size="sm" />
                    
                    {/* Name */}
                    <div className="truncate flex-1 min-w-0">
                      <div className="font-medium text-[hsl(var(--admin-foreground))] truncate text-sm">{recipient.name}</div>
                      {recipient.company && (
                        <div className="text-[11px] text-[hsl(var(--admin-muted-foreground))] truncate">{recipient.company}</div>
                      )}
                    </div>
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
                <AdminLabel className="text-xs text-[hsl(var(--admin-muted-foreground))]">Email Template</AdminLabel>
                <AdminSelect value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  {templates.map(t => (
                    <AdminSelectItem key={t.id} value={t.id}>{t.name}</AdminSelectItem>
                  ))}
                </AdminSelect>
              </div>
              <div className="space-y-2">
                <AdminLabel className="text-xs text-[hsl(var(--admin-muted-foreground))]">CC Your Team</AdminLabel>
                <AdminInput
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="email1@team.com, email2@team.com"
                />
              </div>
              <div className="space-y-2">
                <AdminLabel className="text-xs text-[hsl(var(--admin-muted-foreground))]">Reply-To Email</AdminLabel>
                <AdminInput
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                  placeholder="team@example.org"
                />
              </div>
            </div>
          </AdminCardContent>
        </AdminCard>

        {/* Current recipient email editor */}
        {currentRecipient && (
          <AdminCard>
            <AdminCardHeader className="py-3">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <AdminAvatar name={currentRecipient.name} type={targetType} size="md" />
                  <div>
                    <AdminCardTitle className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-[hsl(var(--admin-muted-foreground))]" />
                      Email to {currentRecipient.name}
                    </AdminCardTitle>
                    <AdminCardDescription className="mt-0.5">
                      {currentRecipient.email}
                      {currentRecipient.company && ` · ${currentRecipient.company}`}
                    </AdminCardDescription>
                  </div>
                </div>
                <AdminButton
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode(viewMode === "edit" ? "preview" : "edit")}
                >
                  {viewMode === "edit" ? (
                    <><Eye className="h-4 w-4 mr-1" /> Preview</>
                  ) : (
                    <><Edit className="h-4 w-4 mr-1" /> Edit</>
                  )}
                </AdminButton>
              </div>
            </AdminCardHeader>
            <AdminCardContent className="space-y-4">
              {/* Merge Fields */}
              <div>
                <AdminLabel className="text-[11px] text-[hsl(var(--admin-muted-foreground))] uppercase tracking-wider">Insert merge field:</AdminLabel>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {MERGE_FIELDS[targetType].map(field => (
                    <AdminBadge 
                      key={field} 
                      intent="neutral"
                      className="cursor-pointer hover:bg-[hsl(var(--admin-surface))] text-[10px]"
                      onClick={() => handleInsertField(field)}
                    >
                      {field}
                    </AdminBadge>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <AdminLabel className="text-xs text-[hsl(var(--admin-muted-foreground))]">Subject</AdminLabel>
                {viewMode === "edit" ? (
                  <AdminInput
                    value={currentSubject}
                    onChange={(e) => setCurrentSubject(e.target.value)}
                    placeholder="Email subject..."
                  />
                ) : (
                  <div className="p-3 bg-[hsl(var(--admin-surface))] rounded-md font-medium text-sm text-[hsl(var(--admin-foreground))] border border-[hsl(var(--admin-border))]">
                    {previewSubject}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="space-y-2">
                <AdminLabel className="text-xs text-[hsl(var(--admin-muted-foreground))]">Message</AdminLabel>
                {viewMode === "edit" ? (
                  <RichTextEditor content={currentBody} onChange={setCurrentBody} />
                ) : (
                  <div 
                    className="p-4 bg-[hsl(var(--admin-surface))] rounded-md prose prose-sm max-w-none border border-[hsl(var(--admin-border))]"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewBody) }}
                  />
                )}
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <AdminLabel className="text-xs text-[hsl(var(--admin-muted-foreground))]">Attachments</AdminLabel>
                <div className="flex flex-wrap gap-2">
                  {attachments.map(att => (
                    <AdminBadge key={att.path} intent="neutral" className="gap-1">
                      <Paperclip className="h-3 w-3" />
                      {att.name}
                      <button onClick={() => removeAttachment(att.path)} className="ml-1 hover:text-[hsl(var(--admin-error))]">
                        <X className="h-3 w-3" />
                      </button>
                    </AdminBadge>
                  ))}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                    <AdminBadge intent="neutral" className="cursor-pointer hover:bg-[hsl(var(--admin-surface))] gap-1">
                      <Upload className="h-3 w-3" />
                      {uploading ? "Uploading..." : "Add file"}
                    </AdminBadge>
                  </label>
                </div>
              </div>

              {/* Navigation and actions */}
              <div className="flex items-center justify-between pt-4 border-t border-[hsl(var(--admin-border))]">
                <div className="flex items-center gap-2">
                  <AdminButton
                    variant="outline"
                    size="sm"
                    onClick={() => goToRecipient(currentIndex - 1)}
                    disabled={currentIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </AdminButton>
                  <AdminButton
                    variant="outline"
                    size="sm"
                    onClick={() => goToRecipient(currentIndex + 1)}
                    disabled={currentIndex === recipients.length - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </AdminButton>
                </div>
                <div className="flex items-center gap-2">
                  <AdminButton
                    variant="outline"
                    onClick={handleSkip}
                    disabled={sending}
                  >
                    <SkipForward className="h-4 w-4 mr-1" />
                    Skip
                  </AdminButton>
                  <AdminButton
                    onClick={handleSend}
                    disabled={sending || !currentSubject.trim() || !currentBody.trim()}
                  >
                    {sending ? (
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
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
  );
}
