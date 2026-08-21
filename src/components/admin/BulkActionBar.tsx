/**
 * BulkActionBar - Floating action bar for bulk operations
 * 
 * Shows when items are selected, with actions and keyboard hints
 */

import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminButton } from "@/components/admin";
import { X, Trash2, Mail, Download, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClearSelection: () => void;
  className?: string;
  position?: "bottom" | "top";
}

export function BulkActionBar({
  selectedCount,
  actions,
  onClearSelection,
  className,
  position = "bottom",
}: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: position === "bottom" ? 20 : -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: position === "bottom" ? 20 : -20 }}
          className={cn(
            "fixed left-1/2 -translate-x-1/2 z-50",
            "flex items-center gap-3 px-4 py-3",
            "bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]",
            "rounded-full shadow-lg",
            position === "bottom" ? "bottom-6" : "top-20",
            className
          )}
        >
          {/* Selection count */}
          <div className="flex items-center gap-2 pr-3 border-r border-[hsl(var(--admin-border))]">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[hsl(var(--admin-accent))] text-white text-xs font-medium">
              {selectedCount}
            </span>
            <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
              selected
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {actions.map((action, i) => (
              <AdminButton
                key={i}
                variant={action.variant === "destructive" ? "adminDestructive" : "adminOutline"}
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
                className="h-8"
              >
                {action.icon}
                <span className="hidden sm:inline">{action.label}</span>
              </AdminButton>
            ))}
          </div>

          {/* Clear selection */}
          <AdminButton
            variant="adminGhost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 w-8 p-0"
            title="Clear selection (Esc)"
          >
            <X className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          </AdminButton>

          {/* Keyboard hint */}
          <span className="hidden md:block text-xs text-[hsl(var(--admin-text-muted))] pl-2 border-l border-[hsl(var(--admin-border))]">
            Esc to clear
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Common bulk action presets
export const commonBulkActions = {
  email: (onClick: () => void): BulkAction => ({
    label: "Email",
    icon: <Mail className="h-4 w-4" />,
    onClick,
  }),
  export: (onClick: () => void): BulkAction => ({
    label: "Export",
    icon: <Download className="h-4 w-4" />,
    onClick,
  }),
  tag: (onClick: () => void): BulkAction => ({
    label: "Tag",
    icon: <Tag className="h-4 w-4" />,
    onClick,
  }),
  delete: (onClick: () => void): BulkAction => ({
    label: "Delete",
    icon: <Trash2 className="h-4 w-4" />,
    onClick,
    variant: "destructive",
  }),
};
