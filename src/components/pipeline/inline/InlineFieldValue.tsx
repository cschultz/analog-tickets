import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { PipelineField } from "@/hooks/usePipelineConfig";
import { cn } from "@/lib/utils";
import { Pencil, Check, X } from "lucide-react";
import { AdminBadge, AdminButton, AdminInput } from "@/components/admin";
import { AdminTextarea } from "@/components/admin/AdminFormPrimitives";

interface InlineFieldValueProps {
  field: PipelineField;
  value: any;
  onSave: (value: any) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

export function InlineFieldValue({
  field,
  value,
  onSave,
  disabled = false,
  className,
}: InlineFieldValueProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(formatValueForEdit(value, field));
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(formatValueForEdit(value, field));
  }, [value, field]);

  function formatValueForEdit(val: any, f: PipelineField): string {
    if (val === null || val === undefined) return "";
    if (f.field_type === "currency") {
      return (Number(val) / 100).toString();
    }
    if (f.field_type === "boolean") {
      return val ? "true" : "false";
    }
    return String(val);
  }

  function parseValueForSave(val: string, f: PipelineField): any {
    if (val.trim() === "") return null;
    
    switch (f.field_type) {
      case "number":
        return Number(val) || 0;
      case "currency":
        return Math.round(Number(val) * 100) || 0;
      case "boolean":
        return val === "true";
      default:
        return val;
    }
  }

  function formatValueForDisplay(val: any, f: PipelineField): string {
    if (val === null || val === undefined || val === "") return "—";
    
    switch (f.field_type) {
      case "currency":
        return `$${(Number(val) / 100).toLocaleString()}`;
      case "boolean":
        return val ? "Yes" : "No";
      case "date":
        return new Date(val).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
      case "datetime":
        return new Date(val).toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
      default:
        return String(val);
    }
  }

  const handleSave = async () => {
    const parsedValue = parseValueForSave(editValue, field);
    if (parsedValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(parsedValue);
      setIsEditing(false);
    } catch (error) {
      setEditValue(formatValueForEdit(value, field));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(formatValueForEdit(value, field));
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && field.field_type !== "textarea") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (disabled) {
    return (
      <span className={cn("text-[hsl(var(--admin-text))]", className)}>
        {formatValueForDisplay(value, field)}
      </span>
    );
  }

  if (!isEditing) {
    // For boolean fields, show a clickable badge
    if (field.field_type === "boolean") {
      return (
        <AdminButton
          variant="adminGhost"
          size="sm"
          onClick={async () => {
            setIsSaving(true);
            try {
              await onSave(!value);
            } finally {
              setIsSaving(false);
            }
          }}
          disabled={isSaving}
          className={cn("h-auto p-0", className)}
        >
          <AdminBadge intent={value ? "success" : "neutral"}>
            {value ? "Yes" : "No"}
          </AdminBadge>
        </AdminButton>
      );
    }

    // For select fields with options
    if (field.field_type === "select" && field.options?.length) {
      return (
        <SelectFieldEditor
          value={value}
          options={field.options}
          onSave={onSave}
          disabled={disabled}
          className={className}
        />
      );
    }

    // For textarea fields, show full content in a readable block
    if (field.field_type === "textarea" && value) {
      return (
        <div
          onClick={() => setIsEditing(true)}
          className={cn(
            "group cursor-pointer rounded-md px-3 py-2.5 -mx-1",
            "bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]",
            "hover:border-[hsl(var(--admin-primary)/0.3)] hover:bg-[hsl(var(--admin-bg))]",
            "transition-colors",
            className
          )}
        >
          <p className="text-sm text-[hsl(var(--admin-foreground))] whitespace-pre-wrap leading-relaxed">
            {String(value)}
          </p>
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="h-3 w-3 text-[hsl(var(--admin-text-tertiary))]" />
            <span className="text-[10px] text-[hsl(var(--admin-text-tertiary))]">Click to edit</span>
          </div>
        </div>
      );
    }

    return (
      <AdminButton
        variant="adminGhost"
        size="sm"
        onClick={() => setIsEditing(true)}
        className={cn(
          "h-auto px-2 py-1 -mx-2 -my-1 justify-start font-normal max-w-full",
          "group",
          className
        )}
      >
        <span className={cn("truncate flex-1 text-left", !value && "text-[hsl(var(--admin-text-tertiary))]")}>
          {formatValueForDisplay(value, field)}
        </span>
        <Pencil className="h-3 w-3 text-[hsl(var(--admin-text-tertiary))] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
      </AdminButton>
    );
  }

  // Textarea for long text
  if (field.field_type === "textarea") {
    return (
      <div className="flex flex-col gap-2">
        <AdminTextarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          placeholder={`Enter ${field.name.toLowerCase()}...`}
          className="min-h-[80px] resize-y"
        />
        <div className="flex justify-end gap-1">
          <AdminButton
            variant="adminGhost"
            size="sm"
            onClick={handleCancel}
            disabled={isSaving}
            className="h-7 w-7 p-0 text-[hsl(var(--admin-error))] hover:bg-[hsl(var(--admin-error-muted))]"
          >
            <X className="h-4 w-4" />
          </AdminButton>
          <AdminButton
            variant="adminGhost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-7 w-7 p-0 text-[hsl(var(--admin-success))] hover:bg-[hsl(var(--admin-success-muted))]"
          >
            <Check className="h-4 w-4" />
          </AdminButton>
        </div>
      </div>
    );
  }

  // Get input type
  const inputType = getInputType(field.field_type);

  return (
    <div className="flex items-center gap-1">
      {field.field_type === "currency" && (
        <span className="text-[hsl(var(--admin-text-muted))]">$</span>
      )}
      <AdminInput
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={inputType}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        disabled={isSaving}
        placeholder={`Enter ${field.name.toLowerCase()}...`}
        className={cn(
          "h-8",
          (field.field_type === "number" || field.field_type === "currency") && "w-24",
          field.field_type === "date" && "w-36",
          field.field_type === "datetime" && "w-48"
        )}
      />
    </div>
  );
}

