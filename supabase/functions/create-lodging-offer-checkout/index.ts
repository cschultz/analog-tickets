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
    price: 9900,
    name: "Krewe - 3 Day",
  },
  tier_1_vip_3day: {
    priceId: (Deno.env.get("STRIPE_PRICE_TIER_1_VIP_3DAY") ?? "").trim(),
    price: 42500,
    name: "VIP - 3 Day",
  },
};

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
      offerCode: z.string().min(1),
      email: z.string().email(),
      name: z.string().min(1).max(100),
      // For lodging_only - uses existing ticket; can be null for ticket-only purchase
      lodgingZoneKey: z.string().min(1).nullable(),
      lodgingQuantity: z.number().min(0).max(4),
      preferences: preferencesSchema.optional(),
      // For ticket_plus_lodging - new ticket purchase
      ticketType: z.string().optional(),
      ticketQuantity: z.number().min(1).max(8).optional(),
      donationAmount: z.number().min(0).max(100000).optional().default(0),
    });

    const rawData = await req.json();
    const validationResult = requestSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error("[create-lodging-offer-checkout] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const {
      offerCode,
      email,
      name,
      lodgingZoneKey,
      lodgingQuantity,
      preferences,
      ticketType,
      ticketQuantity,
      donationAmount,
    } = validationResult.data;

    console.log("[create-lodging-offer-checkout] Processing offer checkout:", {
      offerCode,
      email,
      lodgingZoneKey,
      lodgingQuantity,
      ticketType,
      ticketQuantity,
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
        JSON.stringify({ error: "Invite-only lodging is not currently available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch and validate the offer
    const { data: offer, error: offerError } = await supabaseClient
      .from("custom_offers")
      .select("*")
      .eq("offer_token", offerCode)
      .eq("status", "active")
      .single();

    if (offerError || !offer) {
      console.error("[create-lodging-offer-checkout] Offer not found:", offerError);
      return new Response(
        JSON.stringify({ error: "Offer not found or invalid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Validate offer is not expired
    if (new Date(offer.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This offer has expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate redemptions
    if (offer.redemptions_used >= offer.max_redemptions) {
      return new Response(
        JSON.stringify({ error: "This offer has reached its maximum redemptions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch the accommodation zone (if lodging is selected)
    let zone: { zone_key: string; zone_name: string; description: string | null; night_price: number; stripe_price_id: string | null; inventory_available: number } | null = null;
    
    if (lodgingZoneKey && lodgingQuantity > 0) {
      const { data: zoneData, error: zoneError } = await supabaseClient
        .from("accommodation_zones")
        .select("*")
        .eq("zone_key", lodgingZoneKey)
        .single();

      if (zoneError || !zoneData) {
        console.error("[create-lodging-offer-checkout] Zone not found:", zoneError);
        return new Response(
          JSON.stringify({ error: "Selected accommodation zone is not available" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (zoneData.inventory_available < lodgingQuantity) {
        return new Response(
          JSON.stringify({ 
            error: "Not enough lodging available",
            message: `Only ${zoneData.inventory_available} ${zoneData.zone_name} units remain.`
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
      
      zone = zoneData;
    }

    let existingRegistration = null;
    let ticketConfig = null;
    let finalTicketQuantity = 0;

    // Handle lodging_only offers - verify existing ticket
    if (offer.offer_type === "lodging_only") {
      // lodging_only requires lodging selection
      if (!lodgingZoneKey || lodgingQuantity < 1) {
        return new Response(
          JSON.stringify({ error: "Lodging selection is required for this offer type" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
      
      const { data: registration, error: regError } = await supabaseClient
        .from("registrations")
        .select("id, ticket_type, quantity, email, name")
        .eq("email", email)
        .eq("event_id", offer.event_id)
        .eq("payment_status", "paid")
        .in("ticket_type", ["tier_1_krewe_3day", "tier_1_vip_3day", "krewe_3day", "vip_3day"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (regError || !registration) {
        return new Response(
          JSON.stringify({ error: "No eligible VIP or Krewe ticket found for this email" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      existingRegistration = registration;
      const maxLodging = registration.quantity;

      if (lodgingQuantity > maxLodging) {
        return new Response(
          JSON.stringify({ 
            error: `You can only book up to ${maxLodging} accommodations with ${registration.quantity} tickets`
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // Handle ticket_plus_lodging offers - validate ticket purchase
    if (offer.offer_type === "ticket_plus_lodging") {
      if (!ticketType || !ticketQuantity) {
        return new Response(
          JSON.stringify({ error: "Ticket type and quantity are required for package offers" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      ticketConfig = TICKET_CONFIG[ticketType];
      if (!ticketConfig) {
        return new Response(
          JSON.stringify({ error: "Invalid ticket type for this offer" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Check allowed ticket types if specified
      if (offer.allowed_ticket_types && offer.allowed_ticket_types.length > 0) {
        const isAllowed = offer.allowed_ticket_types.some((t: string) => 
          ticketType.toLowerCase().includes(t.toLowerCase())
        );
        if (!isAllowed) {
          return new Response(
            JSON.stringify({ error: "This ticket type is not allowed for this offer" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
      }

      finalTicketQuantity = ticketQuantity;
      
      // Only validate lodging max if lodging is being purchased
      if (lodgingQuantity > 0) {
        const maxLodging = ticketQuantity;

        if (lodgingQuantity > maxLodging) {
          return new Response(
            JSON.stringify({ 
              error: `You can only book up to ${maxLodging} accommodations with ${ticketQuantity} tickets`
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
      }

      // Check ticket inventory
      const { data: inventory, error: invError } = await supabaseClient
        .from("ticket_inventory")
        .select("total_quantity, sold_quantity")
        .eq("ticket_type", ticketType)
        .eq("event_id", offer.event_id)
        .single();

      if (invError) {
        console.error("[create-lodging-offer-checkout] Ticket inventory check failed:", invError);
        return new Response(
          JSON.stringify({ error: "Unable to check ticket availability" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      const ticketsAvailable = inventory.total_quantity - inventory.sold_quantity;
      if (ticketsAvailable < ticketQuantity) {
        return new Response(
          JSON.stringify({ error: `Only ${ticketsAvailable} tickets available` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // Calculate subtotals
    const ticketSubtotal = ticketConfig ? ticketConfig.price * finalTicketQuantity : 0;
    const lodgingSubtotal = zone ? zone.night_price * 2 * lodgingQuantity : 0;
    const subtotal = ticketSubtotal + lodgingSubtotal;

    // Fetch and calculate fees (before discount)
    const fees = await fetchCheckoutFees(supabaseClient);
    const calculatedFees = calculateFees(fees, {
      ticketSubtotal,
      lodgingSubtotal,
      donationAmount,
    });
    const totalFees = getTotalFeesAmount(calculatedFees);

    // Apply discount if any
    let discountAmount = 0;
    if (offer.discount_type === "percentage" && offer.discount_value > 0) {
      discountAmount = Math.round(subtotal * (offer.discount_value / 100));
    } else if (offer.discount_type === "fixed" && offer.discount_value > 0) {
      discountAmount = Math.min(offer.discount_value, subtotal);
    }

    const totalAmount = Math.max(0, subtotal - discountAmount + donationAmount + totalFees);

    console.log("[create-lodging-offer-checkout] Fee breakdown:", {
      ticketSubtotal,
      lodgingSubtotal,
      donationAmount,
      fees: calculatedFees,
      totalFees,
      discountAmount,
      totalAmount,
    });

    // Create or find customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    // Add ticket if package offer
    if (ticketConfig && finalTicketQuantity > 0) {
      lineItems.push({
        price: ticketConfig.priceId,
        quantity: finalTicketQuantity,
      });
    }

    // Add lodging if selected
    if (zone && lodgingQuantity > 0) {
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
              description: zone.description || undefined,
            },
            unit_amount: zone.night_price * 2,
          },
          quantity: lodgingQuantity,
        });
      }
    }

    // Add discount as coupon if applicable
    let stripeCouponId = undefined;
    if (discountAmount > 0) {
      // Create an inline coupon for this session
      if (offer.discount_type === "percentage") {
        const coupon = await stripe.coupons.create({
          percent_off: offer.discount_value,
          duration: "once",
        });
        stripeCouponId = coupon.id;
      } else if (offer.discount_type === "fixed") {
        const coupon = await stripe.coupons.create({
          amount_off: discountAmount,
          currency: "usd",
          duration: "once",
        });
        stripeCouponId = coupon.id;
      }
    }

    // Add donation
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

    // Create registration if it's a package offer
    let registrationId = existingRegistration?.id;
    if (offer.offer_type === "ticket_plus_lodging" && ticketConfig) {
      const { data: registration, error: regError } = await supabaseClient
        .from("registrations")
        .insert({
          event_id: offer.event_id,
          name,
          email,
          ticket_type: ticketType,
          quantity: finalTicketQuantity,
          total_amount: totalAmount,
          donation_amount: donationAmount,
          payment_status: "pending",
        })
        .select()
        .single();

      if (regError) {
        console.error("[create-lodging-offer-checkout] Registration error:", regError);
        return new Response(
          JSON.stringify({ error: "Unable to create registration" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      registrationId = registration.id;
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";

    // Prepare metadata
    const metadata: Record<string, string> = {
      offer_id: offer.id,
      offer_type: offer.offer_type,
      offer_token: offerCode,
      lodging_zone_key: lodgingZoneKey || "",
      lodging_qty: lodgingQuantity.toString(),
      preferences: preferences ? JSON.stringify(preferences) : "",
    };

    if (registrationId) {
      metadata.registration_id = registrationId;
    }

    if (ticketType && finalTicketQuantity > 0) {
      metadata.ticket_type = ticketType;
      metadata.ticket_qty = finalTicketQuantity.toString();
    }

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/offer/${offer.offer_type === "lodging_only" ? "lodging" : "package"}/success?session_id={CHECKOUT_SESSION_ID}&code=${offerCode}`,
      cancel_url: `${origin}/offer/${offer.offer_type === "lodging_only" ? "lodging" : "package"}?code=${offerCode}&canceled=true`,
      payment_intent_data: {
        description: `Cosmico - ${offer.offer_type === "lodging_only" ? "Lodging Offer" : "Package Offer"}`,
      },
      metadata,
    };

    // Apply coupon if exists
    if (stripeCouponId) {
      sessionParams.discounts = [{ coupon: stripeCouponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Update registration with session ID
    if (registrationId) {
      await supabaseClient
        .from("registrations")
        .update({ stripe_session_id: session.id })
        .eq("id", registrationId);
    }

    console.log("[create-lodging-offer-checkout] Checkout session created:", session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[create-lodging-offer-checkout] Unexpected error:", error?.message);
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again later." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
