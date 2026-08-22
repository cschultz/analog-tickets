import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("cancel-sync-job: Request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin access
    const { isAdmin, error: authError } = await verifyAdmin(req);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: authError || "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { jobId, eventId } = await req.json();
    console.log("cancel-sync-job: Params:", { jobId, eventId });

    const supabase = getServiceClient();

    if (jobId) {
      // Cancel specific job
      const { data: job, error: fetchError } = await supabase
        .from("sync_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (fetchError) {
        return new Response(
          JSON.stringify({ error: "Job not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (job.status !== "running") {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Job already ${job.status}`,
            job 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase
        .from("sync_jobs")
        .update({
          status: "cancelled",
          error_message: "Cancelled by user",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (updateError) {
        throw updateError;
      }

      console.log(`cancel-sync-job: Cancelled job ${jobId}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Job cancelled",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (eventId) {
      // Cancel all running jobs for event
      const { data: jobs, error: fetchError } = await supabase
        .from("sync_jobs")
        .select("id")
        .eq("event_id", eventId)
        .eq("status", "running");

      if (fetchError) {
        throw fetchError;
      }

      if (!jobs || jobs.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "No running jobs to cancel",
            cancelled: 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase
        .from("sync_jobs")
        .update({
          status: "cancelled",
          error_message: "Cancelled by user",
          completed_at: new Date().toISOString(),
        })
        .eq("event_id", eventId)
        .eq("status", "running");

      if (updateError) {
        throw updateError;
      }

      console.log(`cancel-sync-job: Cancelled ${jobs.length} jobs for event ${eventId}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Cancelled ${jobs.length} job(s)`,
          cancelled: jobs.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "jobId or eventId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("cancel-sync-job error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
