import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GET-CUSTOM-OFFER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const { token } = await req.json();
    if (!token) throw new Error("Token is required");

    logStep("Looking up offer", { token });

    // Get the offer
    const { data: offer, error: offerError } = await supabaseAdmin
      .from("custom_offers")
      .select(`
        *,
        event_details(title, event_date, event_time, venue_name)
      `)
      .eq("offer_token", token)
      .single();

    if (offerError || !offer) {
      throw new Error("Offer not found");
    }

    // Check if expired
    if (new Date(offer.expires_at) < new Date()) {
      throw new Error("This offer has expired");
    }

    // Check if already accepted
    if (offer.status !== "pending") {
      throw new Error(`This offer has already been ${offer.status}`);
    }

    logStep("Offer found", { offerId: offer.id, status: offer.status });

    // Get offer items with inventory details
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("custom_offer_items")
      .select(`
        *,
        lodging_inventory(display_name, description, lodging_type, required_ticket_types),
        addon_inventory(display_name, description, addon_type, required_ticket_types),
        accommodation_units(unit_name, product_type, bed_configuration, zone_key),
        accommodation_zones(zone_name, description, required_ticket_types)
      `)
      .eq("offer_id", offer.id);

    if (itemsError) throw itemsError;

    logStep("Items retrieved", { count: items?.length });

    // Enrich items with names
    const enrichedItems = items?.map((item) => {
      let name = "";
      let description = "";
      let required_ticket_types = null;

      if (item.item_type === "ticket" && item.ticket_type) {
        name = item.ticket_type
          .split("_")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      } else if (item.item_type === "lodging") {
        // Try accommodation_zones first (current approach), fall back to lodging_inventory
        if (item.accommodation_units) {
          const unitType = item.accommodation_units.product_type === "cabin" ? "Cabin" : "Tent";
          name = `${unitType} ${item.accommodation_units.unit_name} — ${item.accommodation_units.bed_configuration}`;
          description = item.accommodation_zones?.description || "Specific lodging room";
          required_ticket_types = item.accommodation_zones?.required_ticket_types || null;
        } else if (item.accommodation_zones) {
          name = item.accommodation_zones.zone_name;
          description = item.accommodation_zones.description || "";
          required_ticket_types = item.accommodation_zones.required_ticket_types;
        } else if (item.lodging_inventory) {
          name = item.lodging_inventory.display_name;
          description = item.lodging_inventory.description;
          required_ticket_types = item.lodging_inventory.required_ticket_types;
        } else {
          name = "Lodging Accommodation";
        }
      } else if (item.item_type === "addon" && item.addon_inventory) {
        name = item.addon_inventory.display_name;
        description = item.addon_inventory.description;
        required_ticket_types = item.addon_inventory.required_ticket_types;
      }

      return {
        ...item,
        name,
        description,
        required_ticket_types,
      };
    });

    return new Response(
      JSON.stringify({
        offer: {
          id: offer.id,
          offer_type: offer.offer_type,
          recipient_email: offer.recipient_email,
          recipient_name: offer.recipient_name,
          custom_message: offer.custom_message,
          discount_type: offer.discount_type,
          discount_value: offer.discount_value,
          subtotal: offer.subtotal,
          discount_amount: offer.discount_amount,
          total_amount: offer.total_amount,
          expires_at: offer.expires_at,
          event: offer.event_details,
        },
        items: enrichedItems,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
