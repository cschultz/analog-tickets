import { useState, useRef, useEffect } from "react";
import { PipelineField } from "@/hooks/usePipelineConfig";
import { useUpdatePipelineField, useDeletePipelineField } from "@/hooks/usePipelineAdmin";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AdminButton, AdminInput, AdminLabel } from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin";
import { ChevronDown, Trash2, Type, Hash, DollarSign, Calendar, Mail, Phone, Link, List, ToggleLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_TYPE_ICONS: Record<string, React.ElementType> = {
  text: Type,
  textarea: Type,
  number: Hash,
  currency: DollarSign,
  date: Calendar,
  datetime: Calendar,
  email: Mail,
  phone: Phone,
  url: Link,
  select: List,
  multiselect: List,
  boolean: ToggleLeft,
  tags: List,
};

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long Text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "select", label: "Single Select" },
  { value: "multiselect", label: "Multi Select" },
  { value: "boolean", label: "Checkbox" },
];

interface FieldHeaderEditorProps {
  field: PipelineField;
  children: React.ReactNode;
  disabled?: boolean;
}

export function FieldHeaderEditor({ field, children, disabled }: FieldHeaderEditorProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(field.name);
  const [fieldType, setFieldType] = useState(field.field_type);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateField = useUpdatePipelineField();
  const deleteField = useDeletePipelineField();

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  const handleSave = () => {
    if (name.trim() && (name !== field.name || fieldType !== field.field_type)) {
      updateField.mutate({
        id: field.id,
        pipeline_id: field.pipeline_id,
        name: name.trim(),
        field_type: fieldType,
      });
    }
    setOpen(false);
  };

  const handleDelete = () => {
    if (confirm(`Delete field "${field.name}"? This cannot be undone.`)) {
      deleteField.mutate({ id: field.id, pipeline_id: field.pipeline_id });
      setOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setName(field.name);
      setFieldType(field.field_type);
      setOpen(false);
    }
  };

  if (disabled || field.is_system) {
    return <>{children}</>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AdminButton
          variant="ghost"
          className={cn(
            "h-auto p-0 font-normal justify-start gap-1 group",
            "hover:bg-transparent hover:text-[hsl(var(--admin-foreground))]"
          )}
        >
          {children}
          <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </AdminButton>
      </PopoverTrigger>
      <PopoverContent 
        className="w-64 p-3 bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]" 
        align="start"
        sideOffset={4}
      >
        <div className="space-y-3">
          {/* Field Name */}
          <div className="space-y-1.5">
            <AdminLabel className="text-xs">Name</AdminLabel>
            <AdminInput
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Field name"
              className="h-8"
            />
          </div>

          {/* Field Type */}
          <div className="space-y-1.5">
            <AdminLabel className="text-xs">Type</AdminLabel>
            <AdminSelect value={fieldType} onValueChange={(v) => setFieldType(v as PipelineField["field_type"])}>
              {FIELD_TYPES.map((type) => {
                const TypeIcon = FIELD_TYPE_ICONS[type.value] || Type;
                return (
                  <AdminSelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <TypeIcon className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
                      {type.label}
                    </div>
                  </AdminSelectItem>
                );
              })}
            </AdminSelect>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--admin-border))]">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-[hsl(var(--admin-danger))] hover:text-[hsl(var(--admin-danger))] hover:bg-[hsl(var(--admin-danger))]/10 h-7 px-2"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </AdminButton>
            <AdminButton
              variant="admin"
              size="sm"
              onClick={handleSave}
              disabled={!name.trim()}
              className="h-7 px-3"
            >
              Save
            </AdminButton>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
