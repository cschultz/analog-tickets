/**
 * AdminOverlay - Single Source of Truth for Admin Popups, Dropdowns, and Menus
 * 
 * RULES:
 * - Background: white (admin-surface)
 * - Border: 1px neutral gray (admin-border)
 * - Border radius: medium (rounded-lg)
 * - Shadow: subtle, structural only
 * - No brand colors, no orange, no gradients
 * - Typography follows Admin Style Guide
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronRight } from "lucide-react";

// ============ ADMIN OVERLAY CONTAINER ============

export interface AdminOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}

export const AdminOverlay = React.forwardRef<HTMLDivElement, AdminOverlayProps>(
  ({ className, children, open = true, onClose, ...props }, _ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Handle click outside to dismiss
    React.useEffect(() => {
      if (!open) return;

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        if (containerRef.current && !containerRef.current.contains(target)) {
          onClose?.();
        }
      };

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          onClose?.();
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }, [open, onClose]);

    if (!open) return null;

    return (
      <div
        ref={containerRef}
        className={cn(
          // Core styling - white background, neutral border, medium radius, subtle shadow
          "bg-[hsl(var(--admin-surface))]",
          "border border-[hsl(var(--admin-border-strong))]",
          "rounded-lg",
          "shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
          // Animation
          "animate-in fade-in-0 zoom-in-95 duration-150",
          // Layout
          "min-w-[180px] max-w-[320px] py-1 overflow-hidden",
          // Z-index to float above content
          "z-50",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AdminOverlay.displayName = "AdminOverlay";

// ============ ADMIN MENU (Full Menu Component with Keyboard Nav) ============

export interface AdminMenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  children?: AdminMenuItem[];
}

export interface AdminMenuProps {
  items: AdminMenuItem[];
  onSelect?: (item: AdminMenuItem) => void;
  open?: boolean;
  onClose?: () => void;
  className?: string;
}

export function AdminMenu({ 
  items, 
  onSelect, 
  onClose,
  open = true,
  className
}: AdminMenuProps) {
  const [focusedIndex, setFocusedIndex] = React.useState(-1);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Filter out disabled items for keyboard navigation
  const navigableItems = items.filter(item => !item.disabled);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex(prev => 
            prev < navigableItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex(prev => 
            prev > 0 ? prev - 1 : navigableItems.length - 1
          );
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && navigableItems[focusedIndex]) {
            const item = navigableItems[focusedIndex];
            item.onClick?.();
            onSelect?.(item);
            if (!item.children) {
              onClose?.();
            }
          }
          break;
        case "Tab":
          // Close on Tab to allow focus to move naturally
          onClose?.();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, focusedIndex, navigableItems, onSelect, onClose]);

  // Focus the item when focusedIndex changes
  React.useEffect(() => {
    if (focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  const handleItemClick = (item: AdminMenuItem) => {
    if (item.disabled) return;
    item.onClick?.();
    onSelect?.(item);
    if (!item.children) {
      onClose?.();
    }
  };

  return (
    <AdminOverlay open={open} onClose={onClose} className={className}>
      <div role="menu" aria-orientation="vertical">
        {items.map((item) => {
          const navigableIndex = navigableItems.findIndex(n => n.id === item.id);
          
          return (
            <button
              key={item.id}
              ref={el => { itemRefs.current[navigableIndex] = el; }}
              role="menuitem"
              disabled={item.disabled}
              aria-disabled={item.disabled}
              tabIndex={focusedIndex === navigableIndex ? 0 : -1}
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => !item.disabled && setFocusedIndex(navigableIndex)}
              className={cn(
                "w-full text-left px-3 py-2 flex items-center gap-3",
                "text-sm font-normal",
                "outline-none transition-colors",
                // Default state
                "text-[hsl(var(--admin-text))]",
                // Hover/Focus state
                "hover:bg-[hsl(var(--admin-hover))] focus:bg-[hsl(var(--admin-hover))]",
                // Selected state
                item.selected && "bg-[hsl(var(--admin-selected))]",
                // Disabled state
                item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                // Destructive state
                item.destructive && "text-[hsl(var(--admin-error))] hover:bg-[hsl(var(--admin-error-muted))]"
              )}
            >
              {/* Icon */}
              {item.icon && (
                <span className={cn(
                  "flex-shrink-0 h-4 w-4",
                  item.destructive 
                    ? "text-[hsl(var(--admin-error))]" 
                    : "text-[hsl(var(--admin-text-muted))]"
                )}>
                  {item.icon}
                </span>
              )}
              
              {/* Label and Description */}
              <div className="flex-1 min-w-0">
                <div className="truncate">{item.label}</div>
                {item.description && (
                  <div className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                    {item.description}
                  </div>
                )}
              </div>

              {/* Badge/Status */}
              {item.badge && (
                <span className="flex-shrink-0">
                  {item.badge}
                </span>
              )}

              {/* Selected indicator */}
              {item.selected && !item.badge && (
                <Check className="h-4 w-4 text-[hsl(var(--admin-accent))]" />
              )}

              {/* Submenu indicator */}
              {item.children && item.children.length > 0 && (
                <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              )}
            </button>
          );
        })}
      </div>
    </AdminOverlay>
  );
}

// ============ ADMIN MENU SEPARATOR ============

export function AdminMenuSeparator({ className }: { className?: string }) {
  return (
    <div 
      role="separator"
      className={cn(
        "h-px my-1 mx-2 bg-[hsl(var(--admin-divider))]",
        className
      )} 
    />
  );
}

// ============ ADMIN MENU LABEL ============

export interface AdminMenuLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function AdminMenuLabel({ className, children, ...props }: AdminMenuLabelProps) {
  return (
    <div 
      className={cn(
        "px-3 py-2 text-xs font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wider",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============ ADMIN DROPDOWN TRIGGER ============
// A simple wrapper to help position the overlay relative to a trigger element

export interface AdminDropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  className?: string;
}

export function AdminDropdown({ 
  trigger, 
  children, 
  open: controlledOpen,
  onOpenChange,
  align = "start",
  className
}: AdminDropdownProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (value: boolean) => {
    if (!isControlled) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <div onClick={() => setOpen(!open)}>
        {trigger}
      </div>
      {open && (
        <div 
          className={cn(
            "absolute mt-1 z-50",
            // Apply overlay styling directly so children don't need to
            "bg-[hsl(var(--admin-surface))]",
            "border border-[hsl(var(--admin-border-strong))]",
            "rounded-lg",
            "shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
            "animate-in fade-in-0 zoom-in-95 duration-150",
            "overflow-hidden",
            align === "start" && "left-0",
            align === "center" && "left-1/2 -translate-x-1/2",
            align === "end" && "right-0"
          )}
        >
          {React.isValidElement(children)
            ? React.cloneElement(children as React.ReactElement<{ onClose?: () => void }>, {
                onClose: () => setOpen(false),
              })
            : children}
        </div>
      )}
    </div>
  );
}
