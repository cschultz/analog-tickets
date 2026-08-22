import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  colors,
  fetchEmailTemplateConfig,
  buildColorsFromConfig,
} from "../_shared/email-template.ts";
import { getEmailSenderConfig } from "../_shared/email-sender-config.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface LodgingConfirmationRequest {
  bookingId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId } = (await req.json()) as LodgingConfirmationRequest;

    if (!bookingId) {
      return new Response(
        JSON.stringify({ error: "Missing bookingId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch the booking with registration and zone details
    const { data: booking, error: bookingError } = await supabase
      .from("lodging_bookings")
      .select(`
        id,
        zone_key,
        quantity,
        total_amount,
        created_at,
        assigned_unit_id,
        assignment_status,
        registrations(id, name, email),
        accommodation_zones(zone_name, description, sleeps_min, sleeps_max, night_price)
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Error fetching booking:", bookingError);
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const registration = booking.registrations as any;
    const zone = booking.accommodation_zones as any;

    if (!registration?.email) {
      return new Response(
        JSON.stringify({ error: "No email found for booking" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch email settings for signature
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("signature_line, signature_name")
      .limit(1)
      .maybeSingle();

    const signatureLine = emailSettings?.signature_line || "✌️&❤️,";
    const signatureName = emailSettings?.signature_name || "The Cosmico Team";

    // Fetch active event title
    const { data: activeEvent } = await supabase
      .from("event_details")
      .select("title")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const eventTitle = activeEvent?.title || "Cosmico";
    const firstName = getFirstName(registration.name);
    
    // Fetch email template config
    const templateConfig = await fetchEmailTemplateConfig();
    const c = buildColorsFromConfig(templateConfig);

    // Calculate total
    const totalFormatted = `$${(booking.total_amount / 100).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`;
    const nightPrice = zone?.night_price ? `$${(zone.night_price / 100).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}` : "";

    // Build email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: ${c.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${c.background}; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: ${c.surface}; border-radius: 8px; overflow: hidden; border: 1px solid ${c.border};">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background: ${c.primary}; padding: 30px 40px; text-align: center;">
                      <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 600;">
                        Lodging Confirmed! 🏕️
                      </h1>
                      <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 8px 0 0;">
                        ${escapeHtml(eventTitle)}
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="color: ${c.text}; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                        Hi ${escapeHtml(firstName)},
                      </p>
                      
                      <p style="color: ${c.text}; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                        Great news — your lodging for ${escapeHtml(eventTitle)} is confirmed! Here are your booking details:
                      </p>
                      
                      <!-- Booking Details Card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: ${c.surfaceAlt}; border-radius: 8px; margin-bottom: 24px;">
                        <tr>
                          <td style="padding: 24px;">
                            <h3 style="color: ${c.primary}; font-size: 18px; margin: 0 0 16px; font-weight: 600;">
                              ${escapeHtml(zone?.zone_name || "Accommodation")}
                            </h3>
                            
                            ${zone?.description ? `
                              <p style="color: ${c.textMuted}; font-size: 14px; line-height: 1.5; margin: 0 0 16px;">
                                ${escapeHtml(zone.description)}
                              </p>
                            ` : ""}
                            
                            <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
                              <tr>
                                <td style="color: ${c.textMuted}; padding: 8px 0; border-bottom: 1px solid ${c.border};">Quantity</td>
                                <td style="color: ${c.text}; padding: 8px 0; border-bottom: 1px solid ${c.border}; text-align: right; font-weight: 500;">
                                  ${booking.quantity} ${booking.quantity > 1 ? "units" : "unit"}
                                </td>
                              </tr>
                              ${nightPrice ? `
                              <tr>
                                <td style="color: ${c.textMuted}; padding: 8px 0; border-bottom: 1px solid ${c.border};">Rate</td>
                                <td style="color: ${c.text}; padding: 8px 0; border-bottom: 1px solid ${c.border}; text-align: right; font-weight: 500;">
                                  ${nightPrice}/night
                                </td>
                              </tr>
                              ` : ""}
                              <tr>
                                <td style="color: ${c.textMuted}; padding: 8px 0; border-bottom: 1px solid ${c.border};">Sleeps</td>
                                <td style="color: ${c.text}; padding: 8px 0; border-bottom: 1px solid ${c.border}; text-align: right; font-weight: 500;">
                                  ${zone?.sleeps_min || 2}–${zone?.sleeps_max || 4} guests
                                </td>
                              </tr>
                              <tr>
                                <td style="color: ${c.text}; padding: 12px 0 0; font-weight: 600;">Total Paid</td>
                                <td style="color: ${c.primary}; padding: 12px 0 0; text-align: right; font-weight: 700; font-size: 18px;">
                                  ${totalFormatted}
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Assignment Info -->
                      <div style="background: linear-gradient(135deg, ${c.success}15 0%, ${c.primary}10 100%); border-radius: 8px; padding: 20px; margin-bottom: 24px; border-left: 4px solid ${c.success};">
                        <p style="color: ${c.text}; font-size: 14px; line-height: 1.6; margin: 0;">
                          <strong>What's next?</strong> Your specific tent or cabin assignment will be shared closer to the event. We place guests thoughtfully based on preferences and group requests.
                        </p>
                      </div>
                      
                      <p style="color: ${c.text}; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                        If you have any questions about your lodging, just reply to this email — we're here to help!
                      </p>
                      
                      <p style="color: ${c.text}; font-size: 16px; line-height: 1.6; margin: 24px 0 0;">
                        ${escapeHtml(signatureLine)}<br>
                        <strong>${escapeHtml(signatureName)}</strong>
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background: ${c.surfaceAlt}; padding: 24px 40px; text-align: center; border-top: 1px solid ${c.border};">
                      <p style="color: ${c.textMuted}; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} Analog. All rights reserved.
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

    // Get sender config for lodging emails (personal sender)
    const senderConfig = await getEmailSenderConfig('lodging');

    // Send the email
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: senderConfig.fromAddress,
      to: [registration.email],
      subject: `🏕️ Lodging Confirmed for ${eventTitle}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Error sending lodging confirmation email:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: emailError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Lodging confirmation sent to ${registration.email} for booking ${bookingId}`);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-lodging-confirmation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
