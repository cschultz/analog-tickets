import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SEND-OFFER-EXPIRY-REMINDERS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started - checking for offers expiring soon");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      throw new Error("RESEND_API_KEY not configured");
    }
    const resend = new Resend(resendKey);

    // Find pending offers expiring within 24-25 hours (to catch them once per day)
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const { data: expiringOffers, error: fetchError } = await supabaseAdmin
      .from("custom_offers")
      .select(`
        id,
        offer_token,
        recipient_email,
        recipient_name,
        expires_at,
        subtotal,
        discount_amount,
        total_amount,
        event_id,
        custom_offer_items (
          item_type,
          ticket_type,
          lodging_inventory_id,
          addon_inventory_id,
          quantity,
          unit_price
        )
      `)
      .eq("status", "pending")
      .gte("expires_at", in24Hours.toISOString())
      .lt("expires_at", in25Hours.toISOString());

    if (fetchError) throw fetchError;

    logStep("Found expiring offers", { count: expiringOffers?.length || 0 });

    if (!expiringOffers || expiringOffers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No offers expiring soon", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";
    let emailsSent = 0;
    const errors: string[] = [];

    for (const offer of expiringOffers) {
      try {
        logStep("Processing offer", { offerId: offer.id, email: offer.recipient_email });

        const offerUrl = `${siteUrl}/offer/${offer.offer_token}`;
        const expiresAt = new Date(offer.expires_at);
        const hoursLeft = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));

        // Build items list for email
        let itemsHtml = "";
        for (const item of offer.custom_offer_items || []) {
          let itemName = "";
          if (item.item_type === "ticket") {
            itemName = item.ticket_type?.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Ticket";
          } else if (item.item_type === "lodging" && item.lodging_inventory_id) {
            const { data: l } = await supabaseAdmin
              .from("lodging_inventory")
              .select("display_name")
              .eq("id", item.lodging_inventory_id)
              .single();
            itemName = l?.display_name || "Lodging";
          } else if (item.item_type === "addon" && item.addon_inventory_id) {
            const { data: a } = await supabaseAdmin
              .from("addon_inventory")
              .select("display_name")
              .eq("id", item.addon_inventory_id)
              .single();
            itemName = a?.display_name || "Add-on";
          }
          itemsHtml += `<li>${item.quantity}x ${itemName} - $${(item.unit_price * item.quantity / 100).toFixed(2)}</li>`;
        }

        const emailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">⏰ Your Custom Offer Expires Soon!</h1>
            ${offer.recipient_name ? `<p>Hi ${offer.recipient_name},</p>` : "<p>Hi there,</p>"}
            <p style="font-size: 18px;">Your exclusive Cosmico 2026 package expires in <strong>${hoursLeft} hours</strong>!</p>
            <p>Don't miss out on this special offer we put together just for you:</p>
            <ul style="background: #f5f5f5; padding: 20px 40px; border-radius: 8px;">
              ${itemsHtml}
            </ul>
            <div style="background: #fef2f2; border: 2px solid #dc2626; padding: 15px 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0; font-size: 18px;"><strong>Your Total:</strong> $${(offer.total_amount / 100).toFixed(2)}</p>
              ${offer.discount_amount > 0 ? `<p style="margin: 5px 0; color: #16a34a;">Including $${(offer.discount_amount / 100).toFixed(2)} discount!</p>` : ""}
              <p style="margin: 10px 0 5px 0; color: #dc2626;"><strong>Expires: ${expiresAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</strong></p>
            </div>
            <a href="${offerUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-size: 18px;">Accept Offer Now →</a>
            <p style="color: #666;">Once this offer expires, the reserved inventory will be released and may not be available at this price.</p>
            <p style="color: #666; font-size: 14px;">If you have any questions, just reply to this email.</p>
            <p>✌️&❤️,<br>The Cosmico Team</p>
          </div>
        `;

        await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [offer.recipient_email],
          subject: `⏰ Your Custom Offer Expires in ${hoursLeft} Hours!`,
          html: emailHtml,
        });

        emailsSent++;
        logStep("Email sent", { offerId: offer.id });
      } catch (emailError: any) {
        console.error("Error sending email for offer", offer.id, emailError);
        errors.push(`Offer ${offer.id}: ${emailError.message}`);
      }
    }

    const summary = {
      total_expiring: expiringOffers.length,
      emails_sent: emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    };

    logStep("Reminder emails complete", summary);

    return new Response(
      JSON.stringify({ success: true, ...summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
