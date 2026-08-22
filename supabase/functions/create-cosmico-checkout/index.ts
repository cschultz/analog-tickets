import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { generateMetaEventId, sendMetaCapiInitiateCheckout } from "../_shared/meta-capi-utils.ts";
import { checkRateLimitDb } from "../_shared/error-utils.ts";
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

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

// Ticket type configuration interface
interface TicketTypeConfig {
  priceId: string;
  price: number;
  name: string;
  description: string;
}

interface YouthTicketConfig {
  price: number;
  name: string;
  description: string;
}

// Database ticket type row interface
interface TicketTypeRow {
  key: string;
  label: string;
  price: number;
  description: string | null;
  stripe_price_id: string | null;
}

// Fetch ticket types from database
// deno-lint-ignore no-explicit-any
async function fetchTicketConfig(
  supabaseClient: any,
  eventId: string
): Promise<Record<string, TicketTypeConfig>> {
  const { data: ticketTypes, error } = await supabaseClient
    .from("ticket_types")
    .select("key, label, price, description, stripe_price_id")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .not("key", "like", "youth_%")
    .not("key", "like", "child_%")
    .not("key", "like", "patrons_%");

  if (error || !ticketTypes) {
    console.error("[create-cosmico-checkout] Failed to fetch ticket types:", error);
    return {};
  }

  const config: Record<string, TicketTypeConfig> = {};
  for (const tt of ticketTypes as TicketTypeRow[]) {
    if (tt.stripe_price_id) {
      config[tt.key] = {
        priceId: tt.stripe_price_id,
        price: tt.price,
        name: tt.label,
        description: tt.description || tt.label,
      };
    }
  }
  return config;
}

