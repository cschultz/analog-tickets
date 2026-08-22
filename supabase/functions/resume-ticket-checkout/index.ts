// Public endpoint that revives an abandoned ticket checkout.
// Accepts ?id=<registration_id>&t=<hmac> and redirects to a fresh Stripe Checkout URL.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://example.invalid";

async function hmacToken(id: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`resume:${id}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: url } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const token = url.searchParams.get("t");
    if (!id || !token) return redirect(`${SITE_URL}/tickets?resume=invalid`);

    const expected = await hmacToken(id);
    // constant-time compare (best-effort)
    if (token.length !== expected.length) return redirect(`${SITE_URL}/tickets?resume=invalid`);
    let diff = 0;
    for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return redirect(`${SITE_URL}/tickets?resume=invalid`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reg, error } = await supabase
      .from("registrations")
      .select("id, email, name, phone, ticket_type, quantity, total_amount, payment_status, event_id, metadata")
      .eq("id", id)
      .single();

    if (error || !reg) return redirect(`${SITE_URL}/tickets?resume=notfound`);

    // If already paid, send to my-tickets
    if (reg.payment_status === "paid") {
      return redirect(`${SITE_URL}/my-tickets?email=${encodeURIComponent(reg.email)}`);
    }

    // Look up ticket pricing
    const { data: tt } = await supabase
      .from("ticket_types")
      .select("key, label, price, stripe_price_id")
      .eq("event_id", reg.event_id)
      .eq("key", reg.ticket_type)
      .single();

    if (!tt?.stripe_price_id) {
      return redirect(`${SITE_URL}/tickets?resume=unavailable`);
    }

    // Inventory guard
    const { data: inv } = await supabase
      .from("ticket_inventory")
      .select("total_quantity, sold_quantity")
      .eq("ticket_type", reg.ticket_type)
      .eq("event_id", reg.event_id)
      .single();
    if (inv && (inv.total_quantity - inv.sold_quantity) < (reg.quantity || 1)) {
      return redirect(`${SITE_URL}/tickets?resume=soldout`);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

    const session = await stripe.checkout.sessions.create({
      customer_email: reg.email,
      line_items: [{ price: tt.stripe_price_id, quantity: reg.quantity || 1 }],
      mode: "payment",
      success_url: `${SITE_URL}/ticket-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/tickets?canceled=true`,
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

    return redirect(session.url!);
  } catch (e: any) {
    console.error("[resume-ticket-checkout] error:", e?.message);
    return redirect(`${SITE_URL}/tickets?resume=error`);
  }
});
