import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendRequest {
  waitlistIds?: string[]; // Send to specific waitlist entries
  sendToAll?: boolean; // Send to all waitlist entries that haven't been invited
  testEmail?: string; // Send a test email to this address
  isPreview?: boolean; // Return preview HTML without sending
  previewName?: string; // Name for personalized preview
  previewEmail?: string; // Email for personalized preview (used in token generation display)
  sendActualEmail?: boolean; // When true with isPreview, actually send the preview email
}

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
    const { waitlistIds, sendToAll, testEmail, isPreview, previewName, previewEmail, sendActualEmail } = body;

    // Get lodging settings including email template
    const { data: settings } = await supabaseClient
      .from("lodging_settings")
      .select("invite_email_subject, invite_email_body")
      .limit(1)
      .maybeSingle();

    if (!settings?.invite_email_body) {
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

    // For preview, return sample HTML with optional personalization
    // If sendActualEmail is true, also send the email
    if (isPreview) {
      const displayName = previewName?.split(" ")[0] || "Alex";
      const sampleToken = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
      const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";
      const previewLink = `${siteUrl}/accommodations/invite?token=${sampleToken}`;
      
      const sampleHtml = settings.invite_email_body
        .replace(/\{\{first_name\}\}/g, displayName)
        .replace(/\{\{name\}\}/g, displayName) // Also support {{name}} for backwards compatibility
        .replace(/\{\{invite_link\}\}/g, previewLink)
        .replace(/\{\{signature_line\}\}/g, signatureLine)
        .replace(/\{\{signature_name\}\}/g, signatureName);

      // If sendActualEmail is true, actually send the preview email
      if (sendActualEmail && previewEmail) {
        const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
        try {
          await resend.emails.send({
            from: "The Cosmico Team <hello@example.invalid>",
            to: [previewEmail],
            subject: `[PREVIEW] ${settings.invite_email_subject}`,
            html: sampleHtml,
          });
          console.log("[send-lodging-invites] Preview email sent to:", previewEmail);
        } catch (emailError: any) {
          console.error("[send-lodging-invites] Preview email error:", emailError);
          return new Response(
            JSON.stringify({ error: `Failed to send preview: ${emailError.message}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
          );
        }
      }

      return new Response(
        JSON.stringify({ 
          preview: true,
          subject: settings.invite_email_subject,
          html: sampleHtml,
          previewName: previewName || "Alex",
          previewEmail: previewEmail || "guest@example.com",
          previewToken: sampleToken,
          emailSent: sendActualEmail && !!previewEmail,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get active event
    const { data: event } = await supabaseClient
      .from("event_details")
      .select("id")
      .eq("is_active", true)
      .single();

    if (!event) {
      return new Response(
        JSON.stringify({ error: "No active event found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";

    // Test email mode
    if (testEmail) {
      const testToken = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
      const inviteLink = `${siteUrl}/accommodations/invite?token=${testToken}`;
      
      const html = settings.invite_email_body
        .replace(/\{\{first_name\}\}/g, "Test User")
        .replace(/\{\{name\}\}/g, "Test User") // Also support {{name}} for backwards compatibility
        .replace(/\{\{invite_link\}\}/g, inviteLink)
        .replace(/\{\{signature_line\}\}/g, signatureLine)
        .replace(/\{\{signature_name\}\}/g, signatureName);

      await resend.emails.send({
        from: "The Cosmico Team <hello@example.invalid>",
        to: [testEmail],
        subject: `[TEST] ${settings.invite_email_subject}`,
        html,
      });

      return new Response(
        JSON.stringify({ success: true, message: `Test email sent to ${testEmail}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get waitlist entries to send to
    let waitlistQuery = supabaseClient
      .from("accommodation_waitlist")
      .select("id, email, name, registration_id")
      .eq("event_id", event.id)
      .is("notified_at", null);

    if (waitlistIds && waitlistIds.length > 0) {
      waitlistQuery = waitlistQuery.in("id", waitlistIds);
    }

    const { data: waitlistEntries, error: waitlistError } = await waitlistQuery;

    if (waitlistError) {
      console.error("[send-lodging-invites] Error fetching waitlist:", waitlistError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch waitlist entries" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (!waitlistEntries || waitlistEntries.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No waitlist entries to send to" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    let sentCount = 0;
    const errors: string[] = [];

    // Process in batches of 2 with delay (Resend rate limiting)
    for (let i = 0; i < waitlistEntries.length; i += 2) {
      const batch = waitlistEntries.slice(i, i + 2);
      
      for (const entry of batch) {
        try {
          // Generate unique token
          const inviteToken = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
          
          // Create token record
          const { error: tokenError } = await supabaseClient
            .from("lodging_invite_tokens")
            .insert({
              email: entry.email.toLowerCase(),
              token: inviteToken,
              registration_id: entry.registration_id,
            });

          if (tokenError) {
            console.error("[send-lodging-invites] Token creation error:", tokenError);
            errors.push(`Failed to create token for ${entry.email}`);
            continue;
          }

          const inviteLink = `${siteUrl}/accommodations/invite?token=${inviteToken}`;
          const firstName = entry.name?.split(" ")[0] || "Guest";

          const html = settings.invite_email_body
            .replace(/\{\{first_name\}\}/g, firstName)
            .replace(/\{\{name\}\}/g, firstName) // Also support {{name}} for backwards compatibility
            .replace(/\{\{invite_link\}\}/g, inviteLink)
            .replace(/\{\{signature_line\}\}/g, signatureLine)
            .replace(/\{\{signature_name\}\}/g, signatureName);

          await resend.emails.send({
            from: "The Cosmico Team <hello@example.invalid>",
            to: [entry.email],
            subject: settings.invite_email_subject,
            html,
          });

          // Mark as notified
          await supabaseClient
            .from("accommodation_waitlist")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", entry.id);

          sentCount++;
        } catch (err: any) {
          console.error("[send-lodging-invites] Error sending to", entry.email, err);
          errors.push(`Failed to send to ${entry.email}: ${err.message}`);
        }
      }

      // Delay between batches
      if (i + 2 < waitlistEntries.length) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        total: waitlistEntries.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("[send-lodging-invites] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
