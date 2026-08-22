import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://example.invalid";

interface RequestBody {
  registrationIds: string[];
  customMessage: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify admin
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

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { registrationIds, customMessage }: RequestBody = await req.json();

    if (!registrationIds || registrationIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No registrations specified" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch registrations
    const { data: registrations, error: fetchError } = await supabase
      .from("registrations")
      .select("id, name, email, ticket_type")
      .in("id", registrationIds);

    if (fetchError) {
      throw fetchError;
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({ error: "No registrations found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get email settings
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("signature_name, signature_line")
      .single();

    const signatureName = emailSettings?.signature_name || "The Cosmico Team";
    const signatureLine = emailSettings?.signature_line || "✌️&❤️,";

    // Send emails
    const results = [];
    for (const registration of registrations) {
      const firstName = registration.name.split(" ")[0] || "there";
      
      const emailHtml = generateEmailHtml({
        firstName,
        customMessage,
        signatureName,
        signatureLine,
        siteUrl: SITE_URL,
      });

      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "The Cosmico Team <hello@example.invalid>",
            to: [registration.email],
            subject: "🏕️ Accommodations Now Available - Cosmico 2026",
            html: emailHtml,
          }),
        });

        if (!emailRes.ok) {
          const errorText = await emailRes.text();
          console.error(`Failed to send to ${registration.email}:`, errorText);
          results.push({ id: registration.id, success: false, error: errorText });
        } else {
          results.push({ id: registration.id, success: true });
          
          // Update waitlist_notified_at timestamp
          await supabase
            .from("registrations")
            .update({ waitlist_notified_at: new Date().toISOString() })
            .eq("id", registration.id);
          
          // Log the email
          await supabase.from("email_logs").insert({
            registration_id: registration.id,
            email_type: "accommodation_available",
            status: "sent",
            sent_by: user.id,
          });
        }
      } catch (emailError: any) {
        console.error(`Error sending to ${registration.email}:`, emailError);
        results.push({ id: registration.id, success: false, error: emailError.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in notify-accommodation-waitlist:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

function generateEmailHtml({
  firstName,
  customMessage,
  signatureName,
  signatureLine,
  siteUrl,
}: {
  firstName: string;
  customMessage: string;
  signatureName: string;
  signatureLine: string;
  siteUrl: string;
}): string {
  const escapedMessage = customMessage
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accommodations Now Available</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f0;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a3a2f 0%, #2d5a47 100%); padding: 40px 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #d4a574; font-size: 28px; font-weight: 600; letter-spacing: 2px;">
                COSMICO
              </h1>
              <p style="margin: 8px 0 0; color: #f5f5f0; font-size: 14px; letter-spacing: 1px;">
                FEAST · STAY · GATHER
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #1a3a2f; font-size: 24px; font-weight: 600;">
                🏕️ Accommodations Now Available!
              </h2>
              
              <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
                Hey ${firstName},
              </p>
              
              <p style="margin: 0 0 24px; color: #333; font-size: 16px; line-height: 1.6;">
                ${escapedMessage}
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${siteUrl}/tickets" style="display: inline-block; background-color: #d4a574; color: #1a3a2f; text-decoration: none; font-weight: 600; font-size: 16px; padding: 16px 32px; border-radius: 8px;">
                      Book Your Accommodation
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Signature -->
              <p style="margin: 30px 0 0; color: #333; font-size: 16px; line-height: 1.6;">
                ${signatureLine}<br>
                <strong>${signatureName}</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f0; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e5e0;">
              <p style="margin: 0; color: #666; font-size: 12px;">
                Cosmico 2026 · January 24-26 · Wildhaven Sonoma
              </p>
              <p style="margin: 8px 0 0; color: #999; font-size: 11px;">
                You received this email because you joined the accommodation waitlist.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

serve(handler);
