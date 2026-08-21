/**
 * Hook for fetching the active brand voice
 * Used by edge functions via direct Supabase query
 */

import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";

export interface BrandVoice {
  id: string;
  version: number;
  name: string;
  is_active: boolean;
  tone_description: string;
  message_pillars: string[];
  writing_rules: string[];
  anti_patterns: string[];
  caption_length_guidance: string | null;
  hashtag_guidance: string | null;
  emoji_guidance: string | null;
  system_prompt: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export function useBrandVoice() {
  return useAuthQuery({
    queryKey: ["brand-voice-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_brand_voice")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();
      
      if (error) throw error;
      return data as BrandVoice | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
