import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Creates a Stripe Billing Portal session for a customer to update their payment method
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { enrollmentId } = await req.json();

    if (!enrollmentId) {
      return new Response(
        JSON.stringify({ error: "enrollmentId is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: enrollment, error: enrollError } = await supabaseClient
      .from("payment_plan_enrollments")
      .select("stripe_customer_id")
      .eq("id", enrollmentId)
      .single();

    if (enrollError || !enrollment?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "Enrollment not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";

    // Create a SetupIntent checkout session to update payment method
    const session = await stripe.checkout.sessions.create({
      customer: enrollment.stripe_customer_id,
      mode: "setup",
      payment_method_types: ["card"],
      success_url: `${origin}/payment-plan-status?enrollment=${enrollmentId}&updated=true`,
      cancel_url: `${origin}/payment-plan-status?enrollment=${enrollmentId}`,
      metadata: {
        enrollment_id: enrollmentId,
        purpose: "update_payment_method",
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[create-payment-update-session] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
