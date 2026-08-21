import { AdminBadge } from "@/components/admin";
import { Check, Clock, Send, AlertCircle, Eye, MousePointerClick, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailStatusBadgeProps {
  status: "draft" | "scheduled" | "sending" | "sent" | "delivered" | "opened" | "clicked" | "failed";
  className?: string;
  showIcon?: boolean;
}

const statusConfig = {
  draft: {
    label: "Draft",
    icon: Clock,
    intent: "neutral" as const,
    className: "border-[hsl(var(--admin-border))] text-[hsl(var(--admin-text-muted))]",
  },
  scheduled: {
    label: "Scheduled",
    icon: Clock,
    intent: "warning" as const,
    className: "",
  },
  sending: {
    label: "Sending",
    icon: Send,
    intent: "info" as const,
    className: "animate-pulse",
  },
  sent: {
    label: "Sent",
    icon: Check,
    intent: "success" as const,
    className: "",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCheck,
    intent: "success" as const,
    className: "",
  },
  opened: {
    label: "Opened",
    icon: Eye,
    intent: "info" as const,
    className: "",
  },
  clicked: {
    label: "Clicked",
    icon: MousePointerClick,
    intent: "info" as const,
    className: "bg-[hsl(var(--admin-accent)/0.1)] text-[hsl(var(--admin-accent))] border-[hsl(var(--admin-accent)/0.2)]",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    intent: "danger" as const,
    className: "",
  },
};

export const EmailStatusBadge = ({ status, className, showIcon = true }: EmailStatusBadgeProps) => {
  const config = statusConfig[status];
  const Icon = config.icon;
  
  return (
    <AdminBadge 
      intent={config.intent}
      className={cn("gap-1 font-medium", config.className, className)}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </AdminBadge>
  );
};