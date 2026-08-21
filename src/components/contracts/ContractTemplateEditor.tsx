import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { 
  AdminButton, AdminInput, AdminLabel, AdminBadge,
  AdminSelect, AdminSelectItem,
  AdminDialog, AdminDialogContent, AdminDialogDescription, 
  AdminDialogHeader, AdminDialogTitle, AdminDialogTrigger,
  AdminTextarea, AdminSwitch,
} from "@/components/admin";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { toast } from "sonner";
import { Plus, FileText, Edit, Trash2, Copy } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { MergeFieldPicker } from "@/components/email/MergeFieldPicker";

interface ContractTemplate {
  id: string;
  event_id: string | null;
  name: string;
  description: string | null;
  entity_type: "vendor" | "artisan" | "partner";
  content_html: string;
  merge_fields: string[];
  requires_countersign: boolean;
  is_active: boolean;
  created_at: string;
}

export function ContractTemplateEditor() {
  const { selectedEventId } = useAdminEvent();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState<"vendor" | "artisan" | "partner">("vendor");
  const [contentHtml, setContentHtml] = useState("");
  const [requiresCountersign, setRequiresCountersign] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const { data: templates, isLoading } = useAuthQuery({
    queryKey: ["contract-templates", selectedEventId],
    queryFn: async () => {
      const query = supabase
        .from("contract_templates")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (selectedEventId) {
        query.or(`event_id.eq.${selectedEventId},event_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ContractTemplate[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (template: Partial<ContractTemplate>) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from("contract_templates")
          .update(template as any)
          .eq("id", editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_templates")
          .insert([{ ...template, event_id: selectedEventId } as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success(editingTemplate ? "Template updated" : "Template created");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to save template: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contract_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Template deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete template: " + error.message);
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setEntityType("vendor");
    setContentHtml("");
    setRequiresCountersign(false);
    setIsActive(true);
    setEditingTemplate(null);
  };

  const openEditDialog = (template: ContractTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || "");
    setEntityType(template.entity_type);
    setContentHtml(template.content_html);
    setRequiresCountersign(template.requires_countersign);
    setIsActive(template.is_active);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !contentHtml.trim()) {
      toast.error("Name and content are required");
      return;
    }

    saveMutation.mutate({
      name,
      description,
      entity_type: entityType,
      content_html: contentHtml,
      requires_countersign: requiresCountersign,
      is_active: isActive,
    });
  };

  const insertMergeField = (field: string) => {
    setContentHtml((prev) => prev + field);
  };

  const duplicateTemplate = async (template: ContractTemplate) => {
    const { error } = await supabase
      .from("contract_templates")
      .insert([{
        name: `${template.name} (Copy)`,
        description: template.description,
        entity_type: template.entity_type,
        content_html: template.content_html,
        requires_countersign: template.requires_countersign,
        is_active: false,
        event_id: selectedEventId,
      }]);
    
    if (error) {
      toast.error("Failed to duplicate template");
    } else {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Template duplicated");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Contract Templates</h2>
          <p className="text-sm text-[hsl(var(--admin-text-muted))]">
            Create reusable contract templates with merge fields
          </p>
        </div>
        <AdminDialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <AdminDialogTrigger asChild>
            <AdminButton>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </AdminButton>
          </AdminDialogTrigger>
          <AdminDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <AdminDialogHeader>
              <AdminDialogTitle>
                {editingTemplate ? "Edit Template" : "Create Contract Template"}
              </AdminDialogTitle>
              <AdminDialogDescription>
                Create a reusable contract template with merge fields for personalization
              </AdminDialogDescription>
            </AdminDialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <AdminLabel htmlFor="name">Template Name</AdminLabel>
                  <AdminInput
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Standard Vendor Agreement"
                  />
                </div>
                <div className="space-y-2">
                  <AdminLabel htmlFor="entityType">Entity Type</AdminLabel>
                  <AdminSelect value={entityType} onValueChange={(v: any) => setEntityType(v)}>
                    <AdminSelectItem value="vendor">Vendor</AdminSelectItem>
                    <AdminSelectItem value="artisan">Artisan</AdminSelectItem>
                    <AdminSelectItem value="partner">Partner</AdminSelectItem>
                  </AdminSelect>
                </div>
              </div>

              <div className="space-y-2">
                <AdminLabel htmlFor="description">Description (optional)</AdminLabel>
                <AdminTextarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Internal notes about when to use this template"
                  rows={2}
                  className="bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))] text-[hsl(var(--admin-text))]"
                />
              </div>

              <div className="space-y-2">
                <AdminLabel>Merge Fields</AdminLabel>
                <MergeFieldPicker
                  onInsert={insertMergeField}
                  isContract
                  entityType={entityType}
                  variant="inline"
                  showCategories
                />
              </div>

              <div className="space-y-2">
                <AdminLabel>Contract Content</AdminLabel>
                <RichTextEditor
                  content={contentHtml}
                  onChange={setContentHtml}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                  <AdminSwitch
                    id="countersign"
                    checked={requiresCountersign}
                    onCheckedChange={setRequiresCountersign}
                  />
                  <AdminLabel htmlFor="countersign">Requires admin countersignature</AdminLabel>
                </div>
                <div className="flex items-center space-x-2">
                  <AdminSwitch
                    id="active"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                  <AdminLabel htmlFor="active">Active</AdminLabel>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <AdminButton variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </AdminButton>
                <AdminButton onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : editingTemplate ? "Update" : "Create"}
                </AdminButton>
              </div>
            </div>
          </AdminDialogContent>
        </AdminDialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">Loading templates...</div>
      ) : !templates?.length ? (
        <AdminCard>
          <AdminCardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-[hsl(var(--admin-text-muted))] mb-4" />
            <p className="text-[hsl(var(--admin-text-muted))]">No contract templates yet</p>
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Create your first template to get started</p>
          </AdminCardContent>
        </AdminCard>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <AdminCard key={template.id}>
              <AdminCardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <AdminCardTitle className="text-lg flex items-center gap-2">
                      {template.name}
                      {!template.is_active && (
                        <AdminBadge intent="neutral">Inactive</AdminBadge>
                      )}
                    </AdminCardTitle>
                    <AdminCardDescription>{template.description}</AdminCardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      onClick={() => duplicateTemplate(template)}
                    >
                      <Copy className="w-4 h-4" />
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(template)}
                    >
                      <Edit className="w-4 h-4" />
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Delete this template?")) {
                          deleteMutation.mutate(template.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </AdminButton>
                  </div>
                </div>
              </AdminCardHeader>
              <AdminCardContent>
                <div className="flex items-center gap-4 text-sm text-[hsl(var(--admin-text-muted))]">
                  <AdminBadge intent="neutral" className="capitalize">
                    {template.entity_type}
                  </AdminBadge>
                  {template.requires_countersign && (
                    <span>Requires countersignature</span>
                  )}
                </div>
              </AdminCardContent>
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}
