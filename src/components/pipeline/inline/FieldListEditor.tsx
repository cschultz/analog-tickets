import { useState } from "react";
import { usePipelineFields, PipelineField } from "@/hooks/usePipelineConfig";
import { useCreatePipelineField, useUpdatePipelineField, useDeletePipelineField } from "@/hooks/usePipelineAdmin";
import { AdminButton, AdminInput, AdminLabel } from "@/components/admin";
import { AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { Plus, Trash2, GripVertical, Type, Hash, Calendar, Link, Mail, Phone, List, ToggleLeft, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_TYPES = [
  { value: "text", label: "Text", icon: Type },
  { value: "textarea", label: "Long Text", icon: Type },
  { value: "number", label: "Number", icon: Hash },
  { value: "currency", label: "Currency", icon: Hash },
  { value: "date", label: "Date", icon: Calendar },
  { value: "url", label: "URL", icon: Link },
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "select", label: "Dropdown", icon: List },
  { value: "multiselect", label: "Multi-select", icon: List },
  { value: "boolean", label: "Checkbox", icon: ToggleLeft },
  { value: "tags", label: "Tags", icon: Tag },
] as const;

interface FieldListEditorProps {
  pipelineId: string;
}

interface EditingField {
  id: string;
  name: string;
  field_type: string;
  placeholder: string;
  is_required: boolean;
  show_in_table: boolean;
  show_in_card: boolean;
  options: { value: string; label: string }[] | null;
}

export function FieldListEditor({ pipelineId }: FieldListEditorProps) {
  const { data: fields = [] } = usePipelineFields(pipelineId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("text");
  const [newOptions, setNewOptions] = useState("");

  const createField = useCreatePipelineField();
  const updateField = useUpdatePipelineField();
  const deleteField = useDeletePipelineField();

  // Filter to only show custom fields (non-system)
  const customFields = fields.filter(f => !f.is_system).sort((a, b) => a.display_order - b.display_order);

  const handleExpand = (field: PipelineField) => {
    if (expandedId === field.id) {
      setExpandedId(null);
      setEditingField(null);
    } else {
      setExpandedId(field.id);
      setEditingField({
        id: field.id,
        name: field.name,
        field_type: field.field_type,
        placeholder: field.placeholder || "",
        is_required: field.is_required,
        show_in_table: field.show_in_table,
        show_in_card: field.show_in_card,
        options: field.options,
      });
    }
  };

  const handleSave = () => {
    if (!editingField) return;
    const field = fields.find(f => f.id === editingField.id);
    if (!field) return;

    const hasChanges =
      editingField.name !== field.name ||
      editingField.field_type !== field.field_type ||
      editingField.placeholder !== (field.placeholder || "") ||
      editingField.is_required !== field.is_required ||
      editingField.show_in_table !== field.show_in_table ||
      editingField.show_in_card !== field.show_in_card ||
      JSON.stringify(editingField.options) !== JSON.stringify(field.options);

    if (editingField.name.trim() && hasChanges) {
      updateField.mutate({
        id: editingField.id,
        pipeline_id: pipelineId,
        name: editingField.name.trim(),
        field_type: editingField.field_type as PipelineField["field_type"],
        placeholder: editingField.placeholder || null,
        is_required: editingField.is_required,
        show_in_table: editingField.show_in_table,
        show_in_card: editingField.show_in_card,
        options: editingField.options,
      });
    }
    setExpandedId(null);
    setEditingField(null);
  };

  const handleDelete = (field: PipelineField) => {
    if (confirm(`Delete field "${field.name}"? Data stored in this field will be lost.`)) {
      deleteField.mutate({ id: field.id, pipeline_id: pipelineId });
      setExpandedId(null);
      setEditingField(null);
    }
  };

  const handleCreate = () => {
    if (!newName.trim()) return;

    const slug = newName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const needsOptions = ["select", "multiselect"].includes(newType);
    const options = needsOptions && newOptions.trim()
      ? newOptions.split(",").map(o => ({ value: o.trim().toLowerCase().replace(/\s+/g, "_"), label: o.trim() }))
      : null;

    createField.mutate(
      {
        pipeline_id: pipelineId,
        slug,
        name: newName.trim(),
        field_type: newType as PipelineField["field_type"],
        options,
        default_value: null,
        placeholder: null,
        is_required: false,
        min_value: null,
        max_value: null,
        max_length: null,
        show_in_table: true,
        show_in_form: true,
        show_in_card: false,
        display_order: customFields.length + 100, // After system fields
        column_width: 150,
        field_group: "details",
        is_system: false,
      },
      {
        onSuccess: () => {
          setNewName("");
          setNewType("text");
          setNewOptions("");
          setIsAdding(false);
        },
      }
    );
  };

  const getFieldIcon = (type: string) => {
    const found = FIELD_TYPES.find(t => t.value === type);
    return found ? found.icon : Type;
  };

  const parseOptionsForEdit = (options: { value: string; label: string }[] | null): string => {
    if (!options) return "";
    return options.map(o => o.label).join(", ");
  };

  const updateOptionsFromString = (str: string): { value: string; label: string }[] | null => {
    if (!str.trim()) return null;
    return str.split(",").map(o => ({
      value: o.trim().toLowerCase().replace(/\s+/g, "_"),
      label: o.trim(),
    }));
  };

  return (
    <div className="space-y-2">
      {customFields.length === 0 && !isAdding && (
        <p className="text-xs text-[hsl(var(--admin-muted-foreground))] py-2">
          No custom fields yet. Add fields to capture additional data.
        </p>
      )}

      {customFields.map((field) => {
        const Icon = getFieldIcon(field.field_type);
        return (
          <div
            key={field.id}
            className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden"
          >
            {/* Field Row */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[hsl(var(--admin-surface-hover))] transition-colors",
                expandedId === field.id && "bg-[hsl(var(--admin-surface-hover))]"
              )}
              onClick={() => handleExpand(field)}
            >
              <GripVertical className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))] opacity-50" />
              <Icon className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
              <span className="text-sm text-[hsl(var(--admin-foreground))] flex-1 truncate">
                {field.name}
              </span>
              {field.is_required && (
                <span className="text-[10px] text-[hsl(var(--admin-warning))] uppercase">Required</span>
              )}
              <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))] uppercase">
                {FIELD_TYPES.find(t => t.value === field.field_type)?.label || field.field_type}
              </span>
            </div>

            {/* Expanded Editor */}
            {expandedId === field.id && editingField && (
              <div className="px-3 pb-3 pt-1 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] space-y-3">
                {/* Name */}
                <div className="space-y-1">
                  <AdminLabel>Field Name</AdminLabel>
                  <AdminInput
                    value={editingField.name}
                    onChange={(e) => setEditingField({ ...editingField, name: e.target.value })}
                    className="h-8"
                  />
                </div>

                {/* Type */}
                <div className="space-y-1">
                  <AdminLabel>Field Type</AdminLabel>
                  <AdminSelect
                    value={editingField.field_type}
                    onValueChange={(value) => setEditingField({ ...editingField, field_type: value })}
                    className="h-8"
                  >
                    {FIELD_TYPES.map((t) => (
                      <AdminSelectItem key={t.value} value={t.value}>
                        {t.label}
                      </AdminSelectItem>
                    ))}
                  </AdminSelect>
                </div>

                {/* Options for select/multiselect */}
                {["select", "multiselect"].includes(editingField.field_type) && (
                  <div className="space-y-1">
                    <AdminLabel>Options (comma-separated)</AdminLabel>
                    <AdminInput
                      value={parseOptionsForEdit(editingField.options)}
                      onChange={(e) => setEditingField({ ...editingField, options: updateOptionsFromString(e.target.value) })}
                      placeholder="Option 1, Option 2, Option 3"
                      className="h-8"
                    />
                  </div>
                )}

                {/* Placeholder */}
                <div className="space-y-1">
                  <AdminLabel>Placeholder</AdminLabel>
                  <AdminInput
                    value={editingField.placeholder}
                    onChange={(e) => setEditingField({ ...editingField, placeholder: e.target.value })}
                    placeholder="Hint text..."
                    className="h-8"
                  />
                </div>

                {/* Toggles */}
                <div className="space-y-2">
                  <div 
                    className="flex items-center gap-2 text-xs cursor-pointer"
                    onClick={() => setEditingField({ ...editingField, is_required: !editingField.is_required })}
                  >
                    <AdminCheckbox
                      checked={editingField.is_required}
                      onCheckedChange={(checked) => setEditingField({ ...editingField, is_required: !!checked })}
                    />
                    <span>Required field</span>
                  </div>
                  <div 
                    className="flex items-center gap-2 text-xs cursor-pointer"
                    onClick={() => setEditingField({ ...editingField, show_in_table: !editingField.show_in_table })}
                  >
                    <AdminCheckbox
                      checked={editingField.show_in_table}
                      onCheckedChange={(checked) => setEditingField({ ...editingField, show_in_table: !!checked })}
                    />
                    <span>Show in table view</span>
                  </div>
                  <div 
                    className="flex items-center gap-2 text-xs cursor-pointer"
                    onClick={() => setEditingField({ ...editingField, show_in_card: !editingField.show_in_card })}
                  >
                    <AdminCheckbox
                      checked={editingField.show_in_card}
                      onCheckedChange={(checked) => setEditingField({ ...editingField, show_in_card: !!checked })}
                    />
                    <span>Show on kanban card</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--admin-border))]">
                  <AdminButton
                    variant="adminGhost"
                    size="sm"
                    onClick={() => handleDelete(field)}
                    className="text-[hsl(var(--admin-danger))] hover:text-[hsl(var(--admin-danger))] hover:bg-[hsl(var(--admin-danger))]/10 h-7 px-2"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </AdminButton>
                  <AdminButton variant="admin" size="sm" onClick={handleSave} className="h-7 px-3">
                    Save
                  </AdminButton>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add Field */}
      {isAdding ? (
        <div className="border border-dashed border-[hsl(var(--admin-accent))] rounded-lg p-3 space-y-3">
          <div className="space-y-1">
            <AdminLabel>Field Name</AdminLabel>
            <AdminInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., Commission Rate"
              className="h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !["select", "multiselect"].includes(newType)) handleCreate();
                if (e.key === "Escape") setIsAdding(false);
              }}
            />
          </div>
          <div className="space-y-1">
            <AdminLabel>Field Type</AdminLabel>
            <AdminSelect value={newType} onValueChange={setNewType} className="h-8">
              {FIELD_TYPES.map((t) => (
                <AdminSelectItem key={t.value} value={t.value}>
                  {t.label}
                </AdminSelectItem>
              ))}
            </AdminSelect>
          </div>
          {["select", "multiselect"].includes(newType) && (
            <div className="space-y-1">
              <AdminLabel>Options (comma-separated)</AdminLabel>
              <AdminInput
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder="Option 1, Option 2, Option 3"
                className="h-8"
              />
            </div>
          )}
          <div className="flex gap-2">
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={() => { setIsAdding(false); setNewName(""); setNewType("text"); setNewOptions(""); }}
              className="h-7"
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="admin"
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || createField.isPending}
              className="h-7"
            >
              Add Field
            </AdminButton>
          </div>
        </div>
      ) : (
        <AdminButton
          variant="adminGhost"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="w-full justify-center py-2 border border-dashed border-[hsl(var(--admin-border))] hover:border-[hsl(var(--admin-accent))]"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Custom Field
        </AdminButton>
      )}
    </div>
  );
}
