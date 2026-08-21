/**
 * AdminScrollArea
 * 
 * Scrollable container with Admin-styled scrollbars.
 * 
 * RULES:
 * - All styling uses Admin tokens
 * - Scrollbar matches admin theme (subtle, not obtrusive)
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// ============ ADMIN SCROLL AREA ============

export interface AdminScrollAreaProps extends React.ComponentProps<typeof ScrollArea> {
  /** Orientation of the scroll area */
  orientation?: "vertical" | "horizontal" | "both";
}

export const AdminScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollArea>,
  AdminScrollAreaProps
>(({ className, children, orientation = "vertical", ...props }, ref) => (
  <ScrollArea
    ref={ref}
    className={cn(
      "relative",
      className
    )}
    {...props}
  >
    {children}
    {(orientation === "vertical" || orientation === "both") && (
      <ScrollBar 
        orientation="vertical"
        className={cn(
          "flex select-none touch-none p-0.5 transition-colors",
          "bg-transparent hover:bg-[hsl(var(--admin-hover))]",
          "[&>div]:bg-[hsl(var(--admin-border-strong))] [&>div]:rounded-full",
          "[&>div]:hover:bg-[hsl(var(--admin-text-muted))]"
        )}
      />
    )}
    {(orientation === "horizontal" || orientation === "both") && (
      <ScrollBar 
        orientation="horizontal"
        className={cn(
          "flex select-none touch-none p-0.5 transition-colors",
          "bg-transparent hover:bg-[hsl(var(--admin-hover))]",
          "[&>div]:bg-[hsl(var(--admin-border-strong))] [&>div]:rounded-full",
          "[&>div]:hover:bg-[hsl(var(--admin-text-muted))]"
        )}
      />
    )}
  </ScrollArea>
));
AdminScrollArea.displayName = "AdminScrollArea";
