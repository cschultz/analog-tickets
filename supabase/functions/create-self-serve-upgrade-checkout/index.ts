import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  ticketId: z.string().uuid(),
  destinationTicketType: z.string().min(1).max(100),
  verifiedEmail: z.string().email().transform((value) => value.toLowerCase()),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid upgrade request." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ticketId, destinationTicketType, verifiedEmail } = parsed.data;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const { data: ticket, error: ticketError } = await supabaseClient
      .from("tickets")
      .select(`
        id,
        registration_id,
        ticket_type,
        unit_price,
        status,
        owner_email,
        holder_email,
        holder_name,
        registrations!inner(
          id,
          email,
          event_id,
          event_details(id, title)
        )
      `)
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error("[create-self-serve-upgrade-checkout] Ticket lookup failed", ticketError);
      return new Response(JSON.stringify({ error: "Ticket not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerEmail = (
      ticket.owner_email ||
      ticket.holder_email ||
      ticket.registrations?.email ||
      ""
    ).toLowerCase();

    if (!ownerEmail || ownerEmail !== verifiedEmail) {
      return new Response(JSON.stringify({ error: "You can only upgrade tickets in your own wallet." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ticket.status !== "active") {
      return new Response(JSON.stringify({ error: "Only active tickets can be upgraded." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch BOTH destination and original live prices so we can apply loyalty pricing
    const { data: inventoryRows, error: inventoryError } = await supabaseClient
      .from("ticket_inventory")
      .select("ticket_type, price, total_quantity, sold_quantity")
      .in("ticket_type", [destinationTicketType, ticket.ticket_type]);

    const destinationInventory = inventoryRows?.find((r) => r.ticket_type === destinationTicketType);
    const originalInventory = inventoryRows?.find((r) => r.ticket_type === ticket.ticket_type);

    if (inventoryError || !destinationInventory) {
      console.error("[create-self-serve-upgrade-checkout] Destination inventory lookup failed", inventoryError);
      return new Response(JSON.stringify({ error: "That upgrade option is not available right now." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const available = (destinationInventory.total_quantity || 0) - (destinationInventory.sold_quantity || 0);
    if (available < 1) {
      return new Response(JSON.stringify({ error: "That upgraded ticket type is sold out." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Loyalty pricing: honor the discount % they got on their original purchase.
    // If they paid 79% of current GA price (21% off), give them VIP at 79% of current VIP price.
    const liveDestinationPrice = destinationInventory.price || 0;
    const liveOriginalPrice = originalInventory?.price || 0;
    const paidUnitPrice = ticket.unit_price || 0;
    // Ratio of what they paid vs. current live price for the same tier (cap at 1.0 — never charge >list)
    const priceRatio = liveOriginalPrice > 0 ? Math.min(paidUnitPrice / liveOriginalPrice, 1) : 1;
    const loyaltyDestinationPrice = Math.round(liveDestinationPrice * priceRatio);
    const upgradeAmount = Math.max(loyaltyDestinationPrice - paidUnitPrice, 0);

    console.log("[create-self-serve-upgrade-checkout] Loyalty pricing:", {
      ticket_type: ticket.ticket_type,
      destination: destinationTicketType,
      liveOriginalPrice,
      paidUnitPrice,
      liveDestinationPrice,
      priceRatio,
      loyaltyDestinationPrice,
      upgradeAmount,
    });
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";
    const successUrl = `${origin}/my-tickets?upgrade_pending=1&upgrade_session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/my-tickets`;

    let customerId: string | undefined;
    const customers = await stripe.customers.list({ email: verifiedEmail, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = upgradeAmount > 0
      ? [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Cosmico ticket upgrade`,
              description: `${ticket.ticket_type} → ${destinationTicketType}`,
            },
            unit_amount: upgradeAmount,
          },
          quantity: 1,
        }]
      : [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Cosmico ticket upgrade`,
              description: `${ticket.ticket_type} → ${destinationTicketType}`,
            },
            unit_amount: 0,
          },
          quantity: 1,
        }];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      customer_email: customerId ? undefined : verifiedEmail,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_intent_data: upgradeAmount > 0
        ? { description: `Cosmico ticket upgrade` }
        : undefined,
      metadata: {
        type: "ticket_upgrade",
        registration_id: ticket.registration_id,
        ticket_ids: JSON.stringify([ticket.id]),
        upgrade_from: ticket.ticket_type,
        upgrade_to: destinationTicketType,
        verified_email: verifiedEmail,
      },
    });

    const { data: offer, error: offerError } = await supabaseClient
      .from("upgrade_offers")
      .insert({
        registration_id: ticket.registration_id,
        ticket_ids: [ticket.id],
        unit_upgrade_price: upgradeAmount,
        total_amount: upgradeAmount,
        upgrade_from: ticket.ticket_type,
        upgrade_to: destinationTicketType,
        stripe_session_id: session.id,
        status: "pending",
      })
      .select("id")
      .single();

    if (offerError || !offer) {
      console.error("[create-self-serve-upgrade-checkout] Failed to create upgrade offer", offerError);
      return new Response(JSON.stringify({ error: "Unable to prepare your upgrade." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await stripe.checkout.sessions.update(session.id, {
      metadata: {
        ...session.metadata,
        upgrade_offer_id: offer.id,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
      upgradeOfferId: offer.id,
      upgradeAmount,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[create-self-serve-upgrade-checkout] Error", error);
    const message = error instanceof Error ? error.message : "Upgrade checkout failed.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});