import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // GET request = check only, POST = grant admin
    const checkOnly = req.method === "GET";
    // Create authenticated Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error("[grant-first-admin] Authentication failed:", {
        error: userError,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    console.log("Checking admin status for user:", user.id);

    // Create admin client to check for existing admins
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if any admin users exist
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (checkError) {
      console.error("[grant-first-admin] Admin check failed:", {
        error: checkError,
        userId: user.id,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "Unable to process request" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // If admins already exist
    if (existingAdmins && existingAdmins.length > 0) {
      console.log("Admin users already exist");
      
      // If this is just a check, return the info
      if (checkOnly) {
        return new Response(
          JSON.stringify({ 
            adminExists: true,
            message: "An administrator has already been set up" 
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }
      
      // Otherwise deny the grant request
      return new Response(
        JSON.stringify({ 
          error: "Admin user already exists",
          message: "An administrator has already been set up for this application" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        }
      );
    }

    // If this is just a check and no admin exists
    if (checkOnly) {
      return new Response(
        JSON.stringify({ 
          adminExists: false,
          message: "No administrator has been set up yet" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // No admins exist, grant admin role to this user
    console.log("No admins exist, granting admin role to user:", user.id);
    
    const { data: newAdmin, error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: user.id,
        role: "admin",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[grant-first-admin] Role grant failed:", {
        error: insertError,
        userId: user.id,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "Unable to complete setup" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log("Admin role granted successfully:", newAdmin);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "You are now an administrator",
        data: newAdmin 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[grant-first-admin] Unexpected error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
