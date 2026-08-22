import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { filterSuperAdminEmails } from "../_shared/admin-notify-recipients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const formatMoney = (amount = 0) => `$${(amount / 100).toFixed(2)}`;
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authentication: accept either the service-role key (server-to-server, e.g. Stripe webhook)
  // or an admin user JWT. Reject everything else to prevent admin-inbox spam.
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const isService = bearer && bearer === serviceKey;

  if (!isService) {
    if (!bearer) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(bearer);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminCheck = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
    );
    const { data: roleRow } = await adminCheck
      .from("user_roles")
      .select("role")
      .eq("user_id", claimsData.claims.sub)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { registrationId, stripeSessionId, testMode } = await req.json();
    console.log(
      "[admin-notification] Processing:",
      testMode ? "TEST MODE" : stripeSessionId ? `addon session ${stripeSessionId}` : `registration ${registrationId}`,
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: emailSettings } = await supabaseClient
      .from("email_settings")
      .select("notify_admins_new_registrations")
      .limit(1)
      .single();

    if (emailSettings?.notify_admins_new_registrations === false) {
      console.log("[admin-notification] Admin notifications are disabled in settings");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Admin notifications disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const { data: admins, error: adminError } = await supabaseClient
      .from("user_roles")
      .select("user_id, profiles!inner(email)")
      .eq("role", "admin");

    if (adminError || !admins || admins.length === 0) {
      console.error("[admin-notification] No admins found:", adminError);
      throw new Error("No admin emails found");
    }

    const allAdminEmails = admins.map((admin: any) => admin.profiles.email).filter(Boolean);
    // Platform notifications only go to super admins. Other admins are
    // event-scoped and must not receive platform-level email blasts.
    const adminEmails = filterSuperAdminEmails(allAdminEmails);
    console.log("[admin-notification] Recipients:", adminEmails);
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    let subject = "";
    let html = "";

    if (testMode) {
      const registration = {
        name: "Test Customer",
        email: "test@example.com",
        ticket_type: "dinner_party",
        quantity: 2,
        total_amount: 35000,
        donation_amount: 5000,
        plus_one_name: "Test Guest",
        dietary_notes: "Vegetarian",
        created_at: new Date().toISOString(),
        event_details: {
          title: "Cosmico Winter Gathering",
          event_date: "2025-01-18",
          event_time: "17:00",
          venue_name: "Dawn Ranch",
        },
      };

      subject = `[TEST] New Ticket Sale - ${esc(registration.name)}`;
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>🎉 New Ticket Sale</h2>
          <p>A new ticket has been purchased!</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Customer Details</h3>
            <p><strong>Name:</strong> ${esc(registration.name)}</p>
            <p><strong>Email:</strong> ${esc(registration.email)}</p>
            <p><strong>Ticket Type:</strong> ${esc(registration.ticket_type)}</p>
            <p><strong>Quantity:</strong> ${esc(registration.quantity)}</p>
            <p><strong>Total Amount:</strong> ${formatMoney(registration.total_amount)}</p>
            <p><strong>Donation:</strong> ${formatMoney(registration.donation_amount)}</p>
            <p><strong>Plus One:</strong> ${esc(registration.plus_one_name)}</p>
            <p><strong>Dietary Notes:</strong> ${esc(registration.dietary_notes)}</p>
          </div>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Event Details</h3>
            <p><strong>Event:</strong> ${esc(registration.event_details.title)}</p>
            <p><strong>Date:</strong> ${new Date(registration.event_details.event_date).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</p>
            <p><strong>Time:</strong> ${esc(registration.event_details.event_time)}</p>
            <p><strong>Venue:</strong> ${esc(registration.event_details.venue_name)}</p>
          </div>

          <p style="color: #666; font-size: 14px;">
            Purchased at: ${new Date(registration.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
          </p>
        </div>
      `;
    } else if (stripeSessionId) {
      const { data: purchases, error: purchaseError } = await supabaseClient
        .from("addon_purchases")
        .select(`
          id,
          quantity,
          unit_price,
          total_amount,
          purchaser_email,
          created_at,
          has_dietary_restrictions,
          dietary_restrictions,
          addon_inventory (
            display_name,
            addon_type
          ),
          registrations (
            name,
            email,
            event_details:event_id (
              title,
              event_date,
              event_time,
              venue_name
            )
          )
        `)
        .eq("stripe_session_id", stripeSessionId)
        .eq("payment_status", "paid");

      if (purchaseError || !purchases || purchases.length === 0) {
        throw new Error(`Failed to fetch add-on purchases: ${purchaseError?.message || "No purchases found"}`);
      }

      const primaryPurchase = purchases[0];
      const registration = Array.isArray(primaryPurchase.registrations)
        ? primaryPurchase.registrations[0]
        : primaryPurchase.registrations;
      const eventDetails = Array.isArray(registration?.event_details)
        ? registration.event_details[0]
        : registration?.event_details;
      const customerName = registration?.name || primaryPurchase.purchaser_email;
      const customerEmail = registration?.email || primaryPurchase.purchaser_email;
      const totalAmount = purchases.reduce((sum: number, purchase: any) => sum + (purchase.total_amount || 0), 0);
      const lineItemsHtml = purchases
        .map((purchase: any) => {
          const inventory = Array.isArray(purchase.addon_inventory)
            ? purchase.addon_inventory[0]
            : purchase.addon_inventory;
          const dietaryNote = inventory?.addon_type === "friday_dinner" && purchase.has_dietary_restrictions && purchase.dietary_restrictions
            ? `
                <div style="margin-top: 12px; padding: 12px 14px; border-radius: 8px; background: #fff7e8; border: 1px solid #f1d59a;">
                  <p style="margin: 0 0 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #7a5a16;"><strong>Dietary Restrictions</strong></p>
                  <p style="margin: 0; color: #46361a; line-height: 1.5;">${esc(purchase.dietary_restrictions)}</p>
                </div>
              `
            : "";

          return `
            <div style="background: #f5f5f5; padding: 16px 18px; border-radius: 8px; margin: 0 0 12px;">
              <p style="margin: 0 0 6px;"><strong>Add-on:</strong> ${esc(inventory?.display_name || "Add-on")}</p>
              <p style="margin: 0 0 6px;"><strong>Quantity:</strong> ${esc(purchase.quantity)}</p>
              <p style="margin: 0 0 6px;"><strong>Unit Price:</strong> ${formatMoney(purchase.unit_price)}</p>
              <p style="margin: 0;"><strong>Line Total:</strong> ${formatMoney(purchase.total_amount)}</p>
              ${dietaryNote}
            </div>
          `;
        })
        .join("");

      subject = `New Add-on Order - ${esc(customerName)}`;
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>🍱 New Add-on Order</h2>
          <p>A new add-on purchase has been completed.</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Customer Details</h3>
            <p><strong>Name:</strong> ${esc(customerName)}</p>
            <p><strong>Email:</strong> ${esc(customerEmail)}</p>
            <p><strong>Order Total:</strong> ${formatMoney(totalAmount)}</p>
          </div>

          <div style="margin: 20px 0;">
            <h3 style="margin: 0 0 12px;">Add-ons</h3>
            ${lineItemsHtml}
          </div>

          ${eventDetails ? `
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Event Details</h3>
              <p><strong>Event:</strong> ${esc(eventDetails.title)}</p>
              <p><strong>Date:</strong> ${new Date(eventDetails.event_date).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</p>
              <p><strong>Time:</strong> ${esc(eventDetails.event_time)}</p>
              <p><strong>Venue:</strong> ${esc(eventDetails.venue_name)}</p>
            </div>
          ` : ""}

          <p style="color: #666; font-size: 14px;">
            Purchased at: ${new Date(primaryPurchase.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
          </p>
        </div>
      `;
    } else {
      const { data: registration, error: regError } = await supabaseClient
        .from("registrations")
        .select(`
          *,
          event_details:event_id (
            title,
            event_date,
            event_time,
            venue_name
          )
        `)
        .eq("id", registrationId)
        .single();

      if (regError || !registration) {
        throw new Error(`Failed to fetch registration: ${regError?.message}`);
      }

      subject = `New Ticket Sale - ${esc(registration.name)}`;
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>🎉 New Ticket Sale</h2>
          <p>A new ticket has been purchased!</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Customer Details</h3>
            <p><strong>Name:</strong> ${esc(registration.name)}</p>
            <p><strong>Email:</strong> ${esc(registration.email)}</p>
            <p><strong>Ticket Type:</strong> ${esc(registration.ticket_type)}</p>
            <p><strong>Quantity:</strong> ${esc(registration.quantity)}</p>
            <p><strong>Total Amount:</strong> ${formatMoney(registration.total_amount)}</p>
            ${registration.donation_amount ? `<p><strong>Donation:</strong> ${formatMoney(registration.donation_amount)}</p>` : ""}
            ${registration.plus_one_name ? `<p><strong>Plus One:</strong> ${esc(registration.plus_one_name)}</p>` : ""}
            ${registration.dietary_notes ? `<p><strong>Dietary Notes:</strong> ${esc(registration.dietary_notes)}</p>` : ""}
          </div>

          ${registration.event_details ? `
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Event Details</h3>
              <p><strong>Event:</strong> ${esc(registration.event_details.title)}</p>
              <p><strong>Date:</strong> ${new Date(registration.event_details.event_date).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</p>
              <p><strong>Time:</strong> ${esc(registration.event_details.event_time)}</p>
              <p><strong>Venue:</strong> ${esc(registration.event_details.venue_name)}</p>
            </div>
          ` : ""}

          <p style="color: #666; font-size: 14px;">
            Purchased at: ${new Date(registration.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
          </p>
        </div>
      `;
    }

    const emailPromises = adminEmails.map((email: string) =>
      resend.emails.send({
        from: "The Cosmico Team <hello@example.invalid>",
        to: email,
        subject,
        html,
      })
    );

    await Promise.all(emailPromises);
    console.log("[admin-notification] Emails sent successfully");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[admin-notification] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
