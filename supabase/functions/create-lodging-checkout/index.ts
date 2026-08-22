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

// Ticket type configuration with Stripe price IDs - Tier 1 Pricing
const TICKET_CONFIG: Record<string, { priceId: string; price: number; name: string }> = {
  tier_1_krewe_3day: {
    priceId: (Deno.env.get("STRIPE_PRICE_TIER_1_KREWE_3DAY") ?? "").trim(),
    price: 9900, // $99 in cents
    name: "Krewe - 3 Day",
  },
  tier_1_vip_3day: {
    priceId: (Deno.env.get("STRIPE_PRICE_TIER_1_VIP_3DAY") ?? "").trim(),
    price: 42500, // $425 in cents
    name: "VIP - 3 Day",
  },
  tier_1_ga_2day: {
    priceId: (Deno.env.get("STRIPE_PRICE_TIER_1_GA_2DAY") ?? "").trim(),
    price: 21500, // $215 in cents
    name: "GA - 2 Day",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validation schema
    const preferencesSchema = z.object({
      travelingWithKids: z.boolean().optional(),
      sensitiveToSound: z.boolean().optional(),
      bookingWithFriends: z.string().max(500).optional(),
    }).nullable();

    const requestSchema = z.object({
      ticketType: z.enum(['tier_1_krewe_3day', 'tier_1_vip_3day', 'tier_1_ga_2day']),
      ticketQuantity: z.number().min(1).max(8),
      name: z.string().trim().min(1, "Name is required").max(100),
      email: z.string().email("Invalid email format").max(255),
      donationAmount: z.number().min(0).max(100000).optional().default(0),
      lodgingZoneKey: z.string().nullable(),
      lodgingQuantity: z.number().min(0).max(4).optional().default(0),
      familyUnitId: z.string().uuid().nullable().optional(),
      preferences: preferencesSchema.optional(),
    });

    const rawData = await req.json();
    const validationResult = requestSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error("[create-lodging-checkout] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { 
      ticketType, 
      ticketQuantity, 
      name, 
      email, 
      donationAmount, 
      lodgingZoneKey, 
      lodgingQuantity,
      familyUnitId,
      preferences 
    } = validationResult.data;

    const ticketConfig = TICKET_CONFIG[ticketType];

    console.log("[create-lodging-checkout] Creating checkout:", { 
      ticketType, 
      ticketQuantity, 
      lodgingZoneKey, 
      lodgingQuantity,
      familyUnitId 
    });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get active event
    const { data: event, error: eventError } = await supabaseClient
      .from("event_details")
      .select("id, title")
      .eq("is_active", true)
      .single();

    if (eventError || !event) {
      console.error("[create-lodging-checkout] No active event found:", eventError);
      return new Response(
        JSON.stringify({ error: "No active event found. Please try again later." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check ticket inventory
    const { data: ticketInventory, error: ticketInventoryError } = await supabaseClient
      .from("ticket_inventory")
      .select("total_quantity, sold_quantity")
      .eq("ticket_type", ticketType)
      .eq("event_id", event.id)
      .single();

    if (ticketInventoryError) {
      console.error("[create-lodging-checkout] Ticket inventory check failed:", ticketInventoryError);
      return new Response(
        JSON.stringify({ error: "Unable to process request. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const ticketsAvailable = ticketInventory.total_quantity - ticketInventory.sold_quantity;
    if (ticketsAvailable < ticketQuantity) {
      return new Response(
        JSON.stringify({ 
          error: "Not enough tickets available", 
          message: `Sorry, only ${ticketsAvailable} ${ticketConfig.name} tickets remain.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check lodging inventory if selected
    let lodgingZone = null;
    let familyUnit = null;
    
    // Check for family unit selection first
    if (familyUnitId) {
      const { data: unit, error: unitError } = await supabaseClient
        .from("accommodation_units")
        .select("*")
        .eq("id", familyUnitId)
        .eq("is_family_style", true)
        .eq("inventory_status", "available")
        .single();

      if (unitError || !unit) {
        console.error("[create-lodging-checkout] Family unit not found:", unitError);
        return new Response(
          JSON.stringify({ error: "Selected family-style unit is no longer available." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Verify ticket count supports sleeps_max
      if (ticketQuantity < unit.sleeps_max) {
        return new Response(
          JSON.stringify({ 
            error: "Insufficient tickets", 
            message: `This unit sleeps ${unit.sleeps_max}. You need at least ${unit.sleeps_max} tickets.`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      familyUnit = unit;
    } else if (lodgingZoneKey && lodgingQuantity > 0) {
      // Standard zone-based lodging
      const { data: zone, error: zoneError } = await supabaseClient
        .from("accommodation_zones")
        .select("*")
        .eq("zone_key", lodgingZoneKey)
        .eq("is_publicly_available", true)
        .single();

      if (zoneError || !zone) {
        console.error("[create-lodging-checkout] Zone not found:", zoneError);
        return new Response(
          JSON.stringify({ error: "Selected accommodation zone is not available." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (zone.inventory_available < lodgingQuantity) {
        return new Response(
          JSON.stringify({ 
            error: "Not enough lodging available", 
            message: `Only ${zone.inventory_available} ${zone.zone_name} units remain.`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      lodgingZone = zone;
    }

    // Calculate subtotals
    const ticketSubtotal = ticketConfig.price * ticketQuantity;
    const lodgingSubtotal = familyUnit 
      ? familyUnit.night_price * 2 
      : (lodgingZone ? lodgingZone.night_price * 2 * lodgingQuantity : 0);

    // Fetch and calculate fees
    const fees = await fetchCheckoutFees(supabaseClient);
    const calculatedFees = calculateFees(fees, {
      ticketSubtotal,
      lodgingSubtotal,
      donationAmount,
    });
    const totalFees = getTotalFeesAmount(calculatedFees);
    const totalAmount = ticketSubtotal + lodgingSubtotal + donationAmount + totalFees;

    console.log("[create-lodging-checkout] Fee breakdown:", {
      ticketSubtotal,
      lodgingSubtotal,
      donationAmount,
      fees: calculatedFees,
      totalFees,
      totalAmount,
    });

    // Create registration
    const { data: registration, error: dbError } = await supabaseClient
      .from("registrations")
      .insert({
        event_id: event.id,
        name,
        email,
        ticket_type: ticketType,
        quantity: ticketQuantity,
        total_amount: totalAmount,
        donation_amount: donationAmount,
        payment_status: "pending",
        accommodation_waitlist: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error("[create-lodging-checkout] Database error:", dbError);
      return new Response(
        JSON.stringify({ error: "Unable to process registration. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Check if Stripe customer exists
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      price: ticketConfig.priceId,
      quantity: ticketQuantity,
    }];

    // Add lodging line item - family unit or zone-based
    if (familyUnit) {
      // Family-style unit
      if (familyUnit.stripe_price_id) {
        lineItems.push({
          price: familyUnit.stripe_price_id,
          quantity: 1,
        });
      } else {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: `Family-Style ${familyUnit.product_type === 'tent' ? 'Tent' : 'Cabin'} - Weekend Lodging`,
              description: familyUnit.bed_configuration,
            },
            unit_amount: familyUnit.night_price * 2,
          },
          quantity: 1,
        });
      }
    } else if (lodgingZone && lodgingQuantity > 0) {
      // Use zone's stripe_price_id if available, otherwise use price_data
      if (lodgingZone.stripe_price_id) {
        lineItems.push({
          price: lodgingZone.stripe_price_id,
          quantity: lodgingQuantity,
        });
      } else {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: `${lodgingZone.zone_name} - Weekend Lodging`,
              description: lodgingZone.description,
            },
            unit_amount: lodgingZone.night_price * 2,
          },
          quantity: lodgingQuantity,
        });
      }
    }

    // Add donation line item
    if (donationAmount > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Donation to Launch Pad Foundation",
            description: "Tax-deductible donation",
          },
          unit_amount: donationAmount,
        },
        quantity: 1,
      });
    }

    // Add fee line items (service fee, occupancy tax, etc.)
    const feeLineItems = createFeeLineItems(calculatedFees);
    lineItems.push(...feeLineItems);

    // Prepare metadata
    const metadata: Record<string, string> = {
      registration_id: registration.id,
      ticket_type: ticketType,
      ticket_qty: ticketQuantity.toString(),
      donation_amount: donationAmount.toString(),
    };

    if (familyUnitId && familyUnit) {
      metadata.family_unit_id = familyUnitId;
      metadata.family_unit_name = familyUnit.unit_name;
      metadata.preferences = preferences ? JSON.stringify(preferences) : "";
    } else if (lodgingZoneKey && lodgingQuantity > 0) {
      metadata.lodging_zone_key = lodgingZoneKey;
      metadata.lodging_qty = lodgingQuantity.toString();
      metadata.preferences = preferences ? JSON.stringify(preferences) : "";
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/ticket-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/accommodations?canceled=true`,
      payment_intent_data: {
        description: "Cosmico - Lodging",
      },
      metadata,
    });

    // Update registration with session ID
    await supabaseClient
      .from("registrations")
      .update({
        stripe_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      })
      .eq("id", registration.id);

    console.log("[create-lodging-checkout] Checkout session created:", session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[create-lodging-checkout] Unexpected error:", error?.message);
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again later." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
