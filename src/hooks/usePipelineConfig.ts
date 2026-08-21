import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";

// Types
export interface PipelineConfig {
  id: string;
  slug: string;
  name: string;
  name_singular: string;
  name_plural: string;
  icon: string;
  description: string | null;
  table_name: string;
  has_contacts: boolean;
  has_contracts: boolean;
  has_documents: boolean;
  has_email: boolean;
  has_ownership: boolean;
  has_kanban: boolean;
  has_payments: boolean;
  default_view: "table" | "kanban";
  color: string;
  is_active: boolean;
  display_order: number;
  event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  slug: string;
  name: string;
  color: string;
  display_order: number;
  is_terminal: boolean;
  is_positive: boolean;
  created_at: string;
}

export interface PipelineField {
  id: string;
  pipeline_id: string;
  slug: string;
  name: string;
  field_type: 
    | "text" | "textarea" | "number" | "currency" | "date" | "datetime"
    | "email" | "phone" | "url" | "select" | "multiselect" | "boolean" | "tags";
  options: { value: string; label: string }[] | null;
  default_value: string | null;
  placeholder: string | null;
  is_required: boolean;
  min_value: number | null;
  max_value: number | null;
  max_length: number | null;
  display_order: number;
  show_in_table: boolean;
  show_in_form: boolean;
  show_in_card: boolean;
  column_width: number;
  field_group: "header" | "details" | "meta";
  is_system: boolean;
  created_at: string;
  updated_at: string;
}
// Re-export color utilities from admin style guide for backward compatibility
export { colorToIntent as stageColorToIntent, getIntentFromColor } from "@/components/admin";

// Fetch single pipeline config by slug
export function usePipelineConfig(slug: string) {
  return useAuthQuery({
    queryKey: ["pipeline-config", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_configs")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

      if (error) throw error;
      return data as PipelineConfig;
    },
    enabled: !!slug,
  });
}

// Fetch all active pipeline configs
export function useAllPipelineConfigs() {
  return useAuthQuery({
    queryKey: ["pipeline-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_configs")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as PipelineConfig[];
    },
  });
}

// Fetch stages for a pipeline
export function usePipelineStages(pipelineId: string | undefined) {
  return useAuthQuery({
    queryKey: ["pipeline-stages", pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId!)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as PipelineStage[];
    },
    enabled: !!pipelineId,
  });
}

// Fetch fields for a pipeline
export function usePipelineFields(pipelineId: string | undefined) {
  return useAuthQuery({
    queryKey: ["pipeline-fields", pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_fields")
        .select("*")
        .eq("pipeline_id", pipelineId!)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as PipelineField[];
    },
    enabled: !!pipelineId,
  });
}

// Combined hook for full pipeline setup
export function usePipelineSetup(slug: string) {
  const configQuery = usePipelineConfig(slug);
  const stagesQuery = usePipelineStages(configQuery.data?.id);
  const fieldsQuery = usePipelineFields(configQuery.data?.id);

  return {
    config: configQuery.data,
    stages: stagesQuery.data || [],
    fields: fieldsQuery.data || [],
    isLoading: configQuery.isLoading || stagesQuery.isLoading || fieldsQuery.isLoading,
    error: configQuery.error || stagesQuery.error || fieldsQuery.error,
    
    // Helpers
    tableFields: fieldsQuery.data?.filter(f => f.show_in_table) || [],
    formFields: fieldsQuery.data?.filter(f => f.show_in_form) || [],
    cardFields: fieldsQuery.data?.filter(f => f.show_in_card) || [],
    
    getStage: (slug: string) => stagesQuery.data?.find(s => s.slug === slug),
    getField: (slug: string) => fieldsQuery.data?.find(f => f.slug === slug),
  };
}
