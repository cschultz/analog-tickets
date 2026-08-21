/**
 * AdminSelect
 * 
 * Select component that uses AdminOverlay for dropdown styling.
 * On mobile, opens as a Sheet instead of a small popover.
 * 
 * RULES:
 * - Desktop: Standard dropdown below trigger
 * - Mobile: Full-height Sheet with large touch targets
 * - All styling uses Admin tokens
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Check, ChevronDown, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";

// ============ ADMIN SELECT ============

export interface AdminSelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Title shown in mobile sheet */
  mobileTitle?: string;
}

export function AdminSelect({
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select...",
  disabled,
  error,
  children,
  className,
  mobileTitle = "Select an option",
}: AdminSelectProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  
  const currentValue = value !== undefined ? value : internalValue;
  
  const handleValueChange = (newValue: string) => {
    if (value === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
    setOpen(false);
  };

  // Extract options from children for mobile sheet
  const options = React.useMemo(() => {
    const items: { value: string; label: React.ReactNode; disabled?: boolean }[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === AdminSelectItem) {
        items.push({
          value: child.props.value,
          label: child.props.children,
          disabled: child.props.disabled,
        });
      }
    });
    return items;
  }, [children]);

  // Desktop: Use standard Select with styled content
  if (!isMobile) {
    return (
      <Select
        value={currentValue}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        open={open}
        onOpenChange={setOpen}
      >
        <SelectTrigger
          className={cn(
            // Base styles matching AdminInput
            "h-10 w-full rounded-md border bg-[hsl(var(--admin-surface))]",
            "text-sm text-[hsl(var(--admin-text))]",
            "transition-colors",
            // Border states
            error
              ? "border-[hsl(var(--admin-error))]"
              : "border-[hsl(var(--admin-border))]",
            // Focus
            "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-accent))] focus:border-transparent",
            // Disabled
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[hsl(var(--admin-hover))]",
            className
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className={cn(
            // AdminOverlay styling
            "bg-[hsl(var(--admin-surface))]",
            "border border-[hsl(var(--admin-border-strong))]",
            "rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
            "z-50"
          )}
        >
          {children}
        </SelectContent>
      </Select>
    );
  }

  // Mobile: Use Drawer for full-height sheet
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          // Base styles matching AdminInput
          "h-11 w-full rounded-md border bg-[hsl(var(--admin-surface))]",
          "px-3 text-sm text-left",
          "flex items-center justify-between",
          "transition-colors",
          // Border states
          error
            ? "border-[hsl(var(--admin-error))]"
            : "border-[hsl(var(--admin-border))]",
          // Disabled
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[hsl(var(--admin-hover))]",
          className
        )}
      >
        <span className={cn(!currentValue && "text-[hsl(var(--admin-text-muted))]")}>
          {currentValue
            ? options.find((o) => o.value === currentValue)?.label || currentValue
            : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="bg-[hsl(var(--admin-surface))]">
          <DrawerHeader className="border-b border-[hsl(var(--admin-border))]">
            <DrawerTitle className="text-[hsl(var(--admin-text))]">{mobileTitle}</DrawerTitle>
            <DrawerClose className="absolute right-4 top-4">
              <X className="h-5 w-5 text-[hsl(var(--admin-text-muted))]" />
            </DrawerClose>
          </DrawerHeader>
          <div className="p-2 max-h-[60vh] overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => handleValueChange(option.value)}
                className={cn(
                  // Large touch target
                  "w-full min-h-[48px] px-4 py-3",
                  "flex items-center justify-between",
                  "text-sm text-left rounded-md",
                  "transition-colors",
                  // States
                  currentValue === option.value
                    ? "bg-[hsl(var(--admin-selected))] text-[hsl(var(--admin-text))]"
                    : "text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))]",
                  // Disabled
                  option.disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <span>{option.label}</span>
                {currentValue === option.value && (
                  <Check className="h-5 w-5 text-[hsl(var(--admin-primary))]" />
                )}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

// ============ ADMIN SELECT ITEM ============

export interface AdminSelectItemProps extends React.ComponentProps<typeof SelectItem> {}

export const AdminSelectItem = React.forwardRef<
  React.ElementRef<typeof SelectItem>,
  AdminSelectItemProps
>(({ className, children, ...props }, ref) => (
  <SelectItem
    ref={ref}
    className={cn(
      // Touch target
      "min-h-[40px] py-2.5 px-3",
      "text-sm text-[hsl(var(--admin-text))]",
      "cursor-pointer outline-none",
      // Hover/Focus
      "focus:bg-[hsl(var(--admin-hover))]",
      "data-[highlighted]:bg-[hsl(var(--admin-hover))]",
      // Selected
      "data-[state=checked]:bg-[hsl(var(--admin-selected))]",
      // Disabled
      "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
      className
    )}
    {...props}
  >
    {children}
  </SelectItem>
));
AdminSelectItem.displayName = "AdminSelectItem";

// ============ ADMIN SELECT GROUP ============

export interface AdminSelectGroupProps extends React.ComponentProps<typeof SelectGroup> {}

export const AdminSelectGroup = React.forwardRef<
  React.ElementRef<typeof SelectGroup>,
  AdminSelectGroupProps
>(({ className, ...props }, ref) => (
  <SelectGroup ref={ref} className={cn("p-1", className)} {...props} />
));
AdminSelectGroup.displayName = "AdminSelectGroup";

// ============ ADMIN SELECT LABEL ============

export interface AdminSelectLabelProps extends React.ComponentProps<typeof SelectLabel> {}

export const AdminSelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectLabel>,
  AdminSelectLabelProps
>(({ className, ...props }, ref) => (
  <SelectLabel
    ref={ref}
    className={cn(
      "px-3 py-2 text-xs font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wider",
      className
    )}
    {...props}
  />
));
AdminSelectLabel.displayName = "AdminSelectLabel";

// ============ ADMIN SELECT SEPARATOR ============

export const AdminSelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectSeparator>,
  React.ComponentProps<typeof SelectSeparator>
>(({ className, ...props }, ref) => (
  <SelectSeparator
    ref={ref}
    className={cn("h-px my-1 mx-2 bg-[hsl(var(--admin-divider))]", className)}
    {...props}
  />
));
AdminSelectSeparator.displayName = "AdminSelectSeparator";
