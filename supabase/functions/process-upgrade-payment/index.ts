import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { corsHeaders, colors, escapeHtml } from "../_shared/email-template.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();
    console.log("[PROCESS-UPGRADE-PAYMENT] Verifying session:", sessionId);

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing session ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log("[PROCESS-UPGRADE-PAYMENT] Session status:", session.payment_status);

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ error: "Payment not completed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the upgrade offer
    const { data: offer, error: offerError } = await supabaseClient
      .from("upgrade_offers")
      .select(`
        *,
        registrations (
          id,
          name,
          email,
          total_amount,
          ticket_type,
          event_id,
          event_details (
            title,
            event_date,
            venue_name
          )
        )
      `)
      .eq("stripe_session_id", sessionId)
      .single();

    if (offerError || !offer) {
      console.error("[PROCESS-UPGRADE-PAYMENT] Offer not found:", offerError);
      return new Response(JSON.stringify({ error: "Upgrade offer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already processed
    if (offer.status === "completed") {
      console.log("[PROCESS-UPGRADE-PAYMENT] Already processed");
      return new Response(JSON.stringify({ success: true, alreadyProcessed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const registration = offer.registrations;
    const ticketCount = Array.isArray(offer.ticket_ids) ? offer.ticket_ids.length : 0;
    const upgradeFrom = offer.upgrade_from || "party_only";
    const upgradeTo = offer.upgrade_to || "dinner_and_party";
    const verifiedEmail = session.metadata?.verified_email?.toLowerCase?.() || "";

    // Update tickets to the purchased upgrade tier
    const { error: ticketError } = await supabaseClient
      .from("tickets")
      .update({ 
        ticket_type: upgradeTo,
        updated_at: new Date().toISOString()
      })
      .in("id", offer.ticket_ids);

    if (ticketError) {
      console.error("[PROCESS-UPGRADE-PAYMENT] Ticket update error:", ticketError);
      return new Response(JSON.stringify({ error: "Failed to update tickets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[PROCESS-UPGRADE-PAYMENT] Tickets upgraded:", ticketCount);

    // Update upgrade offer status
    await supabaseClient
      .from("upgrade_offers")
      .update({ 
        status: "completed",
        paid_at: new Date().toISOString()
      })
      .eq("id", offer.id);

    await supabaseClient
      .from("ticket_inventory")
      .update({ sold_quantity: 0 })
      .eq("ticket_type", upgradeFrom)
      .lt("sold_quantity", 0);

    const { data: previousInventory } = await supabaseClient
      .from("ticket_inventory")
      .select("sold_quantity")
      .eq("ticket_type", upgradeFrom)
      .maybeSingle();

    if (previousInventory && typeof previousInventory.sold_quantity === "number") {
      await supabaseClient
        .from("ticket_inventory")
        .update({ sold_quantity: Math.max(0, previousInventory.sold_quantity - ticketCount) })
        .eq("ticket_type", upgradeFrom);
    }

    await supabaseClient.rpc("reserve_tickets", {
      p_ticket_type: upgradeTo,
      p_quantity: ticketCount,
    });

    const { data: upgradedTickets } = await supabaseClient
      .from("tickets")
      .select("registration_id")
      .in("id", offer.ticket_ids);

    const registrationIds = [...new Set((upgradedTickets || []).map((ticket) => ticket.registration_id).filter(Boolean))];

    for (const registrationId of registrationIds) {
      const { data: registrationTickets } = await supabaseClient
        .from("tickets")
        .select("ticket_type")
        .eq("registration_id", registrationId)
        .eq("status", "active");

      const uniqueTicketTypes = [...new Set((registrationTickets || []).map((ticket) => ticket.ticket_type).filter(Boolean))];

      await supabaseClient
        .from("registrations")
        .update({
          total_amount: ((registration?.total_amount as number | null) || 0) + offer.total_amount,
          ticket_type: uniqueTicketTypes.length === 1 ? uniqueTicketTypes[0] : registration?.ticket_type,
          updated_at: new Date().toISOString(),
        })
        .eq("id", registrationId);
    }

    const { data: upgradedTicketDetails, error: upgradedTicketDetailsError } = await supabaseClient
      .from("tickets")
      .select("id, ticket_type, holder_name, holder_email, owner_email")
      .in("id", offer.ticket_ids)
      .order("created_at", { ascending: true });

    if (upgradedTicketDetailsError) {
      console.error("[PROCESS-UPGRADE-PAYMENT] Failed to load upgraded ticket details:", upgradedTicketDetailsError);
    }

    const event = registration.event_details;
    const recipientEmail = verifiedEmail || upgradedTicketDetails?.[0]?.owner_email || upgradedTicketDetails?.[0]?.holder_email || registration.email;
    const safeName = escapeHtml(registration.name);
    const safeEventTitle = escapeHtml(event?.title || "Cosmico Event");
    const safeVenueName = escapeHtml(event?.venue_name || "Venue details to follow");
    const eventDateLabel = event?.event_date
      ? new Date(event.event_date).toLocaleString("en-US", { weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric", timeZone: "America/Los_Angeles" })
      : null;
    const safeEventDateLabel = escapeHtml(eventDateLabel || "Date details to follow");
    const formattedUpgradeAmount = `$${((offer.total_amount || 0) / 100).toFixed(2)}`;
    const walletUrl = `${Deno.env.get("SITE_URL") || "https://example.invalid"}/my-tickets?upgrade_success=true`;
    const ticketsMarkup = (upgradedTicketDetails || []).map((ticket: any, index: number) => {
      const safeHolderName = escapeHtml(ticket.holder_name || `Guest ${index + 1}`);
      const safeHolderEmail = escapeHtml(ticket.holder_email || ticket.owner_email || recipientEmail);
      const safeTicketType = escapeHtml(ticket.ticket_type || upgradeTo);

      return `
        <tr>
          <td style="padding: 14px 0; border-top: 1px solid ${colors.border};">
            <p style="margin: 0 0 4px; color: ${colors.text}; font-size: 15px; font-weight: 600;">${safeHolderName}</p>
            <p style="margin: 0 0 4px; color: ${colors.textMuted}; font-size: 13px;">${safeHolderEmail}</p>
            <p style="margin: 0; color: ${colors.success}; font-size: 13px;">Upgraded ticket: ${safeTicketType}</p>
          </td>
        </tr>
      `;
    }).join("");

    const confirmationHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: ${colors.surfaceAlt};">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${colors.surfaceAlt};">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: ${colors.surface}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          
          <tr>
            <td style="background: ${colors.gradientDark}; padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: ${colors.accentGold}; font-size: 28px; font-weight: 600;">
                🎉 Upgrade Complete!
              </h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                Hi ${safeName},
              </p>
              
              <p style="margin: 0 0 20px; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                Your upgrade is complete and your ticket wallet has been refreshed with the new access level.
              </p>
              
              <div style="background-color: ${colors.surfaceAlt}; border-radius: 8px; padding: 24px; margin: 24px 0;">
                <h3 style="margin: 0 0 16px; color: ${colors.success}; font-size: 18px;">✅ Upgrade Confirmed</h3>
                <p style="margin: 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                  <strong>Event:</strong> ${safeEventTitle}<br>
                  <strong>Date:</strong> ${safeEventDateLabel}<br>
                  <strong>Venue:</strong> ${safeVenueName}<br>
                  <strong>Tickets upgraded:</strong> ${ticketCount}<br>
                  <strong>New ticket type:</strong> ${escapeHtml(upgradeTo)}<br>
                  <strong>Upgrade total:</strong> ${formattedUpgradeAmount}
                </p>
              </div>

              <div style="background-color: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 0 20px; margin: 24px 0;">
                <h3 style="margin: 20px 0 0; color: ${colors.text}; font-size: 18px;">Your upgraded tickets</h3>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 12px 0 6px;">
                  ${ticketsMarkup || `<tr><td style="padding: 14px 0; color: ${colors.textMuted}; font-size: 14px;">Your updated ticket details will appear in your wallet shortly.</td></tr>`}
                </table>
              </div>

              <div style="margin: 28px 0; text-align: center;">
                <a href="${walletUrl}" style="display: inline-block; background: ${colors.gradientDark}; color: ${colors.surface}; text-decoration: none; padding: 14px 24px; border-radius: 999px; font-size: 14px; font-weight: 600;">
                  Open My Tickets
                </a>
              </div>
              
              <p style="margin: 20px 0; color: ${colors.text}; font-size: 16px; line-height: 1.6;">
                If you transferred or assigned tickets, the upgraded access and included perks now travel with those tickets too.
              </p>
              
              <p style="margin: 30px 0 0; color: ${colors.textMuted}; font-size: 14px; text-align: center;">
                Questions? Contact us at hello@example.invalid
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: ${colors.darkBg}; padding: 24px 30px; text-align: center;">
              <p style="margin: 0; color: ${colors.textMuted}; font-size: 12px;">
                © ${new Date().getFullYear()} Cosmico. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    let emailSent = false;
    if (recipientEmail) {
      try {
        await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [recipientEmail],
          subject: `Upgrade Complete! - ${safeEventTitle}`,
          html: confirmationHtml,
        });
        emailSent = true;
        console.log("[PROCESS-UPGRADE-PAYMENT] Confirmation email sent to:", recipientEmail);
      } catch (emailError) {
        console.error("[PROCESS-UPGRADE-PAYMENT] Failed to send confirmation email:", emailError);
      }
    }

    // Send admin notification
    const adminNotificationHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h2 style="color: ${colors.success};">Ticket Upgrade Completed</h2>
  <p><strong>Customer:</strong> ${safeName} (${escapeHtml(registration.email)})</p>
  <p><strong>Event:</strong> ${safeEventTitle}</p>
  <p><strong>Tickets Upgraded:</strong> ${offer.ticket_ids.length}</p>
  <p><strong>Amount Paid:</strong> $${(offer.total_amount / 100).toFixed(2)}</p>
  <p style="color: ${colors.textMuted}; margin-top: 20px;">This is an automated notification.</p>
</body>
</html>
    `;

    try {
      await resend.emails.send({
        from: "The Cosmico Team <hello@example.invalid>",
        to: ["hello@example.invalid"],
        subject: `[Admin] Upgrade Completed - ${safeName}`,
        html: adminNotificationHtml,
      });

      console.log("[PROCESS-UPGRADE-PAYMENT] Admin notification sent");
    } catch (adminEmailError) {
      console.error("[PROCESS-UPGRADE-PAYMENT] Failed to send admin notification:", adminEmailError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        ticketsUpgraded: ticketCount,
        upgradedTo: upgradeTo,
        emailSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[PROCESS-UPGRADE-PAYMENT] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
