import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EntityType = "artist" | "vendor" | "artisan" | "partner";

export interface PipelineStage {
  id: string;
  label: string;
  order: number;
  color: "gray" | "blue" | "yellow" | "green" | "red" | "purple" | "orange";
}

export interface PipelineStageConfig {
  id: string;
  entity_type: EntityType;
  value_label: string;
  stages: PipelineStage[];
  created_at: string;
  updated_at: string;
}

// Default stages if none configured
const DEFAULT_STAGES: PipelineStage[] = [
  { id: "lead", label: "Lead", order: 1, color: "gray" },
  { id: "contacted", label: "Contacted", order: 2, color: "blue" },
  { id: "negotiating", label: "Negotiating", order: 3, color: "yellow" },
  { id: "confirmed", label: "Confirmed", order: 4, color: "green" },
  { id: "declined", label: "Declined", order: 5, color: "red" },
];

const DEFAULT_VALUE_LABELS: Record<EntityType, string> = {
  artist: "Offer",
  vendor: "Contract Value",
  artisan: "Booth Fee",
  partner: "Deal Value",
};

export function usePipelineStageConfig(entityType: EntityType) {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useAuthQuery({
    queryKey: ["pipeline-stage-config", entityType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stage_configs")
        .select("*")
        .eq("entity_type", entityType)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (!data) {
        return {
          id: "",
          entity_type: entityType,
          value_label: DEFAULT_VALUE_LABELS[entityType],
          stages: DEFAULT_STAGES,
          created_at: "",
          updated_at: "",
        } as PipelineStageConfig;
      }

      return {
        ...data,
        stages: (data.stages as unknown as PipelineStage[]) || DEFAULT_STAGES,
      } as PipelineStageConfig;
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: { value_label?: string; stages?: PipelineStage[] }) => {
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.value_label !== undefined) {
        updatePayload.value_label = updates.value_label;
      }
      if (updates.stages !== undefined) {
        updatePayload.stages = JSON.parse(JSON.stringify(updates.stages));
      }

      const { error } = await supabase
        .from("pipeline_stage_configs")
        .update(updatePayload)
        .eq("entity_type", entityType);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stage-config", entityType] });
      toast.success("Pipeline configuration updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update configuration: " + error.message);
    },
  });

  const stages = config?.stages || DEFAULT_STAGES;
  const valueLabel = config?.value_label || DEFAULT_VALUE_LABELS[entityType];

  // Get stage by ID
  const getStage = (stageId: string) => stages.find((s) => s.id === stageId);

  // Get stage label
  const getStageLabel = (stageId: string) => getStage(stageId)?.label || stageId;

  // Get stage color
  const getStageColor = (stageId: string) => getStage(stageId)?.color || "gray";

  // Get ordered stages for kanban/pipeline views
  const orderedStages = [...stages].sort((a, b) => a.order - b.order);

  return {
    config,
    isLoading,
    stages,
    orderedStages,
    valueLabel,
    getStage,
    getStageLabel,
    getStageColor,
    updateConfig: updateConfig.mutate,
    isUpdating: updateConfig.isPending,
  };
}

// Hook to get all pipeline configs (for admin settings page)
export function useAllPipelineStageConfigs() {
  return useAuthQuery({
    queryKey: ["pipeline-stage-configs-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stage_configs")
        .select("*")
        .order("entity_type");

      if (error) throw error;

      return (data || []).map((config) => ({
        ...config,
        stages: (config.stages as unknown as PipelineStage[]) || DEFAULT_STAGES,
      })) as PipelineStageConfig[];
    },
  });
}
