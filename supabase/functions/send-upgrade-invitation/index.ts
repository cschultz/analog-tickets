import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  colors,
} from "../_shared/email-template.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabaseClient
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

    const { upgradeOfferId } = await req.json();
    console.log("[SEND-UPGRADE-INVITATION] Request for offer:", upgradeOfferId);

    // Fetch upgrade offer with registration details
    const { data: offer, error: offerError } = await supabaseClient
      .from("upgrade_offers")
      .select(`
        *,
        registrations (
          name,
          email,
          event_id,
          event_details (
            title,
            event_date,
            event_time,
            venue_name
          )
        )
      `)
      .eq("id", upgradeOfferId)
      .single();

    if (offerError || !offer) {
      console.error("[SEND-UPGRADE-INVITATION] Offer not found:", offerError);
      return new Response(JSON.stringify({ error: "Upgrade offer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const registration = offer.registrations;
    const event = registration.event_details;
    const ticketCount = offer.ticket_ids.length;
    const totalAmount = (offer.total_amount / 100).toFixed(2);
    const unitPrice = (offer.unit_upgrade_price / 100).toFixed(2);

    // Get the checkout URL from Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });
    
    const session = await stripe.checkout.sessions.retrieve(offer.stripe_session_id);
    const paymentUrl = session.url;

    if (!paymentUrl) {
      console.error("[SEND-UPGRADE-INVITATION] No checkout URL available");
      return new Response(JSON.stringify({ error: "Checkout session expired" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch email signature settings
    const { data: emailSettings } = await supabaseClient
      .from('email_settings')
      .select('signature_line, signature_name')
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || '✌️&❤️,';
    const signatureName = emailSettings?.signature_name || 'The Cosmico Team';

    const firstName = getFirstName(registration.name);
    const safeEventTitle = escapeHtml(event?.title || "Cosmico Event");
    const eventTitle = event?.title || "Cosmico";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dinner Upgrade Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: ${colors.background};">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${colors.background};">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: ${colors.surface}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${colors.darkBg} 0%, #0C0C0F 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0 0 10px; color: ${colors.accentGold}; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">
                ${escapeHtml(eventTitle)}
              </h1>
              <p style="margin: 0; color: ${colors.accentBlue}; font-size: 16px;">
                You're Invited to Join Us for Dinner
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #1a1a1a; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(firstName)},
              </p>
              
              <p style="margin: 0 0 20px; color: #1a1a1a; font-size: 16px; line-height: 1.6;">
                Great news! You've been invited to upgrade your ${safeEventTitle} experience to include our exclusive dinner celebration.
              </p>
              
              <p style="margin: 0 0 20px; color: #1a1a1a; font-size: 16px; line-height: 1.6;">
                We're honoring the same ticket-tier price you originally paid for each ticket. Promo code discounts from the original purchase don't carry over to this upgrade offer.
              </p>
              
              <div style="background-color: ${colors.background}; border-radius: 8px; padding: 24px; margin: 24px 0;">
                <h3 style="margin: 0 0 16px; color: ${colors.darkBg}; font-size: 18px;">Upgrade Details</h3>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Tickets to upgrade:</td>
                    <td style="padding: 8px 0; color: #1a1a1a; text-align: right; font-weight: 600;">${ticketCount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Price per ticket:</td>
                    <td style="padding: 8px 0; color: #1a1a1a; text-align: right; font-weight: 600;">$${unitPrice}</td>
                  </tr>
                  <tr style="border-top: 1px solid #ddd;">
                    <td style="padding: 16px 0 8px; color: ${colors.darkBg}; font-weight: 600; font-size: 18px;">Total:</td>
                    <td style="padding: 16px 0 8px; color: #FF6E4A; text-align: right; font-weight: 700; font-size: 20px;">$${totalAmount}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 0 0 20px; color: #1a1a1a; font-size: 16px; line-height: 1.6;">
                Click the button below to complete your upgrade and secure your spot at our dinner table.
              </p>
              
              <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 16px; margin: 0 0 24px; text-align: center;">
                <p style="margin: 0; color: #856404; font-size: 14px; font-weight: 600;">
                  ⏰ This offer expires in 48 hours
                </p>
              </div>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${paymentUrl}" style="display: inline-block; background-color: #FF6E4A; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  Complete Your Upgrade
                </a>
              </div>
              
              <p style="margin: 30px 0 0; color: #888; font-size: 14px; line-height: 1.6; text-align: center;">
                ${escapeHtml(signatureLine)}<br>${escapeHtml(signatureName)}
              </p>
              <p style="margin: 20px 0 0; color: #666; font-size: 13px; line-height: 1.6; text-align: center;">
                Questions? Reply to this email or reach out to us at hello@example.invalid
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: ${colors.darkBg}; padding: 24px 30px; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 12px;">
                © ${new Date().getFullYear()} Cosmico. All rights reserved.
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

    // Send email
    const { error: emailError } = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [registration.email],
      subject: `You're Invited to Upgrade to Dinner - ${safeEventTitle}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("[SEND-UPGRADE-INVITATION] Email error:", emailError);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update offer status to 'invited'
    await supabaseClient
      .from("upgrade_offers")
      .update({ status: "invited" })
      .eq("id", upgradeOfferId);

    console.log("[SEND-UPGRADE-INVITATION] Email sent successfully to:", registration.email);

    return new Response(
      JSON.stringify({ success: true, email: registration.email }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[SEND-UPGRADE-INVITATION] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
