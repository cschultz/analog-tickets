/**
 * MergeFieldPicker - Unified component for inserting merge fields
 * 
 * Used across all template editors for consistent merge field insertion.
 * Organizes fields by category and filters based on target audience.
 */

import { useState } from "react";
import { Sparkles, Plus, ChevronDown } from "lucide-react";
import {
  AdminButton,
  AdminDropdown,
  AdminOverlay,
  AdminMenuLabel,
  AdminMenuSeparator,
} from "@/components/admin";
import {
  getMergeFieldsForAudience,
  getContractMergeFields,
  groupFieldsByCategory,
  getCategoryLabel,
  type MergeFieldAudience,
  type MergeField,
  type MergeFieldCategory,
} from "@/lib/merge-fields";

interface MergeFieldPickerProps {
  onInsert: (field: string) => void;
  audience?: MergeFieldAudience;
  /** Use contract-specific fields (includes dates, amounts, etc.) */
  isContract?: boolean;
  /** Entity type for contracts */
  entityType?: "vendor" | "artisan" | "partner" | "artist";
  /** Render as inline buttons instead of dropdown */
  variant?: "dropdown" | "inline";
  /** Button text for dropdown variant */
  buttonText?: string;
  /** Show category headers in inline variant */
  showCategories?: boolean;
}

export function MergeFieldPicker({
  onInsert,
  audience = "all",
  isContract = false,
  entityType,
  variant = "dropdown",
  buttonText = "Insert Field",
  showCategories = false,
}: MergeFieldPickerProps) {
  const [open, setOpen] = useState(false);

  // Get appropriate fields based on context
  const fields: MergeField[] = isContract && entityType
    ? getContractMergeFields(entityType)
    : getMergeFieldsForAudience(audience);

  const groupedFields = groupFieldsByCategory(fields);
  const categories = Object.keys(groupedFields) as MergeFieldCategory[];

  const handleInsert = (key: string) => {
    onInsert(key);
    setOpen(false);
  };

  // Inline variant - renders as clickable buttons
  if (variant === "inline") {
    if (showCategories) {
      return (
        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category}>
              <div className="text-[10px] font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wider mb-1.5">
                {getCategoryLabel(category)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groupedFields[category].map((field) => (
                  <AdminButton
                    key={field.key}
                    variant="adminOutline"
                    size="sm"
                    onClick={() => onInsert(field.key)}
                    className="h-7 text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {field.label}
                  </AdminButton>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <AdminButton
            key={field.key}
            variant="adminOutline"
            size="sm"
            onClick={() => onInsert(field.key)}
            className="h-7 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            {field.label}
          </AdminButton>
        ))}
      </div>
    );
  }

  // Dropdown variant
  return (
    <AdminDropdown
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <AdminButton variant="adminOutline" size="sm" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {buttonText}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </AdminButton>
      }
    >
      <AdminOverlay open={true} className="w-72 max-h-96 overflow-y-auto">
        <AdminMenuLabel>Click to insert dynamic content</AdminMenuLabel>
        <AdminMenuSeparator />
        
        {categories.map((category) => (
          <div key={category}>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-[hsl(var(--admin-text-muted))] uppercase tracking-wider bg-[hsl(var(--admin-surface))]">
              {getCategoryLabel(category)}
            </div>
            <div role="menu" className="py-0.5">
              {groupedFields[category].map((field) => (
                <button
                  key={field.key}
                  role="menuitem"
                  onClick={() => handleInsert(field.key)}
                  className="w-full text-left px-3 py-1.5 hover:bg-[hsl(var(--admin-hover))] transition-colors"
                >
                  <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
                    {field.label}
                  </span>
                  <span className="block text-xs text-[hsl(var(--admin-text-muted))]">
                    <code className="bg-[hsl(var(--admin-surface))] px-1 rounded text-[hsl(var(--admin-text-secondary))] font-mono text-[10px]">
                      {field.key}
                    </code>
                    <span className="mx-1">→</span>
                    {field.example}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </AdminOverlay>
    </AdminDropdown>
  );
}
