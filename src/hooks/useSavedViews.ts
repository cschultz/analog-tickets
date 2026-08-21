import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

export type EntityType = "artist" | "vendor" | "artisan" | "partner" | "volunteer" | "winecamp";
export type ViewMode = "table" | "board";

export interface FilterCondition {
  field: string;
  operator: "eq" | "neq" | "in" | "contains" | "gt" | "lt" | "gte" | "lte" | "is_null" | "is_not_null";
  value: unknown;
}

export interface SortConfig {
  field: string;
  direction: "asc" | "desc";
}

export interface SavedView {
  id: string;
  event_id: string;
  entity_type: EntityType;
  name: string;
  is_default: boolean;
  is_system: boolean;
  view_mode: ViewMode;
  filters: FilterCondition[];
  sort_config: SortConfig | null;
  visible_columns: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Default system views that get auto-created per entity type
const DEFAULT_VIEWS: Record<EntityType, Omit<SavedView, "id" | "event_id" | "created_by" | "created_at" | "updated_at">[]> = {
  vendor: [
    { entity_type: "vendor", name: "All", is_default: true, is_system: true, view_mode: "table", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "vendor", name: "Board", is_default: false, is_system: true, view_mode: "board", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "vendor", name: "Needs Contract", is_default: false, is_system: true, view_mode: "table", filters: [{ field: "pipeline_status", operator: "in", value: ["lead", "in_discussion"] }], sort_config: null, visible_columns: null },
    { entity_type: "vendor", name: "Confirmed", is_default: false, is_system: true, view_mode: "table", filters: [{ field: "pipeline_status", operator: "in", value: ["confirmed", "completed"] }], sort_config: null, visible_columns: null },
  ],
  artist: [
    { entity_type: "artist", name: "All", is_default: true, is_system: true, view_mode: "table", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "artist", name: "Board", is_default: false, is_system: true, view_mode: "board", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "artist", name: "Needs Contract", is_default: false, is_system: true, view_mode: "table", filters: [{ field: "pipeline_status", operator: "in", value: ["lead", "in_discussion"] }], sort_config: null, visible_columns: null },
    { entity_type: "artist", name: "Confirmed", is_default: false, is_system: true, view_mode: "table", filters: [{ field: "pipeline_status", operator: "in", value: ["confirmed", "completed"] }], sort_config: null, visible_columns: null },
  ],
  artisan: [
    { entity_type: "artisan", name: "All", is_default: true, is_system: true, view_mode: "table", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "artisan", name: "Board", is_default: false, is_system: true, view_mode: "board", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "artisan", name: "Needs Contract", is_default: false, is_system: true, view_mode: "table", filters: [{ field: "pipeline_status", operator: "in", value: ["lead", "in_discussion"] }], sort_config: null, visible_columns: null },
    { entity_type: "artisan", name: "Confirmed", is_default: false, is_system: true, view_mode: "table", filters: [{ field: "pipeline_status", operator: "in", value: ["confirmed", "completed"] }], sort_config: null, visible_columns: null },
  ],
  partner: [
    { entity_type: "partner", name: "All", is_default: true, is_system: true, view_mode: "table", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "partner", name: "Board", is_default: false, is_system: true, view_mode: "board", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "partner", name: "Needs Contract", is_default: false, is_system: true, view_mode: "table", filters: [{ field: "pipeline_status", operator: "in", value: ["lead", "in_discussion"] }], sort_config: null, visible_columns: null },
    { entity_type: "partner", name: "Confirmed", is_default: false, is_system: true, view_mode: "table", filters: [{ field: "pipeline_status", operator: "in", value: ["confirmed", "completed"] }], sort_config: null, visible_columns: null },
  ],
  volunteer: [
    { entity_type: "volunteer", name: "All", is_default: true, is_system: true, view_mode: "table", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "volunteer", name: "Board", is_default: false, is_system: true, view_mode: "board", filters: [], sort_config: null, visible_columns: null },
  ],
  winecamp: [
    { entity_type: "winecamp", name: "All", is_default: true, is_system: true, view_mode: "table", filters: [], sort_config: null, visible_columns: null },
    { entity_type: "winecamp", name: "Board", is_default: false, is_system: true, view_mode: "board", filters: [], sort_config: null, visible_columns: null },
  ],
};

interface UseSavedViewsOptions {
  entityType: EntityType;
  eventId: string | null | undefined;
}

export function useSavedViews({ entityType, eventId }: UseSavedViewsOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch saved views for this entity type + event
  const { data: views = [], isLoading } = useAuthQuery({
    queryKey: ["saved-views", eventId, entityType],
    queryFn: async () => {
      if (!eventId) return [];

      const { data, error } = await supabase
        .from("pipeline_saved_views")
        .select("*")
        .eq("event_id", eventId)
        .eq("entity_type", entityType)
        .order("is_default", { ascending: false })
        .order("is_system", { ascending: false })
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching saved views:", error);
        return [];
      }

      // Transform data to match our interface
      const transformedData = data.map(row => ({
        ...row,
        entity_type: row.entity_type as EntityType,
        view_mode: row.view_mode as ViewMode,
        filters: (row.filters || []) as unknown as FilterCondition[],
        sort_config: row.sort_config as unknown as SortConfig | null,
      })) as SavedView[];

      // If no views exist, create default system views
      if (transformedData.length === 0 && user) {
        const defaults = DEFAULT_VIEWS[entityType] || [];
        const toInsert = defaults.map(v => ({
          ...v,
          event_id: eventId,
          created_by: user.id,
          filters: v.filters as unknown as Json,
          sort_config: v.sort_config as unknown as Json,
        }));

        const { data: created, error: insertError } = await supabase
          .from("pipeline_saved_views")
          .insert(toInsert)
          .select();

        if (insertError) {
          console.error("Error creating default views:", insertError);
          return [];
        }

        return (created || []).map(row => ({
          ...row,
          entity_type: row.entity_type as EntityType,
          view_mode: row.view_mode as ViewMode,
          filters: (row.filters || []) as unknown as FilterCondition[],
          sort_config: row.sort_config as unknown as SortConfig | null,
        })) as SavedView[];
      }

      return transformedData;
    },
    enabled: !!eventId,
  });

