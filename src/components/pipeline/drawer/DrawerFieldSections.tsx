/**
 * DrawerFieldSections
 * 
 * Groups pipeline fields into collapsible sections based on field_group.
 * Shows long-form fields (textarea) in a more readable format.
 */

import { useState } from "react";
import { PipelineField } from "@/hooks/usePipelineConfig";
import { InlineFieldValue } from "../inline/InlineFieldValue";
import { AdminButton } from "@/components/admin";
import { ChevronDown, ChevronUp, Info, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerFieldSectionsProps {
  fields: PipelineField[];
  record: Record<string, any>;
  onFieldUpdate: (slug: string, value: any) => void;
  isUpdating: boolean;
  excludeSlugs?: string[];
}

interface FieldSection {
  key: string;
  label: string;
  icon: React.ElementType;
  fields: PipelineField[];
}

export function DrawerFieldSections({
  fields,
  record,
  onFieldUpdate,
  isUpdating,
  excludeSlugs = [],
}: DrawerFieldSectionsProps) {
  // Filter fields
  const visibleFields = fields.filter(f =>
    !f.is_system &&
    f.slug !== "pipeline_status" &&
    !excludeSlugs.includes(f.slug)
  );

  // Group by field_group
  const detailFields = visibleFields.filter(f => f.field_group === "details" || f.field_group === "header");
  const metaFields = visibleFields.filter(f => f.field_group === "meta");
  // Ungrouped fields go to details
  const ungrouped = visibleFields.filter(f => !f.field_group || !["details", "header", "meta"].includes(f.field_group));

  const sections: FieldSection[] = [];

  const allDetails = [...detailFields, ...ungrouped];
  if (allDetails.length > 0) {
    sections.push({ key: "details", label: "Details", icon: Info, fields: allDetails });
  }
  if (metaFields.length > 0) {
    sections.push({ key: "meta", label: "Additional Info", icon: FileText, fields: metaFields });
  }

  // If only one section, don't wrap in collapsible — just render flat
  if (sections.length <= 1) {
    return (
      <FieldList
        fields={visibleFields}
        record={record}
        onFieldUpdate={onFieldUpdate}
        isUpdating={isUpdating}
      />
    );
  }

  return (
    <div className="space-y-3">
      {sections.map(section => (
        <CollapsibleSection
          key={section.key}
          label={section.label}
          icon={section.icon}
          fieldCount={section.fields.length}
          defaultOpen={section.key === "details"}
        >
          <FieldList
            fields={section.fields}
            record={record}
            onFieldUpdate={onFieldUpdate}
            isUpdating={isUpdating}
          />
        </CollapsibleSection>
      ))}
    </div>
  );
}

function FieldList({
  fields,
  record,
  onFieldUpdate,
  isUpdating,
}: {
  fields: PipelineField[];
  record: Record<string, any>;
  onFieldUpdate: (slug: string, value: any) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="space-y-0.5">
      {fields.map(field => (
        <div
          key={field.id}
          className={cn(
            "flex py-2.5 border-b border-[hsl(var(--admin-border)/0.5)] last:border-0",
            field.field_type === "textarea" ? "flex-col gap-1.5" : "items-start"
          )}
        >
          <span className={cn(
            "text-xs font-medium text-[hsl(var(--admin-muted-foreground))]",
            field.field_type === "textarea" ? "" : "w-32 shrink-0 pt-1"
          )}>
            {field.name}
          </span>
          <div className={cn("min-w-0", field.field_type === "textarea" ? "w-full" : "flex-1")}>
            <InlineFieldValue
              field={field}
              value={record[field.slug]}
              onSave={(value) => onFieldUpdate(field.slug, value)}
              disabled={isUpdating}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CollapsibleSection({
  label,
  icon: Icon,
  fieldCount,
  defaultOpen = true,
  children,
}: {
  label: string;
  icon: React.ElementType;
  fieldCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))] overflow-hidden">
      <AdminButton
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full justify-between px-4 py-2.5 h-auto rounded-none hover:bg-[hsl(var(--admin-muted)/0.08)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
          <span className="text-xs font-medium text-[hsl(var(--admin-foreground))]">{label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--admin-muted)/0.3)] text-[hsl(var(--admin-muted-foreground))]">
            {fieldCount}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
        )}
      </AdminButton>
      {isOpen && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}