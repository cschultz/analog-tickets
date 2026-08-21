/**
 * AdminCollapsible
 * 
 * Expandable/collapsible section with Admin styling.
 * 
 * RULES:
 * - All styling uses Admin tokens
 * - Touch targets >= 44px on trigger
 * - Smooth animation on expand/collapse
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ============ ADMIN COLLAPSIBLE ============

export interface AdminCollapsibleProps extends React.ComponentProps<typeof Collapsible> {}

export function AdminCollapsible({ className, ...props }: AdminCollapsibleProps) {
  return (
    <Collapsible
      className={cn("w-full", className)}
      {...props}
    />
  );
}

// ============ ADMIN COLLAPSIBLE TRIGGER ============

export interface AdminCollapsibleTriggerProps {
  children: React.ReactNode;
  className?: string;
  /** Show chevron indicator */
  showChevron?: boolean;
}

export function AdminCollapsibleTrigger({
  children,
  className,
  showChevron = true,
}: AdminCollapsibleTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        // Touch target
        "min-h-[44px] w-full",
        "px-4 py-3",
        "flex items-center justify-between gap-2",
        // Styling
        "text-sm font-medium text-[hsl(var(--admin-text))]",
        "bg-[hsl(var(--admin-surface))]",
        "border border-[hsl(var(--admin-border))]",
        "rounded-lg",
        // Hover/Focus
        "hover:bg-[hsl(var(--admin-hover))]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--admin-accent))]",
        // Transition
        "transition-colors",
        // Chevron rotation
        "[&[data-state=open]>svg]:rotate-180",
        className
      )}
    >
      {children}
      {showChevron && (
        <ChevronDown className="h-4 w-4 text-[hsl(var(--admin-text-muted))] transition-transform duration-200" />
      )}
    </CollapsibleTrigger>
  );
}

// ============ ADMIN COLLAPSIBLE CONTENT ============

export interface AdminCollapsibleContentProps {
  children: React.ReactNode;
  className?: string;
}

export function AdminCollapsibleContent({
  children,
  className,
}: AdminCollapsibleContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        "overflow-hidden",
        "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        className
      )}
    >
      <div
        className={cn(
          "px-4 py-3",
          "border border-t-0 border-[hsl(var(--admin-border))]",
          "rounded-b-lg",
          "bg-[hsl(var(--admin-surface))]"
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

// ============ ADMIN ACCORDION-STYLE COLLAPSIBLE ============
// Pre-composed version for common accordion pattern

export interface AdminAccordionItemProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function AdminAccordionItem({
  title,
  children,
  defaultOpen = false,
  className,
}: AdminAccordionItemProps) {
  return (
    <AdminCollapsible defaultOpen={defaultOpen} className={className}>
      <AdminCollapsibleTrigger>{title}</AdminCollapsibleTrigger>
      <AdminCollapsibleContent>{children}</AdminCollapsibleContent>
    </AdminCollapsible>
  );
}
