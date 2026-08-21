import { AdminSelect, AdminSelectItem, getBgClassFromColor } from "@/components/admin";
import { PipelineStage } from "@/hooks/usePipelineConfig";

interface PipelineStageSelectProps {
  stages: PipelineStage[];
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function PipelineStageSelect({ 
  stages, 
  value, 
  onValueChange, 
  disabled,
  className = "w-[160px]"
}: PipelineStageSelectProps) {
  const defaultStage = stages.find(s => s.display_order === 1) || stages[0];
  const currentValue = value || defaultStage?.slug || "";

  return (
    <AdminSelect 
      value={currentValue} 
      onValueChange={onValueChange}
      disabled={disabled}
      className={className}
    >
      {stages.map((stage) => (
        <AdminSelectItem key={stage.id} value={stage.slug}>
          <span className="inline-flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${getBgClassFromColor(stage.color)}`} />
            {stage.name}
          </span>
        </AdminSelectItem>
      ))}
    </AdminSelect>
  );
}
