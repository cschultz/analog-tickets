import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobName, hour, minute } = await req.json();

    if (!jobName || hour === undefined || minute === undefined) {
      throw new Error("Missing required parameters: jobName, hour, minute");
    }

    console.log(`[UPDATE-CRON] Updating ${jobName} to run at ${hour}:${minute} UTC`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    ).auth.getUser(token);

    if (authError || !user) {
      throw new Error("Invalid or expired token");
    }

    const { data: hasAdminRole } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (!hasAdminRole) {
      throw new Error("Unauthorized: Admin access required");
    }

    // Map job names to their full function URLs and body
    const jobConfigs: Record<string, { functionName: string; body: string }> = {
      "daily-sales-report": {
        functionName: "send-daily-sales-report",
        body: "{}"
      },
      "send-tickets-delivery-daily": {
        functionName: "send-tickets-delivery", 
        body: '{"autoScheduled": true}'
      }
    };

    const config = jobConfigs[jobName];
    if (!config) {
      throw new Error(`Unknown job name: ${jobName}`);
    }

    const projectRef = "hglwwpcwlndozzahyuyx";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Build the new cron schedule (minute hour * * *)
    const cronSchedule = `${minute} ${hour} * * *`;

    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      throw new Error("SUPABASE_DB_URL not configured");
    }

    // Use postgres client
    const client = new Client(dbUrl);
    await client.connect();

    try {
      // Unschedule existing job (ignore if not exists)
      try {
        await client.queryArray(`SELECT cron.unschedule('${jobName}')`);
        console.log(`[UPDATE-CRON] Unscheduled existing job`);
      } catch (e) {
        console.log(`[UPDATE-CRON] Job didn't exist, creating new`);
      }

      // Schedule new job
      await client.queryArray(`
        SELECT cron.schedule(
          '${jobName}',
          '${cronSchedule}',
          $$
          SELECT net.http_post(
            url := 'https://${projectRef}.supabase.co/functions/v1/${config.functionName}',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${anonKey}"}'::jsonb,
            body := '${config.body}'::jsonb
          ) AS request_id;
          $$
        )
      `);

      console.log(`[UPDATE-CRON] Scheduled new job with schedule: ${cronSchedule}`);
    } finally {
      await client.end();
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Updated ${jobName} to run at ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} UTC`,
        schedule: cronSchedule
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[UPDATE-CRON] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