function getInputType(fieldType: string): string {
  switch (fieldType) {
    case "number":
    case "currency":
      return "number";
    case "date":
      return "date";
    case "datetime":
      return "datetime-local";
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "url":
      return "url";
    default:
      return "text";
  }
}

// Select field with dropdown
interface SelectFieldEditorProps {
  value: string | null;
  options: Array<{ value: string; label: string; color?: string }>;
  onSave: (value: string) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

function SelectFieldEditor({
  value,
  options,
  onSave,
  disabled,
  className,
}: SelectFieldEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find(o => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = async (newValue: string) => {
    if (newValue === value) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(newValue);
    } finally {
      setIsSaving(false);
      setIsOpen(false);
    }
  };

  if (disabled) {
    return (
      <span className={className}>
        {currentOption?.label || value || "—"}
      </span>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <AdminButton
        variant="adminGhost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSaving}
        className={cn(
          "h-auto px-2 py-1 -mx-2 -my-1 justify-start font-normal",
          "group",
          className
        )}
      >
        <span className={!value ? "text-[hsl(var(--admin-text-tertiary))]" : ""}>
          {currentOption?.label || value || "—"}
        </span>
        <Pencil className="h-3 w-3 text-[hsl(var(--admin-text-tertiary))] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
      </AdminButton>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 py-1 bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] rounded-md shadow-lg min-w-[140px] max-h-48 overflow-y-auto">
          {options.map((option) => (
            <AdminButton
              key={option.value}
              variant="adminGhost"
              size="sm"
              onClick={() => handleSelect(option.value)}
              className={cn(
                "w-full justify-start rounded-none h-auto py-1.5 px-3",
                option.value === value && "bg-[hsl(var(--admin-hover))]"
              )}
            >
              {option.label}
            </AdminButton>
          ))}
        </div>
      )}
    </div>
  );
}
