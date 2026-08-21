import { AdminSelect, AdminSelectItem } from "@/components/admin";
import { PIPELINE_STATUSES, PipelineStatus } from "./PipelineStatusBadge";

interface PipelineStatusSelectProps {
  value: PipelineStatus | string | null;
  onValueChange: (value: PipelineStatus) => void;
  disabled?: boolean;
}

export function PipelineStatusSelect({ value, onValueChange, disabled }: PipelineStatusSelectProps) {
  return (
    <AdminSelect 
      value={value || "lead"} 
      onValueChange={(v) => onValueChange(v as PipelineStatus)}
      disabled={disabled}
      className="w-[160px]"
    >
      {PIPELINE_STATUSES.map((status) => (
        <AdminSelectItem key={status.value} value={status.value}>
          <span className="inline-flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.color.split(' ')[0].replace(/\[.*?\]/g, '') || 'bg-[hsl(var(--admin-muted))]'}`} />
            {status.label}
          </span>
        </AdminSelectItem>
      ))}
    </AdminSelect>
  );
}
