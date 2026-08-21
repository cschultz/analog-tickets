import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PipelineConfig, PipelineStage, PipelineField } from "./usePipelineConfig";

// Update pipeline config
export function useUpdatePipelineConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PipelineConfig> & { id: string }) => {
      const { error } = await supabase
        .from("pipeline_configs")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-config"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-configs"] });
      toast.success("Pipeline updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update pipeline: " + error.message);
    },
  });
}

// Create a new pipeline stage
export function useCreatePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stage: Omit<PipelineStage, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .insert(stage)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", variables.pipeline_id] });
      toast.success("Stage created");
    },
    onError: (error: Error) => {
      toast.error("Failed to create stage: " + error.message);
    },
  });
}

// Update a pipeline stage
export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pipeline_id, ...updates }: Partial<PipelineStage> & { id: string; pipeline_id: string }) => {
      const { error } = await supabase
        .from("pipeline_stages")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      return { id, pipeline_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", result.pipeline_id] });
    },
    onError: (error: Error) => {
      toast.error("Failed to update stage: " + error.message);
    },
  });
}

// Delete a pipeline stage
export function useDeletePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pipeline_id }: { id: string; pipeline_id: string }) => {
      const { error } = await supabase
        .from("pipeline_stages")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { pipeline_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", result.pipeline_id] });
      toast.success("Stage deleted");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete stage: " + error.message);
    },
  });
}

// Reorder pipeline stages
export function useReorderPipelineStages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pipeline_id, stages }: { pipeline_id: string; stages: { id: string; display_order: number }[] }) => {
      // Update each stage's display_order
      const updates = stages.map(({ id, display_order }) =>
        supabase
          .from("pipeline_stages")
          .update({ display_order })
          .eq("id", id)
      );

      const results = await Promise.all(updates);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
      
      return { pipeline_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", result.pipeline_id] });
    },
    onError: (error: Error) => {
      toast.error("Failed to reorder stages: " + error.message);
    },
  });
}

// Create a new pipeline field
export function useCreatePipelineField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (field: Omit<PipelineField, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("pipeline_fields")
        .insert(field)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-fields", variables.pipeline_id] });
      toast.success("Field created");
    },
    onError: (error: Error) => {
      toast.error("Failed to create field: " + error.message);
    },
  });
}

// Update a pipeline field
export function useUpdatePipelineField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pipeline_id, ...updates }: Partial<PipelineField> & { id: string; pipeline_id: string }) => {
      const { error } = await supabase
        .from("pipeline_fields")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      return { id, pipeline_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-fields", result.pipeline_id] });
    },
    onError: (error: Error) => {
      toast.error("Failed to update field: " + error.message);
    },
  });
}

// Delete a pipeline field
export function useDeletePipelineField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pipeline_id }: { id: string; pipeline_id: string }) => {
      const { error } = await supabase
        .from("pipeline_fields")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { pipeline_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-fields", result.pipeline_id] });
      toast.success("Field deleted");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete field: " + error.message);
    },
  });
}

// Reorder pipeline fields
export function useReorderPipelineFields() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pipeline_id, fields }: { pipeline_id: string; fields: { id: string; display_order: number }[] }) => {
      const updates = fields.map(({ id, display_order }) =>
        supabase
          .from("pipeline_fields")
          .update({ display_order, updated_at: new Date().toISOString() })
          .eq("id", id)
      );

      const results = await Promise.all(updates);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
      
      return { pipeline_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-fields", result.pipeline_id] });
    },
    onError: (error: Error) => {
      toast.error("Failed to reorder fields: " + error.message);
    },
  });
}
