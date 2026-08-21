import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminButton,
  AdminInput,
  AdminBadge,
  AdminLabel,
  AdminCheckbox,
  AdminSelect,
  AdminSelectItem,
  AdminTooltip,
} from "@/components/admin";
import { toast } from "sonner";
import { Send, Users, Plus, X, Info, Search } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { EmailSuccessAnimation } from "@/components/email/EmailSuccessAnimation";
import { EmailAvatar } from "@/components/email/EmailAvatar";
import { cn } from "@/lib/utils";

interface ProductionEmailComposerProps {
  targetType: "vendor" | "artisan" | "volunteer" | "partner";
  eventId?: string;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  company?: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
}

const MERGE_FIELDS = {
  vendor: ["{{name}}", "{{company}}", "{{email}}", "{{event_name}}", "{{event_date}}"],
  artisan: ["{{name}}", "{{business_name}}", "{{email}}", "{{booth_number}}", "{{event_name}}", "{{event_date}}"],
  volunteer: ["{{name}}", "{{email}}", "{{shift}}", "{{check_in_location}}", "{{event_name}}", "{{event_date}}"],
  partner: ["{{name}}", "{{company}}", "{{email}}", "{{tier}}", "{{event_name}}", "{{event_date}}"],
};

const ProductionEmailComposer = ({ targetType, eventId }: ProductionEmailComposerProps) => {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSentCount, setLastSentCount] = useState(0);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [newCcEmail, setNewCcEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch email settings for type-specific CC
  const { data: emailSettings } = useAuthQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_settings")
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Initialize CC from type-specific defaults
  useEffect(() => {
    if (emailSettings) {
      // Use type-specific CC emails if available
      const ccField = `${targetType}_cc_emails` as keyof typeof emailSettings;
      const typeCcEmails = (emailSettings as any)[ccField];
      if (typeCcEmails && Array.isArray(typeCcEmails) && typeCcEmails.length > 0) {
        setCcEmails(typeCcEmails);
      } else if (emailSettings.default_cc_emails) {
        // Fallback to default CC if type-specific not set
        setCcEmails(emailSettings.default_cc_emails);
      }
    }
  }, [emailSettings, targetType]);

  // Fetch recipients based on target type
  const { data: recipients, isLoading: loadingRecipients } = useAuthQuery({
    queryKey: ["production-recipients", targetType, eventId],
    queryFn: async () => {
      if (!eventId) return [];
      
      if (targetType === "vendor") {
        const { data, error } = await supabase
          .from("vendors")
          .select("id, name, company_name, email")
          .eq("event_id", eventId)
          .not("email", "is", null);
        if (error) throw error;
        return data.map((v) => ({ id: v.id, name: v.name, email: v.email!, company: v.company_name || undefined }));
      }
      
      if (targetType === "artisan") {
        const { data, error } = await supabase
          .from("artisans")
          .select("id, name, business_name, email")
          .eq("event_id", eventId)
          .not("email", "is", null);
        if (error) throw error;
        return data.map((a) => ({ id: a.id, name: a.name, email: a.email!, company: a.business_name || undefined }));
      }
      
      if (targetType === "volunteer") {
        const { data, error } = await supabase
          .from("volunteer_interests")
          .select("id, name, email")
          .not("email", "is", null);
        if (error) throw error;
        return data.map((v) => ({ id: v.id, name: v.name, email: v.email }));
      }

      if (targetType === "partner") {
        const { data, error } = await supabase
          .from("partners")
          .select("id, name, company_name, email")
          .eq("event_id", eventId)
          .not("email", "is", null);
        if (error) throw error;
        return data.map((p) => ({ id: p.id, name: p.name, email: p.email!, company: p.company_name || undefined }));
      }
      
      return [];
    },
    enabled: !!eventId,
  });

  // Fetch templates
  const { data: templates } = useAuthQuery({
    queryKey: ["production-templates", targetType, eventId],
    queryFn: async () => {
      const query = supabase
        .from("production_email_templates")
        .select("*")
        .eq("target_type", targetType as "artisan" | "vendor" | "volunteer")
        .order("created_at", { ascending: false });
      
      if (eventId) {
        query.or(`event_id.eq.${eventId},event_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: !!eventId,
  });

  // Handle select all
  useEffect(() => {
    if (selectAll && recipients) {
      setSelectedRecipients(recipients.map((r) => r.id));
    } else if (!selectAll) {
      setSelectedRecipients([]);
    }
  }, [selectAll, recipients]);

  const handleRecipientToggle = (id: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBodyHtml(template.body_html);
    }
  };

  const handleInsertField = (field: string) => {
    setBodyHtml((prev) => prev + field);
  };

  const handleAddCcEmail = () => {
    const email = newCcEmail.trim();
    if (email && !ccEmails.includes(email) && email.includes("@")) {
      setCcEmails([...ccEmails, email]);
      setNewCcEmail("");
    }
  };

  const handleRemoveCcEmail = (email: string) => {
    setCcEmails(ccEmails.filter(e => e !== email));
  };

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("production_email_templates").insert({
        event_id: eventId,
        target_type: targetType as "artisan" | "vendor" | "volunteer",
        name: templateName,
        subject,
        body_html: bodyHtml,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-templates"] });
      setShowSaveTemplate(false);
      setTemplateName("");
      toast.success("Template saved");
    },
    onError: () => toast.error("Failed to save template"),
  });

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!bodyHtml.trim()) {
      toast.error("Please enter a message");
      return;
    }
    if (selectedRecipients.length === 0) {
      toast.error("Please select at least one recipient");
      return;
    }

    const confirmed = window.confirm(
      `Send this email to ${selectedRecipients.length} recipient(s)?`
    );
    if (!confirmed) return;

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-production-email", {
        body: {
          eventId,
          targetType,
          subject,
          bodyHtml,
          recipientIds: selectedRecipients,
          ccEmails: ccEmails.filter(e => e.trim()),
        },
      });

      if (error) throw error;

      // Show success animation
      setLastSentCount(data.sent || selectedRecipients.length);
      setShowSuccess(true);
      
      // Reset form
      setSubject("");
      setBodyHtml("");
      setSelectedRecipients([]);
      setSelectAll(false);
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast.error(error.message || "Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="flex items-center justify-center py-12">
          <p className="text-[hsl(var(--admin-text-muted))]">Please select an event first</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  const targetLabel = targetType === "vendor" ? "Vendors" : targetType === "artisan" ? "Artisans" : targetType === "partner" ? "Partners" : "Volunteers";

  // Filter recipients by search
  const filteredRecipients = recipients?.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r as Recipient).company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Success Animation */}
      <EmailSuccessAnimation 
        show={showSuccess}
        recipientCount={lastSentCount}
        onComplete={() => setShowSuccess(false)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email Composer */}
        <div className="lg:col-span-2 space-y-4">
          <AdminCard>
            <AdminCardHeader>
              <AdminCardTitle>Send Email to {targetLabel}</AdminCardTitle>
              <AdminCardDescription>
                Compose and send emails with merge fields for personalization
              </AdminCardDescription>
            </AdminCardHeader>
            <AdminCardContent className="space-y-4">
              {/* From Address Info */}
              <div className="p-3 bg-[hsl(var(--admin-hover))]/50 rounded-lg border border-[hsl(var(--admin-border))]">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-[hsl(var(--admin-text-muted))]" />
                  <div className="text-sm">
                    <p className="font-medium text-[hsl(var(--admin-text))]">From: team@example.org</p>
                    <p className="text-[hsl(var(--admin-text-muted))]">Replies will appear in the CRM and be CC'd to your team</p>
                  </div>
                </div>
              </div>

              {/* CC Field */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AdminLabel>CC Team Members</AdminLabel>
                  <AdminTooltip content="These team members will receive a copy of all emails and replies. Set defaults in Email Settings.">
                    <Info className="h-3.5 w-3.5 text-[hsl(var(--admin-text-muted))]" />
                  </AdminTooltip>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {ccEmails.map((email) => (
                    <AdminBadge key={email} intent="neutral" className="gap-1">
                      {email}
                      <button onClick={() => handleRemoveCcEmail(email)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </AdminBadge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <AdminInput
                    placeholder="Add team email..."
                    value={newCcEmail}
                    onChange={(e) => setNewCcEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCcEmail())}
                    className="flex-1"
                  />
                  <AdminButton type="button" variant="adminOutline" size="sm" onClick={handleAddCcEmail}>
                    <Plus className="h-4 w-4" />
                  </AdminButton>
                </div>
              </div>

              {/* Template Selection */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <AdminLabel>Load Template</AdminLabel>
                  <AdminSelect value="" onValueChange={handleTemplateSelect} placeholder="Select a template...">
                    {templates?.map((template) => (
                      <AdminSelectItem key={template.id} value={template.id}>
                        {template.name}
                      </AdminSelectItem>
                    ))}
                  </AdminSelect>
                </div>
                <div className="flex items-end">
                  <AdminButton variant="adminOutline" onClick={() => setShowSaveTemplate(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Save as Template
                  </AdminButton>
                </div>
              </div>

              {showSaveTemplate && (
                <div className="flex gap-2 p-3 bg-[hsl(var(--admin-hover))] rounded-lg">
                  <AdminInput
                    placeholder="Template name..."
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="flex-1"
                  />
                  <AdminButton 
                    size="sm" 
                    onClick={() => saveTemplateMutation.mutate()}
                    disabled={!templateName.trim()}
                  >
                    Save
                  </AdminButton>
                  <AdminButton size="sm" variant="ghost" onClick={() => setShowSaveTemplate(false)}>
                    Cancel
                  </AdminButton>
                </div>
              )}

              {/* Merge Fields */}
              <div>
                <AdminLabel>Merge Fields</AdminLabel>
                <div className="flex flex-wrap gap-2 mt-2">
                  {MERGE_FIELDS[targetType].map((field) => (
                    <AdminBadge
                      key={field}
                      intent="neutral"
                      className="cursor-pointer hover:bg-[hsl(var(--admin-hover))]"
                      onClick={() => handleInsertField(field)}
                    >
                      {field}
                    </AdminBadge>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <AdminLabel htmlFor="subject">Subject *</AdminLabel>
                <AdminInput
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                />
              </div>

              {/* Body */}
              <div>
                <AdminLabel>Message *</AdminLabel>
                <RichTextEditor content={bodyHtml} onChange={setBodyHtml} />
              </div>

              {/* Send Button */}
              <div className="flex justify-end gap-2 pt-4">
                <AdminButton
                  onClick={handleSend}
                  disabled={isSending || selectedRecipients.length === 0}
                  className="gap-2"
                >
                  {isSending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-[hsl(var(--admin-primary-foreground))] border-t-transparent" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send to {selectedRecipients.length} recipient(s)
                    </>
                  )}
                </AdminButton>
              </div>
            </AdminCardContent>
          </AdminCard>
        </div>

        {/* Recipients */}
        <div className="space-y-4">
          <AdminCard>
            <AdminCardHeader>
              <AdminCardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Recipients
              </AdminCardTitle>
              <AdminCardDescription>
                {selectedRecipients.length} of {recipients?.length || 0} selected
              </AdminCardDescription>
            </AdminCardHeader>
            <AdminCardContent>
              {loadingRecipients ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(var(--admin-accent))]"></div>
                </div>
              ) : recipients?.length === 0 ? (
                <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-4">
                  No {targetLabel.toLowerCase()} with email addresses found
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <AdminInput
                      placeholder="Search recipients..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 pb-2 border-b border-[hsl(var(--admin-border))]">
                    <AdminCheckbox
                      id="select-all"
                      checked={selectAll}
                      onCheckedChange={(checked) => setSelectAll(!!checked)}
                    />
                    <AdminLabel htmlFor="select-all" className="font-medium cursor-pointer">
                      Select All
                    </AdminLabel>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto space-y-1">
                    {filteredRecipients?.map((recipient) => (
                      <div
                        key={recipient.id}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg transition-colors",
                          selectedRecipients.includes(recipient.id) 
                            ? "bg-[hsl(var(--admin-accent))]/5 border border-[hsl(var(--admin-accent))]/20" 
                            : "hover:bg-[hsl(var(--admin-hover))]"
                        )}
                      >
                        <AdminCheckbox
                          id={recipient.id}
                          checked={selectedRecipients.includes(recipient.id)}
                          onCheckedChange={() => handleRecipientToggle(recipient.id)}
                        />
                        <EmailAvatar name={recipient.name} size="sm" />
                        <label htmlFor={recipient.id} className="flex-1 cursor-pointer min-w-0">
                          <p className="text-sm font-medium truncate text-[hsl(var(--admin-text))]">{recipient.name}</p>
                          {(recipient as Recipient).company && (
                            <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">{(recipient as Recipient).company}</p>
                          )}
                          <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">{recipient.email}</p>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AdminCardContent>
          </AdminCard>
        </div>
      </div>
    </>
  );
};

export default ProductionEmailComposer;
