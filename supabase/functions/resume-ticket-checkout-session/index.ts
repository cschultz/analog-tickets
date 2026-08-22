// Authenticated resume for ticket checkouts initiated from My Tickets UI.
// Verifies the requester actually owns the registration by matching email,
// then creates a fresh Stripe Checkout session.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://example.invalid";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { registrationId, email } = await req.json();
    if (!registrationId || !email) {
      return new Response(JSON.stringify({ error: "registrationId and email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reg, error } = await supabase
      .from("registrations")
      .select("id, email, name, phone, ticket_type, quantity, payment_status, event_id, metadata")
      .eq("id", registrationId)
      .single();

    if (error || !reg) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Email match guard
    if ((reg.email || "").trim().toLowerCase() !== String(email).trim().toLowerCase()) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reg.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "already_paid", url: `${SITE_URL}/my-tickets` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tt } = await supabase
      .from("ticket_types")
      .select("key, label, price, stripe_price_id")
      .eq("event_id", reg.event_id)
      .eq("key", reg.ticket_type)
      .single();

    if (!tt?.stripe_price_id) {
      return new Response(JSON.stringify({ error: "unavailable", message: "This ticket is no longer available." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inv } = await supabase
      .from("ticket_inventory")
      .select("total_quantity, sold_quantity")
      .eq("ticket_type", reg.ticket_type)
      .eq("event_id", reg.event_id)
      .single();
    if (inv && (inv.total_quantity - inv.sold_quantity) < (reg.quantity || 1)) {
      return new Response(JSON.stringify({ error: "soldout", message: "These tickets just sold out." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

    const session = await stripe.checkout.sessions.create({
      customer_email: reg.email,
      line_items: [{ price: tt.stripe_price_id, quantity: reg.quantity || 1 }],
      mode: "payment",
      success_url: `${SITE_URL}/ticket-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/my-tickets`,
      payment_intent_data: { description: `Cosmico - ${tt.label}` },
      metadata: {
        registration_id: reg.id,
        ticket_type: reg.ticket_type,
        quantity: String(reg.quantity || 1),
        resumed: "true",
      },
    });

    await supabase
      .from("registrations")
      .update({
        stripe_session_id: session.id,
        payment_status: "pending",
        checkout_status: "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", reg.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (e: any) {
    console.error("[resume-ticket-checkout-session] error:", e?.message);
    return new Response(JSON.stringify({ error: e?.message || "unexpected" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
