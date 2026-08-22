import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { generateMetaEventId, sendMetaCapiInitiateCheckout } from "../_shared/meta-capi-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TICKET_LABELS: Record<string, string> = {
  "2day_ga": "2-Day GA",
  "saturday_ga": "Saturday GA",
  "friday_ga": "Friday GA",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { checkout_token, assignees, fbp, fbc } = await req.json();

    if (!checkout_token) throw new Error("Missing checkout token");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch accepted bid
    const { data: bid, error: bidErr } = await supabase
      .from("crew_bids")
      .select("*")
      .eq("checkout_token", checkout_token)
      .eq("status", "accepted")
      .single();

    if (bidErr || !bid) {
      throw new Error("Invalid or expired checkout link");
    }

    // Check expiry
    if (bid.checkout_expires_at && new Date(bid.checkout_expires_at) < new Date()) {
      throw new Error("This checkout link has expired. Please contact us.");
    }

    if (bid.payment_status === "paid") {
      throw new Error("This crew bid has already been paid.");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const ticketLabel = TICKET_LABELS[bid.ticket_type] || bid.ticket_type;
    const unitAmount = bid.accepted_price * 100; // Convert to cents
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";
    const metaEventId = generateMetaEventId("purchase");
    const icEventId = generateMetaEventId("ic");

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: bid.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Cosmico — ${ticketLabel} (Crew Bid)`,
              description: `Crew of ${bid.crew_size} — Captain: ${bid.captain_name}`,
            },
            unit_amount: unitAmount,
          },
          quantity: bid.crew_size,
        },
      ],
      mode: "payment",
      payment_intent_data: {
        description: `Cosmico - Crew Bid ${ticketLabel} x${bid.crew_size}`,
      },
      success_url: `${origin}/bringyourcrew/checkout?token=${checkout_token}&success=true`,
      cancel_url: `${origin}/bringyourcrew/checkout?token=${checkout_token}`,
      metadata: {
        crew_bid_id: bid.id,
        checkout_token: checkout_token,
        captain_name: bid.captain_name,
        crew_size: bid.crew_size.toString(),
        ticket_type: bid.ticket_type,
        assignees: assignees ? JSON.stringify(assignees) : "[]",
        meta_event_id: metaEventId,
        fbp: fbp || "",
        fbc: fbc || "",
        client_ip: bid.client_ip || "",
        client_user_agent: (bid.client_user_agent || "").substring(0, 500),
        event_source_url: "https://example.invalid",
      },
    });

    // Save stripe session ID and meta_event_id
    await supabase
      .from("crew_bids")
      .update({ 
        stripe_session_id: session.id, 
        meta_event_id: metaEventId,
        fbp: fbp || null,
        fbc: fbc || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bid.id);

    // Fire server-side InitiateCheckout CAPI (non-blocking)
    const crewClientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                         req.headers.get("x-real-ip") || undefined;
    sendMetaCapiInitiateCheckout({
      event_id: icEventId,
      email: bid.email,
      first_name: bid.captain_name?.split(" ")[0] || undefined,
      last_name: bid.captain_name?.split(" ").slice(1).join(" ") || undefined,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
      external_id: bid.id,
      client_ip: bid.client_ip || crewClientIp,
      client_user_agent: bid.client_user_agent || req.headers.get("user-agent") || undefined,
      value: bid.accepted_price * bid.crew_size,
      currency: "USD",
      content_ids: [bid.ticket_type],
      content_name: `Cosmico — ${ticketLabel} (Crew Bid)`,
      event_source_url: "https://example.invalid",
    }).catch((err) => console.error("[create-crew-checkout] CAPI IC error:", err));

    return new Response(JSON.stringify({ url: session.url, metaEventId, icEventId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating crew checkout:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
