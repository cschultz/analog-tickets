/**
 * AdminViewToggle - Toggle button group for switching between views
 * 
 * Used for edit/preview, table/kanban, and similar view mode toggles
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ViewOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface AdminViewToggleProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ViewOption<T>[];
  size?: "sm" | "md";
  className?: string;
}

export function AdminViewToggle<T extends string>({
  value,
  onValueChange,
  options,
  size = "sm",
  className,
}: AdminViewToggleProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-[hsl(var(--admin-border))] overflow-hidden",
        className
      )}
      role="group"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onValueChange(option.value)}
          className={cn(
            "inline-flex items-center justify-center font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--admin-ring))] focus-visible:ring-offset-1",
            size === "sm" && "px-3 py-1.5 text-xs gap-1",
            size === "md" && "px-4 py-2 text-sm gap-1.5",
            value === option.value
              ? "bg-[hsl(var(--admin-primary))] text-white"
              : "bg-transparent text-[hsl(var(--admin-muted-foreground))] hover:bg-[hsl(var(--admin-card-hover))]"
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
