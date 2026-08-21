/**
 * AdminActionMenu - Pre-configured action menu for row-level actions
 * 
 * A convenience wrapper around AdminDropdown/AdminMenu specifically for
 * the common "more actions" pattern in tables and lists.
 */

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { AdminButton } from "./AdminUI";
import { AdminDropdown, AdminMenu, AdminMenuSeparator, AdminMenuItem } from "./AdminOverlay";
import { cn } from "@/lib/utils";

export interface AdminActionMenuProps {
  /** Menu items to display */
  items: AdminMenuItem[];
  /** Called when an item is selected */
  onSelect?: (item: AdminMenuItem) => void;
  /** Alignment of the dropdown */
  align?: "start" | "center" | "end";
  /** Optional custom trigger (defaults to MoreHorizontal icon button) */
  trigger?: React.ReactNode;
  /** Additional className for the container */
  className?: string;
  /** Size of the trigger button */
  size?: "sm" | "default";
}

export function AdminActionMenu({
  items,
  onSelect,
  align = "end",
  trigger,
  className,
  size = "sm"
}: AdminActionMenuProps) {
  const [open, setOpen] = React.useState(false);

  const defaultTrigger = (
    <AdminButton 
      variant="adminGhost" 
      size={size === "sm" ? "icon" : "default"} 
      className={cn("h-8 w-8 p-0", size !== "sm" && "h-9 w-9")}
      onClick={(e) => e.stopPropagation()}
    >
      <MoreHorizontal className="h-4 w-4" />
    </AdminButton>
  );

  return (
    <div className={cn("relative", className)} onClick={(e) => e.stopPropagation()}>
      <AdminDropdown
        open={open}
        onOpenChange={setOpen}
        align={align}
        trigger={trigger || defaultTrigger}
      >
        <AdminMenu
          items={items}
          onSelect={onSelect}
        />
      </AdminDropdown>
    </div>
  );
}

/**
 * Helper to create a standard action item
 */
export function createActionItem(
  id: string,
  label: string,
  icon?: React.ReactNode,
  options?: Partial<Omit<AdminMenuItem, 'id' | 'label' | 'icon'>>
): AdminMenuItem {
  return {
    id,
    label,
    icon,
    ...options
  };
}
