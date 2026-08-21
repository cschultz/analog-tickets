import { useState, useRef, useEffect, KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check, X, Pencil, ChevronDown } from "lucide-react";
import { AdminBadge } from "@/components/admin";

// Inline text edit for table cells
interface InlineTextCellProps {
  value: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  type?: "text" | "number" | "date" | "time";
  prefix?: ReactNode;
  suffix?: ReactNode;
  disabled?: boolean;
  displayFormatter?: (value: string) => string;
}

export function InlineTextCell({
  value,
  onSave,
  placeholder = "—",
  className,
  type = "text",
  prefix,
  suffix,
  disabled = false,
  displayFormatter,
}: InlineTextCellProps) {
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
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
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

  if (disabled) {
    return (
      <span className={cn("text-[hsl(var(--admin-text))]", className)}>
        {prefix}
        {displayFormatter ? displayFormatter(value) : value || <span className="text-[hsl(var(--admin-text-tertiary))]">{placeholder}</span>}
        {suffix}
      </span>
    );
  }

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={cn(
          "group inline-flex items-center gap-1 text-left hover:bg-[hsl(var(--admin-hover))] px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded transition-colors min-w-0",
          className
        )}
      >
        {prefix}
        <span className={cn("truncate", !value && "text-[hsl(var(--admin-text-tertiary))]")}>
          {displayFormatter ? displayFormatter(value) : value || placeholder}
        </span>
        {suffix}
        <Pencil className="h-3 w-3 text-[hsl(var(--admin-text-tertiary))] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        disabled={isSaving}
        className={cn(
          "w-full px-1.5 py-0.5 text-sm border border-[hsl(var(--admin-accent))] rounded bg-[hsl(var(--admin-surface))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--admin-accent-muted))]",
          type === "number" && "w-20",
          type === "date" && "w-32",
          type === "time" && "w-24"
        )}
        placeholder={placeholder}
      />
    </div>
  );
}

// Inline number edit with currency formatting
interface InlineCurrencyCellProps {
  value: number; // cents
  onSave: (value: number) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
}

export function InlineCurrencyCell({
  value,
  onSave,
  className,
  disabled = false,
}: InlineCurrencyCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState((value / 100).toString());
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue((value / 100).toString());
  }, [value]);

  const handleSave = async () => {
    const numValue = Math.round(parseFloat(editValue) * 100);
    if (numValue === value || isNaN(numValue)) {
      setIsEditing(false);
      setEditValue((value / 100).toString());
      return;
    }

    setIsSaving(true);
    try {
      await onSave(numValue);
      setIsEditing(false);
    } catch (error) {
      setEditValue((value / 100).toString());
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue((value / 100).toString());
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

  if (disabled) {
    return (
      <span className={cn("text-[hsl(var(--admin-text))]", className)}>
        ${(value / 100).toLocaleString()}
      </span>
    );
  }

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={cn(
          "group inline-flex items-center gap-1 text-left hover:bg-[hsl(var(--admin-hover))] px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded transition-colors",
          className
        )}
      >
        <span>${(value / 100).toLocaleString()}</span>
        <Pencil className="h-3 w-3 text-[hsl(var(--admin-text-tertiary))] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-[hsl(var(--admin-text-muted))]">$</span>
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        disabled={isSaving}
        className="w-20 px-1.5 py-0.5 text-sm border border-[hsl(var(--admin-accent))] rounded bg-[hsl(var(--admin-surface))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--admin-accent-muted))]"
      />
    </div>
  );
}

// Inline number edit
interface InlineNumberCellProps {
  value: number;
  onSave: (value: number) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
}

export function InlineNumberCell({
  value,
  onSave,
  className,
  disabled = false,
  min,
  max,
}: InlineNumberCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value.toString());
  }, [value]);

  const handleSave = async () => {
    const numValue = parseInt(editValue);
    if (numValue === value || isNaN(numValue)) {
      setIsEditing(false);
      setEditValue(value.toString());
      return;
    }

    setIsSaving(true);
    try {
      await onSave(numValue);
      setIsEditing(false);
    } catch (error) {
      setEditValue(value.toString());
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value.toString());
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

  if (disabled) {
    return (
      <span className={cn("text-[hsl(var(--admin-text))]", className)}>
        {value.toLocaleString()}
      </span>
    );
  }

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className={cn(
          "group inline-flex items-center gap-1 text-left hover:bg-[hsl(var(--admin-hover))] px-1.5 py-0.5 -mx-1.5 -my-0.5 rounded transition-colors",
          className
        )}
      >
        <span>{value.toLocaleString()}</span>
        <Pencil className="h-3 w-3 text-[hsl(var(--admin-text-tertiary))] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleSave}
      disabled={isSaving}
      min={min}
      max={max}
      className="w-20 px-1.5 py-0.5 text-sm border border-[hsl(var(--admin-accent))] rounded bg-[hsl(var(--admin-surface))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--admin-accent-muted))]"
    />
  );
}

// Inline status/select cell with badge display
interface InlineStatusCellProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string; intent?: "success" | "warning" | "danger" | "info" | "neutral" }>;
  onSave: (value: T) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
}

export function InlineStatusCell<T extends string>({
  value,
  options,
  onSave,
  className,
  disabled = false,
}: InlineStatusCellProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find(o => o.value === value) || options[0];

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

  const handleSelect = async (newValue: T) => {
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
      <AdminBadge intent={currentOption?.intent || "neutral"}>
        {currentOption?.label}
      </AdminBadge>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSaving}
        className={cn(
          "group inline-flex items-center gap-1 cursor-pointer",
          className
        )}
      >
        <AdminBadge intent={currentOption?.intent || "neutral"}>
          {currentOption?.label}
          <ChevronDown className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </AdminBadge>
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 py-1 bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] rounded-md shadow-lg min-w-[120px]">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm hover:bg-[hsl(var(--admin-hover))] transition-colors",
                option.value === value && "bg-[hsl(var(--admin-hover))]"
              )}
            >
              <AdminBadge intent={option.intent || "neutral"} size="sm">
                {option.label}
              </AdminBadge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline toggle/switch cell
interface InlineToggleCellProps {
  value: boolean;
  onSave: (value: boolean) => Promise<void> | void;
  className?: string;
  disabled?: boolean;
  labels?: { on: string; off: string };
}

export function InlineToggleCell({
  value,
  onSave,
  className,
  disabled = false,
  labels = { on: "Yes", off: "No" },
}: InlineToggleCellProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async () => {
    if (disabled || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(!value);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={disabled || isSaving}
      className={cn(
        "inline-flex items-center cursor-pointer",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <AdminBadge intent={value ? "success" : "neutral"}>
        {value ? labels.on : labels.off}
      </AdminBadge>
    </button>
  );
}
