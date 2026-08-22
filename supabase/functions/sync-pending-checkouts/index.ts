import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-CHECKOUTS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check auth - allow service role key for cron OR admin user
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") || "";
    
    // If using service role key directly (cron job), skip user verification
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!isServiceRole) {
      if (!authHeader) {
        throw new Error("No authorization header");
      }
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        throw new Error("Unauthorized");
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        throw new Error("Admin access required");
      }
      
      logStep("Admin verified", { userId: user.id });
    } else {
      logStep("Service role auth - cron job");
    }

    // Get all pending registrations with Stripe session IDs
    const { data: pendingRegs, error: fetchError } = await supabase
      .from("registrations")
      .select("id, stripe_session_id, name, email, created_at")
      .eq("payment_status", "pending")
      .not("stripe_session_id", "is", null)
      .order("created_at", { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch registrations: ${fetchError.message}`);
    }

    logStep("Found pending registrations", { count: pendingRegs?.length || 0 });

    const results = {
      total: pendingRegs?.length || 0,
      synced: 0,
      expired: 0,
      abandoned: 0,
      declined: 0,
      completed: 0,
      errors: 0,
      details: [] as Array<{
        id: string;
        name: string;
        status: string;
        checkoutStatus: string | null;
        errorCode: string | null;
        errorMessage: string | null;
      }>,
    };

    for (const reg of pendingRegs || []) {
      try {
        logStep("Checking session", { registrationId: reg.id, sessionId: reg.stripe_session_id });

        // Retrieve the checkout session with expanded payment intent
        const session = await stripe.checkout.sessions.retrieve(reg.stripe_session_id, {
          expand: ['payment_intent'],
        });

        let checkoutStatus = session.status || 'unknown';
        let errorCode: string | null = null;
        let errorMessage: string | null = null;
        let expiresAt: string | null = null;
        let paymentIntentId: string | null = null;
        let paymentErrorDetails: Record<string, string | null> | null = null;

        // Calculate expiration time (sessions expire 24 hours after creation)
        if (session.created) {
          const expirationTime = new Date((session.created + 86400) * 1000);
          expiresAt = expirationTime.toISOString();
        }

        // Check payment intent for error details
        if (session.payment_intent && typeof session.payment_intent === 'object') {
          const paymentIntent = session.payment_intent as Stripe.PaymentIntent;
          paymentIntentId = paymentIntent.id;
          
          if (paymentIntent.last_payment_error) {
            errorCode = paymentIntent.last_payment_error.code || paymentIntent.last_payment_error.decline_code || null;
            errorMessage = paymentIntent.last_payment_error.message || null;
            paymentErrorDetails = {
              code: paymentIntent.last_payment_error.code || null,
              decline_code: paymentIntent.last_payment_error.decline_code || null,
              message: paymentIntent.last_payment_error.message || null,
              type: paymentIntent.last_payment_error.type || null,
            };
            logStep("Found payment error", { errorCode, errorMessage });
          }
        }

        // Determine the outcome
        let newPaymentStatus = 'pending';
        if (session.status === 'complete' && session.payment_status === 'paid') {
          newPaymentStatus = 'paid';
          results.completed++;
        } else if (session.status === 'expired') {
          checkoutStatus = 'expired';
          results.expired++;
        } else if (errorCode) {
          checkoutStatus = 'declined';
          results.declined++;
        } else if (session.status === 'open') {
          // Still open but not completed - abandoned
          const createdAt = new Date(session.created * 1000);
          const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceCreation > 1) {
            checkoutStatus = 'abandoned';
            results.abandoned++;
          }
        }

        // Update the registration
        const { error: updateError } = await supabase
          .from("registrations")
          .update({
            checkout_status: checkoutStatus,
            checkout_expires_at: expiresAt,
            stripe_payment_intent_id: paymentIntentId,
            last_payment_error_code: errorCode,
            last_payment_error_message: errorMessage,
            last_payment_error_details: paymentErrorDetails,
            checkout_synced_at: new Date().toISOString(),
            ...(newPaymentStatus === 'paid' ? { payment_status: 'paid' } : {}),
          })
          .eq("id", reg.id);

        if (updateError) {
          logStep("Update error", { registrationId: reg.id, error: updateError.message });
          results.errors++;
        } else {
          results.synced++;
          results.details.push({
            id: reg.id,
            name: reg.name,
            status: newPaymentStatus,
            checkoutStatus,
            errorCode,
            errorMessage,
          });
        }

      } catch (stripeError: any) {
        logStep("Stripe API error", { registrationId: reg.id, error: stripeError.message });
        
        // If session not found, mark as expired
        if (stripeError.code === 'resource_missing') {
          await supabase
            .from("registrations")
            .update({
              checkout_status: 'session_not_found',
              checkout_synced_at: new Date().toISOString(),
            })
            .eq("id", reg.id);
          
          results.expired++;
          results.synced++;
        } else {
          results.errors++;
        }
      }
    }

    logStep("Sync complete", results);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
