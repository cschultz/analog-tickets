import { AdminBadge } from "@/components/admin";

// Legacy static statuses for backward compatibility
export const PIPELINE_STATUSES = [
  { value: "lead", label: "Lead", intent: "neutral" as const, color: "bg-[hsl(var(--admin-muted))] text-[hsl(var(--admin-text-muted))] border-[hsl(var(--admin-border))]" },
  { value: "contacted", label: "Contacted", intent: "info" as const, color: "bg-[hsl(var(--admin-info)/0.1)] text-[hsl(var(--admin-info))] border-[hsl(var(--admin-info)/0.3)]" },
  { value: "negotiating", label: "Negotiating", intent: "warning" as const, color: "bg-[hsl(var(--admin-warning)/0.1)] text-[hsl(var(--admin-warning))] border-[hsl(var(--admin-warning)/0.3)]" },
  { value: "confirmed", label: "Confirmed", intent: "success" as const, color: "bg-[hsl(var(--admin-success)/0.1)] text-[hsl(var(--admin-success))] border-[hsl(var(--admin-success)/0.3)]" },
  { value: "declined", label: "Declined", intent: "danger" as const, color: "bg-[hsl(var(--admin-error)/0.1)] text-[hsl(var(--admin-error))] border-[hsl(var(--admin-error)/0.3)]" },
  // Legacy statuses for migration compatibility
  { value: "in_discussion", label: "In Discussion", intent: "info" as const, color: "bg-[hsl(var(--admin-info)/0.1)] text-[hsl(var(--admin-info))] border-[hsl(var(--admin-info)/0.3)]" },
  { value: "pending_contract", label: "Pending Contract", intent: "warning" as const, color: "bg-[hsl(var(--admin-warning)/0.1)] text-[hsl(var(--admin-warning))] border-[hsl(var(--admin-warning)/0.3)]" },
  { value: "signed", label: "Signed", intent: "success" as const, color: "bg-[hsl(var(--admin-success)/0.1)] text-[hsl(var(--admin-success))] border-[hsl(var(--admin-success)/0.3)]" },
];

export type PipelineStatus = "lead" | "contacted" | "negotiating" | "confirmed" | "declined" | "in_discussion" | "pending_contract" | "signed";
// Use centralized color mapping from admin style guide
import { colorToIntent } from "@/components/admin";

interface PipelineStatusBadgeProps {
  status: PipelineStatus | string | null;
  size?: "sm" | "md";
  // Optional: pass stage config for dynamic labels
  stageLabel?: string;
  stageColor?: string;
}

export function PipelineStatusBadge({ status, size = "md", stageLabel, stageColor }: PipelineStatusBadgeProps) {
  // Use provided stage config if available, otherwise fall back to static config
  if (stageLabel && stageColor) {
    const intent = colorToIntent[stageColor] || "neutral";
    return (
      <AdminBadge intent={intent} size={size}>
        {stageLabel}
      </AdminBadge>
    );
  }

  const statusConfig = PIPELINE_STATUSES.find((s) => s.value === status) || PIPELINE_STATUSES[0];
  
  return (
    <AdminBadge 
      intent={statusConfig.intent}
      size={size}
    >
      {statusConfig.label}
    </AdminBadge>
  );
}

export function getPipelineStatusColor(status: string | null): string {
  const config = PIPELINE_STATUSES.find((s) => s.value === status);
  return config?.color || PIPELINE_STATUSES[0].color;
}

export function getPipelineStatusIntent(status: string | null): "neutral" | "info" | "warning" | "success" | "danger" {
  const config = PIPELINE_STATUSES.find((s) => s.value === status);
  return config?.intent || "neutral";
}
