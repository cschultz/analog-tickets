import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get("id");

    if (!trackingId) {
      return new Response(TRANSPARENT_GIF, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update the recipient record
    const { error } = await supabase
      .from("production_email_recipients")
      .update({
        opened_at: new Date().toISOString(),
        open_count: supabase.rpc("increment", { x: 1 }),
      })
      .eq("tracking_id", trackingId)
      .is("opened_at", null);

    // Also increment open count for subsequent opens
    if (error) {
      await supabase.rpc("increment_production_email_open", { tracking_uuid: trackingId });
    }

    console.log(`Tracked email open for: ${trackingId}`);
  } catch (error) {
    console.error("Error tracking email open:", error);
  }

  return new Response(TRANSPARENT_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
});
