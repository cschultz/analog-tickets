import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[EXPIRE-CUSTOM-OFFERS] ${step}${detailsStr}`);
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
    logStep("Function started - checking for expired offers");

    // Find all pending offers that have expired
    const { data: expiredOffers, error: fetchError } = await supabaseAdmin
      .from("custom_offers")
      .select("id, event_id")
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    if (fetchError) throw fetchError;

    logStep("Found expired offers", { count: expiredOffers?.length || 0 });

    if (!expiredOffers || expiredOffers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired offers to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    let releasedTickets = 0;
    let releasedLodging = 0;
    let releasedAddons = 0;

    for (const offer of expiredOffers) {
      logStep("Processing expired offer", { offerId: offer.id });

      // Get offer items
      const { data: items, error: itemsError } = await supabaseAdmin
        .from("custom_offer_items")
        .select("*")
        .eq("offer_id", offer.id);

      if (itemsError) {
        console.error("Error fetching items for offer", offer.id, itemsError);
        continue;
      }

      // Release inventory for each item
      for (const item of items || []) {
        if (item.item_type === "ticket" && item.ticket_type) {
          const { data: inventory } = await supabaseAdmin
            .from("ticket_inventory")
            .select("sold_quantity")
            .eq("ticket_type", item.ticket_type)
            .eq("event_id", offer.event_id)
            .single();

          if (inventory) {
            await supabaseAdmin
              .from("ticket_inventory")
              .update({ sold_quantity: Math.max(0, inventory.sold_quantity - item.quantity) })
              .eq("ticket_type", item.ticket_type)
              .eq("event_id", offer.event_id);

            releasedTickets += item.quantity;
            logStep("Released ticket inventory", { ticket_type: item.ticket_type, quantity: item.quantity });
          }
        }

        if (item.item_type === "lodging" && item.accommodation_unit_id) {
          await supabaseAdmin
            .from("accommodation_units")
            .update({ inventory_status: "available" })
            .eq("id", item.accommodation_unit_id)
            .eq("inventory_status", "pending_offer");

          releasedLodging += item.quantity;
          logStep("Released specific lodging unit", { id: item.accommodation_unit_id });
        } else if (item.item_type === "lodging" && item.lodging_inventory_id) {
          const { data: lodging } = await supabaseAdmin
            .from("lodging_inventory")
            .select("sold_quantity")
            .eq("id", item.lodging_inventory_id)
            .single();

          if (lodging) {
            await supabaseAdmin
              .from("lodging_inventory")
              .update({ sold_quantity: Math.max(0, lodging.sold_quantity - item.quantity) })
              .eq("id", item.lodging_inventory_id);

            releasedLodging += item.quantity;
            logStep("Released lodging inventory", { id: item.lodging_inventory_id, quantity: item.quantity });
          }
        }

        if (item.item_type === "addon" && item.addon_inventory_id) {
          const { data: addon } = await supabaseAdmin
            .from("addon_inventory")
            .select("sold_quantity")
            .eq("id", item.addon_inventory_id)
            .single();

          if (addon) {
            await supabaseAdmin
              .from("addon_inventory")
              .update({ sold_quantity: Math.max(0, addon.sold_quantity - item.quantity) })
              .eq("id", item.addon_inventory_id);

            releasedAddons += item.quantity;
            logStep("Released addon inventory", { id: item.addon_inventory_id, quantity: item.quantity });
          }
        }
      }

      // Mark offer as expired
      await supabaseAdmin
        .from("custom_offers")
        .update({ status: "expired" })
        .eq("id", offer.id);

      logStep("Offer marked as expired", { offerId: offer.id });
    }

    const summary = {
      expired_offers: expiredOffers.length,
      released_tickets: releasedTickets,
      released_lodging: releasedLodging,
      released_addons: releasedAddons,
    };

    logStep("Expiration complete", summary);

    return new Response(
      JSON.stringify({ success: true, ...summary }),
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
