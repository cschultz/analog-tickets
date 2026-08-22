import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestSchema = z.object({
      token: z.string().min(1),
      lodgingZoneKey: z.string().min(1).optional(),
      lodgingUnitId: z.string().uuid().optional(), // For family-style units
      lodgingQuantity: z.number().min(1).max(4).default(1),
      preferences: z.object({
        travelingWithKids: z.boolean().optional(),
        sensitiveToSound: z.boolean().optional(),
        bookingWithFriends: z.string().max(500).optional(),
      }).nullable().optional(),
    });

    const rawData = await req.json();
    const validationResult = requestSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error("[create-lodging-from-invite] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { token, lodgingZoneKey, lodgingUnitId, lodgingQuantity, preferences } = validationResult.data;

    if (!lodgingZoneKey && !lodgingUnitId) {
      return new Response(
        JSON.stringify({ error: "Either lodgingZoneKey or lodgingUnitId is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Validate the invite token
    const { data: invite, error: inviteError } = await supabaseClient
      .from("lodging_invite_tokens")
      .select("*, registrations(id, name, email, ticket_type, quantity, event_id)")
      .eq("token", token)
      .maybeSingle();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired invite" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (invite.used_at) {
      return new Response(
        JSON.stringify({ error: "This invite has already been used" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This invite has expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const registration = invite.registrations;
    if (!registration) {
      return new Response(
        JSON.stringify({ error: "Registration not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const email = registration.email;
    const eventId = registration.event_id;

    // Check if user already has lodging
    const { data: existingLodging } = await supabaseClient
      .from("lodging_bookings")
      .select("id")
      .eq("registration_id", registration.id)
      .eq("payment_status", "paid")
      .maybeSingle();

    if (existingLodging) {
      return new Response(
        JSON.stringify({ error: "You already have lodging booked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Calculate max lodging allowed (1 unit per ticket)
    const maxLodging = registration.quantity;
    if (lodgingQuantity > maxLodging) {
      return new Response(
        JSON.stringify({ error: `You can only book up to ${maxLodging} accommodations with ${registration.quantity} tickets` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    let zoneKey: string;
    let totalAmount: number;
    let assignmentStatus: "pending" | "assigned";
    let assignedUnitId: string | null = null;
    let productName: string;

    // Determine if this is a family-style unit or zone booking
    if (lodgingUnitId) {
      // Family-style: specific unit selected - use UNIT price, not zone price
      // CRITICAL: Use atomic update to prevent race conditions - only claim if still available
      const { data: unit, error: unitError } = await supabaseClient
        .from("accommodation_units")
        .update({ inventory_status: "pending_offer" })
        .eq("id", lodgingUnitId)
        .eq("is_family_style", true)
        .eq("inventory_status", "available") // Only claim if still available
        .select("*, accommodation_zones(zone_name, night_price)")
        .single();

      if (unitError || !unit) {
        console.log("[create-lodging-from-invite] Unit not available or already claimed:", lodgingUnitId);
        return new Response(
          JSON.stringify({ error: "This unit is no longer available. Someone else may have selected it. Please choose a different unit." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      console.log("[create-lodging-from-invite] Locked unit for checkout:", unit.id, unit.unit_name);

      // CRITICAL: Use unit.night_price for family-style units, NOT zone price
      const unitNightPrice = unit.night_price;
      if (!unitNightPrice || unitNightPrice <= 0) {
        // Rollback the lock if pricing is misconfigured
        await supabaseClient
          .from("accommodation_units")
          .update({ inventory_status: "available" })
          .eq("id", lodgingUnitId);
        
        console.error("[create-lodging-from-invite] Unit missing price:", unit.id, unit.unit_name);
        return new Response(
          JSON.stringify({ error: "Unit pricing not configured" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      zoneKey = unit.zone_key;
      totalAmount = unitNightPrice * 2; // 2 nights at UNIT price
      assignmentStatus = "assigned";
      assignedUnitId = unit.id;
      productName = `${unit.accommodation_zones?.zone_name || zoneKey} - Unit ${unit.unit_name} (Family-Style)`;
      
      console.log("[create-lodging-from-invite] Family-style pricing:", {
        unitId: unit.id,
        unitName: unit.unit_name,
        unitNightPrice,
        totalAmount,
        zoneNightPrice: unit.accommodation_zones?.night_price,
      });

    } else {
      // Zone booking: admin assigns later
      const { data: zone, error: zoneError } = await supabaseClient
        .from("accommodation_zones")
        .select("*")
        .eq("zone_key", lodgingZoneKey)
        .single();

      if (zoneError || !zone) {
        return new Response(
          JSON.stringify({ error: "Selected zone is not available" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (zone.inventory_available < lodgingQuantity) {
        return new Response(
          JSON.stringify({ error: `Only ${zone.inventory_available} units remain in ${zone.zone_name}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      zoneKey = zone.zone_key;
      totalAmount = zone.night_price * 2 * lodgingQuantity; // 2 nights * quantity
      assignmentStatus = "pending";
      productName = `${zone.zone_name} (${lodgingQuantity}x)`;
    }

    // Create Stripe customer if needed
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

    const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://example.invalid";

    // Create pending lodging booking
    const { data: booking, error: bookingError } = await supabaseClient
      .from("lodging_bookings")
      .insert({
        registration_id: registration.id,
        event_id: eventId,
        email: email,
        zone_key: zoneKey,
        quantity: lodgingQuantity,
        total_amount: totalAmount,
        payment_status: "pending",
        preferences: preferences || null,
        assignment_status: assignmentStatus,
        assigned_unit_id: assignedUnitId,
        assigned_at: assignedUnitId ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (bookingError || !booking) {
      console.error("[create-lodging-from-invite] Booking creation error:", bookingError);
      return new Response(
        JSON.stringify({ error: "Failed to create booking" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
              description: "2-night stay at Wildhaven Sonoma",
            },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${siteUrl}/accommodations/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/accommodations/invite?token=${token}&canceled=true`,
      payment_intent_data: {
        description: "Cosmico - Lodging",
      },
      metadata: {
        type: "lodging_invite",
        lodging_booking_id: booking.id,
        invite_token_id: invite.id,
        assigned_unit_id: assignedUnitId || "",
      },
      expires_at: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
    });

    // Update booking with Stripe session ID
    await supabaseClient
      .from("lodging_bookings")
      .update({ stripe_session_id: session.id })
      .eq("id", booking.id);

    console.log("[create-lodging-from-invite] Created checkout session:", {
      email,
      bookingId: booking.id,
      sessionId: session.id,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("[create-lodging-from-invite] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
