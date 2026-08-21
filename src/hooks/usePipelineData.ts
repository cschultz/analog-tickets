import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PipelineConfig, PipelineField } from "./usePipelineConfig";

export interface PipelineRecord {
  id: string;
  event_id?: string;
  pipeline_status?: string | null;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface UsePipelineDataOptions {
  config: PipelineConfig | undefined;
  eventId: string | undefined;
  searchTerm?: string;
  statusFilter?: string | null;
}

export function usePipelineData({ config, eventId, searchTerm, statusFilter }: UsePipelineDataOptions) {
  const queryClient = useQueryClient();
  const tableName = config?.table_name;

  // Type for allowed table names
  type PipelineTableName = "vendors" | "artists" | "artisans" | "partners" | "winecamp_attendees" | "volunteers" | "wineries";

  // Fetch all records
  const query = useAuthQuery({
    queryKey: ["pipeline-data", tableName, eventId, searchTerm, statusFilter],
    queryFn: async () => {
      // Guard against empty string eventId (invalid UUID)
      if (!tableName || !eventId || eventId === "") return [];

      let queryBuilder = supabase
        .from(tableName as PipelineTableName)
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (statusFilter) {
        queryBuilder = queryBuilder.eq("pipeline_status", statusFilter);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      
      // Client-side search filtering
      let records = data as PipelineRecord[];
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        records = records.filter(record => 
          Object.values(record).some(value => 
            typeof value === "string" && value.toLowerCase().includes(search)
          )
        );
      }
      
      return records;
    },
    enabled: !!tableName && !!eventId,
  });

  // Create record
  const createMutation = useMutation({
    mutationFn: async (data: Partial<PipelineRecord>) => {
      // Guard against empty string eventId (invalid UUID)
      if (!tableName || !eventId || eventId === "") {
        throw new Error("Please select an event first");
      }
      
      const insertData = { ...data, event_id: eventId };
      
      const { data: record, error } = await supabase
        .from(tableName as PipelineTableName)
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;
      return record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-data", tableName] });
      toast.success(`${config?.name_singular || "Record"} created`);
    },
    onError: (error) => {
      toast.error(`Failed to create: ${error.message}`);
    },
  });

  // Update record
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PipelineRecord> & { id: string }) => {
      if (!tableName) throw new Error("Missing config");
      
      const { data: record, error } = await supabase
        .from(tableName as PipelineTableName)
        .update(data as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return record;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-data", tableName] });
      toast.success(`${config?.name_singular || "Record"} updated`);
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Update status only
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!tableName) throw new Error("Missing config");
      
      const { error } = await supabase
        .from(tableName as PipelineTableName)
        .update({ pipeline_status: status })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-data", tableName] });
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });

  // Delete record
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tableName) throw new Error("Missing config");
      
      const { error } = await supabase
        .from(tableName as PipelineTableName)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-data", tableName] });
      toast.success(`${config?.name_singular || "Record"} deleted`);
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  // Bulk delete
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!tableName) throw new Error("Missing config");
      
      const { error } = await supabase
        .from(tableName as PipelineTableName)
        .delete()
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-data", tableName] });
      toast.success(`${ids.length} ${config?.name_plural || "records"} deleted`);
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  return {
    records: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    
    create: createMutation.mutate,
    update: updateMutation.mutate,
    updateStatus: updateStatusMutation.mutate,
    delete: deleteMutation.mutate,
    bulkDelete: bulkDeleteMutation.mutate,
    
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Helper to get display value for a field
export function getFieldDisplayValue(
  record: PipelineRecord,
  field: PipelineField
): string {
  const value = record[field.slug];
  
  if (value === null || value === undefined) return "—";
  
  switch (field.field_type) {
    case "currency":
      return typeof value === "number" 
        ? `$${value.toLocaleString()}`
        : String(value);
    case "date":
      return value ? new Date(String(value)).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }) : "—";
    case "datetime":
      return value ? new Date(String(value)).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—";
    case "boolean":
      return value ? "Yes" : "No";
    case "select":
    case "multiselect":
      if (field.options) {
        const option = field.options.find(o => o.value === value);
        return option?.label || String(value);
      }
      return String(value);
    default:
      return String(value);
  }
}
