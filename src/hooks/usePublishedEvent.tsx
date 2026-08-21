import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePublishedEvent() {
  // This hook is for public pages, so we don't require auth
  return useQuery({
    queryKey: ["published-event"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("*")
        .eq("status", "published")
        .eq("is_active", true)
        .single();

      if (error) {
        // If no published event, return null instead of throwing
        if (error.code === "PGRST116") {
          return null;
        }
        throw error;
      }
      return data;
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}