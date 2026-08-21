import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { usePipeline } from "../PipelineContext";
import { AdminButton, AdminBadge, AdminInput } from "@/components/admin/AdminUI";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminSheet, AdminSheetContent, AdminSheetHeader, AdminSheetTitle, AdminSheetDescription, AdminSheetFooter } from "@/components/admin/AdminSheet";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { toast } from "sonner";
import { Send, X, Plus, Loader2, Mail } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { EmailSuccessAnimation } from "@/components/email/EmailSuccessAnimation";
import { FromSenderSelect } from "./FromSenderSelect";

interface PipelineEmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
}

export function PipelineEmailComposer({ isOpen, onClose }: PipelineEmailComposerProps) {
  const { config, selectedRecord } = usePipeline();
  const { selectedEventId } = useAdminEvent();
  const queryClient = useQueryClient();
  
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [newCcEmail, setNewCcEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [fromUserId, setFromUserId] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const entityType = config?.slug as "vendor" | "artisan" | "partner" | "volunteer" | "artist";
  const entityId = selectedRecord?.id as string;
  const entityName = (selectedRecord?.name as string) || "Unknown";
  const entityEmail = selectedRecord?.email as string | null;

  // Fetch email settings
  const { data: emailSettings } = useAuthQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_settings")
        .select("*")
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  // Fetch templates
  const { data: templates } = useAuthQuery({
    queryKey: ["production-templates", entityType, selectedEventId],
    queryFn: async () => {
      if (entityType === "artist") {
        let query = supabase
          .from("artist_email_templates")
          .select("id, name, subject, body_html, category, event_id, created_at, updated_at")
          .order("name", { ascending: true });

        if (selectedEventId) {
          query = query.or(`event_id.eq.${selectedEventId},event_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(t => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          body_html: t.body_html,
        })) as EmailTemplate[];
      } else {
        let query = supabase
          .from("production_email_templates")
          .select("*")
          .eq("target_type", entityType)
          .order("created_at", { ascending: false });

        if (selectedEventId) {
          query = query.or(`event_id.eq.${selectedEventId},event_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as EmailTemplate[];
      }
    },
    enabled: !!entityType,
  });

  // Fetch event details for merge fields
  const { data: eventDetails } = useAuthQuery({
    queryKey: ["event-details", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return null;
      const { data, error } = await supabase
        .from("event_details")
        .select("title, event_date")
        .eq("id", selectedEventId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates?.find(t => t.id === templateId);
    if (template) {
      let subject = template.subject;
      let body = template.body_html;
      
      const mergeData: Record<string, string> = {
        name: entityName,
        first_name: entityName.split(" ")[0] || entityName,
        email: entityEmail || "",
        event_name: eventDetails?.title || "",
        event_date: eventDetails?.event_date || "",
        company: (selectedRecord?.company_name as string) || (selectedRecord?.business_name as string) || "",
        business_name: (selectedRecord?.business_name as string) || "",
      };

      for (const [key, value] of Object.entries(mergeData)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }

      setSubject(subject);
      setBodyHtml(body);
    }
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

  const handleSendClick = () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!bodyHtml.trim()) {
      toast.error("Please enter a message");
      return;
    }
    if (!entityEmail) {
      toast.error("This contact has no email address");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    setShowConfirm(false);
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-production-email", {
        body: {
          eventId: selectedEventId,
          targetType: entityType,
          subject,
          bodyHtml,
          recipientIds: [entityId],
          ccEmails: ccEmails.filter(e => e.trim()),
          fromUserId: fromUserId || undefined,
        },
      });

      if (error) throw error;

      setShowSuccess(true);
      
      setTimeout(() => {
        setSubject("");
        setBodyHtml("");
        setSelectedTemplateId("");
        queryClient.invalidateQueries({ queryKey: ["entity-email-threads", entityType, entityId] });
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast.error(error.message || "Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setSubject("");
    setBodyHtml("");
    setSelectedTemplateId("");
    onClose();
  };

  if (!config || !selectedRecord) return null;

  return (
    <>
      <EmailSuccessAnimation 
        show={showSuccess}
        recipientCount={1}
        onComplete={() => setShowSuccess(false)}
      />

      <AdminConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Send Email"
        description={`Send this email to ${entityName}${entityEmail ? ` (${entityEmail})` : ''}?`}
        actionLabel="Send"
        onConfirm={handleConfirmSend}
      />

      <AdminSheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <AdminSheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl flex flex-col">
          <AdminSheetHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[hsl(var(--admin-accent))] flex items-center justify-center">
                <Mail className="h-4 w-4 text-[hsl(var(--admin-accent-foreground))]" />
              </div>
              <div>
                <AdminSheetTitle>Compose Email</AdminSheetTitle>
                <AdminSheetDescription>
                  {entityEmail 
                    ? <>To: <span className="font-medium">{entityName}</span> &lt;{entityEmail}&gt;</>
                    : "No email address on file"
                  }
                </AdminSheetDescription>
              </div>
            </div>
          </AdminSheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* From Sender */}
            <FromSenderSelect
              pipelineType={entityType}
              value={fromUserId}
              onChange={setFromUserId}
            />

            {/* Template Selection */}
            {templates && templates.length > 0 && (
              <div>
                <AdminLabel>Load Template</AdminLabel>
                <AdminSelect
                  value={selectedTemplateId}
                  onValueChange={handleTemplateSelect}
                  placeholder="Select a template..."
                >
                  {templates.map((template) => (
                    <AdminSelectItem key={template.id} value={template.id}>
                      {template.name}
                    </AdminSelectItem>
                  ))}
                </AdminSelect>
              </div>
            )}

            {/* CC Emails */}
            <div>
              <AdminLabel>CC Team Members</AdminLabel>
              {ccEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {ccEmails.map((email) => (
                    <AdminBadge key={email} intent="neutral" className="gap-1">
                      {email}
                      <span 
                        role="button"
                        tabIndex={0}
                        onClick={() => handleRemoveCcEmail(email)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRemoveCcEmail(email)} 
                        className="ml-1 cursor-pointer hover:text-[hsl(var(--admin-error))]"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </AdminBadge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <AdminInput
                  placeholder="Add team email..."
                  value={newCcEmail}
                  onChange={(e) => setNewCcEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCcEmail())}
                  className="flex-1"
                />
                <AdminButton variant="adminOutline" size="sm" onClick={handleAddCcEmail}>
                  <Plus className="h-4 w-4" />
                </AdminButton>
              </div>
            </div>

            {/* Subject */}
            <div>
              <AdminLabel>Subject *</AdminLabel>
              <AdminInput
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
              />
            </div>

            {/* Body - give it more vertical space */}
            <div className="flex-1 min-h-0">
              <AdminLabel>Message *</AdminLabel>
              <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden min-h-[280px]">
                <RichTextEditor content={bodyHtml} onChange={setBodyHtml} />
              </div>
            </div>
          </div>

          <AdminSheetFooter className="px-6 py-4 border-t border-[hsl(var(--admin-border))]">
            <AdminButton variant="adminOutline" onClick={handleClose}>
              Cancel
            </AdminButton>
            <AdminButton
              variant="admin"
              onClick={handleSendClick}
              disabled={isSending || !entityEmail}
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </AdminButton>
          </AdminSheetFooter>
        </AdminSheetContent>
      </AdminSheet>
    </>
  );
}
