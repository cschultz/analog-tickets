import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LodgingVisualAsset {
  id: string;
  product_type: "tent" | "cabin";
  image_type: "interior" | "exterior";
  image_url: string;
  alt_text: string | null;
}

export function useLodgingVisualAssets() {
  // This hook is for public pages, so we don't require auth
  return useQuery({
    queryKey: ["lodging-visual-assets-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_visual_assets")
        .select("id, product_type, image_type, image_url, alt_text")
        .eq("is_active", true)
        .order("display_order");
      
      if (error) throw error;
      return data as LodgingVisualAsset[];
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

export function getAssetsByProductType(assets: LodgingVisualAsset[] | undefined) {
  if (!assets) return { tent: [], cabin: [] };
  
  return {
    tent: assets.filter((a) => a.product_type === "tent"),
    cabin: assets.filter((a) => a.product_type === "cabin"),
  };
}
