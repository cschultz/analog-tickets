import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Pencil, Check, X } from "lucide-react";

interface InlineViewRenameProps {
  value: string;
  onSave: (value: string) => Promise<void> | void;
  isSystem?: boolean;
  className?: string;
}

export function InlineViewRename({
  value,
  onSave,
  isSystem = false,
  className,
}: InlineViewRenameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (editValue.trim() === "" || editValue === value) {
      setEditValue(value);
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue.trim());
      setIsEditing(false);
    } catch (error) {
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
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  // System views can't be renamed
  if (isSystem) {
    return (
      <span className={cn("truncate", className)}>
        {value}
      </span>
    );
  }

  if (!isEditing) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className={cn(
          "group inline-flex items-center gap-1 text-left hover:bg-[hsl(var(--admin-hover))] px-1 py-0.5 -mx-1 -my-0.5 rounded transition-colors truncate max-w-full",
          className
        )}
      >
        <span className="truncate">{value}</span>
        <Pencil className="h-3 w-3 text-[hsl(var(--admin-text-tertiary))] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        disabled={isSaving}
        className="w-full px-1 py-0.5 text-sm border border-[hsl(var(--admin-accent))] rounded bg-[hsl(var(--admin-surface))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--admin-accent-muted))]"
      />
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="p-0.5 hover:bg-[hsl(var(--admin-success-muted))] rounded text-[hsl(var(--admin-success))]"
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        onClick={handleCancel}
        disabled={isSaving}
        className="p-0.5 hover:bg-[hsl(var(--admin-error-muted))] rounded text-[hsl(var(--admin-error))]"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
