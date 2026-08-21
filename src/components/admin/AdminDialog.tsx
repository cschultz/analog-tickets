/**
 * AdminDialog
 * 
 * Modal dialog with Admin styling.
 * Uses AdminOverlay surface, border, and shadow patterns.
 * 
 * RULES:
 * - All styling uses Admin tokens
 * - Mobile: Full-width, bottom-anchored on small screens
 * - Focus trap and accessible
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import { AdminButton } from "./AdminUI";

// ============ ADMIN DIALOG ============

export interface AdminDialogProps extends React.ComponentProps<typeof Dialog> {}

export function AdminDialog({ children, ...props }: AdminDialogProps) {
  return <Dialog {...props}>{children}</Dialog>;
}

// ============ ADMIN DIALOG TRIGGER ============

export const AdminDialogTrigger = DialogTrigger;

// ============ ADMIN DIALOG CONTENT ============

export interface AdminDialogContentProps extends React.ComponentProps<typeof DialogContent> {
  /** Size preset */
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** Show close button */
  showClose?: boolean;
}

export const AdminDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  AdminDialogContentProps
>(({ className, children, size = "md", showClose = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className="bg-black/40 backdrop-blur-[2px]" />
    <DialogContent
      ref={ref}
      className={cn(
        // Admin theme scoping
        "admin-theme font-admin",
        // AdminOverlay surface styling
        "bg-[hsl(var(--admin-surface))]",
        "border border-[hsl(var(--admin-border-strong))]",
        "shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
        "rounded-lg",
        // Padding
        "p-0",
        // Remove default close button styling
        "[&>button]:hidden",
        // Size variants
        size === "sm" && "max-w-sm",
        size === "md" && "max-w-md",
        size === "lg" && "max-w-lg",
        size === "xl" && "max-w-xl",
        size === "full" && "max-w-[calc(100vw-2rem)] sm:max-w-[90vw]",
        // Mobile: full width, near bottom
        "w-[calc(100vw-2rem)] sm:w-auto",
        className
      )}
      {...props}
    >
      {children}
      {showClose && (
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-[hsl(var(--admin-surface))] transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-accent))] focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <span className="sr-only">Close</span>
        </DialogClose>
      )}
    </DialogContent>
  </DialogPortal>
));
AdminDialogContent.displayName = "AdminDialogContent";

// ============ ADMIN DIALOG HEADER ============

export interface AdminDialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AdminDialogHeader({ className, ...props }: AdminDialogHeaderProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-b border-[hsl(var(--admin-border))]",
        className
      )}
      {...props}
    />
  );
}

// ============ ADMIN DIALOG TITLE ============

export interface AdminDialogTitleProps extends React.ComponentProps<typeof DialogTitle> {
  icon?: React.ReactNode;
}

export const AdminDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogTitle>,
  AdminDialogTitleProps
>(({ className, children, icon, ...props }, ref) => (
  <DialogTitle
    ref={ref}
    className={cn(
      "text-lg font-semibold text-[hsl(var(--admin-text))] flex items-center gap-2",
      className
    )}
    {...props}
  >
    {icon}
    {children}
  </DialogTitle>
));
AdminDialogTitle.displayName = "AdminDialogTitle";

// ============ ADMIN DIALOG DESCRIPTION ============

export interface AdminDialogDescriptionProps extends React.ComponentProps<typeof DialogDescription> {}

export const AdminDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogDescription>,
  AdminDialogDescriptionProps
>(({ className, ...props }, ref) => (
  <DialogDescription
    ref={ref}
    className={cn(
      "text-sm text-[hsl(var(--admin-text-secondary))] mt-1",
      className
    )}
    {...props}
  />
));
AdminDialogDescription.displayName = "AdminDialogDescription";

// ============ ADMIN DIALOG BODY ============

export interface AdminDialogBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AdminDialogBody({ className, ...props }: AdminDialogBodyProps) {
  return (
    <div
      className={cn("px-6 py-4", className)}
      {...props}
    />
  );
}

// ============ ADMIN DIALOG FOOTER ============

export interface AdminDialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AdminDialogFooter({ className, ...props }: AdminDialogFooterProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-[hsl(var(--admin-border))]",
        "flex flex-col-reverse sm:flex-row sm:justify-end gap-2",
        className
      )}
      {...props}
    />
  );
}

// ============ ADMIN CONFIRM DIALOG (EXPANDED) ============

export type AdminConfirmIntent = "default" | "danger" | "warning" | "success" | "info";

export interface AdminConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  intent?: AdminConfirmIntent;
  isLoading?: boolean;
  /** Additional content to show in dialog body */
  children?: React.ReactNode;
}

const intentIcons: Record<AdminConfirmIntent, React.ReactNode> = {
  default: null,
  danger: <AlertTriangle className="h-5 w-5 text-[hsl(var(--admin-error))]" />,
  warning: <AlertCircle className="h-5 w-5 text-[hsl(var(--admin-warning))]" />,
  success: <CheckCircle className="h-5 w-5 text-[hsl(var(--admin-success))]" />,
  info: <Info className="h-5 w-5 text-[hsl(var(--admin-info))]" />,
};

const intentButtonVariants: Record<AdminConfirmIntent, "admin" | "adminDestructive"> = {
  default: "admin",
  danger: "adminDestructive",
  warning: "admin",
  success: "admin",
  info: "admin",
};

export function AdminConfirmDialogExpanded({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  intent = "default",
  isLoading = false,
  children,
}: AdminConfirmDialogProps) {
  const [isPending, setIsPending] = React.useState(false);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsPending(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const loading = isLoading || isPending;

  return (
    <AdminDialog open={open} onOpenChange={onOpenChange}>
      <AdminDialogContent size="sm" showClose={false}>
        <AdminDialogHeader>
          <AdminDialogTitle icon={intentIcons[intent]}>
            {title}
          </AdminDialogTitle>
          {description && (
            <AdminDialogDescription>{description}</AdminDialogDescription>
          )}
        </AdminDialogHeader>

        {children && (
          <AdminDialogBody>{children}</AdminDialogBody>
        )}

        <AdminDialogFooter>
          <AdminButton
            variant="adminOutline"
            onClick={handleCancel}
            disabled={loading}
          >
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant={intentButtonVariants[intent]}
            onClick={handleConfirm}
            isLoading={loading}
          >
            {confirmLabel}
          </AdminButton>
        </AdminDialogFooter>
      </AdminDialogContent>
    </AdminDialog>
  );
}
