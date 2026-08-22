import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CartItem {
  type: "lodging" | "addon";
  id: string;
  quantity: number;
  addonType?: string;
  displayName?: string;
  unitPrice?: number;
  hasDietaryRestrictions?: boolean;
  dietaryRestrictions?: string;
}

interface CheckoutRequest {
  items: CartItem[];
  registrationId: string;
  customerEmail: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-ADDON-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { items, registrationId, customerEmail }: CheckoutRequest = await req.json();

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }
    if (!registrationId) {
      throw new Error("Registration ID is required");
    }
    if (!customerEmail) {
      throw new Error("Customer email is required");
    }

    logStep("Request validated", { itemCount: items.length, registrationId, customerEmail });

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify the registration exists and belongs to this email
    const { data: registration, error: regError } = await supabaseAdmin
      .from("registrations")
      .select("id, email, event_id, ticket_type")
      .eq("id", registrationId)
      .eq("payment_status", "paid")
      .single();

    if (regError || !registration) {
      logStep("Registration not found", { error: regError });
      throw new Error("Registration not found or not paid");
    }

    if (registration.email.toLowerCase() !== customerEmail.toLowerCase()) {
      throw new Error("Email does not match registration");
    }

    logStep("Registration verified", { eventId: registration.event_id });

    // ---- Friday-dinner cap enforcement (mirrors src/lib/addons.ts) ----
    const ADDON_TICKET_TYPE_ALIASES: Record<string, string> = {
      "2day_ga": "tier_1_ga_2day",
      "friday_ga": "tier_1_ga_friday",
      "saturday_ga": "tier_1_ga_saturday",
      ga_friday: "tier_1_ga_friday",
      ga_saturday: "tier_1_ga_saturday",
      ga_2day: "tier_1_ga_2day",
      ga_2_day: "tier_1_ga_2day",
      early_bird_ga_friday: "tier_1_ga_friday",
      early_bird_ga_saturday: "tier_1_ga_saturday",
      early_bird_ga_2day: "tier_1_ga_2day",
      vip_3day: "tier_1_vip_3day",
      vip_3_day: "tier_1_vip_3day",
      early_bird_vip_3day: "tier_1_vip_3day",
      early_bird_vip_3_day: "tier_1_vip_3day",
      krewe_3day: "tier_1_krewe_3day",
      krewe_3_day: "tier_1_krewe_3day",
      early_bird_krewe_3day: "tier_1_krewe_3day",
      early_bird_krewe_3_day: "tier_1_krewe_3day",
      // Legacy ticket_type values still in production data
      krewe: "tier_1_krewe_3day",
      vip_friday: "tier_1_ga_friday",
      artist_guest: "tier_1_vip_3day",
    };
    const FRIDAY_ELIGIBLE_TICKET_TYPES = [
      "tier_1_ga_friday",
      "tier_1_ga_2day",
      "tier_1_krewe_3day",
      "tier_1_vip_3day",
      "patrons_premier",
      "patrons_ultimate",
      "party_only",
    ];
    const includesFriday = (t: string | null | undefined) => {
      if (!t) return false;
      const resolved = ADDON_TICKET_TYPE_ALIASES[t] || t;
      return FRIDAY_ELIGIBLE_TICKET_TYPES.includes(resolved);
    };

    // Fetch all items from inventory
    const lodgingIds = items.filter((i) => i.type === "lodging").map((i) => i.id);
    const addonIds = items.filter((i) => i.type === "addon").map((i) => i.id);

    let lodgingItems: any[] = [];
    let addonItems: any[] = [];

    if (lodgingIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("lodging_inventory")
        .select("*")
        .in("id", lodgingIds)
        .eq("is_active", true);
      if (error) throw new Error("Failed to fetch lodging inventory");
      lodgingItems = data || [];
    }

    if (addonIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("addon_inventory")
        .select("*")
        .in("id", addonIds)
        .eq("is_active", true);
      if (error) throw new Error("Failed to fetch addon inventory");
      addonItems = data || [];
    }

    logStep("Inventory fetched", { lodgingCount: lodgingItems.length, addonCount: addonItems.length });

    // Build line items for Stripe and validate availability
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const purchaseRecords: any[] = [];

    for (const cartItem of items) {
      let inventoryItem: any;
      let itemName: string;
      let itemPrice: number;

      if (cartItem.type === "lodging") {
        inventoryItem = lodgingItems.find((l) => l.id === cartItem.id);
        if (!inventoryItem) throw new Error(`Lodging item not found: ${cartItem.id}`);
        itemName = inventoryItem.display_name;
        itemPrice = inventoryItem.price;
      } else {
        inventoryItem = addonItems.find((a) => a.id === cartItem.id);
        if (!inventoryItem) throw new Error(`Addon item not found: ${cartItem.id}`);
        if (inventoryItem.required_ticket_types && inventoryItem.required_ticket_types.length > 0 && !inventoryItem.required_ticket_types.includes(registration.ticket_type)) {
          throw new Error(`${inventoryItem.display_name} is not available with your ticket type.`);
        }
        itemName = inventoryItem.display_name;
        itemPrice = inventoryItem.price;
      }

      // Enforce per-addon sales cutoff (e.g. Friday dinner closes Thursday 10am PT)
      if (inventoryItem.sales_end_at && new Date(inventoryItem.sales_end_at).getTime() <= Date.now()) {
        throw new Error(`Sales for ${itemName} have closed.`);
      }

      const hasDietaryRestrictions = cartItem.type === "addon" && inventoryItem.addon_type === "friday_dinner"
        ? !!cartItem.hasDietaryRestrictions
        : false;
      const dietaryRestrictions = hasDietaryRestrictions ? (cartItem.dietaryRestrictions || "").trim() : "";

      if (hasDietaryRestrictions && dietaryRestrictions.length === 0) {
        throw new Error(`Please share dietary restrictions for ${itemName}.`);
      }

      if (dietaryRestrictions.length > 1000) {
        throw new Error("Dietary restrictions must be 1000 characters or fewer");
      }

      // Check inventory availability (kitchen/event capacity)
      const available = inventoryItem.total_quantity - inventoryItem.sold_quantity;
      if (available < cartItem.quantity) {
        if (available <= 0) {
          throw new Error(`${itemName} is sold out — no more inventory remaining.`);
        }
        throw new Error(
          `${itemName} only has ${available} spot${available === 1 ? "" : "s"} left in inventory, but you requested ${cartItem.quantity}.`
        );
      }

      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: itemName,
            description: inventoryItem.description || undefined,
          },
          unit_amount: itemPrice,
        },
        quantity: cartItem.quantity,
      });

      purchaseRecords.push({
        registration_id: registrationId,
        purchase_type: cartItem.type,
        inventory_id: cartItem.id,
        quantity: cartItem.quantity,
        unit_price: itemPrice,
        total_amount: itemPrice * cartItem.quantity,
        purchaser_email: customerEmail.toLowerCase(),
        has_dietary_restrictions: hasDietaryRestrictions,
        dietary_restrictions: hasDietaryRestrictions ? dietaryRestrictions : null,
        payment_status: "pending",
      });
    }

    // ---- Enforce Friday-dinner cap server-side ----
    const fridayDinnerInventoryIds = addonItems
      .filter((a) => a.addon_type === "friday_dinner")
      .map((a) => a.id);
    const requestedFridayDinnerQty = items
      .filter((i) => i.type === "addon" && fridayDinnerInventoryIds.includes(i.id))
      .reduce((sum, i) => sum + (i.quantity || 0), 0);

    if (requestedFridayDinnerQty > 0) {
      // Sum Friday-eligible ticket quantities across all paid registrations
      // for this email + event.
      const { data: eventRegs, error: eventRegsError } = await supabaseAdmin
        .from("registrations")
        .select("id, ticket_type, quantity")
        .eq("event_id", registration.event_id)
        .eq("payment_status", "paid")
        .ilike("email", customerEmail);
      if (eventRegsError) throw new Error("Failed to verify ticket eligibility");

      const fridayCap = (eventRegs || []).reduce(
        (sum, r: any) => sum + (includesFriday(r.ticket_type) ? (r.quantity || 1) : 0),
        0
      );

      // Only count PAID dinners against the cap. Pending rows represent
      // unpaid Stripe sessions from prior attempts (often abandoned/expired)
      // and must not block a legitimate retry. The webhook revalidates
      // inventory atomically at payment time, so this is safe.
      // We also expire stale pending rows for this registration so the
      // user's record stays clean.
      const regIds = (eventRegs || []).map((r: any) => r.id);
      let alreadyPurchased = 0;
      if (regIds.length > 0 && fridayDinnerInventoryIds.length > 0) {
        // Expire pending dinner rows older than 30 minutes for these regs
        // (Stripe Checkout sessions older than this are effectively dead).
        const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from("addon_purchases")
          .update({ payment_status: "expired" })
          .in("registration_id", regIds)
          .in("inventory_id", fridayDinnerInventoryIds)
          .eq("payment_status", "pending")
          .lt("created_at", cutoff);

        const { data: existing, error: existingError } = await supabaseAdmin
          .from("addon_purchases")
          .select("quantity, payment_status")
          .in("registration_id", regIds)
          .in("inventory_id", fridayDinnerInventoryIds)
          .eq("payment_status", "paid");
        if (existingError) throw new Error("Failed to verify existing add-on purchases");
        alreadyPurchased = (existing || []).reduce(
          (sum: number, p: any) => sum + (p.quantity || 0),
          0
        );
      }

      const remaining = Math.max(0, fridayCap - alreadyPurchased);
      logStep("Friday dinner cap check", {
        requested: requestedFridayDinnerQty,
        fridayCap,
        alreadyPurchased,
        remaining,
      });

      if (requestedFridayDinnerQty > remaining) {
        if (fridayCap <= 0) {
          throw new Error(
            "The Friday-night dinner is only available with a Friday, 2-day, or 3-day ticket. Add a Friday-eligible ticket to your account to reserve a seat.",
          );
        }
        if (alreadyPurchased >= fridayCap) {
          throw new Error(
            `You already have ${alreadyPurchased} Friday-night dinner${alreadyPurchased === 1 ? "" : "s"} on this account, which matches your ticket cap (1 per Friday-eligible ticket). Add another Friday-eligible ticket to reserve more.`,
          );
        }
        throw new Error(
          `You can reserve ${remaining} more Friday-night dinner${remaining === 1 ? "" : "s"} on this account (1 per Friday-eligible ticket). Reduce your quantity or add another Friday-eligible ticket.`,
        );
      }
    }

    logStep("Line items built", { count: lineItems.length });

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check for existing Stripe customer
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    logStep("Stripe customer lookup", { found: !!customerId });

    // Create checkout session
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : customerEmail,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/my-tickets?addon_success=true`,
      cancel_url: `${origin}/my-tickets?addon_canceled=true`,
      payment_intent_data: {
        description: "Cosmico - Add-on",
      },
      metadata: {
        registration_id: registrationId,
        purchase_type: "addon",
      },
    });

    logStep("Checkout session created", { sessionId: session.id });

    // Create pending purchase records
    for (const record of purchaseRecords) {
      record.stripe_session_id = session.id;
    }

    const { error: insertError } = await supabaseAdmin
      .from("addon_purchases")
      .insert(purchaseRecords);

    if (insertError) {
      logStep("Failed to create purchase records", { error: insertError });
      // Don't fail the checkout - we can reconcile later
    } else {
      logStep("Purchase records created", { count: purchaseRecords.length });
    }

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
