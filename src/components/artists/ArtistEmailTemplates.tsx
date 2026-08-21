import { useState, useEffect, useRef } from "react";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle, AdminCardDescription } from "@/components/admin/AdminCard";
import { AdminButton, AdminInput, AdminTable, AdminTableBody, AdminTableCell, AdminTableHead, AdminTableHeader, AdminTableRow, AdminBadge } from "@/components/admin/AdminUI";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogHeader, AdminDialogTitle, AdminDialogTrigger } from "@/components/admin/AdminDialog";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RichTextEditor, RichTextEditorRef } from "@/components/RichTextEditor";
import MergeFieldToolbar from "./MergeFieldToolbar";

interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body_html: string;
  created_at: string;
}

interface ArtistEmailTemplatesProps {
  eventId?: string;
}

const CATEGORIES = [
  { value: "announcement", label: "Announcement" },
  { value: "logistics", label: "Logistics" },
  { value: "contracts_admin", label: "Contracts/Admin" },
  { value: "general", label: "General" },
];

const CATEGORY_LABELS: Record<string, string> = {
  announcement: "Announcement",
  logistics: "Logistics",
  contracts_admin: "Contracts/Admin",
  general: "General",
};

const ArtistEmailTemplates = ({ eventId }: ArtistEmailTemplatesProps) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "general",
    subject: "",
    body_html: "",
  });
  const editorRef = useRef<RichTextEditorRef>(null);

  useEffect(() => {
    fetchTemplates();
  }, [eventId]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("artist_email_templates")
        .select("*")
        .order("name");

      if (eventId) {
        query = query.or(`event_id.eq.${eventId},event_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch templates: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.subject.trim()) {
      toast.error("Name and subject are required");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (editingTemplate) {
        const { error } = await supabase
          .from("artist_email_templates")
          .update({
            name: formData.name,
            category: formData.category as any,
            subject: formData.subject,
            body_html: formData.body_html,
          })
          .eq("id", editingTemplate.id);

        if (error) throw error;
        toast.success("Template updated successfully");
      } else {
        const { error } = await supabase
          .from("artist_email_templates")
          .insert({
            event_id: eventId || null,
            name: formData.name,
            category: formData.category as any,
            subject: formData.subject,
            body_html: formData.body_html,
            created_by: user?.id,
          });

        if (error) throw error;
        toast.success("Template created successfully");
      }

      resetForm();
      fetchTemplates();
    } catch (error: any) {
      toast.error("Failed to save template: " + error.message);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const { error } = await supabase
        .from("artist_email_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;
      toast.success("Template deleted successfully");
      fetchTemplates();
    } catch (error: any) {
      toast.error("Failed to delete template: " + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "general",
      subject: "",
      body_html: "",
    });
    setEditingTemplate(null);
    setIsDialogOpen(false);
  };

  const openEditDialog = (template: EmailTemplate) => {
    setFormData({
      name: template.name,
      category: template.category,
      subject: template.subject,
      body_html: template.body_html,
    });
    setEditingTemplate(template);
    setIsDialogOpen(true);
  };

  const handleInsertField = (tag: string) => {
    editorRef.current?.insertContent(tag);
  };

  return (
    <AdminCard>
      <AdminCardHeader
        icon={FileText}
        action={
          <AdminDialog open={isDialogOpen} onOpenChange={(open) => {
            if (!open) resetForm();
            setIsDialogOpen(open);
          }}>
            <AdminDialogTrigger asChild>
              <AdminButton variant="admin">
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </AdminButton>
            </AdminDialogTrigger>
            <AdminDialogContent size="lg" className="max-h-[90vh] flex flex-col overflow-hidden">
              <AdminDialogHeader className="shrink-0 pb-4">
                <AdminDialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</AdminDialogTitle>
                <AdminDialogDescription>
                  Create a reusable email template for artist communications.
                </AdminDialogDescription>
              </AdminDialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 pr-2">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <AdminLabel htmlFor="template-name">Template Name *</AdminLabel>
                      <AdminInput
                        id="template-name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Announcement Email"
                      />
                    </div>
                    <div className="space-y-2">
                      <AdminLabel htmlFor="template-category">Category *</AdminLabel>
                      <AdminSelect 
                        value={formData.category} 
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        {CATEGORIES.map((cat) => (
                          <AdminSelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </AdminSelectItem>
                        ))}
                      </AdminSelect>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <AdminLabel htmlFor="template-subject">Subject *</AdminLabel>
                    <AdminInput
                      id="template-subject"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="Email subject line"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <AdminLabel>Email Body</AdminLabel>
                      <MergeFieldToolbar onInsertField={handleInsertField} />
                    </div>
                    <div className="min-h-[200px] max-h-[300px]">
                      <RichTextEditor 
                        ref={editorRef}
                        content={formData.body_html} 
                        onChange={(value) => setFormData({ ...formData, body_html: value })} 
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex justify-end gap-2 pt-4 border-t border-[hsl(var(--admin-border))] mt-4">
                <AdminButton variant="adminOutline" onClick={resetForm}>Cancel</AdminButton>
                <AdminButton variant="admin" onClick={handleSubmit}>
                  {editingTemplate ? "Update" : "Create"} Template
                </AdminButton>
              </div>
            </AdminDialogContent>
          </AdminDialog>
        }
      >
        <div>
          <AdminCardTitle>Email Templates</AdminCardTitle>
          <AdminCardDescription>
            Create reusable templates for artist communications
          </AdminCardDescription>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-primary))] border-t-transparent rounded-full" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No templates created yet.</p>
            <p className="text-sm">Create templates to speed up your artist communications.</p>
          </div>
        ) : (
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead>Name</AdminTableHead>
                <AdminTableHead>Category</AdminTableHead>
                <AdminTableHead>Subject</AdminTableHead>
                <AdminTableHead className="w-[100px]">Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {templates.map((template) => (
                <AdminTableRow key={template.id}>
                  <AdminTableCell className="font-medium">{template.name}</AdminTableCell>
                  <AdminTableCell>
                    <AdminBadge intent="neutral">
                      {CATEGORY_LABELS[template.category] || template.category}
                    </AdminBadge>
                  </AdminTableCell>
                  <AdminTableCell className="max-w-xs truncate">{template.subject}</AdminTableCell>
                  <AdminTableCell>
                    <div className="flex items-center gap-1">
                      <AdminButton variant="adminGhost" size="sm" onClick={() => openEditDialog(template)}>
                        <Pencil className="h-4 w-4" />
                      </AdminButton>
                      <AdminButton variant="adminGhost" size="sm" onClick={() => handleDelete(template.id)}>
                        <Trash2 className="h-4 w-4 text-[hsl(var(--admin-danger))]" />
                      </AdminButton>
                    </div>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminCardContent>
    </AdminCard>
  );
};

export default ArtistEmailTemplates;
