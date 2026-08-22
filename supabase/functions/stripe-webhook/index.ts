import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getEmailSenderConfig } from "../_shared/email-sender-config.ts";
import { sendMetaCapiPurchase } from "../_shared/meta-capi-utils.ts";

const PRODUCTION_DOMAIN = "https://example.invalid";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const formatMoney = (amount: number) => `$${(amount / 100).toFixed(2)}`;

// Helper: fire Meta CAPI Purchase event — completely non-blocking (fire-and-forget)
// Never awaited in the main webhook flow; errors are caught and logged.
function fireMetaCapiPurchaseAsync(
  session: Stripe.Checkout.Session,
  meta_event_id: string | undefined,
  extraData?: {
    email?: string;
    name?: string;
    fbp?: string;
    fbc?: string;
    external_id?: string;
    client_ip?: string;
    client_user_agent?: string;
  }
) {
  if (!meta_event_id) {
    console.log("[webhook] No meta_event_id found, skipping CAPI Purchase");
    return;
  }

  // Fire and forget — do NOT await this
  (async () => {
    try {
      const email = extraData?.email || session.customer_email || session.customer_details?.email || undefined;
      const name = extraData?.name || session.customer_details?.name || undefined;
      const nameParts = name?.split(" ") || [];
      const firstName = nameParts[0] || undefined;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;
      const phone = session.customer_details?.phone || undefined;
      const zipCode = session.customer_details?.address?.postal_code || undefined;

      const amountTotal = session.amount_total || 0;
      const value = amountTotal / 100;
      const currency = (session.currency || "usd").toUpperCase();

      // Prefer real client IP/UA from Stripe metadata (captured at checkout time)
      // Fallback to extraData (from DB), then webhook request headers as last resort
      const storedClientIp = session.metadata?.client_ip || extraData?.client_ip || undefined;
      const storedUserAgent = session.metadata?.client_user_agent || extraData?.client_user_agent || undefined;
      const eventSourceUrl = session.metadata?.event_source_url || PRODUCTION_DOMAIN;

      const result = await sendMetaCapiPurchase({
        event_id: meta_event_id,
        email,
        phone,
        first_name: firstName,
        last_name: lastName,
        zip_code: zipCode,
        external_id: extraData?.external_id || session.customer || undefined,
        fbp: extraData?.fbp || session.metadata?.fbp || undefined,
        fbc: extraData?.fbc || session.metadata?.fbc || undefined,
        client_ip: storedClientIp,
        client_user_agent: storedUserAgent,
        value,
        currency,
        content_ids: [session.metadata?.ticket_type || session.metadata?.package_type || "ticket"],
        content_name: session.metadata?.package_name || `Cosmico - ${session.metadata?.ticket_type || "Purchase"}`,
        event_source_url: eventSourceUrl,
      });

      console.log(`[webhook] Meta CAPI Purchase result for event_id ${meta_event_id}:`, result.success ? "accepted" : "failed");
    } catch (err) {
      console.error("[webhook] Meta CAPI Purchase error (non-fatal):", err);
    }
  })();
}

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.error("[webhook] Missing stripe-signature header");
    return new Response("Missing signature", { status: 400 });
  }

  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  try {
    // Capture client metadata from request for CAPI
    const webhookClientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                            req.headers.get("x-real-ip") || undefined;
    const webhookUserAgent = req.headers.get("user-agent") || undefined;

    const body = await req.text();
    
    // Verify webhook signature
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );

    console.log(`[webhook] Received event: ${event.type} (${event.id})`);

    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // IDEMPOTENCY CHECK: Check if this event has already been processed
    const { data: existingLog, error: checkError } = await supabaseClient
      .from("webhook_logs")
      .select("id, status")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingLog) {
      console.log(`[webhook] Event ${event.id} already exists with status: ${existingLog.status}`);
      // If already processed successfully, return immediately
      if (existingLog.status === "processed" || existingLog.status === "duplicate") {
        return new Response(
          JSON.stringify({ received: true, alreadyProcessed: true, eventId: event.id }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      // If previously failed, we'll retry - update to processing
      await supabaseClient
        .from("webhook_logs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", existingLog.id);
      console.log(`[webhook] Retrying previously failed event ${event.id}`);
    } else {
      // Log new webhook event with processing status
      const { error: insertError } = await supabaseClient
        .from("webhook_logs")
        .insert({
          event_id: event.id,
          event_type: event.type,
          status: "processing",
        });
      
      if (insertError) {
        // If insert fails due to unique constraint, another instance is processing
        if (insertError.code === "23505") {
          console.log(`[webhook] Event ${event.id} is being processed by another instance`);
          return new Response(
            JSON.stringify({ received: true, processingElsewhere: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        console.error(`[webhook] Failed to log event: ${insertError.message}`);
      }
    }

    // Handle successful checkout — both immediate and async (delayed) payment methods
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;

      // For checkout.session.completed with async payment methods, skip until payment actually succeeds
      if (event.type === "checkout.session.completed" && session.payment_status === "unpaid") {
        console.log(`[webhook] Session ${session.id} has async payment — deferring until async_payment_succeeded`);
        await supabaseClient.from("webhook_logs").update({ status: "deferred_async", session_id: session.id }).eq("event_id", event.id);
        return new Response(JSON.stringify({ received: true, deferred: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      
      console.log(`[webhook] Processing payment for session: ${session.id}`);

      // Check if this is a family ticket purchase from My Tickets
      if (session.metadata?.type === "kids_tickets") {
        console.log(`[webhook] Processing family ticket purchase for session: ${session.id}`);

        const registrationId = session.metadata.registration_id;
        const childCount = parseInt(session.metadata.child_count || "0", 10);
        const youthCount = parseInt(session.metadata.youth_count || "0", 10);
        const youthTicketType = session.metadata.youth_ticket_type || null;
        const youthUnitPrice = parseInt(session.metadata.youth_unit_price || "0", 10);

        const { data: registration, error: registrationError } = await supabaseClient
          .from("registrations")
          .select("*")
          .eq("id", registrationId)
          .single();

        if (registrationError || !registration) {
          console.error(`[webhook] Family ticket registration not found for ${registrationId}:`, registrationError);
          await supabaseClient
            .from("webhook_logs")
            .update({
              session_id: session.id,
              status: "error",
              error_message: "Family ticket registration not found",
            })
            .eq("event_id", event.id);

          return new Response(JSON.stringify({ error: "Registration not found" }), { status: 404 });
        }

        if (registration.payment_status === "paid") {
          await supabaseClient
            .from("webhook_logs")
            .update({
              session_id: session.id,
              registration_id: registration.id,
              status: "duplicate",
            })
            .eq("event_id", event.id);

          return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), { status: 200 });
        }

        await supabaseClient
          .from("registrations")
          .update({
            payment_status: "paid",
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            checkout_synced_at: new Date().toISOString(),
          })
          .eq("id", registration.id);

        const ticketsToCreate = [];
        for (let i = 0; i < childCount; i++) {
          ticketsToCreate.push({
            registration_id: registration.id,
            event_id: registration.event_id,
            holder_name: `Child Guest ${i + 1}`,
            holder_email: null,
            ticket_type: "child_free",
            unit_price: 0,
            status: "active",
            original_purchaser_email: registration.email,
          });
        }

        for (let i = 0; i < youthCount; i++) {
          ticketsToCreate.push({
            registration_id: registration.id,
            event_id: registration.event_id,
            holder_name: `Youth Guest ${i + 1}`,
            holder_email: null,
            ticket_type: youthTicketType,
            unit_price: youthUnitPrice,
            status: "active",
            original_purchaser_email: registration.email,
          });
        }

        if (ticketsToCreate.length > 0) {
          const { error: ticketsError } = await supabaseClient.from("tickets").insert(ticketsToCreate);
          if (ticketsError) {
            console.error(`[webhook] Failed to create family tickets for ${registration.id}:`, ticketsError);
          }
        }

        if (youthTicketType && youthCount > 0) {
          const { error: reserveError } = await supabaseClient.rpc("reserve_tickets", {
            p_ticket_type: youthTicketType,
            p_quantity: youthCount,
          });

          if (reserveError) {
            console.error(`[webhook] Failed to reserve youth inventory for ${registration.id}:`, reserveError);
          }
        }

        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            registration_id: registration.id,
            status: "processed",
          })
          .eq("event_id", event.id);

        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-cosmico-confirmation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ registrationId: registration.id }),
        }).catch((err) => console.error("[webhook] Error sending family ticket confirmation:", err));

        return new Response(
          JSON.stringify({ received: true, type: "kids_tickets", registrationId: registration.id }),
          { status: 200 },
        );
      }

      // Check if this is a custom offer payment
      if (session.metadata?.offer_id && session.metadata?.offer_token) {
        console.log(`[webhook] Processing custom offer payment for session: ${session.id}`);
        
        const offerId = session.metadata.offer_id;
        const offerToken = session.metadata.offer_token;
        const recipientName = session.metadata.recipient_name || "Guest";

        // Get the offer and verify it's still pending
        const { data: offer, error: offerError } = await supabaseClient
          .from("custom_offers")
          .select("*, event_details(title)")
          .eq("id", offerId)
          .single();

        if (offerError || !offer) {
          console.error(`[webhook] Custom offer not found for ${offerId}:`, offerError);
          await supabaseClient
            .from("webhook_logs")
            .update({
              session_id: session.id,
              status: "error",
              error_message: "Custom offer not found",
            })
            .eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Offer not found" }), { status: 404 });
        }

        // Check if already processed
        if (offer.status === "accepted") {
          console.log(`[webhook] Custom offer already processed for ${offerId}`);
          await supabaseClient
            .from("webhook_logs")
            .update({
              session_id: session.id,
              status: "duplicate",
            })
            .eq("event_id", event.id);
          return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), { status: 200 });
        }

        // Get offer items
        const { data: offerItems, error: itemsError } = await supabaseClient
          .from("custom_offer_items")
          .select("*")
          .eq("offer_id", offerId);

        if (itemsError) {
          console.error(`[webhook] Failed to fetch offer items:`, itemsError);
          throw new Error("Failed to fetch offer items");
        }

        console.log(`[webhook] Processing ${offerItems?.length || 0} offer items`);

        // Create registration record from the offer
        const ticketItems = (offerItems || []).filter(i => i.item_type === "ticket");
        const totalTickets = ticketItems.reduce((sum, i) => sum + i.quantity, 0);
        const primaryTicketType = ticketItems[0]?.ticket_type || "custom_offer";

        const { data: registration, error: regError } = await supabaseClient
          .from("registrations")
          .insert({
            event_id: offer.event_id,
            name: recipientName,
            email: offer.recipient_email,
            ticket_type: primaryTicketType,
            quantity: totalTickets || 1,
            total_amount: offer.total_amount,
            payment_status: "paid",
            stripe_session_id: session.id,
          })
          .select()
          .single();

        if (regError) {
          console.error(`[webhook] Failed to create registration:`, regError);
          throw new Error(`Failed to create registration: ${regError.message}`);
        }

        console.log(`[webhook] Created registration ${registration.id} for custom offer`);

        // Create tickets for each ticket item
        const ticketsToCreate = [];
        for (const item of ticketItems) {
          for (let i = 0; i < item.quantity; i++) {
            ticketsToCreate.push({
              registration_id: registration.id,
              event_id: offer.event_id,
              holder_name: i === 0 && ticketsToCreate.length === 0 ? recipientName : `Guest ${ticketsToCreate.length + 1}`,
              holder_email: i === 0 && ticketsToCreate.length === 0 ? offer.recipient_email : null,
              ticket_type: item.ticket_type,
              unit_price: item.unit_price,
              status: "active",
              original_purchaser_email: offer.recipient_email,
            });
          }
        }

        if (ticketsToCreate.length > 0) {
          const { error: ticketsError } = await supabaseClient
            .from("tickets")
            .insert(ticketsToCreate);

          if (ticketsError) {
            console.error(`[webhook] Failed to create tickets:`, ticketsError);
            // Log but don't fail - payment was successful
          } else {
            console.log(`[webhook] Created ${ticketsToCreate.length} ticket(s) for custom offer`);
          }
        }

        // Process lodging items - create addon_purchases records
        const lodgingItems = (offerItems || []).filter(i => i.item_type === "lodging");
        for (const item of lodgingItems) {
          if (item.accommodation_unit_id) {
            const { data: unit } = await supabaseClient
              .from("accommodation_units")
              .select("id, zone_key")
              .eq("id", item.accommodation_unit_id)
              .single();

            const bookingZoneKey = unit?.zone_key || item.zone_key;
            if (bookingZoneKey) {
              const { error: bookingError } = await supabaseClient
                .from("lodging_bookings")
                .insert({
                  registration_id: registration.id,
                  event_id: offer.event_id,
                  email: offer.recipient_email,
                  zone_key: bookingZoneKey,
                  quantity: item.quantity,
                  total_amount: item.unit_price * item.quantity,
                  payment_status: "paid",
                  stripe_session_id: session.id,
                  assignment_status: "assigned",
                  assigned_unit_id: item.accommodation_unit_id,
                  assigned_at: new Date().toISOString(),
                });

              if (bookingError) {
                console.error(`[webhook] Failed to create specific room lodging booking:`, bookingError);
              } else {
                await supabaseClient
                  .from("accommodation_units")
                  .update({ inventory_status: "assigned" })
                  .eq("id", item.accommodation_unit_id);
                console.log(`[webhook] Created specific room lodging booking for ${item.accommodation_unit_id}`);
              }
            }
            continue;
          }

          const { error: lodgingError } = await supabaseClient
            .from("addon_purchases")
            .insert({
              registration_id: registration.id,
              inventory_id: item.lodging_inventory_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_amount: item.unit_price * item.quantity,
              purchase_type: "lodging",
              purchaser_email: offer.recipient_email,
              payment_status: "paid",
              stripe_session_id: session.id,
            });

          if (lodgingError) {
            console.error(`[webhook] Failed to create lodging purchase:`, lodgingError);
          } else {
            console.log(`[webhook] Created lodging purchase for ${item.lodging_inventory_id}`);
          }
        }

        // Process addon items - create addon_purchases records
        const addonItems = (offerItems || []).filter(i => i.item_type === "addon");
        for (const item of addonItems) {
          const { error: addonError } = await supabaseClient
            .from("addon_purchases")
            .insert({
              registration_id: registration.id,
              inventory_id: item.addon_inventory_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_amount: item.unit_price * item.quantity,
              purchase_type: "addon",
              purchaser_email: offer.recipient_email,
              payment_status: "paid",
              stripe_session_id: session.id,
            });

          if (addonError) {
            console.error(`[webhook] Failed to create addon purchase:`, addonError);
          } else {
            console.log(`[webhook] Created addon purchase for ${item.addon_inventory_id}`);
          }
        }

        // Update offer status to accepted
        const { error: updateOfferError } = await supabaseClient
          .from("custom_offers")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            registration_id: registration.id,
          })
          .eq("id", offerId);

        if (updateOfferError) {
          console.error(`[webhook] Failed to update offer status:`, updateOfferError);
        } else {
          console.log(`[webhook] Updated offer ${offerId} to accepted`);
        }

        // Update webhook log
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            registration_id: registration.id,
            status: "processed",
          })
          .eq("event_id", event.id);

        // Send confirmation email
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-ticket-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ registrationId: registration.id }),
        })
          .then((res) => {
            if (!res.ok) {
              console.error(`[webhook] Failed to send custom offer confirmation: ${res.statusText}`);
            } else {
              console.log(`[webhook] Confirmation email sent for custom offer`);
            }
          })
          .catch((err) => console.error("[webhook] Error sending email:", err));

        // Send admin notification
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-admin-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ 
            registrationId: registration.id,
            customOffer: true,
            offerId: offerId,
          }),
        })
          .then((res) => {
            if (!res.ok) {
              console.error(`[webhook] Failed to send admin notification: ${res.statusText}`);
            }
          })
          .catch((err) => console.error("[webhook] Error sending admin notification:", err));

        console.log(`[webhook] Successfully processed custom offer payment for ${offerId}`);

        // Fire server-side Meta CAPI Purchase event for custom offers
        fireMetaCapiPurchaseAsync(session, session.metadata?.meta_event_id, {
          email: offer.recipient_email,
          name: recipientName,
          external_id: registration.id,
          client_ip: webhookClientIp,
          client_user_agent: webhookUserAgent,
        });

        return new Response(
          JSON.stringify({ received: true, type: "custom_offer", registrationId: registration.id }),
          { status: 200 }
        );
      }

      // Check if this is an addon purchase
      if (session.metadata?.purchase_type === "addon") {
        console.log(`[webhook] Processing addon purchase for session: ${session.id}`);
        
        // Update addon_purchases to paid (retry to tolerate insert race with checkout creation)
        let purchases: any[] | null = null;
        let fetchError: any = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await supabaseClient
            .from("addon_purchases")
            .select("*")
            .eq("stripe_session_id", session.id);
          fetchError = res.error;
          purchases = res.data;
          if (!fetchError && purchases && purchases.length > 0) break;
          // brief backoff: 500ms, 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }

        // Manually hydrate inventory + registration info (no FK relationships exist)
        if (purchases && purchases.length > 0) {
          const lodgingIds = Array.from(new Set(purchases.filter((p: any) => p.purchase_type === "lodging" && p.inventory_id).map((p: any) => p.inventory_id)));
          const addonIds = Array.from(new Set(purchases.filter((p: any) => p.purchase_type === "addon" && p.inventory_id).map((p: any) => p.inventory_id)));
          const regIds = Array.from(new Set(purchases.map((p: any) => p.registration_id).filter(Boolean)));

          const [lodgingRes, addonRes, regRes] = await Promise.all([
            lodgingIds.length ? supabaseClient.from("lodging_inventory").select("*").in("id", lodgingIds) : Promise.resolve({ data: [] }),
            addonIds.length ? supabaseClient.from("addon_inventory").select("*").in("id", addonIds) : Promise.resolve({ data: [] }),
            regIds.length ? supabaseClient.from("registrations").select("id, email, name").in("id", regIds) : Promise.resolve({ data: [] }),
          ]);

          const lodgingMap = new Map((lodgingRes.data || []).map((r: any) => [r.id, r]));
          const addonMap = new Map((addonRes.data || []).map((r: any) => [r.id, r]));
          const regMap = new Map((regRes.data || []).map((r: any) => [r.id, r]));

          purchases = purchases.map((p: any) => ({
            ...p,
            lodging_inventory: p.purchase_type === "lodging" ? lodgingMap.get(p.inventory_id) || null : null,
            addon_inventory: p.purchase_type === "addon" ? addonMap.get(p.inventory_id) || null : null,
            registrations: regMap.get(p.registration_id) || null,
          }));
        }

        if (fetchError || !purchases || purchases.length === 0) {
          console.error(`[webhook] Addon purchases not found for session ${session.id} after retries:`, fetchError);

          await supabaseClient
            .from("webhook_logs")
            .update({
              session_id: session.id,
              status: "error",
              error_message: "Addon purchases not found after retries",
            })
            .eq("event_id", event.id);

          // Return 500 so Stripe retries the webhook (instead of 404 which it treats as final)
          return new Response(
            JSON.stringify({ error: "Addon purchases not found - will retry" }),
            { status: 500 }
          );
        }

        // Check if already processed
        if (purchases[0].payment_status === "paid") {
          console.log(`[webhook] Addon purchase already processed for session ${session.id}`);
          
          await supabaseClient
            .from("webhook_logs")
            .update({
              session_id: session.id,
              status: "duplicate",
            })
            .eq("event_id", event.id);

          return new Response(
            JSON.stringify({ received: true, alreadyProcessed: true }),
            { status: 200 }
          );
        }

        // Update all addon purchases to paid
        const { error: updateError } = await supabaseClient
          .from("addon_purchases")
          .update({ payment_status: "paid" })
          .eq("stripe_session_id", session.id);

        if (updateError) {
          console.error(`[webhook] Failed to update addon purchases:`, updateError);
          throw new Error("Failed to update addon purchases");
        }

        console.log(`[webhook] Updated ${purchases.length} addon purchase(s) to paid`);

        // Update inventory sold_quantity for each purchase
        for (const purchase of purchases) {
          const tableName = purchase.purchase_type === "lodging" ? "lodging_inventory" : "addon_inventory";
          
          // Get current inventory and increment sold_quantity
          const { data: currentInv } = await supabaseClient
            .from(tableName)
            .select("sold_quantity")
            .eq("id", purchase.inventory_id)
            .single();

          if (currentInv) {
            const { error: updateInvError } = await supabaseClient
              .from(tableName)
              .update({ sold_quantity: currentInv.sold_quantity + purchase.quantity })
              .eq("id", purchase.inventory_id);
            
            if (updateInvError) {
              console.error(`[webhook] Failed to update ${tableName} inventory:`, updateInvError);
            } else {
              console.log(`[webhook] Updated ${tableName} inventory for ${purchase.inventory_id}, added ${purchase.quantity}`);
            }
          }
        }

        // Update webhook log
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            registration_id: session.metadata?.registration_id || null,
            status: "processed",
          })
          .eq("event_id", event.id);

        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-admin-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ stripeSessionId: session.id }),
        })
          .then((res) => {
            if (!res.ok) {
              console.error(`[webhook] Failed to send add-on admin notification: ${res.statusText}`);
            } else {
              console.log(`[webhook] Add-on admin notification sent for session ${session.id}`);
            }
          })
          .catch((err) => console.error("[webhook] Error sending add-on admin notification:", err));

        const primaryPurchase = purchases[0];
        const registration = Array.isArray(primaryPurchase.registrations)
          ? primaryPurchase.registrations[0]
          : primaryPurchase.registrations;
        const customerName = registration?.name || primaryPurchase.purchaser_email || session.customer_details?.name || "there";
        const customerEmail = registration?.email || primaryPurchase.purchaser_email || session.customer_email;
        const totalAmount = purchases.reduce((sum: number, purchase: any) => sum + (purchase.total_amount || 0), 0);

        if (customerEmail) {
          const senderConfig = await getEmailSenderConfig('guest');
          const purchaseRowsHtml = purchases.map((purchase: any) => {
            const inventory = purchase.purchase_type === "lodging"
              ? (Array.isArray(purchase.lodging_inventory) ? purchase.lodging_inventory[0] : purchase.lodging_inventory)
              : (Array.isArray(purchase.addon_inventory) ? purchase.addon_inventory[0] : purchase.addon_inventory);
            const itemLabel = inventory?.display_name || (purchase.purchase_type === "lodging" ? "Accommodation" : "Add-on");
            const dietaryNote = inventory?.addon_type === "friday_dinner" && purchase.has_dietary_restrictions && purchase.dietary_restrictions
              ? `
                <div style="margin-top: 12px; padding: 12px 14px; border: 1px solid #d8c59e; background: #f8f0de;">
                  <div style="margin: 0 0 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6c5230; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Dietary Restrictions</div>
                  <div style="margin: 0; font-size: 14px; line-height: 1.6; color: #2f2f2f;">${escapeHtml(purchase.dietary_restrictions)}</div>
                </div>
              `
              : "";

            return `
              <div style="padding: 18px 0; border-top: 1px solid #d4cdc0;">
                <div style="display: flex; justify-content: space-between; gap: 16px; font-size: 15px; line-height: 1.5; color: #2f2f2f;">
                  <div>
                    <div style="font-weight: 600;">${escapeHtml(itemLabel)}</div>
                    <div style="color: #7b7469; margin-top: 4px;">Quantity: ${purchase.quantity}</div>
                  </div>
                  <div style="text-align: right; white-space: nowrap;">${formatMoney(purchase.total_amount || 0)}</div>
                </div>
                ${dietaryNote}
              </div>
            `;
          }).join("");

          const confirmationHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your add-on order is confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #f5f0e8; color: #2f2f2f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f0e8;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">
          <tr>
            <td align="center" style="padding-bottom: 8px; font-size: 18px; font-weight: 400; letter-spacing: 0.15em; color: #2f2f2f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              COSMICO
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 36px; font-size: 13px; color: #888; font-style: italic;">
              Your booking has been updated.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 20px; font-size: 22px; color: #2f2f2f;">
              Thanks, ${escapeHtml(customerName.split(' ')[0] || customerName)}.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 28px; font-size: 16px; color: #444; line-height: 1.7;">
              Your add-on order is confirmed. If you included a Japanese picnic dinner dietary note, we've saved it with your order.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #d4cdc0; border-bottom: 1px solid #d4cdc0;">
                <tr>
                  <td style="padding: 20px 0;">
                    <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #7b7469; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin-bottom: 6px;">Order Summary</div>
                    ${purchaseRowsHtml}
                    <div style="padding-top: 18px; border-top: 1px solid #d4cdc0; display: flex; justify-content: space-between; gap: 16px; font-size: 16px; font-weight: 600; color: #2f2f2f;">
                      <span>Total</span>
                      <span>${formatMoney(totalAmount)}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 28px; font-size: 16px; color: #444; line-height: 1.7;">
              You can view your tickets, accommodations, and add-ons any time from your booking page.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 40px; font-size: 16px; color: #444; line-height: 1.7;">
              See you in May,<br>
              Chris &amp; Anne
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 24px; border-top: 1px solid #d4cdc0; font-size: 12px; color: #aaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              Cosmico
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

          await resend.emails.send({
            from: senderConfig.fromAddress,
            to: [customerEmail],
            reply_to: senderConfig.replyTo || 'hello@example.invalid',
            subject: 'Your add-ons are confirmed — Cosmico',
            html: confirmationHtml,
          });

          console.log(`[webhook] Add-on confirmation email sent to ${customerEmail}`);
        }

        console.log(`[webhook] Successfully processed addon purchase for session ${session.id}`);

        return new Response(
          JSON.stringify({ received: true, type: "addon" }),
          { status: 200 }
        );
      }

      // Check if this is a lodging invite purchase
      if (session.metadata?.type === "lodging_invite") {
        console.log(`[webhook] Processing lodging invite payment for session: ${session.id}`);
        
        const bookingId = session.metadata.lodging_booking_id;
        const inviteTokenId = session.metadata.invite_token_id;
        const assignedUnitId = session.metadata.assigned_unit_id || null;

        // Update lodging booking to paid
        const { data: booking, error: bookingFetchError } = await supabaseClient
          .from("lodging_bookings")
          .select("*, accommodation_zones(zone_name)")
          .eq("id", bookingId)
          .single();

        if (bookingFetchError || !booking) {
          console.error(`[webhook] Lodging booking not found for ${bookingId}:`, bookingFetchError);
          await supabaseClient
            .from("webhook_logs")
            .update({
              session_id: session.id,
              status: "error",
              error_message: "Lodging booking not found",
            })
            .eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404 });
        }

        if (booking.payment_status === "paid") {
          console.log(`[webhook] Lodging booking already paid for ${bookingId}`);
          await supabaseClient
            .from("webhook_logs")
            .update({ session_id: session.id, status: "duplicate" })
            .eq("event_id", event.id);
          return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), { status: 200 });
        }

        // Update booking to paid
        const { error: updateBookingError } = await supabaseClient
          .from("lodging_bookings")
          .update({ payment_status: "paid" })
          .eq("id", bookingId);

        if (updateBookingError) {
          console.error(`[webhook] Failed to update lodging booking:`, updateBookingError);
          throw new Error("Failed to update lodging booking");
        }

        console.log(`[webhook] Lodging booking ${bookingId} marked as paid`);

        // Update zone inventory if zone booking
        if (!assignedUnitId && booking.zone_key) {
          await supabaseClient.rpc("decrement_zone_inventory", {
            p_zone_key: booking.zone_key,
            p_quantity: booking.quantity,
          });
          console.log(`[webhook] Decremented zone inventory for ${booking.zone_key}`);

          // Auto-reserve a unit from the zone for each quantity
          for (let i = 0; i < booking.quantity; i++) {
            // Try to find an available non-family-style unit first, then any available unit
            let availableUnit = null;
            
            const { data: regularUnit } = await supabaseClient
              .from("accommodation_units")
              .select("id, unit_name")
              .eq("zone_key", booking.zone_key)
              .eq("inventory_status", "available")
              .eq("is_family_style", false)
              .limit(1)
              .maybeSingle();

            if (regularUnit) {
              availableUnit = regularUnit;
            } else {
              // Fallback to family-style units if no regular units available
              const { data: familyUnit } = await supabaseClient
                .from("accommodation_units")
                .select("id, unit_name")
                .eq("zone_key", booking.zone_key)
                .eq("inventory_status", "available")
                .limit(1)
                .maybeSingle();
              
              if (familyUnit) {
                availableUnit = familyUnit;
              }
            }

            if (availableUnit) {
              await supabaseClient
                .from("accommodation_units")
                .update({ inventory_status: "reserved" })
                .eq("id", availableUnit.id);
              
              // Link first unit to booking (status stays 'pending' until admin confirms)
              if (i === 0) {
                await supabaseClient
                  .from("lodging_bookings")
                  .update({ 
                    assigned_unit_id: availableUnit.id,
                    // Keep as 'pending' - admin will finalize to 'assigned' when notifying guest
                  })
                  .eq("id", bookingId);
              }
              console.log(`[webhook] Auto-reserved unit ${availableUnit.unit_name} for zone booking`);
            } else {
              console.warn(`[webhook] No available units in zone ${booking.zone_key} for auto-reservation`);
            }
          }
        }

        // If family-style with assigned unit, mark unit as assigned (transition from pending_offer → assigned)
        if (assignedUnitId) {
          await supabaseClient
            .from("accommodation_units")
            .update({ inventory_status: "assigned" })
            .eq("id", assignedUnitId)
            .in("inventory_status", ["available", "pending_offer", "reserved"]); // Handle all possible prior states
          console.log(`[webhook] Marked unit ${assignedUnitId} as assigned`);
        }

        // Mark invite token as used
        if (inviteTokenId) {
          await supabaseClient
            .from("lodging_invite_tokens")
            .update({ used_at: new Date().toISOString() })
            .eq("id", inviteTokenId);
        }

        // Update webhook log
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            registration_id: booking.registration_id,
            status: "processed",
          })
          .eq("event_id", event.id);

        // Send lodging confirmation email - await to ensure it completes before response
        try {
          const emailRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-lodging-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ bookingId: booking.id }),
          });
          if (!emailRes.ok) {
            const errorText = await emailRes.text();
            console.error(`[webhook] Failed to send lodging confirmation: ${emailRes.status} - ${errorText}`);
          } else {
            console.log(`[webhook] Lodging confirmation email sent successfully`);
          }
        } catch (emailErr) {
          console.error("[webhook] Error sending lodging email:", emailErr);
        }

        console.log(`[webhook] Successfully processed lodging payment for ${bookingId}`);
        return new Response(
          JSON.stringify({ received: true, type: "lodging_invite", bookingId }),
          { status: 200 }
        );
      }

      // Check if this is a self-service lodging purchase
      if (session.metadata?.type === "self_service_lodging") {
        console.log(`[webhook] Processing self-service lodging payment for session: ${session.id}`);
        
        const bookingId = session.metadata.booking_id;
        const zoneKey = session.metadata.lodging_zone_key;
        const quantity = parseInt(session.metadata.lodging_qty || "1", 10);

        // Update lodging booking to paid
        const { data: booking, error: bookingFetchError } = await supabaseClient
          .from("lodging_bookings")
          .select("*, accommodation_zones(zone_name)")
          .eq("id", bookingId)
          .single();

        if (bookingFetchError || !booking) {
          console.error(`[webhook] Self-service lodging booking not found for ${bookingId}:`, bookingFetchError);
          await supabaseClient
            .from("webhook_logs")
            .update({
              session_id: session.id,
              status: "error",
              error_message: "Lodging booking not found",
            })
            .eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404 });
        }

        if (booking.payment_status === "paid") {
          console.log(`[webhook] Self-service lodging booking already paid for ${bookingId}`);
          await supabaseClient
            .from("webhook_logs")
            .update({ session_id: session.id, status: "duplicate" })
            .eq("event_id", event.id);
          return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), { status: 200 });
        }

        // Auto-reserve a unit from the zone and update booking
        let autoAssignedUnitId: string | null = null;
        
        if (zoneKey) {
          // Find and reserve an available unit
          const { data: availableUnit } = await supabaseClient
            .from("accommodation_units")
            .select("id, unit_name")
            .eq("zone_key", zoneKey)
            .eq("inventory_status", "available")
            .eq("is_family_style", false)
            .limit(1)
            .single();

          if (availableUnit) {
            autoAssignedUnitId = availableUnit.id;
            
            // Mark unit as reserved
            await supabaseClient
              .from("accommodation_units")
              .update({ inventory_status: "reserved" })
              .eq("id", availableUnit.id);
            
            console.log(`[webhook] Auto-reserved unit ${availableUnit.unit_name} for self-service booking`);
          } else {
            console.warn(`[webhook] No available units in zone ${zoneKey} for auto-reservation`);
          }

          // Decrement zone inventory
          await supabaseClient.rpc("decrement_zone_inventory", {
            p_zone_key: zoneKey,
            p_quantity: quantity,
          });
          console.log(`[webhook] Decremented zone inventory for ${zoneKey} by ${quantity}`);
        }

        // Update booking to paid with auto-assigned unit (or pending if no unit available)
        const { error: updateBookingError } = await supabaseClient
          .from("lodging_bookings")
          .update({ 
            payment_status: "paid",
            assignment_status: autoAssignedUnitId ? "assigned" : "pending",
            assigned_unit_id: autoAssignedUnitId,
          })
          .eq("id", bookingId);

        if (updateBookingError) {
          console.error(`[webhook] Failed to update self-service lodging booking:`, updateBookingError);
          throw new Error("Failed to update lodging booking");
        }

        console.log(`[webhook] Self-service lodging booking ${bookingId} marked as paid${autoAssignedUnitId ? ' with auto-assigned unit' : ''}`);

        // Update webhook log
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            registration_id: booking.registration_id,
            status: "processed",
          })
          .eq("event_id", event.id);

        // Send lodging confirmation email - await to ensure it completes before response
        try {
          const emailRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-lodging-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ bookingId: booking.id }),
          });
          if (!emailRes.ok) {
            const errorText = await emailRes.text();
            console.error(`[webhook] Failed to send self-service lodging confirmation: ${emailRes.status} - ${errorText}`);
          } else {
            console.log(`[webhook] Self-service lodging confirmation email sent successfully`);
          }
        } catch (emailErr) {
          console.error("[webhook] Error sending self-service lodging email:", emailErr);
        }

        console.log(`[webhook] Successfully processed self-service lodging payment for ${bookingId}`);
        return new Response(
          JSON.stringify({ received: true, type: "self_service_lodging", bookingId }),
          { status: 200 }
        );
      }

      // Check if this is a crew bid payment
      if (session.metadata?.crew_bid_id) {
        console.log(`[webhook] Processing crew bid payment for session: ${session.id}`);
        
        const crewBidId = session.metadata.crew_bid_id;
        const assignees = session.metadata.assignees ? JSON.parse(session.metadata.assignees) : [];

        // Map crew bid ticket types to inventory ticket types
        const CREW_TO_INVENTORY_TYPE: Record<string, string> = {
          "2day_ga": "tier_1_ga_2day",
          "saturday_ga": "tier_1_ga_saturday",
          "friday_ga": "tier_1_ga_friday",
        };

        // Fetch the crew bid
        const { data: crewBid, error: crewBidError } = await supabaseClient
          .from("crew_bids")
          .select("*")
          .eq("id", crewBidId)
          .single();

        if (crewBidError || !crewBid) {
          console.error(`[webhook] Crew bid not found for ${crewBidId}:`, crewBidError);
          await supabaseClient
            .from("webhook_logs")
            .update({ session_id: session.id, status: "error", error_message: "Crew bid not found" })
            .eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Crew bid not found" }), { status: 404 });
        }

        // Check if already processed
        if (crewBid.payment_status === "paid") {
          console.log(`[webhook] Crew bid already paid for ${crewBidId}`);
          await supabaseClient
            .from("webhook_logs")
            .update({ session_id: session.id, status: "duplicate" })
            .eq("event_id", event.id);
          return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), { status: 200 });
        }

        // Get active event
        const { data: activeEvent } = await supabaseClient
          .from("event_details")
          .select("id")
          .eq("title", "Cosmico 2026")
          .eq("is_active", true)
          .single();

        const eventId = activeEvent?.id;

        // Update crew bid to paid
        const { error: updateBidError } = await supabaseClient
          .from("crew_bids")
          .update({ payment_status: "paid", updated_at: new Date().toISOString() })
          .eq("id", crewBidId);

        if (updateBidError) {
          console.error(`[webhook] Failed to update crew bid payment status:`, updateBidError);
          throw new Error("Failed to update crew bid");
        }

        console.log(`[webhook] Crew bid ${crewBidId} marked as paid`);

        // Map the crew bid ticket type to the inventory/registration type
        const inventoryTicketType = CREW_TO_INVENTORY_TYPE[crewBid.ticket_type] || crewBid.ticket_type;
        console.log(`[webhook] Mapped crew ticket type: ${crewBid.ticket_type} -> ${inventoryTicketType}`);

        // Create a registration for the captain
        // accepted_price is in dollars, convert to cents for consistency with rest of system
        const totalAmount = crewBid.accepted_price * crewBid.crew_size * 100;
        const { data: registration, error: regError } = await supabaseClient
          .from("registrations")
          .insert({
            event_id: eventId,
            name: crewBid.captain_name,
            email: crewBid.email,
            ticket_type: inventoryTicketType,
            quantity: crewBid.crew_size,
            total_amount: totalAmount,
            payment_status: "paid",
            stripe_session_id: session.id,
          })
          .select()
          .single();

        if (regError) {
          console.error(`[webhook] Failed to create crew registration:`, regError);
          // Don't fail — payment was successful
        } else {
          console.log(`[webhook] Created registration ${registration.id} for crew bid`);

          // Create individual tickets for each crew member
          const ticketsToCreate = [];
          for (let i = 0; i < crewBid.crew_size; i++) {
            const assignee = assignees[i] || {};
            ticketsToCreate.push({
              registration_id: registration.id,
              event_id: eventId,
              holder_name: assignee.name || (i === 0 ? crewBid.captain_name : `Crew Member ${i + 1}`),
              holder_email: assignee.email || (i === 0 ? crewBid.email : null),
              ticket_type: inventoryTicketType,
              unit_price: crewBid.accepted_price * 100,
              status: "active",
              original_purchaser_email: crewBid.email,
            });
          }

          const { error: ticketsError } = await supabaseClient
            .from("tickets")
            .insert(ticketsToCreate);

          if (ticketsError) {
            console.error(`[webhook] Failed to create crew tickets:`, ticketsError);
          } else {
            console.log(`[webhook] Created ${ticketsToCreate.length} crew ticket(s)`);
          }

          // Reserve tickets in inventory using mapped type
          const { error: reserveError } = await supabaseClient
            .rpc("reserve_tickets", {
              p_ticket_type: inventoryTicketType,
              p_quantity: crewBid.crew_size,
            });

          if (reserveError) {
            console.error(`[webhook] Failed to reserve crew tickets in inventory:`, reserveError);
          } else {
            console.log(`[webhook] Reserved ${crewBid.crew_size} tickets in inventory for type: ${inventoryTicketType}`);
          }
        }

        // Update webhook log
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            registration_id: registration?.id || null,
            status: "processed",
          })
          .eq("event_id", event.id);

        // Send crew payment confirmation email
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-crew-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              type: "crew_payment_confirmation",
              data: {
                captain_name: crewBid.captain_name,
                email: crewBid.email,
                crew_size: crewBid.crew_size,
                ticket_type: crewBid.ticket_type,
                accepted_price: crewBid.accepted_price,
                assignees,
              },
            }),
          });
          console.log(`[webhook] Crew payment confirmation email sent`);

          // Send individual emails to each assigned crew member (non-captain with email)
          for (let i = 0; i < assignees.length; i++) {
            const assignee = assignees[i];
            if (assignee?.email && assignee.email !== crewBid.email) {
              try {
                await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-crew-confirmation`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
                  },
                  body: JSON.stringify({
                    type: "crew_member_ticket",
                    data: {
                      member_name: assignee.name || `Crew Member ${i + 1}`,
                      email: assignee.email,
                      captain_name: crewBid.captain_name,
                      ticket_type: crewBid.ticket_type,
                      ticket_number: i + 1,
                      total_crew: crewBid.crew_size,
                    },
                  }),
                });
                console.log(`[webhook] Sent crew member email to ${assignee.email}`);
              } catch (memberEmailErr) {
                console.error(`[webhook] Error sending crew member email to ${assignee.email}:`, memberEmailErr);
              }
            }
          }
        } catch (emailErr) {
          console.error("[webhook] Error sending crew confirmation email:", emailErr);
        }

        // Send admin notification
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-admin-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            registrationId: registration?.id,
            crewBid: true,
            captainName: crewBid.captain_name,
            crewSize: crewBid.crew_size,
          }),
        }).catch((err) => console.error("[webhook] Error sending crew admin notification:", err));

        console.log(`[webhook] Successfully processed crew bid payment for ${crewBidId}`);

        // Fire server-side Meta CAPI Purchase for crew bid
        fireMetaCapiPurchaseAsync(session, session.metadata?.meta_event_id || crewBid.meta_event_id, {
          email: crewBid.email,
          name: crewBid.captain_name,
          fbp: crewBid.fbp || undefined,
          fbc: crewBid.fbc || undefined,
          external_id: crewBid.id,
          client_ip: crewBid.client_ip || undefined,
          client_user_agent: crewBid.client_user_agent || undefined,
        });
        return new Response(
          JSON.stringify({ received: true, type: "crew_bid", crewBidId }),
          { status: 200 }
        );
      }

      // Check if this is a payment plan first payment
      if (session.metadata?.payment_plan === "true") {
        console.log(`[webhook] Processing payment plan first payment for session: ${session.id}`);
        
        const enrollmentId = session.metadata.enrollment_id;
        const buyerEmail = session.metadata.buyer_email || session.customer_email || session.customer_details?.email;
        const buyerName = session.metadata.buyer_name || session.customer_details?.name || "Guest";

        if (!enrollmentId) {
          console.error("[webhook] Payment plan session missing enrollment_id");
          await supabaseClient.from("webhook_logs").update({
            session_id: session.id,
            status: "error",
            error_message: "Missing enrollment_id for payment plan",
          }).eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Missing enrollment_id" }), { status: 400 });
        }

        // Check if already processed
        const { data: enrollment } = await supabaseClient
          .from("payment_plan_enrollments")
          .select("*")
          .eq("id", enrollmentId)
          .single();

        if (!enrollment) {
          console.error(`[webhook] Enrollment not found: ${enrollmentId}`);
          await supabaseClient.from("webhook_logs").update({
            session_id: session.id, status: "error", error_message: "Enrollment not found",
          }).eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Enrollment not found" }), { status: 404 });
        }

        if (enrollment.status === "active") {
          console.log(`[webhook] Payment plan enrollment already active: ${enrollmentId}`);
          await supabaseClient.from("webhook_logs").update({
            session_id: session.id, status: "duplicate",
          }).eq("event_id", event.id);
          return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), { status: 200 });
        }

        // Get the PaymentIntent to extract saved payment method
        let paymentMethodId: string | null = null;
        if (session.payment_intent) {
          try {
            const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string);
            paymentMethodId = pi.payment_method as string || null;
            console.log(`[webhook] Extracted payment method: ${paymentMethodId}`);
          } catch (piErr) {
            console.error("[webhook] Error retrieving PaymentIntent:", piErr);
          }
        }

        // Activate enrollment with saved payment method
        const { error: updateEnrollmentError } = await supabaseClient
          .from("payment_plan_enrollments")
          .update({
            status: "active",
            stripe_payment_method_id: paymentMethodId,
            stripe_checkout_session_id: session.id,
          })
          .eq("id", enrollmentId);

        if (updateEnrollmentError) {
          console.error("[webhook] Failed to activate enrollment:", updateEnrollmentError);
        }

        // Mark first scheduled payment as paid
        const { error: spUpdateError } = await supabaseClient
          .from("scheduled_payments")
          .update({
            status: "paid",
            stripe_payment_intent_id: session.payment_intent as string || null,
            paid_at: new Date().toISOString(),
            attempt_count: 1,
          })
          .eq("enrollment_id", enrollmentId)
          .eq("payment_number", 1);

        if (spUpdateError) {
          console.error("[webhook] Failed to update first scheduled payment:", spUpdateError);
        }

        // Create a registration record for the payment plan buyer
        const ticketType = session.metadata.ticket_type || "tier_1_vip_3day";
        const totalAmount = parseInt(session.metadata.total_amount || "0", 10);

        // Get active event
        const { data: activeEvent } = await supabaseClient
          .from("event_details")
          .select("id")
          .eq("is_active", true)
          .limit(1)
          .single();

        let registrationId: string | null = null;

        // Check if a registration_id was passed in metadata (for existing registrations)
        if (session.metadata.registration_id) {
          registrationId = session.metadata.registration_id;
          // Update existing registration to note payment plan
          await supabaseClient
            .from("registrations")
            .update({ payment_status: "payment_plan" })
            .eq("id", registrationId);
        } else {
          // Parse cart line items
          let cartLineItems: { name: string; amount: number; quantity: number }[] = [];
          try {
            cartLineItems = JSON.parse(session.metadata.cart_line_items || "[]");
          } catch { /* ignore */ }

          const qty = cartLineItems.length > 0 ? cartLineItems.reduce((sum, i) => sum + (i.quantity || 1), 0) : 1;

          const { data: reg, error: regError } = await supabaseClient
            .from("registrations")
            .insert({
              event_id: activeEvent?.id || null,
              name: buyerName,
              email: buyerEmail,
              ticket_type: ticketType,
              quantity: qty,
              total_amount: totalAmount,
              payment_status: "payment_plan",
              stripe_session_id: session.id,
            })
            .select()
            .single();

          if (regError) {
            console.error("[webhook] Failed to create payment plan registration:", regError);
          } else {
            registrationId = reg.id;
            console.log(`[webhook] Created registration ${reg.id} for payment plan`);

            // Create ticket records
            const ticketsToCreate = [];
            for (let i = 0; i < qty; i++) {
              ticketsToCreate.push({
                registration_id: reg.id,
                event_id: activeEvent?.id || null,
                holder_name: i === 0 ? buyerName : `Guest ${i + 1}`,
                holder_email: i === 0 ? buyerEmail : null,
                ticket_type: ticketType,
                unit_price: Math.round(totalAmount / qty),
                status: "active",
                original_purchaser_email: buyerEmail,
              });
            }
            const { error: ticketsError } = await supabaseClient.from("tickets").insert(ticketsToCreate);
            if (ticketsError) {
              console.error("[webhook] Failed to create payment plan tickets:", ticketsError);
            }

            // Reserve tickets in inventory
            await supabaseClient.rpc("reserve_tickets", {
              p_ticket_type: ticketType,
              p_quantity: qty,
            });
          }
        }

        // Link enrollment to registration
        if (registrationId) {
          await supabaseClient
            .from("payment_plan_enrollments")
            .update({ registration_id: registrationId })
            .eq("id", enrollmentId);
        }

        // Update webhook log
        await supabaseClient.from("webhook_logs").update({
          session_id: session.id,
          registration_id: registrationId,
          status: "processed",
        }).eq("event_id", event.id);

        // Send confirmation email (fire and forget)
        if (registrationId) {
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-cosmico-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({ registrationId }),
          }).catch((err) => console.error("[webhook] Error sending payment plan confirmation:", err));
        }

        // Admin notification
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-admin-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ registrationId, paymentPlan: true }),
        }).catch((err) => console.error("[webhook] Error sending payment plan admin notification:", err));

        console.log(`[webhook] Successfully processed payment plan first payment for enrollment ${enrollmentId}`);
        return new Response(
          JSON.stringify({ received: true, type: "payment_plan", enrollmentId, registrationId }),
          { status: 200 }
        );
      }

      // Check if this is a Patrons package (no registration record)
      const isPatronsPackage = session.metadata?.package_type && 
        ["ultimate", "premier"].includes(session.metadata.package_type);

      if (isPatronsPackage) {
        // Handle Patrons package - send special confirmation email
        console.log(`[webhook] Processing Patrons package: ${session.metadata?.package_type}`);
        
        const patronsData = {
          name: session.metadata?.buyer_name || "Valued Patron",
          email: session.metadata?.buyer_email || session.customer_email,
          packageType: session.metadata?.package_type,
          sessionId: session.id,
        };

        // Update webhook log
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            status: "processed",
          })
          .eq("event_id", event.id);

        // Send Patrons confirmation email
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-patrons-confirmation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify(patronsData),
        })
          .then((res) => {
            if (!res.ok) {
              console.error(`[webhook] Failed to send Patrons confirmation: ${res.statusText}`);
            } else {
              console.log(`[webhook] Patrons confirmation sent to ${patronsData.email}`);
            }
          })
          .catch((err) => console.error("[webhook] Error sending Patrons email:", err));

        // Send admin notification for Patrons
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-admin-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ 
            patronsPackage: true,
            name: patronsData.name,
            email: patronsData.email,
            packageType: patronsData.packageType,
          }),
        })
          .then((res) => {
            if (!res.ok) {
              console.error(`[webhook] Failed to send Patrons admin notification: ${res.statusText}`);
            } else {
              console.log(`[webhook] Patrons admin notification sent`);
            }
          })
          .catch((err) => console.error("[webhook] Error sending Patrons admin notification:", err));

        console.log(`[webhook] Successfully processed Patrons package for ${patronsData.email}`);

        // Fire server-side Meta CAPI Purchase for patrons
        fireMetaCapiPurchaseAsync(session, session.metadata?.meta_event_id, {
          email: patronsData.email,
          name: patronsData.name,
          fbp: session.metadata?.fbp || undefined,
          fbc: session.metadata?.fbc || undefined,
          external_id: session.customer as string || undefined,
        });
        
        return new Response(
          JSON.stringify({ received: true, type: "patrons" }),
          { status: 200 }
        );
      }

      // Raffle / sweepstakes donation
      if (session.metadata?.raffle_entry_id) {
        console.log(`[webhook] Processing raffle entry payment for session: ${session.id}`);
        const raffleId = session.metadata.raffle_entry_id;
        const { error: raffleErr } = await supabaseClient
          .from("raffle_entries")
          .update({ payment_status: "paid", stripe_session_id: session.id })
          .eq("id", raffleId);
        if (raffleErr) console.error(`[webhook] Failed to mark raffle paid:`, raffleErr);
        await supabaseClient.from("webhook_logs").update({
          session_id: session.id, status: "processed",
        }).eq("event_id", event.id);
        return new Response(JSON.stringify({ received: true, type: "raffle" }), { status: 200 });
      }

      // Ticket upgrade (self-serve or admin offered)
      if (session.metadata?.type === "ticket_upgrade") {
        console.log(`[webhook] Processing ticket upgrade for session: ${session.id}`);
        const offerId = session.metadata.upgrade_offer_id;
        const regId = session.metadata.registration_id;
        const toType = session.metadata.upgrade_to;
        const fromType = session.metadata.upgrade_from;
        const ticketIdsRaw = session.metadata.ticket_ids;

        if (offerId) {
          const { data: offer } = await supabaseClient
            .from("upgrade_offers").select("status").eq("id", offerId).maybeSingle();
          if (offer?.status === "completed") {
            await supabaseClient.from("webhook_logs").update({
              session_id: session.id, status: "duplicate",
            }).eq("event_id", event.id);
            return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), { status: 200 });
          }
          await supabaseClient.from("upgrade_offers").update({
            status: "completed", paid_at: new Date().toISOString(),
          }).eq("id", offerId);
        }

        if (regId && toType) {
          const { data: nt } = await supabaseClient
            .from("ticket_types").select("price").eq("key", toType).maybeSingle();
          const { data: reg } = await supabaseClient
            .from("registrations").select("quantity, total_amount").eq("id", regId).maybeSingle();
          const qty = reg?.quantity || 1;
          const newTotal = nt?.price ? nt.price * qty : (reg?.total_amount || 0) + (session.amount_total || 0);
          await supabaseClient.from("registrations").update({
            ticket_type: toType,
            total_amount: newTotal,
            checkout_synced_at: new Date().toISOString(),
          }).eq("id", regId);

          let ticketIds: string[] = [];
          try { ticketIds = ticketIdsRaw ? JSON.parse(ticketIdsRaw) : []; } catch {}
          if (ticketIds.length > 0) {
            await supabaseClient.from("tickets").update({ ticket_type: toType }).in("id", ticketIds);
          } else if (fromType) {
            await supabaseClient.from("tickets").update({ ticket_type: toType })
              .eq("registration_id", regId).eq("ticket_type", fromType);
          }
        }

        await supabaseClient.from("webhook_logs").update({
          session_id: session.id, registration_id: regId || null, status: "processed",
        }).eq("event_id", event.id);
        return new Response(JSON.stringify({ received: true, type: "ticket_upgrade" }), { status: 200 });
      }

      // Admin-generated payment link: ticket type change (price difference)
      if (session.metadata?.action === "admin_ticket_change") {
        console.log(`[webhook] Processing admin ticket change for session: ${session.id}`);
        const registrationId = session.metadata.registration_id;
        const toTicketType = session.metadata.to_ticket_type;
        const fromTicketType = session.metadata.from_ticket_type;

        if (!registrationId || !toTicketType) {
          await supabaseClient.from("webhook_logs").update({
            session_id: session.id, status: "error",
            error_message: "admin_ticket_change missing metadata",
          }).eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Missing metadata" }), { status: 200 });
        }

        const { data: reg, error: regErr } = await supabaseClient
          .from("registrations").select("*").eq("id", registrationId).single();
        if (regErr || !reg) {
          await supabaseClient.from("webhook_logs").update({
            session_id: session.id, status: "error",
            error_message: `admin_ticket_change: registration ${registrationId} not found`,
          }).eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Registration not found" }), { status: 200 });
        }

        const { data: newType } = await supabaseClient
          .from("ticket_types").select("price").eq("key", toTicketType).maybeSingle();

        const qty = reg.quantity || 1;
        const newTotal = newType?.price ? newType.price * qty : reg.total_amount + (session.amount_total || 0);

        const { error: updErr } = await supabaseClient
          .from("registrations")
          .update({
            ticket_type: toTicketType,
            total_amount: newTotal,
            checkout_synced_at: new Date().toISOString(),
          })
          .eq("id", registrationId);

        if (updErr) console.error(`[webhook] Failed to update registration on ticket change:`, updErr);

        await supabaseClient
          .from("tickets")
          .update({ ticket_type: toTicketType })
          .eq("registration_id", registrationId)
          .eq("ticket_type", fromTicketType);

        await supabaseClient.from("webhook_logs").update({
          session_id: session.id, registration_id: registrationId, status: "processed",
        }).eq("event_id", event.id);

        console.log(`[webhook] Admin ticket change processed for ${registrationId}: ${fromTicketType} -> ${toTicketType}`);
        return new Response(
          JSON.stringify({ received: true, type: "admin_ticket_change" }),
          { status: 200 }
        );
      }

      // Admin-generated payment link: add-on addition
      if (session.metadata?.action === "admin_addon_addition") {
        console.log(`[webhook] Processing admin addon addition for session: ${session.id}`);
        const registrationId = session.metadata.registration_id;
        const addonInventoryId = session.metadata.addon_inventory_id;
        const qty = parseInt(session.metadata.quantity || "1", 10);

        if (!registrationId || !addonInventoryId) {
          await supabaseClient.from("webhook_logs").update({
            session_id: session.id, status: "error",
            error_message: "admin_addon_addition missing metadata",
          }).eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Missing metadata" }), { status: 200 });
        }

        const { data: reg } = await supabaseClient
          .from("registrations").select("email").eq("id", registrationId).single();
        const { data: addon } = await supabaseClient
          .from("addon_inventory").select("price, sold_quantity").eq("id", addonInventoryId).single();

        if (!reg || !addon) {
          await supabaseClient.from("webhook_logs").update({
            session_id: session.id, status: "error",
            error_message: "admin_addon_addition: registration or addon not found",
          }).eq("event_id", event.id);
          return new Response(JSON.stringify({ error: "Not found" }), { status: 200 });
        }

        const unitPrice = addon.price;
        const { error: insErr } = await supabaseClient.from("addon_purchases").insert({
          registration_id: registrationId,
          inventory_id: addonInventoryId,
          purchase_type: "addon",
          quantity: qty,
          unit_price: unitPrice,
          total_amount: unitPrice * qty,
          purchaser_email: reg.email,
          stripe_session_id: session.id,
          payment_status: "paid",
        });

        if (insErr) {
          console.error(`[webhook] Failed to insert admin addon purchase:`, insErr);
        } else {
          await supabaseClient
            .from("addon_inventory")
            .update({ sold_quantity: (addon.sold_quantity || 0) + qty })
            .eq("id", addonInventoryId);
        }

        await supabaseClient.from("webhook_logs").update({
          session_id: session.id, registration_id: registrationId, status: "processed",
        }).eq("event_id", event.id);

        console.log(`[webhook] Admin addon added for ${registrationId}: ${addonInventoryId} x${qty}`);
        return new Response(
          JSON.stringify({ received: true, type: "admin_addon_addition" }),
          { status: 200 }
        );
      }

      // Regular ticket purchase - find the registration by session ID
      const { data: registration, error: fetchError } = await supabaseClient
        .from("registrations")
        .select("*")
        .eq("stripe_session_id", session.id)
        .single();

      if (fetchError || !registration) {
        console.error(`[webhook] Registration not found for session ${session.id}:`, fetchError);
        
        // Log error
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            status: "error",
            error_message: "Registration not found",
          })
          .eq("event_id", event.id);

        return new Response(
          JSON.stringify({ error: "Registration not found" }),
          { status: 404 }
        );
      }

      // Check if already processed
      if (registration.payment_status === "paid") {
        console.log(`[webhook] Payment already processed for registration ${registration.id}`);
        
        // Update log
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            registration_id: registration.id,
            status: "duplicate",
          })
          .eq("event_id", event.id);

        return new Response(
          JSON.stringify({ received: true, alreadyProcessed: true }),
          { status: 200 }
        );
      }

      // Update registration status to paid
      const { error: updateError } = await supabaseClient
        .from("registrations")
        .update({
          payment_status: "paid",
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
          last_payment_error_code: null,
          last_payment_error_message: null,
          last_payment_error_details: null,
          checkout_synced_at: new Date().toISOString(),
        })
        .eq("id", registration.id);

      if (updateError) {
        console.error(`[webhook] Failed to update registration ${registration.id}:`, updateError);
        
        // Log error
        await supabaseClient
          .from("webhook_logs")
          .update({
            session_id: session.id,
            registration_id: registration.id,
            status: "error",
            error_message: `Failed to update registration: ${updateError.message}`,
          })
          .eq("event_id", event.id);

        throw new Error("Failed to update registration");
      }

      console.log(`[webhook] Updated registration ${registration.id} to paid`);

      // Create individual ticket records
      // IMPORTANT: When lodging/fees/tax are bundled in the Stripe session, registration.total_amount
      // includes all of those. We must derive the per-ticket price from the actual ticket line items
      // in Stripe — never divide the cart total across the tickets.
      let ticketPrice = 0;
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ["data.price.product"],
        });
        // Match by product name pattern matching the registration's ticket_type label, OR
        // fall back to any line where unit_amount > 5000 cents that is NOT lodging/fee/tax/donation
        const ticketLine = lineItems.data.find((li: any) => {
          const name = (li.description || (li.price?.product as any)?.name || "").toLowerCase();
          if (!name) return false;
          if (name.includes("lodging") || name.includes("tent") || name.includes("cabin")) return false;
          if (name.includes("service fee") || name.includes("fee")) return false;
          if (name.includes("tax")) return false;
          if (name.includes("donation")) return false;
          return (li.quantity || 0) === registration.quantity;
        });
        if (ticketLine?.price?.unit_amount) {
          ticketPrice = ticketLine.price.unit_amount;
          console.log(`[webhook] Derived ticketPrice=${ticketPrice} from Stripe line item "${ticketLine.description}"`);
        }
      } catch (liErr) {
        console.error(`[webhook] Failed to list line items for accurate ticketPrice:`, liErr);
      }
      // Fallback to the legacy calculation only if line-item lookup failed AND no lodging is in the cart
      if (!ticketPrice) {
        const hasLodging = !!session.metadata?.lodging_zone_key;
        if (hasLodging) {
          console.warn(`[webhook] Lodging in cart but couldn't derive ticketPrice from line items; using 0 to avoid corruption. Manual review required for ${registration.id}`);
          ticketPrice = 0;
        } else {
          ticketPrice = Math.round((registration.total_amount - (registration.donation_amount || 0)) / registration.quantity);
        }
      }
      const ticketsToCreate = [];
      
      for (let i = 0; i < registration.quantity; i++) {
        ticketsToCreate.push({
          registration_id: registration.id,
          event_id: registration.event_id,
          holder_name: i === 0 ? registration.name : (registration.plus_one_name || `Guest ${i + 1}`),
          holder_email: i === 0 ? registration.email : null,
          ticket_type: registration.ticket_type,
          unit_price: ticketPrice,
          status: "active",
          original_purchaser_email: registration.email,
        });
      }

      const { error: ticketsError } = await supabaseClient
        .from("tickets")
        .insert(ticketsToCreate);

      if (ticketsError) {
        console.error(`[webhook] Failed to create tickets for ${registration.id}:`, ticketsError);
        // Log but don't fail - payment was successful
      } else {
        console.log(`[webhook] Created ${ticketsToCreate.length} ticket(s) for registration ${registration.id}`);
      }

      // Update webhook log with success
      await supabaseClient
        .from("webhook_logs")
        .update({
          session_id: session.id,
          registration_id: registration.id,
          status: "processed",
        })
        .eq("event_id", event.id);

      // Reserve tickets in inventory
      const { data: reserveResult, error: reserveError } = await supabaseClient
        .rpc("reserve_tickets", {
          p_ticket_type: registration.ticket_type,
          p_quantity: registration.quantity
        });

      if (reserveError || !reserveResult) {
        console.error(`[webhook] Failed to reserve tickets for ${registration.id}:`, reserveError);
        // Log but don't fail the webhook since payment was successful
      } else {
        console.log(`[webhook] Reserved ${registration.quantity} ${registration.ticket_type} ticket(s)`);
      }

      // Mark family-style unit as sold if applicable
      if (session.metadata?.family_unit_id) {
        const familyUnitId = session.metadata.family_unit_id;
        console.log(`[webhook] Marking family unit ${familyUnitId} as sold`);
        
        const { error: unitUpdateError } = await supabaseClient
          .from("accommodation_units")
          .update({ inventory_status: "reserved" })
          .eq("id", familyUnitId)
          .in("inventory_status", ["available", "pending_offer"]);

        if (unitUpdateError) {
          console.error(`[webhook] Failed to mark family unit as reserved:`, unitUpdateError);
          // Log but don't fail - payment was successful
        } else {
          console.log(`[webhook] Family unit ${familyUnitId} marked as reserved`);
        }
      }

      // Update zone inventory if zone-based lodging selected
      if (session.metadata?.lodging_zone_key && session.metadata?.lodging_qty) {
        const zoneKey = session.metadata.lodging_zone_key;
        const lodgingQty = parseInt(session.metadata.lodging_qty, 10);
        console.log(`[webhook] Updating zone ${zoneKey} inventory, decrementing by ${lodgingQty}`);

        const { error: zoneUpdateError } = await supabaseClient
          .rpc("decrement_zone_inventory", {
            p_zone_key: zoneKey,
            p_quantity: lodgingQty
          });

        if (zoneUpdateError) {
          console.error(`[webhook] Failed to update zone inventory:`, zoneUpdateError);
        } else {
          console.log(`[webhook] Zone ${zoneKey} inventory decremented by ${lodgingQty}`);
        }

        // Create the lodging_bookings row (this was previously missing for combo checkouts)
        const { data: existingBooking } = await supabaseClient
          .from("lodging_bookings")
          .select("id")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (!existingBooking) {
          // Derive lodging total from Stripe line items
          let lodgingTotal = 0;
          try {
            const liResp = await stripe.checkout.sessions.listLineItems(session.id, {
              limit: 100,
              expand: ["data.price.product"],
            });
            const lodgingLine = liResp.data.find((li: any) => {
              const name = (li.description || (li.price?.product as any)?.name || "").toLowerCase();
              return name.includes("lodging") || name.includes("tent") || name.includes("cabin");
            });
            if (lodgingLine?.amount_total) lodgingTotal = lodgingLine.amount_total;
          } catch (liErr) {
            console.error(`[webhook] Failed to derive lodging total:`, liErr);
          }

          const { error: lbErr } = await supabaseClient.from("lodging_bookings").insert({
            registration_id: registration.id,
            event_id: registration.event_id,
            email: registration.email,
            zone_key: zoneKey,
            quantity: lodgingQty,
            total_amount: lodgingTotal,
            payment_status: "paid",
            stripe_session_id: session.id,
            assignment_status: "pending",
          });
          if (lbErr) {
            console.error(`[webhook] Failed to create lodging_booking:`, lbErr);
          } else {
          console.log(`[webhook] Created lodging_booking for ${registration.id} zone=${zoneKey} qty=${lodgingQty} total=${lodgingTotal}`);
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Combined ticket + add-on checkouts: process add-on rows.
      // create-cosmico-checkout pre-inserts addon_purchases (pending). This block:
      //   1. Marks any existing pending rows for this session as paid + bumps inventory
      //   2. SELF-HEALS by deriving from Stripe line items if the pre-insert was lost
      //      (e.g. isolate teardown), so a paid add-on never goes missing again.
      // ─────────────────────────────────────────────────────────────────────
      try {
        const { data: existingAddonRows } = await supabaseClient
          .from("addon_purchases")
          .select("*")
          .eq("stripe_session_id", session.id);

        let rowsToProcess = existingAddonRows || [];
        if (rowsToProcess.length === 0) {
          const liResp = await stripe.checkout.sessions.listLineItems(session.id, {
            limit: 100,
            expand: ["data.price.product"],
          });
          const addonLines = liResp.data.filter((li: any) => {
            const name = (li.description || (li.price?.product as any)?.name || "").toLowerCase();
            if (!name) return false;
            if (name.includes("lodging") || name.includes("tent") || name.includes("cabin")) return false;
            if (name.includes("service fee") || name.includes("fee") || name.includes("processing")) return false;
            if (name.includes("tax") || name.includes("donation")) return false;
            if (name.includes("ticket") || name.includes("vip") || name.includes("ga ") ||
                name.includes("krewe") || name.includes("party only") || name.includes("youth") ||
                name.includes("child") || name.includes("weekend") || name.includes("3 day") ||
                name.includes("3-day") || name.includes("2 day") || name.includes("2-day") ||
                name.includes("friday") || name.includes("saturday") || name.includes("early bird") ||
                name.includes("patron")) return false;
            return true;
          });

          if (addonLines.length > 0) {
            console.warn(`[webhook] Self-healing missing addon_purchases for session ${session.id}: ${addonLines.length} line(s) detected`);
            const { data: allInv } = await supabaseClient
              .from("addon_inventory")
              .select("id, display_name, price");
            const invByName = new Map(
              (allInv || []).map((i: any) => [String(i.display_name).toLowerCase().trim(), i])
            );

            const newRows: any[] = [];
            for (const li of addonLines) {
              const name = String(li.description || (li.price?.product as any)?.name || "").toLowerCase().trim();
              const inv = invByName.get(name);
              if (!inv) {
                console.error(`[webhook] Self-heal: could not match addon line "${name}" to inventory`);
                continue;
              }
              const qty = li.quantity || 1;
              const unit = li.price?.unit_amount ?? Math.round((li.amount_total || 0) / qty);
              newRows.push({
                inventory_id: inv.id,
                registration_id: registration.id,
                purchaser_email: registration.email.toLowerCase(),
                purchase_type: "addon",
                quantity: qty,
                unit_price: unit,
                total_amount: li.amount_total || unit * qty,
                payment_status: "pending",
                stripe_session_id: session.id,
              });
            }
            if (newRows.length > 0) {
              const { data: inserted, error: healErr } = await supabaseClient
                .from("addon_purchases")
                .insert(newRows)
                .select();
              if (healErr) {
                console.error(`[webhook] Self-heal insert failed for session ${session.id}:`, healErr);
              } else {
                rowsToProcess = inserted || [];
                console.log(`[webhook] Self-heal inserted ${rowsToProcess.length} addon_purchases row(s) for session ${session.id}`);
              }
            }
          }
        }

        for (const row of rowsToProcess) {
          if (row.payment_status === "paid") continue;
          const { error: payErr } = await supabaseClient
            .from("addon_purchases")
            .update({ payment_status: "paid" })
            .eq("id", row.id);
          if (payErr) {
            console.error(`[webhook] Failed to mark addon ${row.id} paid:`, payErr);
            continue;
          }
          const { data: invRow } = await supabaseClient
            .from("addon_inventory")
            .select("sold_quantity")
            .eq("id", row.inventory_id)
            .single();
          if (invRow) {
            await supabaseClient
              .from("addon_inventory")
              .update({ sold_quantity: (invRow.sold_quantity || 0) + (row.quantity || 0) })
              .eq("id", row.inventory_id);
            console.log(`[webhook] Combined-cart addon paid + inventory bumped: ${row.inventory_id} +${row.quantity}`);
          }
        }
      } catch (addonErr) {
        console.error(`[webhook] Combined-cart addon processing error for session ${session.id}:`, addonErr);
      }

      // Determine which email function to use based on ticket type
      const isCosmico2026 = registration.ticket_type.startsWith('tier_1_');
      const emailFunction = isCosmico2026 ? 'send-cosmico-confirmation' : 'send-ticket-email';

      // Send confirmation email (fire and forget)
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${emailFunction}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ registrationId: registration.id }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error(`[webhook] Failed to send email via ${emailFunction}: ${res.statusText}`);
          } else {
            console.log(`[webhook] Email sent via ${emailFunction} for registration ${registration.id}`);
          }
        })
        .catch((err) => console.error("[webhook] Error sending email:", err));

      // Send admin notification (fire and forget)
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-admin-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ registrationId: registration.id }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error(`[webhook] Failed to send admin notification: ${res.statusText}`);
          } else {
            console.log(`[webhook] Admin notification sent for registration ${registration.id}`);
          }
        })
        .catch((err) => console.error("[webhook] Error sending admin notification:", err));

      // Send event info email automatically (fire and forget)
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-event-info-auto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ registrationId: registration.id }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error(`[webhook] Failed to send event info email: ${res.statusText}`);
          } else {
            console.log(`[webhook] Event info email sent for registration ${registration.id}`);
          }
        })
        .catch((err) => console.error("[webhook] Error sending event info email:", err));

      // Schedule drip sequence emails (fire and forget)
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/schedule-sequence-emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ registrationId: registration.id }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error(`[webhook] Failed to schedule sequence emails: ${res.statusText}`);
          } else {
            console.log(`[webhook] Sequence emails scheduled for registration ${registration.id}`);
          }
        })
        .catch((err) => console.error("[webhook] Error scheduling sequence emails:", err));

      console.log(`[webhook] Successfully processed payment for ${registration.id}`);

      // Sync to Flodesk (fire and forget)
      const firstName = registration.name?.split(" ")[0] || "";
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-flodesk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ 
          email: registration.email, 
          firstName,
        }),
      })
        .then((res) => {
          if (!res.ok) console.error(`[webhook] Failed to sync to Flodesk: ${res.statusText}`);
          else console.log(`[webhook] Synced ${registration.email} to Flodesk`);
        })
        .catch((err) => console.error("[webhook] Error syncing to Flodesk:", err));

      // Sync to SimplyText if phone available (fire and forget)
      // Adds to BOTH the master list and the focused 2026 ticket holder segment
      // so we can send targeted messages only to confirmed attendees.
      if (registration.phone) {
        const smsLists = ["Cosmico Full List", "Cosmico 2026 - Ticket Holders"];
        for (const listName of smsLists) {
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-simpletexting`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              phone: registration.phone,
              email: registration.email,
              firstName,
              listName,
            }),
          })
            .then((res) => {
              if (!res.ok) console.error(`[webhook] Failed to sync to SimplyText (${listName}): ${res.statusText}`);
              else console.log(`[webhook] Synced ${registration.email} to SimplyText list "${listName}"`);
            })
            .catch((err) => console.error(`[webhook] Error syncing to SimplyText (${listName}):`, err));
        }
      }

      // Fire server-side Meta CAPI Purchase for regular tickets
      fireMetaCapiPurchaseAsync(session, session.metadata?.meta_event_id || registration.meta_event_id, {
        email: registration.email,
        name: registration.name,
        fbp: registration.fbp || undefined,
        fbc: registration.fbc || undefined,
        external_id: registration.id,
        client_ip: registration.client_ip || undefined,
        client_user_agent: registration.client_user_agent || undefined,
      });
    }

    // Handle expired Stripe Checkout sessions — flip pending registrations/lodging to expired
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`[webhook] Session expired: ${session.id}`);

      const { data: regs } = await supabaseClient
        .from("registrations")
        .update({ payment_status: "expired" })
        .eq("stripe_session_id", session.id)
        .eq("payment_status", "pending")
        .select("id, email");
      if (regs && regs.length > 0) {
        console.log(`[webhook] Marked ${regs.length} registration(s) expired for session ${session.id}`);
      }

      const { data: lodg } = await supabaseClient
        .from("lodging_bookings")
        .update({ payment_status: "expired" })
        .eq("stripe_session_id", session.id)
        .eq("payment_status", "pending")
        .select("id, email, assigned_unit_id");
      if (lodg && lodg.length > 0) {
        console.log(`[webhook] Marked ${lodg.length} lodging booking(s) expired for session ${session.id}`);
        for (const b of lodg) {
          if ((b as any).assigned_unit_id) {
            await supabaseClient
              .from("accommodation_units")
              .update({ inventory_status: "available" })
              .eq("id", (b as any).assigned_unit_id)
              .in("inventory_status", ["pending_offer", "reserved"]);
          }
        }
      }

      await supabaseClient
        .from("webhook_logs")
        .update({ status: "processed", session_id: session.id, updated_at: new Date().toISOString() })
        .eq("event_id", event.id);
    }

    // Handle failed payment intents — flip linked pending registrations/lodging to failed
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.log(`[webhook] Payment intent failed: ${pi.id} reason=${pi.last_payment_error?.code}`);
      try {
        const sessions = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 5 });
        for (const s of sessions.data) {
          await supabaseClient
            .from("registrations")
            .update({ payment_status: "failed" })
            .eq("stripe_session_id", s.id)
            .eq("payment_status", "pending");
          await supabaseClient
            .from("lodging_bookings")
            .update({ payment_status: "failed" })
            .eq("stripe_session_id", s.id)
            .eq("payment_status", "pending");
        }
      } catch (e: any) {
        console.error(`[webhook] Failed to lookup sessions for PI ${pi.id}:`, e.message);
      }
      await supabaseClient
        .from("webhook_logs")
        .update({ status: "processed", updated_at: new Date().toISOString() })
        .eq("event_id", event.id);
    }

    // Return 200 to acknowledge receipt of the event
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[webhook] Error processing webhook:", error.message);
    
    // If it's a signature verification error, return 400
    if (error.type === "StripeSignatureVerificationError") {
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400 }
      );
    }

    // For other errors, return 500
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});
