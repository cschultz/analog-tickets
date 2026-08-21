/**
 * Admin Confirmation Dialog
 * 
 * Use this for all destructive or high-impact actions that require user confirmation.
 * Built on AdminDialog primitives for consistent admin styling.
 * 
 * Action hierarchy:
 * - Safe actions (view/export/email): No confirmation needed
 * - Reversible actions (transfer): Optional confirmation with explanation
 * - Destructive actions (refund/archive/delete): REQUIRED confirmation with consequences
 */

import * as React from "react";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogDescription,
  AdminDialogBody,
  AdminDialogFooter,
} from "@/components/admin/AdminDialog";
import { AdminButton } from "./AdminUI";
import { AlertTriangle, Trash2, RefreshCcw, Archive, Ban, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionType = "destructive" | "warning" | "danger";

export interface AdminConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  consequences?: string[];
  scope?: string; // e.g., "This action affects the current event only"
  actionType?: ActionType;
  actionLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  icon?: "refund" | "archive" | "delete" | "warning" | "ban";
}

const iconMap = {
  refund: DollarSign,
  archive: Archive,
  delete: Trash2,
  warning: AlertTriangle,
  ban: Ban,
};

const actionTypeStyles = {
  destructive: {
    iconBg: "bg-[hsl(var(--admin-error-muted))]",
    iconColor: "text-[hsl(var(--admin-error))]",
    titleColor: "text-[hsl(var(--admin-error))]",
    buttonVariant: "adminDestructive" as const,
  },
  warning: {
    iconBg: "bg-[hsl(var(--admin-warning-muted))]",
    iconColor: "text-[hsl(var(--admin-warning))]",
    titleColor: "text-[hsl(var(--admin-warning))]",
    buttonVariant: "admin" as const,
  },
  danger: {
    iconBg: "bg-[hsl(var(--admin-error-muted))]",
    iconColor: "text-[hsl(var(--admin-error))]",
    titleColor: "text-[hsl(var(--admin-error))]",
    buttonVariant: "adminDestructive" as const,
  },
};

export function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  scope,
  actionType = "destructive",
  actionLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  isLoading,
  icon = "warning",
}: AdminConfirmDialogProps) {
  const IconComponent = iconMap[icon];
  const styles = actionTypeStyles[actionType];

  return (
    <AdminDialog open={open} onOpenChange={onOpenChange}>
      <AdminDialogContent size="sm" showClose={false}>
        <AdminDialogHeader>
          <div className="flex items-start gap-3">
            <div className={cn("p-2 rounded-full shrink-0", styles.iconBg)}>
              <IconComponent className={cn("h-5 w-5", styles.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <AdminDialogTitle className={styles.titleColor}>
                {title}
              </AdminDialogTitle>
              {description && (
                <AdminDialogDescription>
                  {description}
                </AdminDialogDescription>
              )}
            </div>
          </div>
        </AdminDialogHeader>

        {(consequences || scope) && (
          <AdminDialogBody>
            <div className="space-y-3">
              {consequences && consequences.length > 0 && (
                <div className="bg-[hsl(var(--admin-hover))] p-4 rounded-lg">
                  <p className="text-sm font-medium text-[hsl(var(--admin-text))] mb-2">
                    This action will:
                  </p>
                  <ul className="list-disc list-inside text-sm text-[hsl(var(--admin-text-secondary))] space-y-1">
                    {consequences.map((consequence, i) => (
                      <li key={i}>{consequence}</li>
                    ))}
                  </ul>
                </div>
              )}

              {scope && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[hsl(var(--admin-info-muted))] rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--admin-info))] shrink-0" />
                  <p className="text-sm text-[hsl(var(--admin-info))]">{scope}</p>
                </div>
              )}
            </div>
          </AdminDialogBody>
        )}

        <AdminDialogFooter>
          <AdminButton
            variant="adminOutline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant={styles.buttonVariant}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isLoading}
            isLoading={isLoading}
          >
            {actionLabel}
          </AdminButton>
        </AdminDialogFooter>
      </AdminDialogContent>
    </AdminDialog>
  );
}
