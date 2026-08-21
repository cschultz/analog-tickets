import { cn } from "@/lib/utils";

export type StatusType = 
  | "lead" 
  | "contacted" 
  | "negotiating" 
  | "confirmed" 
  | "declined" 
  | "pending"
  | "active"
  | "inactive"
  | "draft"
  | "published"
  | "paid"
  | "unpaid"
  | "partial"
  | "cancelled"
  | "completed";

interface StatusPillProps {
  status: StatusType | string;
  size?: "sm" | "md";
  showDot?: boolean;
  className?: string;
}

const statusConfig: Record<string, { 
  label: string; 
  dotColor: string; 
  bgColor: string; 
  textColor: string;
}> = {
  // Pipeline statuses
  lead: {
    label: "Lead",
    dotColor: "bg-[hsl(215,100%,50%)]",
    bgColor: "bg-[hsl(215,100%,96%)]",
    textColor: "text-[hsl(215,100%,40%)]",
  },
  contacted: {
    label: "Contacted",
    dotColor: "bg-[hsl(38,95%,50%)]",
    bgColor: "bg-[hsl(38,95%,95%)]",
    textColor: "text-[hsl(38,80%,35%)]",
  },
  negotiating: {
    label: "Negotiating",
    dotColor: "bg-[hsl(280,80%,55%)]",
    bgColor: "bg-[hsl(280,80%,96%)]",
    textColor: "text-[hsl(280,70%,40%)]",
  },
  confirmed: {
    label: "Confirmed",
    dotColor: "bg-[hsl(142,72%,42%)]",
    bgColor: "bg-[hsl(142,72%,95%)]",
    textColor: "text-[hsl(142,60%,30%)]",
  },
  declined: {
    label: "Declined",
    dotColor: "bg-[hsl(0,0%,55%)]",
    bgColor: "bg-[hsl(0,0%,95%)]",
    textColor: "text-[hsl(0,0%,40%)]",
  },
  pending: {
    label: "Pending",
    dotColor: "bg-[hsl(38,95%,50%)]",
    bgColor: "bg-[hsl(38,95%,95%)]",
    textColor: "text-[hsl(38,80%,35%)]",
  },
  // General statuses
  active: {
    label: "Active",
    dotColor: "bg-[hsl(142,72%,42%)]",
    bgColor: "bg-[hsl(142,72%,95%)]",
    textColor: "text-[hsl(142,60%,30%)]",
  },
  inactive: {
    label: "Inactive",
    dotColor: "bg-[hsl(0,0%,55%)]",
    bgColor: "bg-[hsl(0,0%,95%)]",
    textColor: "text-[hsl(0,0%,40%)]",
  },
  draft: {
    label: "Draft",
    dotColor: "bg-[hsl(0,0%,55%)]",
    bgColor: "bg-[hsl(0,0%,95%)]",
    textColor: "text-[hsl(0,0%,40%)]",
  },
  published: {
    label: "Published",
    dotColor: "bg-[hsl(142,72%,42%)]",
    bgColor: "bg-[hsl(142,72%,95%)]",
    textColor: "text-[hsl(142,60%,30%)]",
  },
  // Payment statuses
  paid: {
    label: "Paid",
    dotColor: "bg-[hsl(142,72%,42%)]",
    bgColor: "bg-[hsl(142,72%,95%)]",
    textColor: "text-[hsl(142,60%,30%)]",
  },
  unpaid: {
    label: "Unpaid",
    dotColor: "bg-[hsl(0,72%,55%)]",
    bgColor: "bg-[hsl(0,72%,96%)]",
    textColor: "text-[hsl(0,60%,40%)]",
  },
  partial: {
    label: "Partial",
    dotColor: "bg-[hsl(38,95%,50%)]",
    bgColor: "bg-[hsl(38,95%,95%)]",
    textColor: "text-[hsl(38,80%,35%)]",
  },
  cancelled: {
    label: "Cancelled",
    dotColor: "bg-[hsl(0,72%,55%)]",
    bgColor: "bg-[hsl(0,72%,96%)]",
    textColor: "text-[hsl(0,60%,40%)]",
  },
  completed: {
    label: "Completed",
    dotColor: "bg-[hsl(142,72%,42%)]",
    bgColor: "bg-[hsl(142,72%,95%)]",
    textColor: "text-[hsl(142,60%,30%)]",
  },
};

const defaultConfig = {
  label: "",
  dotColor: "bg-[hsl(0,0%,55%)]",
  bgColor: "bg-[hsl(0,0%,95%)]",
  textColor: "text-[hsl(0,0%,40%)]",
};

