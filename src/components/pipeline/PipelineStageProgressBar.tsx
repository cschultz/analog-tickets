/**
 * PipelineStageProgressBar - Visual funnel showing conversion rates between stages
 */

import { useMemo } from "react";
import { usePipeline } from "./PipelineContext";
import { AdminBadge, getIntentFromColor } from "@/components/admin";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PipelineStageProgressBarProps {
  className?: string;
  compact?: boolean;
}

export function PipelineStageProgressBar({ className, compact = false }: PipelineStageProgressBarProps) {
  const { stages, records } = usePipeline();

  // Calculate stats for each stage
  const stageStats = useMemo(() => {
    const total = records.length;
    if (total === 0) return [];

    return stages.map(stage => {
      const count = records.filter(r => r.pipeline_status === stage.slug).length;
      const percentage = Math.round((count / total) * 100);
      return {
        ...stage,
        count,
        percentage,
      };
    });
  }, [stages, records]);

  // Calculate conversion rates (from first stage to each subsequent)
  const conversionRates = useMemo(() => {
    if (stageStats.length === 0) return [];
    
    const firstStageCount = stageStats[0]?.count || 0;
    if (firstStageCount === 0) return stageStats.map(s => ({ ...s, conversionRate: 0 }));

    let cumulativeAfterFirst = 0;
    return stageStats.map((stage, index) => {
      if (index === 0) {
        return { ...stage, conversionRate: 100 };
      }
      cumulativeAfterFirst += stage.count;
      // Conversion = records that made it past the first stage
      const conversionRate = Math.round(
        ((records.length - stageStats[0].count) / records.length) * 100
      );
      return { ...stage, conversionRate };
    });
  }, [stageStats, records.length]);

  if (records.length === 0 || stages.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn("flex h-2 rounded-full overflow-hidden bg-[hsl(var(--admin-muted)/0.3)]", className)}>
          {stageStats.map((stage, index) => (
            <Tooltip key={stage.id}>
              <TooltipTrigger asChild>
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${stage.percentage}%`,
                    backgroundColor: stage.color,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <span className="font-medium">{stage.name}</span>
                  <span className="text-[hsl(var(--admin-muted-foreground))] ml-2">
                    {stage.count} ({stage.percentage}%)
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Progress bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-[hsl(var(--admin-muted)/0.3)]">
        {stageStats.map((stage) => (
          <div
            key={stage.id}
            className="h-full transition-all duration-300 relative group"
            style={{
              width: `${stage.percentage}%`,
              backgroundColor: stage.color,
              minWidth: stage.count > 0 ? "8px" : "0",
            }}
          >
            {/* Hover tooltip effect */}
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))}
      </div>

      {/* Stage labels */}
      <div className="flex items-center gap-4 flex-wrap">
        {stageStats.map((stage) => {
          const intent = getIntentFromColor(stage.color);
          return (
            <div key={stage.id} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-xs text-[hsl(var(--admin-foreground))]">
                {stage.name}
              </span>
              <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                {stage.count}
              </span>
              <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                ({stage.percentage}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
