import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendRequest {
  email: string;
  name?: string;
  registration_id?: string; // Optional, for linking to an existing registration
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SEND-DIRECT-LODGING-INVITE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getUser(token);
    
    if (claimsError || !claimsData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Verify admin role
    const { data: isAdmin } = await supabaseClient.rpc("has_role", {
      _user_id: claimsData.user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const body: SendRequest = await req.json();
    const { email, name, registration_id } = body;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Processing invite request", { email, name, registration_id });

    // Check if lodging invites are enabled
    const { data: lodgingSettings } = await supabaseClient
      .from("lodging_settings")
      .select("lodging_invite_enabled, invite_email_subject, invite_email_body")
      .limit(1)
      .maybeSingle();

    if (!lodgingSettings?.lodging_invite_enabled) {
      return new Response(
        JSON.stringify({ error: "Lodging invites are currently disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!lodgingSettings.invite_email_body) {
      return new Response(
        JSON.stringify({ error: "Email template not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get email settings for signature
    const { data: emailSettings } = await supabaseClient
      .from("email_settings")
      .select("signature_line, signature_name")
      .limit(1)
      .maybeSingle();

    const signatureLine = emailSettings?.signature_line || "✌️&❤️,";
    const signatureName = emailSettings?.signature_name || "The Cosmico Team";

    // Check for existing valid token
    const { data: existingToken } = await supabaseClient
      .from("lodging_invite_tokens")
      .select("id, token, used_at, expires_at")
      .eq("email", email.toLowerCase())
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let inviteToken: string;
    
    if (existingToken) {
      // Reuse existing valid token
      inviteToken = existingToken.token;
      logStep("Reusing existing token", { tokenId: existingToken.id });
    } else {
      // Generate new token
      inviteToken = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
      
      // Create token record
      const { error: tokenError } = await supabaseClient
        .from("lodging_invite_tokens")
        .insert({
          email: email.toLowerCase(),
          token: inviteToken,
          registration_id: registration_id || null,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        });

      if (tokenError) {
        logStep("Token creation error", { error: tokenError });
        return new Response(
          JSON.stringify({ error: "Failed to create invite token" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }
      logStep("Created new token");
    }

    // Build and send email
    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";
    const inviteLink = `${siteUrl}/accommodations/invite?token=${inviteToken}`;
    const firstName = name?.split(" ")[0] || "Guest";

    const html = lodgingSettings.invite_email_body
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{name\}\}/g, firstName)
      .replace(/\{\{invite_link\}\}/g, inviteLink)
      .replace(/\{\{signature_line\}\}/g, signatureLine)
      .replace(/\{\{signature_name\}\}/g, signatureName);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    
    await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [email],
      subject: lodgingSettings.invite_email_subject,
      html,
    });

    logStep("Email sent successfully", { email });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Lodging invite sent to ${email}`,
        invite_link: inviteLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    logStep("Error", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