export function StatusPill({ 
  status, 
  size = "md", 
  showDot = true,
  className 
}: StatusPillProps) {
  const normalizedStatus = status.toLowerCase().replace(/[_\s-]/g, "");
  const config = statusConfig[normalizedStatus] || { 
    ...defaultConfig, 
    label: status.charAt(0).toUpperCase() + status.slice(1) 
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        config.bgColor,
        config.textColor,
        size === "sm" && "px-2 py-0.5 text-[11px]",
        size === "md" && "px-2.5 py-1 text-xs",
        className
      )}
    >
      {showDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", config.dotColor)} />
      )}
      {config.label}
    </span>
  );
}

// Just the dot for inline use
export function StatusDot({ status, className }: { status: string; className?: string }) {
  const normalizedStatus = status.toLowerCase().replace(/[_\s-]/g, "");
  const config = statusConfig[normalizedStatus] || defaultConfig;

  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", config.dotColor, className)}
      title={config.label || status}
    />
  );
}

// ============ ADMIN STATUS INDICATOR ============
/**
 * AdminStatusIndicator - For use inside admin popups, overlays, and menus
 * 
 * RULES (per Admin Style Guide):
 * - No pill-style labels
 * - Text with optional subtle dot indicator
 * - No orange or accent colors
 * - Informational, not promotional
 * - Matches table/card patterns
 */

interface AdminStatusIndicatorProps {
  status: StatusType | string;
  showDot?: boolean;
  className?: string;
}

// Muted, neutral colors for popup/overlay context - informational only
const overlayStatusConfig: Record<string, { 
  label: string; 
  dotColor: string; 
  textColor: string;
}> = {
  // Event statuses - neutral, informational
  draft: {
    label: "Draft",
    dotColor: "bg-[hsl(var(--admin-muted-foreground))]",
    textColor: "text-[hsl(var(--admin-muted-foreground))]",
  },
  published: {
    label: "Published",
    dotColor: "bg-[hsl(142,50%,45%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  archived: {
    label: "Archived",
    dotColor: "bg-[hsl(var(--admin-muted-foreground))]",
    textColor: "text-[hsl(var(--admin-muted-foreground))]",
  },
  // Pipeline statuses - subtle, not promotional
  lead: {
    label: "Lead",
    dotColor: "bg-[hsl(215,60%,55%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  contacted: {
    label: "Contacted",
    dotColor: "bg-[hsl(215,60%,55%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  negotiating: {
    label: "Negotiating",
    dotColor: "bg-[hsl(38,70%,55%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  confirmed: {
    label: "Confirmed",
    dotColor: "bg-[hsl(142,50%,45%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  declined: {
    label: "Declined",
    dotColor: "bg-[hsl(var(--admin-muted-foreground))]",
    textColor: "text-[hsl(var(--admin-muted-foreground))]",
  },
  pending: {
    label: "Pending",
    dotColor: "bg-[hsl(38,70%,55%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  active: {
    label: "Active",
    dotColor: "bg-[hsl(142,50%,45%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  inactive: {
    label: "Inactive",
    dotColor: "bg-[hsl(var(--admin-muted-foreground))]",
    textColor: "text-[hsl(var(--admin-muted-foreground))]",
  },
  paid: {
    label: "Paid",
    dotColor: "bg-[hsl(142,50%,45%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  unpaid: {
    label: "Unpaid",
    dotColor: "bg-[hsl(0,55%,55%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  completed: {
    label: "Completed",
    dotColor: "bg-[hsl(142,50%,45%)]",
    textColor: "text-[hsl(var(--admin-text))]",
  },
  cancelled: {
    label: "Cancelled",
    dotColor: "bg-[hsl(var(--admin-muted-foreground))]",
    textColor: "text-[hsl(var(--admin-muted-foreground))]",
  },
};

const overlayDefaultConfig = {
  label: "",
  dotColor: "bg-[hsl(var(--admin-muted-foreground))]",
  textColor: "text-[hsl(var(--admin-text))]",
};

export function AdminStatusIndicator({ 
  status, 
  showDot = true,
  className 
}: AdminStatusIndicatorProps) {
  const normalizedStatus = status.toLowerCase().replace(/[_\s-]/g, "");
  const config = overlayStatusConfig[normalizedStatus] || { 
    ...overlayDefaultConfig, 
    label: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ')
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-normal",
        config.textColor,
        className
      )}
    >
      {showDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dotColor)} />
      )}
      <span>{config.label}</span>
    </span>
  );
}
