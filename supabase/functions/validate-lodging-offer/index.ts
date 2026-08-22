import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
      code: z.string().min(1),
      email: z.string().email().optional(), // For verifying existing tickets
    });

    const rawData = await req.json();
    const validationResult = requestSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error("[validate-lodging-offer] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid request", valid: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { code, email } = validationResult.data;

    console.log("[validate-lodging-offer] Validating offer:", { code, email: email ? "provided" : "not provided" });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if lodging invites are enabled globally
    const { data: lodgingSettings, error: settingsError } = await supabaseClient
      .from("lodging_settings")
      .select("lodging_invite_enabled")
      .limit(1)
      .single();

    if (settingsError || !lodgingSettings?.lodging_invite_enabled) {
      console.log("[validate-lodging-offer] Lodging invites are disabled");
      return new Response(
        JSON.stringify({ 
          error: "Invite-only lodging is not currently available", 
          valid: false,
          error_code: "INVITES_DISABLED"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch the offer by token
    const { data: offer, error: offerError } = await supabaseClient
      .from("custom_offers")
      .select(`
        id,
        offer_token,
        offer_type,
        recipient_email,
        recipient_name,
        status,
        expires_at,
        max_redemptions,
        redemptions_used,
        requires_existing_ticket,
        allowed_ticket_types,
        custom_message,
        discount_type,
        discount_value,
        event_id,
        event:event_details!event_id (
          id,
          title,
          event_date,
          venue_name
        )
      `)
      .eq("offer_token", code)
      .single();

    if (offerError || !offer) {
      console.log("[validate-lodging-offer] Offer not found:", offerError);
      return new Response(
        JSON.stringify({ 
          error: "Offer not found or invalid code", 
          valid: false,
          error_code: "NOT_FOUND"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check offer status
    if (offer.status !== "active") {
      console.log("[validate-lodging-offer] Offer not active:", offer.status);
      return new Response(
        JSON.stringify({ 
          error: offer.status === "paused" 
            ? "This offer is currently paused" 
            : "This offer is no longer available",
          valid: false,
          error_code: "INACTIVE"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check expiration
    if (new Date(offer.expires_at) < new Date()) {
      console.log("[validate-lodging-offer] Offer expired");
      return new Response(
        JSON.stringify({ 
          error: "This offer has expired", 
          valid: false,
          error_code: "EXPIRED"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check redemptions
    if (offer.redemptions_used >= offer.max_redemptions) {
      console.log("[validate-lodging-offer] Max redemptions reached");
      return new Response(
        JSON.stringify({ 
          error: "This offer has reached its maximum redemptions", 
          valid: false,
          error_code: "MAX_REDEMPTIONS"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // For lodging_only offers, verify existing ticket
    let existingTicket = null;
    if (offer.offer_type === "lodging_only" && email) {
      console.log("[validate-lodging-offer] Verifying existing ticket for email:", email);
      
      // Find paid registration with VIP or Krewe ticket
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
        console.log("[validate-lodging-offer] No eligible ticket found:", regError);
        return new Response(
          JSON.stringify({ 
            error: "No eligible VIP or Krewe ticket found for this email", 
            valid: false,
            error_code: "NO_ELIGIBLE_TICKET",
            requires_ticket_verification: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      existingTicket = registration;
      console.log("[validate-lodging-offer] Found existing ticket:", { 
        type: registration.ticket_type, 
        qty: registration.quantity 
      });
    }

    // Fetch ALL publicly available accommodation zones (live inventory & pricing).
    // Sold-out zones are returned too so the UI can mark them as such — they are not hidden.
    const { data: zones, error: zonesError } = await supabaseClient
      .from("accommodation_zones")
      .select("*")
      .eq("is_publicly_available", true)
      .order("night_price", { ascending: true });

    if (zonesError) {
      console.error("[validate-lodging-offer] Error fetching zones:", zonesError);
    }

    // Fetch available family-style units (parity with regular checkout LodgingSelector)
    const { data: familyUnits, error: familyUnitsError } = await supabaseClient
      .from("accommodation_units")
      .select("id, unit_name, product_type, zone_key, bed_configuration, sleeps_max, has_loft, night_price, inventory_status")
      .eq("is_family_style", true)
      .eq("inventory_status", "available")
      .order("night_price", { ascending: true });

    if (familyUnitsError) {
      console.error("[validate-lodging-offer] Error fetching family units:", familyUnitsError);
    }

    // Build response
    const response = {
      valid: true,
      offer: {
        id: offer.id,
        offer_type: offer.offer_type,
        recipient_email: offer.recipient_email,
        recipient_name: offer.recipient_name,
        custom_message: offer.custom_message,
        discount_type: offer.discount_type,
        discount_value: offer.discount_value,
        expires_at: offer.expires_at,
        requires_existing_ticket: offer.requires_existing_ticket,
        allowed_ticket_types: offer.allowed_ticket_types,
        event: offer.event,
      },
      existing_ticket: existingTicket,
      max_lodging_qty: existingTicket ? existingTicket.quantity : null,
      zones: zones || [],
      family_units: familyUnits || [],
    };

    console.log("[validate-lodging-offer] Offer validated successfully");

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[validate-lodging-offer] Unexpected error:", error?.message);
    return new Response(
      JSON.stringify({ error: "Unable to validate offer", valid: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
