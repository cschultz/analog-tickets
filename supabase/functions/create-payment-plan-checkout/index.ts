import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimitDb } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

const requestSchema = z.object({
  cartTotal: z.number().min(100), // cents
  cartDescription: z.string().min(1),
  cartLineItems: z.array(z.object({
    name: z.string(),
    amount: z.number(), // cents
    quantity: z.number().default(1),
  })),
  name: z.string().trim().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  registrationId: z.string().uuid().optional(),
  // Metadata to pass through
  ticketType: z.string().optional(),
  lodgingZoneKey: z.string().optional(),
  // CAPI fields
  fbp: z.string().optional(),
  fbc: z.string().optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
                     req.headers.get("x-real-ip") || "unknown";

    const rateLimitResult = await checkRateLimitDb(
      clientIp, "create-payment-plan-checkout", RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS
    );

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
      );
    }

    const rawData = await req.json();
    const validationResult = requestSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error("[payment-plan-checkout] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { cartTotal, cartDescription, cartLineItems, name, email, phone, registrationId, ticketType, lodgingZoneKey } = validationResult.data;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch payment plan config
    const { data: config, error: configError } = await supabaseClient
      .from("payment_plan_config")
      .select("*")
      .limit(1)
      .single();

    if (configError || !config) {
      console.error("[payment-plan-checkout] Config not found:", configError);
      return new Response(
        JSON.stringify({ error: "Payment plans are not currently available." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!config.is_enabled) {
      return new Response(
        JSON.stringify({ error: "Payment plans are not currently available." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (cartTotal < config.min_cart_amount) {
      return new Response(
        JSON.stringify({ error: `Payment plans are available for orders of $${(config.min_cart_amount / 100).toFixed(0)} or more.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Determine which plan based on cutoff date
    const now = new Date();
    const cutoffDate = new Date(config.cutoff_date);
    const isBeforeCutoff = now < cutoffDate;

    const paymentCount = isBeforeCutoff ? config.pre_cutoff_payment_count : config.post_cutoff_payment_count;
    const splits = isBeforeCutoff ? config.pre_cutoff_splits : config.post_cutoff_splits;
    const scheduleDates = isBeforeCutoff ? config.pre_cutoff_dates : config.post_cutoff_dates;

    // Calculate payment amounts ensuring they sum to exact total
    const amounts: number[] = [];
    let remaining = cartTotal;
    for (let i = 0; i < paymentCount; i++) {
      if (i === paymentCount - 1) {
        amounts.push(remaining); // Last payment gets the remainder
      } else {
        const amount = Math.round(cartTotal * splits[i]);
        amounts.push(amount);
        remaining -= amount;
      }
    }

    const firstPaymentAmount = amounts[0];

    console.log("[payment-plan-checkout] Plan details:", {
      isBeforeCutoff, paymentCount, amounts, scheduleDates, email,
    });

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get or create Stripe customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({ email, name });
      customerId = customer.id;
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";

    // Build line items for Stripe Checkout
    // First payment amount as the charge, plus SetupIntent to save card
    const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${cartDescription} — Payment 1 of ${paymentCount}`,
            description: `Reserve your spot today. ${paymentCount - 1} more payment${paymentCount > 2 ? 's' : ''} to follow.`,
          },
          unit_amount: firstPaymentAmount,
        },
        quantity: 1,
      },
    ];

    // Create enrollment record (pending until payment succeeds)
    const { data: enrollment, error: enrollError } = await supabaseClient
      .from("payment_plan_enrollments")
      .insert({
        registration_id: registrationId || null,
        stripe_customer_id: customerId,
        buyer_name: name,
        buyer_email: email,
        total_amount: cartTotal,
        payment_count: paymentCount,
        payment_splits: splits,
        status: "pending",
        locked_price: isBeforeCutoff,
      })
      .select()
      .single();

    if (enrollError || !enrollment) {
      console.error("[payment-plan-checkout] Failed to create enrollment:", enrollError);
      return new Response(
        JSON.stringify({ error: "Unable to process payment plan. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Create scheduled payment records
    const scheduledPayments = amounts.map((amount, i) => ({
      enrollment_id: enrollment.id,
      payment_number: i + 1,
      amount,
      scheduled_date: scheduleDates[i] === "immediate" ? new Date().toISOString().split("T")[0] : scheduleDates[i],
      status: i === 0 ? "processing" : "pending", // First payment is being charged now
    }));

    const { error: scheduleError } = await supabaseClient
      .from("scheduled_payments")
      .insert(scheduledPayments);

    if (scheduleError) {
      console.error("[payment-plan-checkout] Failed to create scheduled payments:", scheduleError);
    }

    // Create Stripe Checkout session with payment + setup
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: stripeLineItems,
      payment_intent_data: {
        setup_future_usage: "off_session", // This saves the card for future charges
        description: `Cosmico - ${cartDescription} (Payment 1/${paymentCount})`,
        metadata: {
          enrollment_id: enrollment.id,
          payment_number: "1",
          payment_plan: "true",
        },
      },
      success_url: `${origin}/ticket-success?session_id={CHECKOUT_SESSION_ID}&payment_plan=true`,
      cancel_url: `${origin}/tickets?canceled=true`,
      metadata: {
        payment_plan: "true",
        enrollment_id: enrollment.id,
        payment_count: paymentCount.toString(),
        total_amount: cartTotal.toString(),
        buyer_name: name,
        buyer_email: email,
        ticket_type: ticketType || "",
        lodging_zone_key: lodgingZoneKey || "",
        registration_id: registrationId || "",
        cart_line_items: JSON.stringify(cartLineItems).substring(0, 500),
      },
    });

    if (registrationId) {
      await supabaseClient
        .from("registrations")
        .update({
          stripe_session_id: session.id,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        })
        .eq("id", registrationId);
    }

    console.log("[payment-plan-checkout] Checkout session created:", session.id);

    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
        enrollmentId: enrollment.id,
        paymentPlan: {
          count: paymentCount,
          amounts,
          dates: scheduleDates,
          firstPayment: firstPaymentAmount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[payment-plan-checkout] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again later." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
