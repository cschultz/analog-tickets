import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Check, X, Pencil } from "lucide-react";

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void> | void;
  className?: string;
  inputClassName?: string;
  displayClassName?: string;
  placeholder?: string;
  type?: "text" | "number";
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
}

export function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  displayClassName,
  placeholder = "Click to edit",
  type = "text",
  prefix,
  suffix,
  disabled = false,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    if (disabled) return;
    setEditValue(value);
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save:", error);
      setEditValue(value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {prefix && <span className="text-[hsl(var(--admin-muted-foreground))]">{prefix}</span>}
        <Input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          disabled={isSaving}
          className={cn(
            "h-7 px-2 text-sm min-w-0",
            inputClassName
          )}
        />
        {suffix && <span className="text-[hsl(var(--admin-muted-foreground))]">{suffix}</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="p-1 hover:bg-[hsl(var(--admin-success)/0.1)] rounded text-[hsl(var(--admin-success))]"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="p-1 hover:bg-[hsl(var(--admin-danger)/0.1)] rounded text-[hsl(var(--admin-danger))]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={startEditing}
      className={cn(
        "group inline-flex items-center gap-1 cursor-pointer rounded px-1 -mx-1",
        !disabled && "hover:bg-[hsl(var(--admin-surface))]",
        disabled && "cursor-default",
        className
      )}
    >
      {prefix && <span className="text-[hsl(var(--admin-muted-foreground))]">{prefix}</span>}
      <span className={cn(displayClassName)}>
        {value || <span className="text-[hsl(var(--admin-muted-foreground))] italic">{placeholder}</span>}
      </span>
      {suffix && <span className="text-[hsl(var(--admin-muted-foreground))]">{suffix}</span>}
      {!disabled && (
        <Pencil className="h-3 w-3 text-[hsl(var(--admin-muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
}

// Specialized for currency values
interface InlineCurrencyEditProps {
  value: number;
  onSave: (newValue: number) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
}

export function InlineCurrencyEdit({
  value,
  onSave,
  className,
  disabled = false,
}: InlineCurrencyEditProps) {
  const handleSave = async (newValue: string) => {
    const numValue = parseFloat(newValue) || 0;
    await onSave(numValue);
  };

  return (
    <InlineEdit
      value={value.toString()}
      onSave={handleSave}
      type="number"
      prefix="$"
      className={className}
      disabled={disabled}
    />
  );
}
