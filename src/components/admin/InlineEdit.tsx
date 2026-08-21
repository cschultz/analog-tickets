import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Check, X, Pencil } from "lucide-react";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  multiline?: boolean;
  disabled?: boolean;
}

export function InlineEdit({
  value,
  onSave,
  placeholder = "Click to edit...",
  className,
  inputClassName,
  multiline = false,
  disabled = false,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

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
      // Revert on error
      setEditValue(value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
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
        {value || <span className="text-[hsl(var(--admin-text-tertiary))]">{placeholder}</span>}
      </span>
    );
  }

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={cn(
          "group inline-flex items-center gap-2 text-left hover:bg-[hsl(var(--admin-hover))] px-2 py-1 -mx-2 -my-1 rounded transition-colors",
          className
        )}
      >
        <span className={cn(!value && "text-[hsl(var(--admin-text-tertiary))]")}>
          {value || placeholder}
        </span>
        <Pencil className="h-3 w-3 text-[hsl(var(--admin-text-tertiary))] opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  const InputComponent = multiline ? "textarea" : "input";

  return (
    <div className="flex items-start gap-2">
      <InputComponent
        ref={inputRef as any}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        disabled={isSaving}
        className={cn(
          "flex-1 px-2 py-1 text-sm border border-[hsl(var(--admin-accent))] rounded-md bg-[hsl(var(--admin-surface))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-accent-muted))]",
          multiline && "min-h-[80px] resize-y",
          inputClassName
        )}
        placeholder={placeholder}
      />
      <div className="flex gap-1">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="p-1 hover:bg-[hsl(var(--admin-success-muted))] rounded text-[hsl(var(--admin-success))]"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="p-1 hover:bg-[hsl(var(--admin-error-muted))] rounded text-[hsl(var(--admin-error))]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Inline select for status changes
interface InlineSelectProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onSave: (value: T) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

export function InlineSelect<T extends string>({
  value,
  options,
  onSave,
  disabled = false,
  className,
}: InlineSelectProps<T>) {
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = async (newValue: T) => {
    if (newValue === value) return;
    
    setIsSaving(true);
    try {
      await onSave(newValue);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value as T)}
      disabled={disabled || isSaving}
      className={cn(
        "px-2 py-1 text-sm border border-[hsl(var(--admin-border))] rounded-md bg-[hsl(var(--admin-surface))] hover:border-[hsl(var(--admin-border-strong))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-accent-muted))] cursor-pointer disabled:opacity-50",
        className
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
