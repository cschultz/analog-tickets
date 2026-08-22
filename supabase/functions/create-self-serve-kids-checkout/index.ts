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

const requestSchema = z.object({
  registrationId: z.string().uuid(),
  email: z.string().email().transform((value) => value.toLowerCase()),
  childCount: z.number().int().min(0).max(6).optional().default(0),
  youthTicketType: z.string().nullable().optional(),
  youthCount: z.number().int().min(0).max(6).optional().default(0),
});

function getYouthOptionsForTicketType(ticketType: string | null | undefined): string[] {
  if (!ticketType) return [];
  if (ticketType === "tier_1_ga_friday") return [];
  if (ticketType === "tier_1_ga_saturday") return ["youth_saturday"];
  return ["youth_2day", "youth_saturday"];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid family ticket request." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { registrationId, email, childCount, youthTicketType, youthCount } = parsed.data;
    if (childCount + youthCount <= 0) {
      return new Response(JSON.stringify({ error: "Choose at least one child or youth ticket." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const { data: parentRegistration, error: parentError } = await supabaseClient
      .from("registrations")
      .select("id, event_id, name, email, ticket_type, payment_status")
      .eq("id", registrationId)
      .single();

    if (parentError || !parentRegistration) {
      return new Response(JSON.stringify({ error: "Original booking not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((parentRegistration.email || "").toLowerCase() !== email) {
      return new Response(JSON.stringify({ error: "You can only add family tickets to your own booking." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parentRegistration.payment_status !== "paid") {
      return new Response(JSON.stringify({ error: "Your original booking must be paid before you add family tickets." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedYouthOptions = getYouthOptionsForTicketType(parentRegistration.ticket_type);
    if (youthCount > 0 && (!youthTicketType || !allowedYouthOptions.includes(youthTicketType))) {
      return new Response(JSON.stringify({ error: "That youth ticket option is not available for this booking." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let youthTypeConfig:
      | { key: string; label: string; price: number; description: string | null; stripe_price_id: string | null }
      | null = null;

    if (youthCount > 0 && youthTicketType) {
      const { data: youthConfig, error: youthConfigError } = await supabaseClient
        .from("ticket_types")
        .select("key, label, price, description, stripe_price_id")
        .eq("event_id", parentRegistration.event_id)
        .eq("key", youthTicketType)
        .eq("is_active", true)
        .single();

      if (youthConfigError || !youthConfig) {
        return new Response(JSON.stringify({ error: "That youth ticket is not active right now." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      youthTypeConfig = youthConfig;

      const { data: youthInventory, error: youthInventoryError } = await supabaseClient
        .from("ticket_inventory")
        .select("total_quantity, sold_quantity, reserved_for_offers, is_active")
        .eq("event_id", parentRegistration.event_id)
        .eq("ticket_type", youthTicketType)
        .single();

      if (youthInventoryError || !youthInventory || !youthInventory.is_active) {
        return new Response(JSON.stringify({ error: "Youth ticket inventory is unavailable right now." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const availableYouth = youthInventory.total_quantity - youthInventory.sold_quantity - (youthInventory.reserved_for_offers || 0);
      if (availableYouth < youthCount) {
        return new Response(JSON.stringify({ error: `Only ${availableYouth} youth ticket${availableYouth === 1 ? "" : "s"} remain.` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const youthSubtotal = youthTypeConfig ? youthTypeConfig.price * youthCount : 0;
    const fees = await fetchCheckoutFees(supabaseClient);
    const calculatedFees = calculateFees(fees, {
      ticketSubtotal: youthSubtotal,
      lodgingSubtotal: 0,
      donationAmount: 0,
    });
    const totalFees = youthSubtotal > 0 ? getTotalFeesAmount(calculatedFees) : 0;
    const totalAmount = youthSubtotal + totalFees;
    const registrationTicketType = youthCount > 0 && youthTicketType ? youthTicketType : "child_free";
    const registrationMetadata = {
      parent_registration_id: parentRegistration.id,
      child_count: childCount,
      youth_ticket_type: youthTicketType || null,
      youth_count: youthCount,
    };

    const { data: registration, error: registrationError } = await supabaseClient
      .from("registrations")
      .insert({
        event_id: parentRegistration.event_id,
        name: parentRegistration.name,
        email,
        ticket_type: registrationTicketType,
        quantity: childCount + youthCount,
        total_amount: totalAmount,
        payment_status: totalAmount > 0 ? "pending" : "paid",
        metadata: registrationMetadata,
      })
      .select()
      .single();

    if (registrationError || !registration) {
      console.error("[create-self-serve-kids-checkout] Failed to create registration", registrationError);
      return new Response(JSON.stringify({ error: "Unable to prepare family tickets right now." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const createTicketRows = () => {
      const rows = [];
      for (let i = 0; i < childCount; i += 1) {
        rows.push({
          registration_id: registration.id,
          event_id: registration.event_id,
          holder_name: `Child Guest ${i + 1}`,
          holder_email: null,
          ticket_type: "child_free",
          unit_price: 0,
          status: "active",
          original_purchaser_email: email,
        });
      }

      for (let i = 0; i < youthCount; i += 1) {
        rows.push({
          registration_id: registration.id,
          event_id: registration.event_id,
          holder_name: `Youth Guest ${i + 1}`,
          holder_email: null,
          ticket_type: youthTicketType,
          unit_price: youthTypeConfig?.price || 0,
          status: "active",
          original_purchaser_email: email,
        });
      }

      return rows;
    };

    if (totalAmount === 0) {
      const ticketRows = createTicketRows();
      if (ticketRows.length > 0) {
        const { error: ticketInsertError } = await supabaseClient.from("tickets").insert(ticketRows);
        if (ticketInsertError) {
          console.error("[create-self-serve-kids-checkout] Failed to create child tickets", ticketInsertError);
          return new Response(JSON.stringify({ error: "Unable to save child tickets right now." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-cosmico-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ registrationId: registration.id }),
      }).catch((error) => console.error("[create-self-serve-kids-checkout] Failed to trigger free child confirmation", error));

      return new Response(JSON.stringify({
        success: true,
        registrationId: registration.id,
        message: childCount === 1 ? "Free child ticket added to your booking." : `Added ${childCount} free child tickets to your booking.`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    const customerId = customers.data[0]?.id;
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

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

    if (youthTypeConfig && youthCount > 0) {
      if (youthTypeConfig.stripe_price_id) {
        lineItems.push({ price: youthTypeConfig.stripe_price_id, quantity: youthCount });
      } else {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: youthTypeConfig.label,
              description: youthTypeConfig.description || youthTypeConfig.label,
            },
            unit_amount: youthTypeConfig.price,
          },
          quantity: youthCount,
        });
      }
    }

    lineItems.push(...createFeeLineItems(calculatedFees));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: lineItems,
      success_url: `${origin}/my-tickets?kids_tickets_success=true`,
      cancel_url: `${origin}/my-tickets?kids_tickets_canceled=true`,
      payment_intent_data: {
        description: "Cosmico family tickets",
      },
      metadata: {
        type: "kids_tickets",
        registration_id: registration.id,
        parent_registration_id: parentRegistration.id,
        child_count: childCount.toString(),
        youth_ticket_type: youthTicketType || "",
        youth_count: youthCount.toString(),
        youth_unit_price: String(youthTypeConfig?.price || 0),
      },
    });

    await supabaseClient
      .from("registrations")
      .update({ stripe_session_id: session.id })
      .eq("id", registration.id);

    return new Response(JSON.stringify({ success: true, url: session.url, registrationId: registration.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[create-self-serve-kids-checkout] Error", error);
    const message = error instanceof Error ? error.message : "Unable to start family ticket checkout.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});