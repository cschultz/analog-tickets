/**
 * Admin UI Component Library
 * 
 * These are the canonical admin components. Use these instead of creating
 * one-off styled components on individual pages.
 * 
 * RULES:
 * - NO ORANGE anywhere
 * - Use semantic tokens only (admin-success, admin-warning, admin-error, etc.)
 * - No hardcoded hex colors
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Search, 
  Filter, 
  Download, 
  Plus, 
  FileText, 
  Loader2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

// ============ ADMIN BUTTON ============
// Re-export the button with admin variants for clarity

export interface AdminButtonProps extends React.ComponentProps<typeof Button> {
  isLoading?: boolean;
}

export const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(
  ({ children, isLoading, disabled, variant = "admin", asChild, ...props }, ref) => {
    // When asChild is used, we can't add the loading spinner as a sibling
    // because Slot expects exactly one child element
    if (asChild) {
      return (
        <Button
          ref={ref}
          variant={variant}
          disabled={disabled || isLoading}
          asChild
          {...props}
        >
          {children}
        </Button>
      );
    }

    return (
      <Button
        ref={ref}
        variant={variant}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {children}
      </Button>
    );
  }
);
AdminButton.displayName = "AdminButton";

// ============ ADMIN INPUT ============

export interface AdminInputProps extends React.ComponentProps<typeof Input> {
  compact?: boolean;
}

export const AdminInput = React.forwardRef<HTMLInputElement, AdminInputProps>(
  ({ className, compact, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        className={cn(
          compact && "h-9",
          className
        )}
        {...props}
      />
    );
  }
);
AdminInput.displayName = "AdminInput";

// ============ ADMIN SEARCH INPUT ============

export interface AdminSearchInputProps extends React.ComponentProps<"input"> {
  compact?: boolean;
  onSearch?: (value: string) => void;
}

export const AdminSearchInput = React.forwardRef<HTMLInputElement, AdminSearchInputProps>(
  ({ className, compact, placeholder = "Search...", onChange, onSearch, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
      onSearch?.(e.target.value);
    };

    return (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
        <input
          ref={ref}
          type="text"
          placeholder={placeholder}
          onChange={handleChange}
          className={cn(
            "pl-10 pr-3 py-2 w-full rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]",
            "text-sm text-[hsl(var(--admin-text))] placeholder:text-[hsl(var(--admin-text-muted))]",
            "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-accent))] focus:border-transparent",
            "transition-colors",
            compact ? "h-9" : "h-10",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
AdminSearchInput.displayName = "AdminSearchInput";

// ============ ADMIN TABS ============

export interface AdminTabsProps extends React.ComponentProps<typeof Tabs> {}

export const AdminTabs = React.forwardRef<
  React.ElementRef<typeof Tabs>,
  AdminTabsProps
>(({ className, ...props }, ref) => (
  <Tabs ref={ref} className={cn("w-full", className)} {...props} />
));
AdminTabs.displayName = "AdminTabs";

export interface AdminTabsListProps extends React.ComponentProps<typeof TabsList> {}

export const AdminTabsList = React.forwardRef<
  React.ElementRef<typeof TabsList>,
  AdminTabsListProps
>(({ className, ...props }, ref) => (
  <TabsList 
    ref={ref} 
    className={cn(
      "h-10 bg-transparent border-b border-[hsl(var(--admin-border))] rounded-none p-0 gap-0",
      className
    )} 
    {...props} 
  />
));
AdminTabsList.displayName = "AdminTabsList";

export interface AdminTabsTriggerProps extends React.ComponentProps<typeof TabsTrigger> {}

export const AdminTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsTrigger>,
  AdminTabsTriggerProps
>(({ className, ...props }, ref) => (
  <TabsTrigger 
    ref={ref} 
    className={cn(
      "relative h-10 px-4 py-2 rounded-none bg-transparent",
      "text-sm font-medium text-[hsl(var(--admin-text-secondary))]",
      "hover:text-[hsl(var(--admin-text))]",
      "data-[state=active]:text-[hsl(var(--admin-text))]",
      "data-[state=active]:shadow-none",
      "data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0",
      "data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[hsl(var(--admin-primary))]",
      "transition-colors",
      className
    )} 
    {...props} 
  />
));
AdminTabsTrigger.displayName = "AdminTabsTrigger";

export const AdminTabsContent = TabsContent;

// ============ ADMIN BADGE ============

const adminBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium text-xs px-2.5 py-1 border-0",
  {
    variants: {
      intent: {
        neutral: "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-secondary))]",
        success: "bg-[hsl(var(--admin-success-muted))] text-[hsl(var(--admin-success))]",
        warning: "bg-[hsl(var(--admin-warning-muted))] text-[hsl(var(--admin-warning))]",
        danger: "bg-[hsl(var(--admin-error-muted))] text-[hsl(var(--admin-error))]",
        info: "bg-[hsl(var(--admin-info-muted))] text-[hsl(var(--admin-info))]",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: {
      intent: "neutral",
      size: "md",
    },
  }
);

export interface AdminBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof adminBadgeVariants> {
  showDot?: boolean;
}

export function AdminBadge({ 
  className, 
  intent, 
  size, 
  showDot = false,
  children,
  ...props 
}: AdminBadgeProps) {
  return (
    <span className={cn(adminBadgeVariants({ intent, size }), className)} {...props}>
      {showDot && (
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          intent === "success" && "bg-[hsl(var(--admin-success))]",
          intent === "warning" && "bg-[hsl(var(--admin-warning))]",
          intent === "danger" && "bg-[hsl(var(--admin-error))]",
          intent === "info" && "bg-[hsl(var(--admin-info))]",
          (!intent || intent === "neutral") && "bg-[hsl(var(--admin-text-muted))]"
        )} />
      )}
      {children}
    </span>
  );
}

// ============ ADMIN TOOLBAR ============

export interface AdminToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function AdminToolbar({ className, children, ...props }: AdminToolbarProps) {
  return (
    <div 
      className={cn(
        "flex flex-col sm:flex-row justify-between gap-4 mb-6",
        className
      )} 
      {...props}
    >
      {children}
    </div>
  );
}

export interface AdminToolbarLeftProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AdminToolbarLeft({ className, children, ...props }: AdminToolbarLeftProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} {...props}>
      {children}
    </div>
  );
}

export interface AdminToolbarRightProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AdminToolbarRight({ className, children, ...props }: AdminToolbarRightProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      {children}
    </div>
  );
}

// ============ ADMIN TABLE ============

export interface AdminTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function AdminTable({ className, children, ...props }: AdminTableProps) {
  return (
    <div 
      className={cn(
        "rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] overflow-hidden",
        className
      )} 
      {...props}
    >
      <Table>{children}</Table>
    </div>
  );
}

export const AdminTableHeader = TableHeader;
export const AdminTableBody = TableBody;
export const AdminTableRow = TableRow;
export const AdminTableHead = TableHead;
export const AdminTableCell = TableCell;

// ============ ADMIN TABLE EMPTY STATE ============

export interface AdminTableEmptyProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  /** @deprecated kept for backward compatibility */
  colSpan?: number;
  /** @deprecated use `title` instead */
  message?: string;
}

