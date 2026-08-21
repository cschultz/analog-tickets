import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminTextarea,
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminSelect,
  AdminSelectItem,
} from "@/components/admin";
import { toast } from "sonner";
import { 
  Loader2, 
  Mail, 
  Send, 
  Sparkles, 
  Save,
  FileText
} from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";

interface SavedTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
}

interface IndividualEmailComposerProps {
  recipientEmail: string;
  recipientName: string;
  registrationId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSent?: () => void;
  defaultCc?: string[];
  leadEmail?: string;
  /** When set, automatically generates an AI draft on open using this prompt + context */
  autoDraftPrompt?: string;
  /** Optional structured context for the AI (intent reasons, ticket interest, etc.) */
  leadContext?: string;
}

export const IndividualEmailComposer = ({
  recipientEmail,
  recipientName,
  registrationId,
  isOpen,
  onClose,
  onSent,
  defaultCc,
  leadEmail,
  autoDraftPrompt,
  leadContext,
}: IndividualEmailComposerProps) => {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [hasAutoDrafted, setHasAutoDrafted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    } else {
      setHasAutoDrafted(false);
    }
  }, [isOpen]);

  // Auto-trigger AI draft when opened with a prompt (e.g., from Leads page "AI Draft Recovery")
  useEffect(() => {
    if (isOpen && autoDraftPrompt && !hasAutoDrafted && !isGenerating) {
      setHasAutoDrafted(true);
      setShowAiPanel(true);
      setAiPrompt(autoDraftPrompt);
      runAiDraft(autoDraftPrompt, leadContext);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoDraftPrompt]);

  const runAiDraft = async (prompt: string, context?: string) => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-email-ai", {
        body: {
          prompt,
          recipientName,
          context: context || "individual_email",
        },
      });
      if (error) throw error;
      if (data?.subject) setSubject(data.subject);
      if (data?.body) setBody(data.body);
      toast.success("Draft generated! Review and edit before sending.");
      setShowAiPanel(false);
    } catch (error) {
      console.error("AI generation error:", error);
      toast.error("Failed to generate draft. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("saved_email_templates")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data) {
      setTemplates(data);
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setBody(template.body_html);
      setSelectedTemplateId(templateId);
      toast.success(`Loaded template: ${template.name}`);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    if (!subject || !body) {
      toast.error("Subject and body are required");
      return;
    }

    setIsSavingTemplate(true);
    
    const { data: userData } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from("saved_email_templates")
      .insert({
        name: templateName.trim(),
        subject,
        body_html: body,
        category: "general",
        created_by: userData.user?.id
      });

    if (error) {
      toast.error("Failed to save template");
    } else {
      toast.success(`Template "${templateName}" saved`);
      setTemplateName("");
      setShowSaveDialog(false);
      fetchTemplates();
    }
    setIsSavingTemplate(false);
  };

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Please describe what you want to say");
      return;
    }
    await runAiDraft(aiPrompt, leadContext);
    setAiPrompt("");
  };

  const handleSend = async () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setIsSending(true);

    try {
      const { error } = await supabase.functions.invoke("send-individual-email", {
        body: {
          to: recipientEmail,
          name: recipientName,
          subject,
          body,
          registrationId,
          cc: defaultCc,
          leadEmail,
        }
      });

      if (error) throw error;

      toast.success(`Email sent to ${recipientName}`);
      onSent?.();
      onClose();
      setSubject("");
      setBody("");
    } catch (error) {
      console.error("Send error:", error);
      toast.error("Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    onClose();
    setSubject("");
    setBody("");
    setSelectedTemplateId("");
    setShowAiPanel(false);
    setAiPrompt("");
  };

  return (
    <AdminDialog open={isOpen} onOpenChange={handleClose}>
      <AdminDialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <AdminDialogHeader>
          <AdminDialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email {recipientName}
          </AdminDialogTitle>
        </AdminDialogHeader>

        <div className="space-y-4">
          {/* Recipient info */}
          <div className="bg-[hsl(var(--admin-hover))] rounded-lg p-3">
            <p className="text-sm">
              <span className="text-[hsl(var(--admin-text-muted))]">To:</span>{" "}
              <span className="font-medium">{recipientName}</span>{" "}
              <span className="text-[hsl(var(--admin-text-muted))]">({recipientEmail})</span>
            </p>
          </div>

          {/* Template / AI row */}
          <div className="flex gap-2 flex-wrap">
            <AdminSelect value={selectedTemplateId} onValueChange={handleLoadTemplate}>
              <FileText className="h-4 w-4 mr-2" />
              {templates.find(t => t.id === selectedTemplateId)?.name || "Load template..."}
            </AdminSelect>

            <AdminButton
              variant="adminOutline"
              onClick={() => setShowAiPanel(!showAiPanel)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              AI Draft
            </AdminButton>

            {(subject || body) && (
              <AdminButton
                variant="adminOutline"
                onClick={() => setShowSaveDialog(true)}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                Save as Template
              </AdminButton>
            )}
          </div>

          {/* AI Panel */}
          {showAiPanel && (
            <div className="bg-[hsl(var(--admin-accent-muted))] border border-[hsl(var(--admin-accent))]/20 rounded-lg p-4 space-y-3">
              <AdminLabel>Describe what you want to say:</AdminLabel>
              <AdminTextarea
                placeholder="e.g., Thank them for their purchase and remind them about the packing list..."
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={3}
              />
              <AdminButton 
                variant="admin"
                onClick={handleGenerateWithAI} 
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Draft
              </AdminButton>
            </div>
          )}

          {/* Subject */}
          <div>
            <AdminLabel>Subject</AdminLabel>
            <AdminInput
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject..."
            />
          </div>

          {/* Body */}
          <div>
            <AdminLabel>Message</AdminLabel>
            <RichTextEditor
              content={body}
              onChange={setBody}
              placeholder="Write your message..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <AdminButton variant="adminOutline" onClick={handleClose}>
              Cancel
            </AdminButton>
            <AdminButton variant="admin" onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Email
            </AdminButton>
          </div>
        </div>

        {/* Save Template Dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 bg-[hsl(var(--admin-text))]/50 flex items-center justify-center z-50" onClick={() => setShowSaveDialog(false)}>
            <div className="bg-[hsl(var(--admin-background))] rounded-lg p-6 w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Save as Template</h3>
              <div className="space-y-4">
                <div>
                  <AdminLabel>Template Name</AdminLabel>
                  <AdminInput
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="e.g., Welcome Follow-up"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <AdminButton variant="adminOutline" onClick={() => setShowSaveDialog(false)}>
                    Cancel
                  </AdminButton>
                  <AdminButton variant="admin" onClick={handleSaveAsTemplate} disabled={isSavingTemplate}>
                    {isSavingTemplate && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Template
                  </AdminButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </AdminDialogContent>
    </AdminDialog>
  );
};
