import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseRealtimePipelineOptions {
  tables: string[];
  queryKeys: string[];
  showNotifications?: boolean;
}

export function useRealtimePipeline({
  tables,
  queryKeys,
  showNotifications = false,
}: UseRealtimePipelineOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channels = tables.map((table) => {
      const channel = supabase
        .channel(`realtime-${table}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
          },
          (payload) => {
            // Invalidate related queries
            queryKeys.forEach((key) => {
              queryClient.invalidateQueries({ queryKey: [key] });
            });

            // Show notification for updates from other users
            if (showNotifications && payload.eventType === "UPDATE") {
              const oldStatus = (payload.old as any)?.pipeline_status;
              const newStatus = (payload.new as any)?.pipeline_status;
              
              if (oldStatus !== newStatus) {
                const name = (payload.new as any)?.name || (payload.new as any)?.business_name || "A record";
                toast.info(`${name} moved to ${newStatus}`, {
                  description: "Updated by another user",
                  duration: 3000,
                });
              }
            }
          }
        )
        .subscribe();

      return channel;
    });

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [tables, queryKeys, queryClient, showNotifications]);
}

// Simplified hook for a single table
export function useRealtimeTable(
  table: string,
  queryKey: string,
  showNotifications = false
) {
  return useRealtimePipeline({
    tables: [table],
    queryKeys: [queryKey],
    showNotifications,
  });
}
