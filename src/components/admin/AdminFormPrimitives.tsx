/**
 * Admin Form Primitives
 * 
 * Thin wrappers around Radix/shadcn form primitives that enforce Admin tokens.
 * These maintain identical behavior to underlying primitives but ensure visual consistency.
 * 
 * RULES:
 * - All styling uses Admin tokens only
 * - Border, radius, focus match AdminInput patterns
 * - Mobile: touch targets >= 44px
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// ============ ADMIN LABEL ============

export interface AdminLabelProps extends React.ComponentProps<typeof Label> {
  required?: boolean;
  error?: boolean;
}

export const AdminLabel = React.forwardRef<HTMLLabelElement, AdminLabelProps>(
  ({ className, children, required, error, ...props }, ref) => (
    <Label
      ref={ref}
      className={cn(
        "text-sm font-medium text-[hsl(var(--admin-text))]",
        error && "text-[hsl(var(--admin-error))]",
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="text-[hsl(var(--admin-error))] ml-0.5">*</span>
      )}
    </Label>
  )
);
AdminLabel.displayName = "AdminLabel";

// ============ ADMIN TEXTAREA ============

export interface AdminTextareaProps extends React.ComponentProps<typeof Textarea> {
  error?: boolean;
}

export const AdminTextarea = React.forwardRef<HTMLTextAreaElement, AdminTextareaProps>(
  ({ className, error, ...props }, ref) => (
    <Textarea
      ref={ref}
      className={cn(
        // Base styles matching AdminInput
        "w-full rounded-md border bg-[hsl(var(--admin-surface))]",
        "text-sm text-[hsl(var(--admin-text))] placeholder:text-[hsl(var(--admin-text-muted))]",
        "transition-colors resize-none",
        // Border states
        error 
          ? "border-[hsl(var(--admin-error))] focus:ring-[hsl(var(--admin-error))]"
          : "border-[hsl(var(--admin-border))] focus:ring-[hsl(var(--admin-accent))]",
        // Focus state
        "focus:outline-none focus:ring-2 focus:border-transparent",
        // Disabled
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[hsl(var(--admin-hover))]",
        // Touch target (mobile)
        "min-h-[44px] py-2.5 px-3",
        className
      )}
      {...props}
    />
  )
);
AdminTextarea.displayName = "AdminTextarea";

// ============ ADMIN CHECKBOX ============

export interface AdminCheckboxProps extends React.ComponentProps<typeof Checkbox> {
  error?: boolean;
}

export const AdminCheckbox = React.forwardRef<
  React.ElementRef<typeof Checkbox>,
  AdminCheckboxProps
>(({ className, error, ...props }, ref) => (
  <Checkbox
    ref={ref}
    className={cn(
      // Size: 20x20 for touch (≥44px with padding)
      "h-5 w-5 rounded",
      // Border and background
      "border-[hsl(var(--admin-border-strong))] bg-[hsl(var(--admin-surface))]",
      // Checked state - use accent for softer look
      "data-[state=checked]:bg-[hsl(var(--admin-accent))] data-[state=checked]:border-[hsl(var(--admin-accent))]",
      "data-[state=checked]:text-white",
      // Focus
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--admin-accent))] focus-visible:ring-offset-2",
      // Disabled
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Error
      error && "border-[hsl(var(--admin-error))]",
      className
    )}
    {...props}
  />
));
AdminCheckbox.displayName = "AdminCheckbox";

// ============ ADMIN SWITCH ============

export interface AdminSwitchProps extends React.ComponentProps<typeof Switch> {}

export const AdminSwitch = React.forwardRef<
  React.ElementRef<typeof Switch>,
  AdminSwitchProps
>(({ className, ...props }, ref) => (
  <Switch
    ref={ref}
    className={cn(
      // Size for touch target
      "h-6 w-11",
      // Track
      "bg-[hsl(var(--admin-border-strong))]",
      "data-[state=checked]:bg-[hsl(var(--admin-primary))]",
      // Focus
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--admin-accent))] focus-visible:ring-offset-2",
      // Disabled
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
AdminSwitch.displayName = "AdminSwitch";

// ============ ADMIN RADIO GROUP ============

export interface AdminRadioGroupProps extends React.ComponentProps<typeof RadioGroup> {}

export const AdminRadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroup>,
  AdminRadioGroupProps
>(({ className, ...props }, ref) => (
  <RadioGroup
    ref={ref}
    className={cn("grid gap-2", className)}
    {...props}
  />
));
AdminRadioGroup.displayName = "AdminRadioGroup";

// ============ ADMIN RADIO GROUP ITEM ============

export interface AdminRadioGroupItemProps extends React.ComponentProps<typeof RadioGroupItem> {}

export const AdminRadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupItem>,
  AdminRadioGroupItemProps
>(({ className, ...props }, ref) => (
  <RadioGroupItem
    ref={ref}
    className={cn(
      // Size for touch
      "h-5 w-5",
      // Border and background
      "border-[hsl(var(--admin-border-strong))] text-[hsl(var(--admin-primary))]",
      // Focus
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--admin-accent))] focus-visible:ring-offset-2",
      // Disabled
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
AdminRadioGroupItem.displayName = "AdminRadioGroupItem";

// ============ FORM FIELD WRAPPER ============
// Convenience wrapper for label + input + error message

export interface AdminFormFieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function AdminFormField({
  label,
  required,
  error,
  hint,
  children,
  className,
}: AdminFormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <AdminLabel required={required} error={!!error}>
          {label}
        </AdminLabel>
      )}
      {children}
      {hint && !error && (
        <p className="text-xs text-[hsl(var(--admin-text-muted))]">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-[hsl(var(--admin-error))]">{error}</p>
      )}
    </div>
  );
}
