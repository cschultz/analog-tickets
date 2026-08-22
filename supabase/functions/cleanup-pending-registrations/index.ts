import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Create client with user's auth token
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("[cleanup] Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Verify user has admin role
    const { data: isAdmin, error: roleError } = await supabaseClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      console.error("[cleanup] Authorization failed for user:", user.id);
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin role required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    console.log(`[cleanup] Admin user ${user.email} (${user.id}) initiated cleanup`);
    console.log("[cleanup] Starting cleanup of old pending registrations");

    // Use service role for deletion operations
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Calculate cutoff time (48 hours ago)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 48);
    console.log(`[cleanup] Cutoff time: ${cutoffTime.toISOString()}`);

    // Find old pending registrations
    const { data: oldRegistrations, error: fetchError } = await serviceClient
      .from("registrations")
      .select("id, name, email, created_at, ticket_type")
      .eq("payment_status", "pending")
      .lt("created_at", cutoffTime.toISOString());

    if (fetchError) {
      throw new Error(`Failed to fetch old registrations: ${fetchError.message}`);
    }

    console.log(`[cleanup] Found ${oldRegistrations?.length || 0} old pending registrations`);

    if (!oldRegistrations || oldRegistrations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          deleted: 0,
          message: "No old pending registrations to clean up",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Delete old pending registrations
    const { error: deleteError } = await serviceClient
      .from("registrations")
      .delete()
      .eq("payment_status", "pending")
      .lt("created_at", cutoffTime.toISOString());

    if (deleteError) {
      throw new Error(`Failed to delete old registrations: ${deleteError.message}`);
    }

    console.log(`[cleanup] Successfully deleted ${oldRegistrations.length} old pending registrations`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: oldRegistrations.length,
        registrations: oldRegistrations.map(r => ({
          id: r.id,
          name: r.name,
          email: r.email,
          ticket_type: r.ticket_type,
          created_at: r.created_at,
        })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[cleanup] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