export function AdminTableEmpty({ 
  icon, 
  title,
  description = "Try adjusting your search or filter to find what you're looking for.",
  action,
  colSpan = 100,
  message,
}: AdminTableEmptyProps) {
  const heading = title ?? message ?? "No results found";
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-48">
        <div className="flex flex-col items-center justify-center text-center py-8">
          <div className="h-12 w-12 rounded-full bg-[hsl(var(--admin-hover))] flex items-center justify-center mb-4">
            {icon || <FileText className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />}
          </div>
          <h3 className="text-base font-medium mb-1">{heading}</h3>
          <p className="text-sm text-[hsl(var(--admin-text-secondary))] mb-4 max-w-sm">
            {description}
          </p>
          {action}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============ ADMIN TABLE LOADING ============

export interface AdminTableLoadingProps {
  rows?: number;
  cols?: number;
}

export function AdminTableLoading({ rows = 5, cols = 4 }: AdminTableLoadingProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <div className="h-4 bg-[hsl(var(--admin-hover))] rounded animate-pulse" 
                style={{ width: `${60 + Math.random() * 30}%` }} 
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ============ ADMIN EMPTY STATE ============

export interface AdminEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function AdminEmptyState({ 
  icon, 
  title, 
  description,
  action,
  className
}: AdminEmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-16 text-center",
      className
    )}>
      <div className="h-14 w-14 rounded-full bg-[hsl(var(--admin-hover))] flex items-center justify-center mb-4">
        {icon || <FileText className="h-7 w-7 text-[hsl(var(--admin-text-muted))]" />}
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[hsl(var(--admin-text-secondary))] mb-6 max-w-md">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

// ============ ADMIN STAT CARD ============

export interface AdminStatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
}

export function AdminStatCard({ 
  title, 
  value, 
  description,
  icon,
  trend,
  className
}: AdminStatCardProps) {
  return (
    <div className={cn(
      "p-5 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]",
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[hsl(var(--admin-text-secondary))]">
          {title}
        </span>
        {icon && (
          <span className="text-[hsl(var(--admin-text-muted))]">
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-[hsl(var(--admin-text))]">
          {value}
        </span>
        {trend && (
          <span className={cn(
            "text-sm font-medium",
            trend.positive ? "text-[hsl(var(--admin-success))]" : "text-[hsl(var(--admin-error))]"
          )}>
            {trend.value}
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
          {description}
        </p>
      )}
    </div>
  );
}

// ============ ADMIN PAGINATION ============

export interface AdminPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function AdminPagination({ 
  currentPage, 
  totalPages, 
  onPageChange,
  className
}: AdminPaginationProps) {
  return (
    <div className={cn("flex items-center justify-between mt-4", className)}>
      <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="adminOutline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="adminOutline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
