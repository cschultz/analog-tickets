import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendOfferRequest {
  offer_id: string;
  new_expires_at: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[RESEND-CUSTOM-OFFER] ${step}${detailsStr}`);
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
    logStep("Function started");

    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Admin access required");
    logStep("Admin verified", { userId: userData.user.id });

    const body: ResendOfferRequest = await req.json();
    logStep("Request body", body);

    if (!body.offer_id) throw new Error("Offer ID is required");
    if (!body.new_expires_at) throw new Error("New expiration date is required");

    // Get the existing offer with its items
    const { data: offer, error: offerError } = await supabaseAdmin
      .from("custom_offers")
      .select("*, custom_offer_items(*), event_details(title)")
      .eq("id", body.offer_id)
      .single();

    if (offerError || !offer) throw new Error("Offer not found");
    logStep("Offer found", { status: offer.status, recipient: offer.recipient_email });

    // Only allow resending expired or pending offers
    if (offer.status !== "expired" && offer.status !== "pending") {
      throw new Error(`Cannot resend offer with status: ${offer.status}`);
    }

    // Validate and set new expiration date
    const newExpiresAt = new Date(body.new_expires_at);
    if (newExpiresAt <= new Date()) {
      throw new Error("New expiration date must be in the future");
    }

    // Generate new token
    const newOfferToken = crypto.randomUUID().replace(/-/g, "");

    // Update the offer with new expiration and token
    const { error: updateError } = await supabaseAdmin
      .from("custom_offers")
      .update({
        status: "pending",
        expires_at: newExpiresAt.toISOString(),
        offer_token: newOfferToken,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.offer_id);

    if (updateError) throw updateError;
    logStep("Offer updated with new expiration", { newExpiresAt: newExpiresAt.toISOString() });

    // Send email
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const resend = new Resend(resendKey);
      const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://example.invalid";
      const offerUrl = `${siteUrl}/offer/${newOfferToken}`;

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
          <h1 style="color: #1a1a1a;">Your Custom Offer Has Been Extended!</h1>
          ${offer.recipient_name ? `<p>Hi ${offer.recipient_name},</p>` : "<p>Hi there,</p>"}
          <p>Great news! We've extended your custom package offer for Cosmico 2026.</p>
          ${offer.custom_message ? `<p style="font-style: italic; color: #666;">"${offer.custom_message}"</p>` : ""}
          <p>Here's what's included:</p>
          <ul style="background: #f5f5f5; padding: 20px 40px; border-radius: 8px;">
            ${itemsHtml}
          </ul>
          <div style="background: #f5f5f5; padding: 15px 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Subtotal:</strong> $${(offer.subtotal / 100).toFixed(2)}</p>
            ${offer.discount_amount > 0 ? `<p style="margin: 5px 0; color: #16a34a;"><strong>Discount:</strong> -$${(offer.discount_amount / 100).toFixed(2)}</p>` : ""}
            <p style="margin: 5px 0; font-size: 18px;"><strong>Total:</strong> $${(offer.total_amount / 100).toFixed(2)}</p>
          </div>
          <p style="color: #dc2626;"><strong>New expiration: ${newExpiresAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" })}.</strong></p>
          <a href="${offerUrl}" style="display: inline-block; background: #1a1a1a; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0;">Review & Accept Offer</a>
          <p style="color: #666; font-size: 14px;">If you have any questions, just reply to this email.</p>
          <p>✌️&❤️,<br>The Cosmico Team</p>
        </div>
      `;

      try {
        await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [offer.recipient_email],
          subject: `Extended: Your Custom Cosmico 2026 Package${offer.recipient_name ? `, ${offer.recipient_name}` : ""}`,
          html: emailHtml,
        });
        logStep("Email sent successfully");
      } catch (emailError) {
        console.error("Email error:", emailError);
        // Don't fail the whole request if email fails
      }
    }

    return new Response(
      JSON.stringify({ success: true, offer_id: offer.id, new_offer_token: newOfferToken }),
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
