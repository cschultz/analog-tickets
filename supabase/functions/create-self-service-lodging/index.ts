import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  fetchCheckoutFees,
  calculateFees,
  createFeeLineItems,
  getTotalFeesAmount,
} from "../_shared/checkout-fees.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isEligibleLodgingTicketType(ticketType: string | null | undefined) {
  if (!ticketType) return false;
  const normalized = ticketType.toLowerCase().replace(/[\s-]/g, "_");
  const includesQualifyingPass = normalized.includes("vip") || normalized.includes("krewe");
  const isSingleDay = normalized.includes("single") || normalized.includes("friday") || normalized.includes("saturday");
  return includesQualifyingPass && !isSingleDay;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const preferencesSchema = z.object({
      travelingWithKids: z.boolean().optional(),
      sensitiveToSound: z.boolean().optional(),
      bookingWithFriends: z.string().max(500).optional(),
    }).nullable();

    const requestSchema = z.object({
      email: z.string().email().transform(e => e.toLowerCase()),
      lodgingZoneKey: z.string().min(1),
      lodgingQuantity: z.number().min(1).max(4),
      registrationId: z.string().uuid().optional(),
      preferences: preferencesSchema.optional(),
    });

    const rawData = await req.json();
    const validationResult = requestSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error("[create-self-service-lodging] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { email, lodgingZoneKey, lodgingQuantity, registrationId, preferences } = validationResult.data;

    console.log("[create-self-service-lodging] Processing self-service lodging:", {
      email,
      lodgingZoneKey,
      lodgingQuantity,
    });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if lodging invites are enabled
    const { data: lodgingSettings } = await supabaseClient
      .from("lodging_settings")
      .select("lodging_invite_enabled")
      .limit(1)
      .single();

    if (!lodgingSettings?.lodging_invite_enabled) {
      return new Response(
        JSON.stringify({ error: "Lodging is not currently available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get active event
    const { data: event, error: eventError } = await supabaseClient
      .from("event_details")
      .select("id, title")
      .eq("is_active", true)
      .single();

    if (eventError || !event) {
      console.error("[create-self-service-lodging] No active event found:", eventError);
      return new Response(
        JSON.stringify({ error: "No active event found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Verify user has an eligible ticket
    let registrationQuery = supabaseClient
      .from("registrations")
      .select("id, ticket_type, quantity, email, name")
      .eq("event_id", event.id)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(20);

    if (registrationId) {
      registrationQuery = registrationQuery.eq("id", registrationId);
    } else {
      registrationQuery = registrationQuery.eq("email", email);
    }

    const { data: registrationCandidates, error: regError } = await registrationQuery;

    if (regError) {
      console.error("[create-self-service-lodging] Registration lookup error:", regError);
      return new Response(
        JSON.stringify({ error: "Unable to verify your ticket" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const registration = registrationCandidates?.find((candidate) =>
      isEligibleLodgingTicketType(candidate.ticket_type)
    );

    if (!registration) {
      return new Response(
        JSON.stringify({ 
          error: "No eligible ticket found",
          message: "Lodging is available for VIP and Krewe ticket holders only. Please check that you're using the same email as your ticket purchase."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check if user already has lodging for this event
    const { data: existingLodging } = await supabaseClient
      .from("lodging_bookings")
      .select("id")
      .eq("registration_id", registration.id)
      .eq("payment_status", "paid")
      .maybeSingle();

    if (existingLodging) {
      return new Response(
        JSON.stringify({ 
          error: "You already have lodging booked",
          message: "You've already purchased lodging for this event. Contact us if you need to make changes."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Calculate max lodging allowed based on ticket quantity (1 unit per ticket)
    const maxLodging = registration.quantity;

    if (lodgingQuantity > maxLodging) {
      return new Response(
        JSON.stringify({ 
          error: `You can only book up to ${maxLodging} accommodations with ${registration.quantity} tickets`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch the accommodation zone
    const { data: zone, error: zoneError } = await supabaseClient
      .from("accommodation_zones")
      .select("*")
      .eq("zone_key", lodgingZoneKey)
      .single();

    if (zoneError || !zone) {
      console.error("[create-self-service-lodging] Zone not found:", zoneError);
      return new Response(
        JSON.stringify({ error: "Selected accommodation zone is not available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!zone.is_publicly_available) {
      return new Response(
        JSON.stringify({ error: "This zone is not available for self-service booking" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (zone.inventory_available < lodgingQuantity) {
      return new Response(
        JSON.stringify({ 
          error: "Not enough lodging available",
          message: `Only ${zone.inventory_available} ${zone.zone_name} units remain.`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create or find customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

    // Calculate subtotals (lodging only for this flow)
    const lodgingSubtotal = zone.night_price * 2 * lodgingQuantity;

    // Fetch and calculate fees
    const fees = await fetchCheckoutFees(supabaseClient);
    const calculatedFees = calculateFees(fees, {
      ticketSubtotal: 0,  // No tickets in self-service lodging
      lodgingSubtotal,
      donationAmount: 0,
    });
    const totalFees = getTotalFeesAmount(calculatedFees);
    const totalAmount = lodgingSubtotal + totalFees;

    console.log("[create-self-service-lodging] Fee breakdown:", {
      lodgingSubtotal,
      fees: calculatedFees,
      totalFees,
      totalAmount,
    });

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    if (zone.stripe_price_id) {
      lineItems.push({
        price: zone.stripe_price_id,
        quantity: lodgingQuantity,
      });
    } else {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `${zone.zone_name} - Weekend Lodging`,
            description: zone.description,
          },
          unit_amount: zone.night_price * 2,
        },
        quantity: lodgingQuantity,
      });
    }

    // Add fee line items (occupancy tax, service fee)
    const feeLineItems = createFeeLineItems(calculatedFees);
    lineItems.push(...feeLineItems);

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";

    // Create lodging booking record
    const { data: booking, error: bookingError } = await supabaseClient
      .from("lodging_bookings")
      .insert({
        registration_id: registration.id,
        event_id: event.id,
        email: email,
        zone_key: lodgingZoneKey,
        quantity: lodgingQuantity,
        total_amount: totalAmount,
        payment_status: "pending",
        preferences: preferences || null,
      })
      .select()
      .single();

    if (bookingError) {
      console.error("[create-self-service-lodging] Booking creation error:", bookingError);
      return new Response(
        JSON.stringify({ error: "Unable to create booking" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/accommodations/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/accommodations?canceled=true`,
      payment_intent_data: {
        description: "Cosmico - Lodging",
      },
      metadata: {
        booking_id: booking.id,
        registration_id: registration.id,
        lodging_zone_key: lodgingZoneKey,
        lodging_qty: lodgingQuantity.toString(),
        preferences: preferences ? JSON.stringify(preferences) : "",
        type: "self_service_lodging",
      },
    });

    // Update booking with session ID
    await supabaseClient
      .from("lodging_bookings")
      .update({ stripe_session_id: session.id })
      .eq("id", booking.id);

    console.log("[create-self-service-lodging] Checkout session created:", session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[create-self-service-lodging] Unexpected error:", error?.message);
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again later." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
