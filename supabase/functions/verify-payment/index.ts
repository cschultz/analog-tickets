import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SHA-256 hash for email (required by Meta CAPI)
async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();

    // Validate presence
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      console.error("[verify-payment] Invalid session ID provided:", {
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate Stripe checkout session ID format (cs_test_ or cs_live_ prefix)
    const stripeSessionPattern = /^cs_(test|live)_[a-zA-Z0-9]{24,}$/;
    if (!stripeSessionPattern.test(sessionId)) {
      console.error("[verify-payment] Invalid session ID format:", {
        sessionIdPrefix: sessionId.substring(0, 10) + '...',
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log("Verifying payment for session:", sessionId);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the checkout session from Stripe with expanded data
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['total_details', 'discounts', 'discounts.promotion_code']
    });
    
    // Fetch line items for ecommerce tracking
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
      expand: ['data.price.product']
    });

    const paymentIntent = typeof session.payment_intent === "string"
      ? await stripe.paymentIntents.retrieve(session.payment_intent)
      : session.payment_intent ?? null;

    const paymentIntentLastError = paymentIntent?.last_payment_error
      ? {
          code: paymentIntent.last_payment_error.code || null,
          decline_code: paymentIntent.last_payment_error.decline_code || null,
          message: paymentIntent.last_payment_error.message || null,
          type: paymentIntent.last_payment_error.type || null,
        }
      : null;

    console.log("Stripe session status:", session.payment_status);

    if (session.payment_status !== "paid") {
      await supabaseClient
        .from("registrations")
        .update({
          stripe_payment_intent_id: paymentIntent?.id || null,
          last_payment_error_code: paymentIntentLastError?.code || paymentIntentLastError?.decline_code || null,
          last_payment_error_message: paymentIntentLastError?.message || null,
          last_payment_error_details: paymentIntentLastError,
          checkout_synced_at: new Date().toISOString(),
        })
        .eq("stripe_session_id", sessionId);

      console.log("[verify-payment] Payment not completed:", {
        sessionId,
        status: session.payment_status,
        sessionStatus: session.status,
        paymentIntentStatus: paymentIntent?.status || null,
        paymentIntentId: paymentIntent?.id || null,
        paymentIntentLastError,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Payment not completed. Please try again.",
          error_code: "payment_not_completed",
          stripe_payment_status: session.payment_status,
          stripe_session_status: session.status,
          payment_intent_status: paymentIntent?.status || null,
          payment_intent_id: paymentIntent?.id || null,
          payment_intent_last_error: paymentIntentLastError,
          customer_email: session.customer_details?.email || session.customer_email || null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Find the registration by session ID
    const { data: registration, error: fetchError } = await supabaseClient
      .from("registrations")
      .select("*")
      .eq("stripe_session_id", sessionId)
      .single();

    if (fetchError || !registration) {
      console.error("[verify-payment] Registration lookup failed:", {
        sessionId,
        error: fetchError,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({
          error: "Unable to verify payment. Please contact support.",
          error_code: "registration_not_found",
          stripe_payment_status: session.payment_status,
          stripe_session_status: session.status,
          payment_intent_status: paymentIntent?.status || null,
          payment_intent_id: paymentIntent?.id || null,
          customer_email: session.customer_details?.email || session.customer_email || null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Check if already processed - still return ecommerce data for tracking
    if (registration.payment_status === "paid") {
      console.log("Payment already processed for registration:", registration.id);
      
      // Build ecommerce data even for already processed payments
      const ecommerceData = {
        transaction_id: session.id,
        value: session.amount_total ? session.amount_total / 100 : 0,
        currency: (session.currency || 'usd').toUpperCase(),
        tax: session.total_details?.amount_tax ? session.total_details.amount_tax / 100 : undefined,
        shipping: session.total_details?.amount_shipping ? session.total_details.amount_shipping / 100 : undefined,
        discount: session.total_details?.amount_discount ? session.total_details.amount_discount / 100 : undefined,
        coupon: session.discounts?.[0]?.promotion_code 
          ? (typeof session.discounts[0].promotion_code === 'object' 
              ? session.discounts[0].promotion_code.code 
              : undefined)
          : undefined,
        payment_type: session.payment_method_types?.[0] || undefined,
        items: lineItems.data.map((item: any) => {
          const product = item.price?.product;
          const productName = typeof product === 'object' ? product.name : 'Ticket';
          const productId = typeof product === 'object' ? product.id : (item.price?.id || 'unknown');
          
          return {
            item_id: item.price?.id || productId,
            item_name: productName,
            item_category: 'Tickets',
            item_variant: item.description || undefined,
            quantity: item.quantity || 1,
            price: item.price?.unit_amount ? item.price.unit_amount / 100 : 0
          };
        })
      };
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          alreadyProcessed: true,
          registrationId: registration.id,
          registration_payment_status: registration.payment_status,
          ticket_type: registration.ticket_type,
          customer_email: registration.email,
          ecommerce: ecommerceData
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Update registration status to paid and reserve tickets
    const { error: updateError } = await supabaseClient
      .from("registrations")
      .update({
        payment_status: "paid",
        stripe_payment_intent_id: paymentIntent?.id || null,
        last_payment_error_code: paymentIntentLastError?.code || paymentIntentLastError?.decline_code || null,
        last_payment_error_message: paymentIntentLastError?.message || null,
        last_payment_error_details: paymentIntentLastError,
        checkout_synced_at: new Date().toISOString(),
      })
      .eq("id", registration.id);

    if (updateError) {
      console.error("[verify-payment] Failed to update registration:", {
        registrationId: registration.id,
        error: updateError,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({
          error: "Unable to process payment verification.",
          error_code: "registration_update_failed",
          registration_id: registration.id,
          registration_payment_status: registration.payment_status,
          stripe_payment_status: session.payment_status,
          stripe_session_status: session.status,
          payment_intent_status: paymentIntent?.status || null,
          payment_intent_id: paymentIntent?.id || null,
          customer_email: registration.email,
          ticket_type: registration.ticket_type,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log("Registration updated to paid:", registration.id);

    // Create individual ticket records
    const ticketPrice = Math.round((registration.total_amount - (registration.donation_amount || 0)) / registration.quantity);
    const ticketsToCreate = [];
    
    for (let i = 0; i < registration.quantity; i++) {
      ticketsToCreate.push({
        registration_id: registration.id,
        event_id: registration.event_id,
        holder_name: i === 0 ? registration.name : (registration.plus_one_name || `Guest ${i + 1}`),
        holder_email: i === 0 ? registration.email : null,
        ticket_type: registration.ticket_type,
        unit_price: ticketPrice,
        status: "active",
        original_purchaser_email: registration.email,
      });
    }

    const { error: ticketsError } = await supabaseClient
      .from("tickets")
      .insert(ticketsToCreate);

    if (ticketsError) {
      console.error("Failed to create tickets:", ticketsError);
      // Log but don't fail - payment was successful
    } else {
      console.log(`Created ${ticketsToCreate.length} ticket(s) for registration ${registration.id}`);
    }

    // Reserve tickets by updating inventory
    console.log("Reserving tickets for:", registration.ticket_type, "quantity:", registration.quantity);
    const { data: reserveResult, error: reserveError } = await supabaseClient
      .rpc("reserve_tickets", {
        p_ticket_type: registration.ticket_type,
        p_quantity: registration.quantity
      });

    if (reserveError || !reserveResult) {
      console.error("Failed to reserve tickets:", reserveError);
      // Log but don't fail the payment verification since payment was successful
    } else {
      console.log("Tickets reserved successfully");
    }

    // Send confirmation email with QR code in background (fire and forget)
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-ticket-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
      body: JSON.stringify({ registrationId: registration.id }),
    })
      .then((res) => {
        if (!res.ok) {
          console.error("Failed to send email:", res.statusText);
        } else {
          console.log("Email sent successfully");
        }
      })
      .catch((err) => console.error("Error sending email:", err));

    // After the initial 3 PM PT (22:00 UTC) batch on May 8 2026, deliver real
    // tickets (with QR codes) immediately upon purchase. Before that cutoff,
    // the scheduled batch handles delivery.
    const IMMEDIATE_DELIVERY_CUTOFF = new Date("2026-05-08T22:00:00Z");
    if (Date.now() >= IMMEDIATE_DELIVERY_CUTOFF.getTime()) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-tickets-delivery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          singleRegistrationId: registration.id,
          autoScheduled: true,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error("[verify-payment] Immediate ticket delivery failed:", res.statusText);
          } else {
            console.log("[verify-payment] Immediate tickets delivered for", registration.id);
          }
        })
        .catch((err) => console.error("[verify-payment] Immediate delivery error:", err));
    }

    // Send Meta Conversions API event (server-side) with same event_id for deduplication
    // Note: This is a backup - the primary CAPI call now happens via meta-capi edge function
    // from the client, which includes fbp/fbc cookies for better matching
    const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");
    const metaPixelId = Deno.env.get("META_PIXEL_ID") || "180875934879890";
    
    if (metaAccessToken) {
      const metaEventData = {
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            event_id: session.id, // Same as transaction_id for deduplication
            action_source: "website",
            event_source_url: `${Deno.env.get("SITE_URL") || "https://example.invalid"}/ticket-success?session_id=${sessionId}`,
            user_data: {
              em: session.customer_email ? await hashEmail(session.customer_email) : undefined,
            },
            custom_data: {
              value: session.amount_total ? session.amount_total / 100 : 0,
              currency: (session.currency || "usd").toUpperCase(),
              content_type: "product",
              num_items: lineItems.data.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0),
              contents: lineItems.data.map((item: any) => ({
                id: item.price?.id || "unknown",
                quantity: item.quantity || 1
              }))
            }
          }
        ]
      };

      fetch(`https://graph.facebook.com/v18.0/${metaPixelId}/events?access_token=${metaAccessToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metaEventData)
      })
        .then(async (res) => {
          const responseData = await res.json();
          if (!res.ok) {
            console.error("[Meta CAPI] Failed to send event:", responseData);
          } else {
            console.log("[Meta CAPI] Purchase event sent successfully:", responseData);
          }
        })
        .catch((err) => console.error("[Meta CAPI] Error sending event:", err));
    } else {
      console.log("[Meta CAPI] META_ACCESS_TOKEN not configured, skipping server-side tracking");
    }

    // Build ecommerce data for GA4 tracking
    const ecommerceData = {
      transaction_id: session.id,
      value: session.amount_total ? session.amount_total / 100 : 0,
      currency: (session.currency || 'usd').toUpperCase(),
      tax: session.total_details?.amount_tax ? session.total_details.amount_tax / 100 : undefined,
      shipping: session.total_details?.amount_shipping ? session.total_details.amount_shipping / 100 : undefined,
      discount: session.total_details?.amount_discount ? session.total_details.amount_discount / 100 : undefined,
      coupon: session.discounts?.[0]?.promotion_code 
        ? (typeof session.discounts[0].promotion_code === 'object' 
            ? session.discounts[0].promotion_code.code 
            : undefined)
        : undefined,
      payment_type: session.payment_method_types?.[0] || undefined,
      items: lineItems.data.map((item: any) => {
        const product = item.price?.product;
        const productName = typeof product === 'object' ? product.name : 'Ticket';
        const productId = typeof product === 'object' ? product.id : (item.price?.id || 'unknown');
        
        return {
          item_id: item.price?.id || productId,
          item_name: productName,
          item_category: 'Tickets',
          item_variant: item.description || undefined,
          quantity: item.quantity || 1,
          price: item.price?.unit_amount ? item.price.unit_amount / 100 : 0
        };
      })
    };

    console.log("[verify-payment] Ecommerce data prepared:", JSON.stringify(ecommerceData));

    return new Response(
      JSON.stringify({ 
        success: true, 
        registrationId: registration.id,
        message: "Payment verified and confirmation email sent",
        ecommerce: ecommerceData
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[verify-payment] Unexpected error:", {
      error: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString()
    });
    return new Response(
      JSON.stringify({ error: "Unable to verify payment. Please try again." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
