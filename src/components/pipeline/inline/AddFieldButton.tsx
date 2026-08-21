import { useState } from "react";
import { useCreatePipelineField } from "@/hooks/usePipelineAdmin";
import { PipelineField } from "@/hooks/usePipelineConfig";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AdminButton, AdminInput, AdminLabel } from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin";
import { Plus, Type, Hash, DollarSign, Calendar, Mail, Phone, Link, List, ToggleLeft } from "lucide-react";

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
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "select", label: "Single Select" },
  { value: "boolean", label: "Checkbox" },
];

interface AddFieldButtonProps {
  pipelineId: string;
  existingFieldCount: number;
}

export function AddFieldButton({ pipelineId, existingFieldCount }: AddFieldButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<PipelineField["field_type"]>("text");

  const createField = useCreatePipelineField();

  const handleCreate = () => {
    if (!name.trim()) return;

    const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    createField.mutate(
      {
        pipeline_id: pipelineId,
        slug,
        name: name.trim(),
        field_type: fieldType,
        display_order: existingFieldCount + 1,
        show_in_table: true,
        show_in_form: true,
        show_in_card: false,
        column_width: 150,
        field_group: "details",
        is_required: false,
        is_system: false,
        options: null,
        default_value: null,
        placeholder: null,
        min_value: null,
        max_value: null,
        max_length: null,
      },
      {
        onSuccess: () => {
          setName("");
          setFieldType("text");
          setOpen(false);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreate();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AdminButton
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
          title="Add column"
        >
          <Plus className="w-4 h-4" />
        </AdminButton>
      </PopoverTrigger>
      <PopoverContent 
        className="w-64 p-3 bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]" 
        align="start"
        sideOffset={4}
      >
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[hsl(var(--admin-foreground))]">
            Add Column
          </h4>

          {/* Field Name */}
          <div className="space-y-1.5">
            <AdminLabel className="text-xs">Name</AdminLabel>
            <AdminInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Column name"
              className="h-8"
              autoFocus
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

          {/* Create Button */}
          <AdminButton
            variant="admin"
            size="sm"
            onClick={handleCreate}
            disabled={!name.trim() || createField.isPending}
            className="w-full h-8"
          >
            {createField.isPending ? "Creating..." : "Add Column"}
          </AdminButton>
        </div>
      </PopoverContent>
    </Popover>
  );
}
