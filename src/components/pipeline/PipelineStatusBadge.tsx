import { AdminBadge, getIntentFromColor } from "@/components/admin";
import { PipelineStage } from "@/hooks/usePipelineConfig";

interface PipelineStatusBadgeProps {
  stage: PipelineStage | undefined;
  size?: "sm" | "md";
}

export function PipelineStatusBadge({ stage, size = "md" }: PipelineStatusBadgeProps) {
  if (!stage) {
    return (
      <AdminBadge intent="neutral" size={size}>
        Unknown
      </AdminBadge>
    );
  }

  const intent = getIntentFromColor(stage.color);

  return (
    <AdminBadge intent={intent} size={size}>
      {stage.name}
    </AdminBadge>
  );
}
