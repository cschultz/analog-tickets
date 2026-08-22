import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Manage the photo processing cron job.
 * Actions: "start" schedules the cron, "stop" unschedules it, "status" checks if running.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Verify admin via auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    if (action === "start") {
      await supabase.rpc("schedule_photo_cron");
      
      // Get pending count
      const { count: pending } = await supabase
        .from("social_photos")
        .select("id", { count: "exact", head: true })
        .in("sync_status", ["pending", "failed"]);

      return new Response(
        JSON.stringify({ success: true, message: "Photo processing started", pending: pending || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "stop") {
      await supabase.rpc("unschedule_photo_cron");
      return new Response(
        JSON.stringify({ success: true, message: "Photo processing stopped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "status") {
      const { data: cronStatus } = await supabase.rpc("check_photo_cron_status");
      
      const { count: pending } = await supabase
        .from("social_photos")
        .select("id", { count: "exact", head: true })
        .in("sync_status", ["pending", "failed"]);

      const { count: complete } = await supabase
        .from("social_photos")
        .select("id", { count: "exact", head: true })
        .eq("sync_status", "complete");

      return new Response(
        JSON.stringify({ 
          isRunning: cronStatus || false, 
          pending: pending || 0, 
          complete: complete || 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'start', 'stop', or 'status'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[MANAGE-CRON] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