  // Create a new view
  const createViewMutation = useMutation({
    mutationFn: async (view: Omit<SavedView, "id" | "created_at" | "updated_at">) => {
      const insertData = {
        ...view,
        filters: view.filters as unknown as Json,
        sort_config: view.sort_config as unknown as Json,
      };
      const { data, error } = await supabase
        .from("pipeline_saved_views")
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        entity_type: data.entity_type as EntityType,
        view_mode: data.view_mode as ViewMode,
        filters: (data.filters || []) as unknown as FilterCondition[],
        sort_config: data.sort_config as unknown as SortConfig | null,
      } as SavedView;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views", eventId, entityType] });
      toast.success("View created");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create view");
    },
  });

  // Update a view
  const updateViewMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SavedView> & { id: string }) => {
      const updateData = {
        ...updates,
        filters: updates.filters as unknown as Json,
        sort_config: updates.sort_config as unknown as Json,
      };
      const { data, error } = await supabase
        .from("pipeline_saved_views")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        entity_type: data.entity_type as EntityType,
        view_mode: data.view_mode as ViewMode,
        filters: (data.filters || []) as unknown as FilterCondition[],
        sort_config: data.sort_config as unknown as SortConfig | null,
      } as SavedView;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views", eventId, entityType] });
      toast.success("View updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update view");
    },
  });

  // Delete a view
  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pipeline_saved_views")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views", eventId, entityType] });
      toast.success("View deleted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete view");
    },
  });

  // Get the default view
  const defaultView = views.find(v => v.is_default) || views[0] || null;

  return {
    views,
    isLoading,
    defaultView,
    createView: (view: Omit<SavedView, "id" | "created_at" | "updated_at">) => createViewMutation.mutateAsync(view),
    updateView: (id: string, updates: Partial<SavedView>) => updateViewMutation.mutateAsync({ id, ...updates }),
    deleteView: (id: string) => deleteViewMutation.mutateAsync(id),
    isCreating: createViewMutation.isPending,
    isUpdating: updateViewMutation.isPending,
    isDeleting: deleteViewMutation.isPending,
  };
}
