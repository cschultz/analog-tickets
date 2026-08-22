import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AcceptOfferRequest {
  token: string;
  recipient_name: string;
  recipient_email?: string;
  modifications?: {
    item_id: string;
    new_quantity: number;
  }[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ACCEPT-CUSTOM-OFFER] ${step}${detailsStr}`);
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

    const body: AcceptOfferRequest = await req.json();
    const { token, recipient_name, recipient_email, modifications } = body;

    if (!token) throw new Error("Token is required");
    if (!recipient_name?.trim()) throw new Error("Name is required");

    logStep("Looking up offer", { token });

    // Get the offer
    const { data: offer, error: offerError } = await supabaseAdmin
      .from("custom_offers")
      .select("*, event_details(title)")
      .eq("offer_token", token)
      .single();

    if (offerError || !offer) {
      throw new Error("Offer not found");
    }

    if (new Date(offer.expires_at) < new Date()) {
      throw new Error("This offer has expired");
    }

    if (offer.status !== "pending") {
      throw new Error(`This offer has already been ${offer.status}`);
    }

    logStep("Offer valid", { offerId: offer.id });

    // Get offer items
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("custom_offer_items")
      .select(`
        *,
        lodging_inventory(display_name, required_ticket_types),
        accommodation_units(unit_name, product_type, bed_configuration),
        addon_inventory(display_name, required_ticket_types)
      `)
      .eq("offer_id", offer.id);

    if (itemsError) throw itemsError;

    // Apply modifications if any
    let modifiedItems = [...(items || [])];
    if (modifications && modifications.length > 0) {
      for (const mod of modifications) {
        const itemIndex = modifiedItems.findIndex((i) => i.id === mod.item_id);
        if (itemIndex !== -1) {
          const item = modifiedItems[itemIndex];
          const oldQty = item.quantity;
          const newQty = mod.new_quantity;

          if (newQty < 0) throw new Error("Quantity cannot be negative");
          if (newQty > oldQty) {
            throw new Error(
              `Cannot increase quantity beyond what was offered (${oldQty}) for "${item.name}".`
            );
          }

          // If reducing quantity, release inventory
          if (newQty < oldQty) {
            const diff = oldQty - newQty;
            if (item.item_type === "ticket" && item.ticket_type) {
              await supabaseAdmin.rpc("release_ticket_inventory", {
                p_ticket_type: item.ticket_type,
                p_quantity: diff,
                p_event_id: offer.event_id,
              });
            } else if (item.item_type === "lodging" && item.accommodation_unit_id) {
              await supabaseAdmin
                .from("accommodation_units")
                .update({ inventory_status: "available" })
                .eq("id", item.accommodation_unit_id)
                .eq("inventory_status", "pending_offer");
            } else if (item.item_type === "lodging" && item.lodging_inventory_id) {
              const { data: lodging } = await supabaseAdmin
                .from("lodging_inventory")
                .select("sold_quantity")
                .eq("id", item.lodging_inventory_id)
                .single();
              if (lodging) {
                await supabaseAdmin
                  .from("lodging_inventory")
                  .update({ sold_quantity: Math.max(0, lodging.sold_quantity - diff) })
                  .eq("id", item.lodging_inventory_id);
              }
            } else if (item.item_type === "addon" && item.addon_inventory_id) {
              const { data: addon } = await supabaseAdmin
                .from("addon_inventory")
                .select("sold_quantity")
                .eq("id", item.addon_inventory_id)
                .single();
              if (addon) {
                await supabaseAdmin
                  .from("addon_inventory")
                  .update({ sold_quantity: Math.max(0, addon.sold_quantity - diff) })
                  .eq("id", item.addon_inventory_id);
              }
            }
          }

          // Update item or remove if quantity is 0
          if (newQty === 0) {
            modifiedItems = modifiedItems.filter((_, i) => i !== itemIndex);
          } else {
            modifiedItems[itemIndex] = { ...item, quantity: newQty };
          }
        }
      }
    }

    // Admin-created custom offers explicitly override standard ticket gating.

    // Calculate new totals
    let newSubtotal = 0;
    for (const item of modifiedItems) {
      newSubtotal += item.unit_price * item.quantity;
    }

    let newDiscountAmount = 0;
    if (offer.discount_type === "percentage" && offer.discount_value > 0) {
      newDiscountAmount = Math.round(newSubtotal * (offer.discount_value / 100));
    } else if (offer.discount_type === "fixed" && offer.discount_value > 0) {
      newDiscountAmount = Math.min(offer.discount_value, newSubtotal);
    }

    const newTotal = Math.max(0, newSubtotal - newDiscountAmount);

    logStep("Calculated new totals", { newSubtotal, newDiscountAmount, newTotal });

    // Create Stripe checkout session
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Resolve and validate email (allow user override on the offer page)
    const checkoutEmail = (recipient_email?.trim().toLowerCase()) || offer.recipient_email;
    if (!checkoutEmail || !EMAIL_RE.test(checkoutEmail)) {
      throw new Error("A valid email address is required to complete checkout. Please update the email on the offer page.");
    }

    // Persist a corrected email back to the offer record so receipts/notifications go to the right place
    if (recipient_email && checkoutEmail !== offer.recipient_email) {
      await supabaseAdmin
        .from("custom_offers")
        .update({ recipient_email: checkoutEmail })
        .eq("id", offer.id);
      logStep("Updated offer recipient email", { from: offer.recipient_email, to: checkoutEmail });
    }

    // Check for existing customer
    const customers = await stripe.customers.list({
      email: checkoutEmail,
      limit: 1,
    });

    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of modifiedItems) {
      let name = "";
      if (item.item_type === "ticket") {
        name = `${item.ticket_type?.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Ticket`;
      } else if (item.item_type === "lodging") {
        if (item.accommodation_units) {
          name = `${item.accommodation_units.product_type === "cabin" ? "Cabin" : "Tent"} ${item.accommodation_units.unit_name} — ${item.accommodation_units.bed_configuration}`;
        } else {
          name = item.lodging_inventory?.display_name || "Lodging";
        }
      } else if (item.item_type === "addon") {
        name = item.addon_inventory?.display_name || "Add-on";
      }

      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name,
            description: `Cosmico 2026 - ${offer.event_details?.title || "Event"}`,
          },
          unit_amount: item.unit_price,
        },
        quantity: item.quantity,
      });
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";

    // Create session options
    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : checkoutEmail,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/offer/${token}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/offer/${token}`,
      payment_intent_data: {
        description: "Cosmico - Custom Offer",
      },
      metadata: {
        offer_id: offer.id,
        offer_token: token,
        recipient_name: recipient_name.trim(),
        modified_items: JSON.stringify(modifiedItems.map((i) => ({ id: i.id, quantity: i.quantity }))),
      },
    };

    // Apply discount using Stripe coupon if applicable
    if (newDiscountAmount > 0) {
      // Create a one-time coupon for this offer
      const coupon = await stripe.coupons.create({
        amount_off: newDiscountAmount,
        currency: "usd",
        duration: "once",
        name: `Custom Offer Discount (${offer.discount_type === "percentage" ? `${offer.discount_value}%` : `$${(offer.discount_value / 100).toFixed(2)}`})`,
      });
      sessionOptions.discounts = [{ coupon: coupon.id }];
      logStep("Created discount coupon", { couponId: coupon.id, amount: newDiscountAmount });
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    logStep("Checkout session created", { sessionId: session.id });

    // Update offer with modifications (if any)
    if (modifications && modifications.length > 0) {
      for (const item of modifiedItems) {
        await supabaseAdmin
          .from("custom_offer_items")
          .update({ quantity: item.quantity })
          .eq("id", item.id);
      }

      // Remove items with 0 quantity
      const removedIds = (items || [])
        .filter((i) => !modifiedItems.find((m) => m.id === i.id))
        .map((i) => i.id);

      if (removedIds.length > 0) {
        await supabaseAdmin
          .from("custom_offer_items")
          .delete()
          .in("id", removedIds);
      }

      // Update offer totals
      await supabaseAdmin
        .from("custom_offers")
        .update({
          subtotal: newSubtotal,
          discount_amount: newDiscountAmount,
          total_amount: newTotal,
        })
        .eq("id", offer.id);
    }

    return new Response(
      JSON.stringify({ url: session.url }),
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
