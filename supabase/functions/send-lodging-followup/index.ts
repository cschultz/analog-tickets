import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FollowUpRequest {
  waitlistIds?: string[]; // Send to specific waitlist entries
  sendToAll?: boolean; // Send to all invited-but-not-booked entries
  isPreview?: boolean; // Return preview HTML without sending
  previewName?: string;
  previewEmail?: string;
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

    const body: FollowUpRequest = await req.json();
    const { waitlistIds, sendToAll, isPreview, previewName, previewEmail } = body;

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

    // Get email settings for signature
    const { data: emailSettings } = await supabaseClient
      .from("email_settings")
      .select("signature_line, signature_name")
      .limit(1)
      .maybeSingle();

    const signatureLine = emailSettings?.signature_line || "✌️&❤️,";
    const signatureName = emailSettings?.signature_name || "The Cosmico Team";
    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";

    // For preview, return sample HTML
    if (isPreview) {
      const displayName = previewName?.split(" ")[0] || "Alex";
      const sampleToken = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
      const previewLink = `${siteUrl}/accommodations/invite?token=${sampleToken}`;
      
      const html = generateFollowUpEmail(displayName, previewLink, signatureLine, signatureName);

      return new Response(
        JSON.stringify({ 
          preview: true,
          subject: "Don't forget to book your lodging! 🏕️",
          html,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get waitlist entries that have been invited but haven't booked
    let waitlistQuery = supabaseClient
      .from("accommodation_waitlist")
      .select("id, email, name, registration_id")
      .eq("event_id", event.id)
      .not("notified_at", "is", null); // Only those who have been invited

    if (waitlistIds && waitlistIds.length > 0) {
      waitlistQuery = waitlistQuery.in("id", waitlistIds);
    }

    const { data: waitlistEntries, error: waitlistError } = await waitlistQuery;

    if (waitlistError) {
      console.error("[send-lodging-followup] Error fetching waitlist:", waitlistError);
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

    // Get emails that have already booked lodging
    const emails = waitlistEntries.map(e => e.email.toLowerCase());
    const { data: bookings } = await supabaseClient
      .from("lodging_bookings")
      .select("email")
      .eq("event_id", event.id)
      .eq("payment_status", "completed")
      .in("email", emails);

    const bookedEmails = new Set((bookings || []).map((b: any) => b.email.toLowerCase()));

    // Filter to only those who haven't booked
    const entriesToEmail = waitlistEntries.filter(
      entry => !bookedEmails.has(entry.email.toLowerCase())
    );

    if (entriesToEmail.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "All selected entries have already booked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    let sentCount = 0;
    const errors: string[] = [];

    // Process in batches of 2 with delay (Resend rate limiting)
    for (let i = 0; i < entriesToEmail.length; i += 2) {
      const batch = entriesToEmail.slice(i, i + 2);
      
      for (const entry of batch) {
        try {
          // Look up existing token or create a new one
          const { data: existingToken } = await supabaseClient
            .from("lodging_invite_tokens")
            .select("token, used_at")
            .eq("email", entry.email.toLowerCase())
            .is("used_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          let inviteToken: string;
          
          if (existingToken?.token) {
            inviteToken = existingToken.token;
            console.log("[send-lodging-followup] Reusing existing token for:", entry.email);
          } else {
            // Create new token
            inviteToken = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
            const { error: tokenError } = await supabaseClient
              .from("lodging_invite_tokens")
              .insert({
                email: entry.email.toLowerCase(),
                token: inviteToken,
                registration_id: entry.registration_id,
              });

            if (tokenError) {
              console.error("[send-lodging-followup] Token creation error:", tokenError);
              errors.push(`Failed to create token for ${entry.email}`);
              continue;
            }
          }

          const inviteLink = `${siteUrl}/accommodations/invite?token=${inviteToken}`;
          const firstName = entry.name?.split(" ")[0] || "Guest";

          const html = generateFollowUpEmail(firstName, inviteLink, signatureLine, signatureName);

          await resend.emails.send({
            from: "The Cosmico Team <hello@example.invalid>",
            to: [entry.email],
            subject: "Don't forget to book your lodging! 🏕️",
            html,
          });

          sentCount++;
          console.log("[send-lodging-followup] Follow-up sent to:", entry.email);
        } catch (err: any) {
          console.error("[send-lodging-followup] Error sending to", entry.email, err);
          errors.push(`Failed to send to ${entry.email}: ${err.message}`);
        }
      }

      // Delay between batches
      if (i + 2 < entriesToEmail.length) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        total: entriesToEmail.length,
        skipped: waitlistEntries.length - entriesToEmail.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("[send-lodging-followup] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

function generateFollowUpEmail(firstName: string, inviteLink: string, signatureLine: string, signatureName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px;">
        <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 20px 0;">Hey ${firstName}! 👋</h1>
        
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Just a quick reminder — we noticed you haven't booked your lodging for Cosmico yet!
        </p>
        
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Spaces are filling up, and we'd hate for you to miss out on staying onsite with the crew. 
          Your personalized booking link is still active:
        </p>
        
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding: 25px 0;">
              <a href="${inviteLink}" 
                 style="display: inline-block; padding: 14px 32px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">
                Book Your Lodging Now →
              </a>
            </td>
          </tr>
        </table>
        
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          If you have any questions about the accommodation options or need help deciding, 
          just reply to this email — we're here to help!
        </p>
        
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 30px 0 5px 0;">
          ${signatureLine}
        </p>
        <p style="color: #1a1a1a; font-size: 16px; font-weight: 600; margin: 0;">
          ${signatureName}
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;" />
        
        <p style="color: #888; font-size: 12px; line-height: 1.5; margin: 0;">
          Your personal booking link: <a href="${inviteLink}" style="color: #666;">${inviteLink}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
