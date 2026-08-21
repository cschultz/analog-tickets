import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { toast } from "sonner";
import { Check, FileText } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { MergeFieldPicker } from "@/components/email/MergeFieldPicker";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin/AdminSheet";
import {
  AdminButton,
  AdminInput,
  AdminScrollArea,
} from "@/components/admin";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import type { MergeFieldAudience } from "@/lib/merge-fields";

interface CreateTemplateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "vendor" | "artisan" | "partner" | "volunteer" | "artist";
  initialSubject?: string;
  initialBody?: string;
  onTemplateCreated?: (templateId: string) => void;
}

// Map entity type to audience for merge fields
const getAudienceForEntity = (entityType: string): MergeFieldAudience => {
  switch (entityType) {
    case "artist": return "artist";
    case "vendor": return "vendor";
    case "artisan": return "artisan";
    case "partner": return "partner";
    default: return "all";
  }
};

export function CreateTemplateDrawer({
  isOpen,
  onClose,
  entityType,
  initialSubject = "",
  initialBody = "",
  onTemplateCreated,
}: CreateTemplateDrawerProps) {
  const { selectedEventId } = useAdminEvent();
  const queryClient = useQueryClient();

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [bodyHtml, setBodyHtml] = useState(initialBody);
  
  // Track which field to insert into (subject or body)
  const [activeField, setActiveField] = useState<"subject" | "body">("body");
  const subjectInputRef = useRef<HTMLInputElement>(null);

  // Reset form when drawer opens with new initial values
  useEffect(() => {
    if (isOpen) {
      setSubject(initialSubject);
      setBodyHtml(initialBody);
      setName("");
    }
  }, [isOpen, initialSubject, initialBody]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (entityType === "artist") {
        // Save to artist_email_templates
        const { data, error } = await supabase
          .from("artist_email_templates")
          .insert([{
            name,
            subject,
            body_html: bodyHtml,
            audience: "artist",
            category: "general" as const,
            event_id: selectedEventId,
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // Save to production_email_templates
        const { data, error } = await supabase
          .from("production_email_templates")
          .insert([{
            name,
            subject,
            body_html: bodyHtml,
            target_type: entityType,
            event_id: selectedEventId,
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-email-templates"] });
      toast.success("Template created successfully");
      onTemplateCreated?.(data.id);
      handleClose();
    },
    onError: (error) => {
      toast.error("Failed to create template: " + error.message);
    },
  });

  const handleClose = () => {
    setName("");
    setSubject("");
    setBodyHtml("");
    onClose();
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    if (!subject.trim()) {
      toast.error("Please enter a subject line");
      return;
    }
    if (!bodyHtml.trim()) {
      toast.error("Please enter email content");
      return;
    }
    saveMutation.mutate();
  };

  const insertMergeField = (field: string) => {
    if (activeField === "subject") {
      // Insert into subject at cursor position
      const input = subjectInputRef.current;
      if (input) {
        const start = input.selectionStart || subject.length;
        const end = input.selectionEnd || subject.length;
        const newSubject = subject.slice(0, start) + field + subject.slice(end);
        setSubject(newSubject);
        // Focus and set cursor position after the inserted field
        setTimeout(() => {
          input.focus();
          input.setSelectionRange(start + field.length, start + field.length);
        }, 0);
      }
    } else {
      // Insert into body (append since RichTextEditor doesn't expose cursor position)
      setBodyHtml((prev) => prev + field);
    }
  };

  return (
    <AdminSheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AdminSheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
        <AdminSheetHeader>
          <AdminSheetTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Create Email Template
          </AdminSheetTitle>
          <AdminSheetDescription>
            Create a reusable template with merge fields for personalization
          </AdminSheetDescription>
        </AdminSheetHeader>

        <AdminScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 py-4">
            {/* Template Name */}
            <div className="space-y-2">
              <AdminLabel htmlFor="template-name">Template Name</AdminLabel>
              <AdminInput
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Artist Welcome Email"
                autoFocus
              />
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <AdminLabel htmlFor="template-subject">Subject Line</AdminLabel>
              <AdminInput
                ref={subjectInputRef}
                id="template-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Welcome to {{event_name}}!"
                onFocus={() => setActiveField("subject")}
              />
            </div>

            {/* Merge Fields */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <AdminLabel>Insert Merge Field</AdminLabel>
                <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                  Inserting into: <strong>{activeField}</strong>
                </span>
              </div>
              <MergeFieldPicker
                onInsert={insertMergeField}
                audience={getAudienceForEntity(entityType)}
                variant="inline"
                showCategories
              />
            </div>

            {/* Body Content */}
            <div className="space-y-2" onClick={() => setActiveField("body")}>
              <AdminLabel>Email Content</AdminLabel>
              <div className="min-h-[300px] border border-[hsl(var(--admin-border))] rounded-md overflow-hidden">
                <RichTextEditor
                  content={bodyHtml}
                  onChange={setBodyHtml}
                />
              </div>
            </div>
          </div>
        </AdminScrollArea>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[hsl(var(--admin-border))] -mx-6 px-6">
          <AdminButton variant="adminOutline" onClick={handleClose}>
            Cancel
          </AdminButton>
          <AdminButton
            variant="admin"
            onClick={handleSave}
            disabled={saveMutation.isPending || !name.trim()}
          >
            {saveMutation.isPending ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Save Template
              </>
            )}
          </AdminButton>
        </div>
      </AdminSheetContent>
    </AdminSheet>
  );
}
