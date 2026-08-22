import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      console.error("[CREATE-UPGRADE-CHECKOUT] Auth error:", userError);
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
      console.error("[CREATE-UPGRADE-CHECKOUT] User is not admin:", user.id);
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { registrationId, ticketIds, unitUpgradePrice } = await req.json();
    console.log("[CREATE-UPGRADE-CHECKOUT] Request:", { registrationId, ticketIds, unitUpgradePrice });

    if (!registrationId || !ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch registration details
    const { data: registration, error: regError } = await supabaseClient
      .from("registrations")
      .select("*, event_details(*)")
      .eq("id", registrationId)
      .single();

    if (regError || !registration) {
      console.error("[CREATE-UPGRADE-CHECKOUT] Registration not found:", regError);
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the tickets to upgrade
    const { data: tickets, error: ticketsError } = await supabaseClient
      .from("tickets")
      .select("id, ticket_type, status, unit_price")
      .in("id", ticketIds)
      .eq("registration_id", registrationId)
      .eq("ticket_type", "party_only")
      .eq("status", "active");

    if (ticketsError || !tickets || tickets.length === 0) {
      console.error("[CREATE-UPGRADE-CHECKOUT] No valid tickets found:", ticketsError);
      return new Response(JSON.stringify({ error: "No valid party_only tickets found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const registrationMetadata = registration.metadata && typeof registration.metadata === "object"
      ? registration.metadata as Record<string, unknown>
      : null;
    const promoDiscountCents = typeof registrationMetadata?.promo_discount_cents === "number"
      ? registrationMetadata.promo_discount_cents
      : 0;
    const promoAdjustmentPerTicket = promoDiscountCents > 0 && registration.quantity > 0
      ? Math.round(promoDiscountCents / registration.quantity)
      : 0;
    const averagePaidUnitPrice = Math.round(
      tickets.reduce((sum, ticket) => sum + (ticket.unit_price || 0), 0) / tickets.length
    );
    const defaultUpgradePrice = Math.max(averagePaidUnitPrice + promoAdjustmentPerTicket, 0);
    const upgradePrice = typeof unitUpgradePrice === "number" && unitUpgradePrice > 0
      ? unitUpgradePrice
      : defaultUpgradePrice;
    const totalAmount = upgradePrice * tickets.length;

    console.log("[CREATE-UPGRADE-CHECKOUT] Pricing:", { 
      averagePaidUnitPrice,
      promoDiscountCents,
      promoAdjustmentPerTicket,
      upgradePrice, 
      ticketCount: tickets.length, 
      totalAmount 
    });

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: registration.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Dinner Upgrade - ${registration.event_details?.title || "Cosmico Event"}`,
              description: `Upgrade ${tickets.length} ticket(s) from Party Only to Dinner & Party`,
            },
            unit_amount: upgradePrice,
          },
          quantity: tickets.length,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/`,
      payment_intent_data: {
        description: `Cosmico - Dinner Upgrade`,
      },
      metadata: {
        type: "ticket_upgrade",
        upgrade_offer_id: "", // Will be updated after creating the offer
        registration_id: registrationId,
        ticket_ids: JSON.stringify(ticketIds),
        original_price_basis: "same_tier_original_price",
        promo_discount_transferable: "false",
      },
    });

    console.log("[CREATE-UPGRADE-CHECKOUT] Stripe session created:", session.id);

    // Create upgrade offer record
    const { data: upgradeOffer, error: offerError } = await supabaseClient
      .from("upgrade_offers")
      .insert({
        registration_id: registrationId,
        ticket_ids: ticketIds,
        unit_upgrade_price: upgradePrice,
        total_amount: totalAmount,
        upgrade_from: "party_only",
        upgrade_to: "dinner_and_party",
        stripe_session_id: session.id,
        created_by: user.id,
        status: "pending",
      })
      .select()
      .single();

    if (offerError) {
      console.error("[CREATE-UPGRADE-CHECKOUT] Error creating upgrade offer:", offerError);
      return new Response(JSON.stringify({ error: "Failed to create upgrade offer" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[CREATE-UPGRADE-CHECKOUT] Upgrade offer created:", upgradeOffer.id);

    return new Response(
      JSON.stringify({
        success: true,
        upgradeOfferId: upgradeOffer.id,
        checkoutUrl: session.url,
        sessionId: session.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[CREATE-UPGRADE-CHECKOUT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