// Fetch youth ticket types from database
// deno-lint-ignore no-explicit-any
async function fetchYouthConfig(
  supabaseClient: any,
  eventId: string
): Promise<Record<string, YouthTicketConfig>> {
  const { data: youthTypes, error } = await supabaseClient
    .from("ticket_types")
    .select("key, label, price, description")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .like("key", "youth_%");

  if (error || !youthTypes) {
    console.error("[create-cosmico-checkout] Failed to fetch youth types:", error);
    return {};
  }

  const config: Record<string, YouthTicketConfig> = {};
  for (const yt of youthTypes as TicketTypeRow[]) {
    config[yt.key] = {
      price: yt.price,
      name: yt.label,
      description: yt.description || yt.label,
    };
  }
  return config;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting check (DB-backed, persists across cold starts)
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    
    const rateLimitResult = await checkRateLimitDb(
      clientIp, 
      "create-cosmico-checkout", 
      RATE_LIMIT_MAX_REQUESTS, 
      RATE_LIMIT_WINDOW_SECONDS
    );
    
    if (!rateLimitResult.allowed) {
      console.warn(`[create-cosmico-checkout] Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ 
          error: "Too many requests. Please try again later.",
          retryAfter: Math.ceil((rateLimitResult.resetsAt.getTime() - Date.now()) / 1000)
        }),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": Math.ceil((rateLimitResult.resetsAt.getTime() - Date.now()) / 1000).toString()
          }, 
          status: 429 
        }
      );
    }

    // Validation schema - uses string for ticketType, validated against DB later
    const addonSchema = z.object({
      inventoryId: z.string().uuid(),
      addonType: z.string(),
      displayName: z.string(),
      unitPrice: z.number().min(0),
      quantity: z.number().min(1).max(10),
      hasDietaryRestrictions: z.boolean().optional().default(false),
      dietaryRestrictions: z.string().trim().max(1000).optional(),
    });

    const requestSchema = z.object({
      ticketType: z.string().min(1),
      quantity: z.number().min(1).max(4),
      name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
      email: z.string().email("Invalid email format").max(255, "Email too long"),
      phone: z.string().max(20).optional(),
      donationAmount: z.number().min(0).max(100000).optional().default(0),
      accommodationWaitlist: z.boolean().optional().default(false),
      childCount: z.number().min(0).max(3).optional().default(0),
      youthTicketType: z.string().nullable().optional(),
      youthCount: z.number().min(0).max(4).optional().default(0),
      promoCode: z.string().max(50).optional(),
      addons: z.array(addonSchema).optional(),
      // Meta CAPI deduplication fields (passed from browser)
      fbp: z.string().optional(),
      fbc: z.string().optional(),
      client_ip: z.string().optional(),
      client_user_agent: z.string().optional(),
      event_source_url: z.string().optional(),
      // Ad attribution (UTMs + click IDs) — captured from URL on landing
      attribution: z.object({
        gclid: z.string().max(500).optional(),
        gbraid: z.string().max(500).optional(),
        wbraid: z.string().max(500).optional(),
        fbclid: z.string().max(500).optional(),
        utm_source: z.string().max(255).optional(),
        utm_medium: z.string().max(255).optional(),
        utm_campaign: z.string().max(255).optional(),
        utm_content: z.string().max(255).optional(),
        utm_term: z.string().max(255).optional(),
      }).optional(),
    });

    const rawData = await req.json();
    const validationResult = requestSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error("[create-cosmico-checkout] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid request. Please check your input." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { ticketType, quantity, name, email, phone, donationAmount, accommodationWaitlist, childCount, youthTicketType, youthCount, promoCode, addons, fbp, fbc, client_ip, client_user_agent, event_source_url, attribution } = validationResult.data;

    // Use real client IP from frontend (captured via get-client-ip), fallback to proxy IP
    const realClientIp = client_ip || clientIp;
    const realUserAgent = client_user_agent || req.headers.get("user-agent") || undefined;

    // Generate unique event IDs for CAPI deduplication
    const metaEventId = generateMetaEventId("purchase");
    const icEventId = generateMetaEventId("ic");

    console.log("Creating Cosmico checkout:", { ticketType, quantity, email, donationAmount, accommodationWaitlist, childCount, youthTicketType, youthCount, metaEventId });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get active Cosmico 2026 event first
    const { data: event, error: eventError } = await supabaseClient
      .from("event_details")
      .select("id")
      .eq("title", "Cosmico 2026")
      .eq("is_active", true)
      .single();

    if (eventError || !event) {
      console.error("[create-cosmico-checkout] Event not found:", eventError);
      return new Response(
        JSON.stringify({ error: "Event not found. Please try again later." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch ticket configuration from database
    const TICKET_CONFIG = await fetchTicketConfig(supabaseClient, event.id);
    const YOUTH_TICKET_CONFIG = await fetchYouthConfig(supabaseClient, event.id);

    // Validate ticket type exists in config
    const ticketConfig = TICKET_CONFIG[ticketType];
    if (!ticketConfig) {
      console.error("[create-cosmico-checkout] Invalid ticket type:", ticketType);
      return new Response(
        JSON.stringify({ error: "Invalid ticket type selected." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check ticket availability for the specific event
    const { data: inventory, error: inventoryError } = await supabaseClient
      .from("ticket_inventory")
      .select("total_quantity, sold_quantity")
      .eq("ticket_type", ticketType)
      .eq("event_id", event.id)
      .single();

    if (inventoryError) {
      console.error("[create-cosmico-checkout] Inventory check failed:", inventoryError);
      return new Response(
        JSON.stringify({ error: "Unable to process request. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const available = inventory.total_quantity - inventory.sold_quantity;

    if (available < quantity) {
      return new Response(
        JSON.stringify({ 
          error: "Not enough tickets available", 
          message: `Sorry, only ${available} ${ticketConfig.name} tickets remain.`,
          available,
          requested: quantity 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const ticketSubtotal = ticketConfig.price * quantity;
    const youthSubtotal = youthTicketType && youthCount > 0 && YOUTH_TICKET_CONFIG[youthTicketType]
      ? YOUTH_TICKET_CONFIG[youthTicketType].price * youthCount 
      : 0;

    // Fetch and calculate fees
    const fees = await fetchCheckoutFees(supabaseClient);
    const calculatedFees = calculateFees(fees, {
      ticketSubtotal,
      lodgingSubtotal: 0,  // No lodging in this flow
      donationAmount,
    });
    const totalFees = getTotalFeesAmount(calculatedFees);
    let promoDiscountCents = 0;
    let promoCodeId: string | null = null;
    let stripeCouponId: string | undefined;

    // Validate and apply promo code
    if (promoCode) {
      const { data: promo, error: promoErr } = await supabaseClient
        .from("promo_codes")
        .select("*")
        .eq("code", promoCode.toUpperCase())
        .eq("is_active", true)
        .single();

      if (!promoErr && promo) {
        const now = new Date();
        const validFrom = promo.valid_from ? new Date(promo.valid_from) : null;
        const validUntil = promo.valid_until ? new Date(promo.valid_until) : null;
        const withinDates = (!validFrom || validFrom <= now) && (!validUntil || validUntil >= now);
        const withinUses = promo.max_uses === null || promo.current_uses < promo.max_uses;
        const ticketAllowed = !promo.allowed_ticket_types || promo.allowed_ticket_types.length === 0 || promo.allowed_ticket_types.includes(ticketType);

        // Hard cap on ticket quantity per promo code
        const maxQty = (promo as { max_quantity_per_use?: number | null }).max_quantity_per_use ?? null;
        if (maxQty !== null && quantity > maxQty) {
          return new Response(
            JSON.stringify({ error: `Promo code ${promo.code} is limited to ${maxQty} ticket${maxQty === 1 ? "" : "s"}. Please reduce your quantity.` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        if (withinDates && withinUses && ticketAllowed) {
          // Check single-use per email
          let emailUsed = false;
          if (promo.is_single_use) {
            const { count } = await supabaseClient
              .from("promo_code_uses")
              .select("*", { count: "exact", head: true })
              .eq("promo_code_id", promo.id)
              .eq("email", email.toLowerCase());
            emailUsed = (count || 0) > 0;
          }

          if (!emailUsed) {
            const ticketBaseCents = ticketSubtotal + youthSubtotal;
            if (promo.discount_type === "percentage") {
              promoDiscountCents = Math.round(ticketBaseCents * (Number(promo.discount_value) / 100));
            } else {
              promoDiscountCents = Math.min(Math.round(Number(promo.discount_value) * 100), ticketBaseCents);
            }
            promoCodeId = promo.id;

            // Create Stripe coupon for this checkout
            if (promoDiscountCents > 0) {
              const coupon = await stripe.coupons.create({
                amount_off: promoDiscountCents,
                currency: "usd",
                duration: "once",
                name: `Promo: ${promo.code}`,
              });
              stripeCouponId = coupon.id;
            }

            console.log("[create-cosmico-checkout] Promo applied:", { code: promo.code, discountCents: promoDiscountCents });
          }
        }
      }
    }

    // Waive service fees when promo fully covers ticket cost (e.g. 100% off comp)
    const ticketBaseCentsTotal = ticketSubtotal + youthSubtotal;
    const feesWaived = ticketBaseCentsTotal > 0 && promoDiscountCents >= ticketBaseCentsTotal;
    if (feesWaived) {
      for (const f of calculatedFees) {
        // deno-lint-ignore no-explicit-any
        (f as any).amount = 0;
      }
    }
    const effectiveTotalFees = feesWaived ? 0 : totalFees;

    // Validate and calculate add-on totals
    let addonTotalCents = 0;
    // deno-lint-ignore no-explicit-any
    const validatedAddons: any[] = [];
    if (addons && addons.length > 0) {
      for (const addon of addons) {
        const { data: inv, error: invErr } = await supabaseClient
          .from("addon_inventory")
          .select("id, addon_type, display_name, price, total_quantity, sold_quantity, is_active, required_ticket_types")
          .eq("id", addon.inventoryId)
          .eq("is_active", true)
          .single();

        if (invErr || !inv) {
          console.error("[create-cosmico-checkout] Add-on not found:", addon.inventoryId);
          return new Response(
            JSON.stringify({ error: "Selected add-on is no longer available." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        // Verify ticket eligibility
        if (inv.required_ticket_types && inv.required_ticket_types.length > 0) {
          if (!inv.required_ticket_types.includes(ticketType)) {
            return new Response(
              JSON.stringify({ error: `${inv.display_name} is not available with your ticket type.` }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
            );
          }
        }

        // Check availability
        const available = inv.total_quantity - inv.sold_quantity;
        if (available < addon.quantity) {
          return new Response(
            JSON.stringify({ error: `Only ${available} seats remaining for ${inv.display_name}.` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        // Use server-side price (don't trust client)
        addonTotalCents += inv.price * addon.quantity;
        const hasDietaryRestrictions = inv.addon_type === "friday_dinner" ? !!addon.hasDietaryRestrictions : false;
        const dietaryRestrictions = hasDietaryRestrictions
          ? (addon.dietaryRestrictions || "").trim()
          : "";

        if (hasDietaryRestrictions && dietaryRestrictions.length === 0) {
          return new Response(
            JSON.stringify({ error: `Please share dietary restrictions for ${inv.display_name}.` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        validatedAddons.push({
          ...addon,
          serverPrice: inv.price,
          displayName: inv.display_name,
          hasDietaryRestrictions,
          dietaryRestrictions,
        });
      }
    }

    const totalAmount = ticketSubtotal + youthSubtotal + donationAmount + effectiveTotalFees + addonTotalCents - promoDiscountCents;

    console.log("[create-cosmico-checkout] Fee breakdown:", {
      ticketSubtotal,
      youthSubtotal,
      donationAmount,
      addonTotalCents,
      fees: calculatedFees,
      totalFees,
      promoDiscountCents,
      totalAmount,
    });

    // Create registration with child/youth info in metadata
    const registrationMetadata = {
      child_count: childCount || 0,
      youth_ticket_type: youthTicketType || null,
      youth_count: youthCount || 0,
      promo_code: promoCode || null,
      promo_discount_cents: promoDiscountCents,
      addons: validatedAddons.length > 0 ? validatedAddons.map(a => ({
        inventory_id: a.inventoryId,
        addon_type: a.addonType,
        display_name: a.displayName,
        unit_price: a.serverPrice,
        quantity: a.quantity,
          has_dietary_restrictions: a.hasDietaryRestrictions,
          dietary_restrictions: a.hasDietaryRestrictions ? a.dietaryRestrictions : null,
      })) : null,
    };

    const { data: registration, error: dbError } = await supabaseClient
      .from("registrations")
      .insert({
        event_id: event.id,
        name,
        email,
        phone: phone || null,
        ticket_type: ticketType,
        quantity,
        total_amount: totalAmount,
        donation_amount: donationAmount,
        payment_status: "pending",
        accommodation_waitlist: accommodationWaitlist,
        metadata: registrationMetadata,
        meta_event_id: metaEventId,
        fbp: fbp || null,
        fbc: fbc || null,
        client_ip: realClientIp || null,
        client_user_agent: realUserAgent || null,
        // Ad attribution
        gclid: attribution?.gclid || null,
        gbraid: attribution?.gbraid || null,
        wbraid: attribution?.wbraid || null,
        fbclid: attribution?.fbclid || null,
        utm_source: attribution?.utm_source || null,
        utm_medium: attribution?.utm_medium || null,
        utm_campaign: attribution?.utm_campaign || null,
        utm_content: attribution?.utm_content || null,
        utm_term: attribution?.utm_term || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("[create-cosmico-checkout] Database error:", dbError);
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
      quantity,
    }];

    // Add child tickets as free line item (for visibility)
    if (childCount > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Child Ticket (0-12)",
            description: "Free admission for children ages 0-12",
          },
          unit_amount: 0,
        },
        quantity: childCount,
      });
    }

    // Add youth tickets as line item
    if (youthTicketType && youthCount > 0 && YOUTH_TICKET_CONFIG[youthTicketType]) {
      const youthConfig = YOUTH_TICKET_CONFIG[youthTicketType];
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: youthConfig.name,
            description: youthConfig.description,
          },
          unit_amount: youthConfig.price,
        },
        quantity: youthCount,
      });
    }

    // Add donation as separate line item if present
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

    // Add add-on line items
    for (const addon of validatedAddons) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: addon.displayName,
            description: `Add-on: ${addon.displayName}`,
          },
          unit_amount: addon.serverPrice,
        },
        quantity: addon.quantity,
      });
    }

    // Add fee line items (service fee, etc.) — skipped entirely when fully comped
    if (!feesWaived) {
      const feeLineItems = createFeeLineItems(calculatedFees);
      lineItems.push(...feeLineItems);
    }

    // Create checkout session
    // deno-lint-ignore no-explicit-any
    const sessionParams: any = {
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/ticket-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/tickets?canceled=true`,
      payment_intent_data: {
        description: `Cosmico - ${ticketConfig.name}`,
      },
      metadata: {
        registration_id: registration.id,
        ticket_type: ticketType,
        quantity: quantity.toString(),
        donation_amount: donationAmount.toString(),
        child_count: childCount.toString(),
        youth_ticket_type: youthTicketType || "",
        youth_count: youthCount.toString(),
        promo_code: promoCode || "",
        promo_discount_cents: promoDiscountCents.toString(),
        meta_event_id: metaEventId,
        fbp: fbp || "",
        fbc: fbc || "",
        client_ip: realClientIp || "",
        client_user_agent: (realUserAgent || "").substring(0, 500),
        event_source_url: event_source_url || "https://example.invalid",
        addon_count: validatedAddons.length.toString(),
        addon_total_cents: addonTotalCents.toString(),
      },
    };

    // Apply Stripe coupon if promo code is valid
    if (stripeCouponId) {
      sessionParams.discounts = [{ coupon: stripeCouponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Update registration with session ID
    await supabaseClient
      .from("registrations")
      .update({
        stripe_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      })
      .eq("id", registration.id);

    // Create addon purchase records (AWAITED — must complete before responding so the
    // webhook can find them when payment_intent.succeeded fires moments later).
    if (validatedAddons.length > 0) {
      try {
        const addonRows = validatedAddons.map((addon) => ({
          inventory_id: addon.inventoryId,
          registration_id: registration.id,
          purchaser_email: email.toLowerCase(),
          purchase_type: "addon",
          quantity: addon.quantity,
          unit_price: addon.serverPrice,
          total_amount: addon.serverPrice * addon.quantity,
          has_dietary_restrictions: addon.hasDietaryRestrictions,
          dietary_restrictions: addon.hasDietaryRestrictions ? addon.dietaryRestrictions : null,
          payment_status: "pending",
          stripe_session_id: session.id,
        }));
        const { error: addonInsertError } = await supabaseClient
          .from("addon_purchases")
          .insert(addonRows);
        if (addonInsertError) {
          console.error("[create-cosmico-checkout] Addon purchase record error:", addonInsertError);
          // Don't fail the checkout — webhook has a self-heal fallback that derives
          // addons from Stripe line items if these rows are missing.
        }
      } catch (err) {
        console.error("[create-cosmico-checkout] Addon purchase record exception:", err);
      }
    }

    // Record promo code usage and increment counter (non-blocking)
    if (promoCodeId && promoDiscountCents > 0) {
      (async () => {
        try {
          await supabaseClient.from("promo_code_uses").insert({
            promo_code_id: promoCodeId,
            email: email.toLowerCase(),
            registration_id: registration.id,
            discount_applied: promoDiscountCents / 100,
          });
          const { data: p } = await supabaseClient
            .from("promo_codes")
            .select("current_uses")
            .eq("id", promoCodeId)
            .single();
          if (p) {
            await supabaseClient
              .from("promo_codes")
              .update({ current_uses: p.current_uses + 1 })
              .eq("id", promoCodeId);
          }
        } catch (err) {
          console.error("[create-cosmico-checkout] Promo tracking error:", err);
        }
      })();
    }

    console.log("Cosmico checkout session created:", session.id);

    // Fire server-side InitiateCheckout CAPI (non-blocking)
    sendMetaCapiInitiateCheckout({
      event_id: icEventId,
      email,
      first_name: name?.split(" ")[0] || undefined,
      last_name: name?.split(" ").slice(1).join(" ") || undefined,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
      external_id: registration.id,
      client_ip: realClientIp !== "unknown" ? realClientIp : undefined,
      client_user_agent: realUserAgent,
      value: totalAmount / 100,
      currency: "USD",
      content_ids: [ticketType],
      content_name: `Cosmico - ${ticketConfig.name}`,
      event_source_url: event_source_url || "https://example.invalid",
    }).catch((err) => console.error("[create-cosmico-checkout] CAPI IC error:", err));

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id, metaEventId, icEventId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[create-cosmico-checkout] Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again later." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
