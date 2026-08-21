import { usePipeline } from "@/components/pipeline/PipelineContext";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityLogEntry {
  id: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  created_by: string | null;
  entity_name: string | null;
}

export function usePipelineActivityLog() {
  const { config, selectedRecord } = usePipeline();

  const { data: activities = [], isLoading } = useAuthQuery({
    queryKey: ["pipeline-activity-log", config?.slug, selectedRecord?.id],
    queryFn: async () => {
      if (!selectedRecord?.id || !config?.slug) return [];
      
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, action, old_value, new_value, created_at, created_by, entity_name")
        .eq("entity_type", config.slug)
        .eq("entity_id", selectedRecord.id as string)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as ActivityLogEntry[];
    },
    enabled: !!selectedRecord?.id && !!config?.slug,
  });

  return { activities, isLoading };
}
