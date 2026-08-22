import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const TRACKING_PIXEL = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
  0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
  0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3b
]);

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get("id");

    if (trackingId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Get current record and increment
      const { data: current } = await supabase
        .from("artist_email_recipients")
        .select("open_count, opened_at")
        .eq("tracking_id", trackingId)
        .single();

      if (current) {
        await supabase
          .from("artist_email_recipients")
          .update({ 
            open_count: (current.open_count || 0) + 1,
            opened_at: current.opened_at || new Date().toISOString(),
          })
          .eq("tracking_id", trackingId);
      }
    }
  } catch (error) {
    console.error("Error tracking email open:", error);
  }

  // Always return the tracking pixel
  return new Response(TRACKING_PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
});
