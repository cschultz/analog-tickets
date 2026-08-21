/**
 * AdminTooltip
 * 
 * Tooltip component with Admin styling.
 * On mobile, tooltips are disabled or converted to inline help.
 * 
 * RULES:
 * - Desktop: Standard tooltip on hover
 * - Mobile: Disabled by default (touch devices don't hover)
 * - All styling uses Admin tokens
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ============ ADMIN TOOLTIP PROVIDER ============

export interface AdminTooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

export function AdminTooltipProvider({ 
  children, 
  delayDuration = 300 
}: AdminTooltipProviderProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      {children}
    </TooltipProvider>
  );
}

// ============ ADMIN TOOLTIP ============

export interface AdminTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** If true, show tooltip even on mobile (as a tap-to-show) */
  forceOnMobile?: boolean;
  className?: string;
}

export function AdminTooltip({
  content,
  children,
  side = "top",
  align = "center",
  forceOnMobile = false,
  className,
}: AdminTooltipProps) {
  const isMobile = useIsMobile();

  // On mobile without force, just render children
  if (isMobile && !forceOnMobile) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        className={cn(
          // AdminOverlay styling
          "bg-[hsl(var(--admin-surface))]",
          "border border-[hsl(var(--admin-border-strong))]",
          "shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
          "rounded-md",
          // Text styling
          "px-3 py-2 text-sm text-[hsl(var(--admin-text))]",
          // Animation
          "animate-in fade-in-0 zoom-in-95",
          // Z-index
          "z-50",
          className
        )}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

// ============ ADMIN INLINE HELP ============
// Alternative to tooltip for mobile - shows help text inline

export interface AdminInlineHelpProps {
  children: React.ReactNode;
  className?: string;
}

export function AdminInlineHelp({ children, className }: AdminInlineHelpProps) {
  return (
    <span
      className={cn(
        "text-xs text-[hsl(var(--admin-text-muted))] block mt-1",
        className
      )}
    >
      {children}
    </span>
  );
}
