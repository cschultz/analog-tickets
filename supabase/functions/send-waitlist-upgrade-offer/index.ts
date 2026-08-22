import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WaitlistUpgradeRequest {
  waitlist_entry_id: string;
  price_in_cents: number;
  event_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is admin
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { waitlist_entry_id, price_in_cents, event_id }: WaitlistUpgradeRequest = await req.json();

    if (!waitlist_entry_id || !price_in_cents || !event_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Creating upgrade offer for waitlist entry: ${waitlist_entry_id}`);

    // Use service role to fetch waitlist entry and event details
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch waitlist entry
    const { data: waitlistEntry, error: fetchError } = await supabaseAdmin
      .from("ticket_waitlist")
      .select("*")
      .eq("id", waitlist_entry_id)
      .single();

    if (fetchError || !waitlistEntry) {
      console.error("Error fetching waitlist entry:", fetchError);
      return new Response(JSON.stringify({ error: "Waitlist entry not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch event details
    const { data: eventData, error: eventError } = await supabaseAdmin
      .from("event_details")
      .select("*")
      .eq("id", event_id)
      .single();

    if (eventError || !eventData) {
      console.error("Error fetching event:", eventError);
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch email signature settings
    const { data: emailSettings } = await supabaseAdmin
      .from("email_settings")
      .select("signature_line, signature_name")
      .limit(1)
      .single();

    const signatureLine = emailSettings?.signature_line || "✌️&❤️,";
    const signatureName = emailSettings?.signature_name || "The Cosmico Team";

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: waitlistEntry.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.invalid";

    // Create Stripe checkout session for Dinner + Party ticket
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : waitlistEntry.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${eventData.title} - Dinner + Party Ticket`,
              description: `Special invitation for ${waitlistEntry.name}`,
            },
            unit_amount: price_in_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/ticket-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#tickets`,
      payment_intent_data: {
        description: "Cosmico - Dinner + Party Ticket",
      },
      metadata: {
        event_id: event_id,
        name: waitlistEntry.name,
        email: waitlistEntry.email,
        ticket_type: "dinner_party",
        quantity: "1",
        waitlist_entry_id: waitlist_entry_id,
        source: "waitlist_upgrade_offer",
      },
    });

    console.log(`Created Stripe session: ${session.id}`);

    // Format price for email
    const priceFormatted = `$${(price_in_cents / 100).toFixed(0)}`;

    // Format event date
    const eventDate = new Date(eventData.event_date);
    const formattedDate = eventDate.toLocaleDateString('en-US', { weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', timeZone: "America/Los_Angeles" });

    // Send invitation email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Georgia', serif; background-color: #F3EEE6; margin: 0; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #A37552 0%, #8B5E3C 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: normal; font-style: italic;">
              You're Invited, ${waitlistEntry.name}!
            </h1>
          </div>
          
          <div style="padding: 40px 30px;">
            <p style="color: #322821; font-size: 18px; line-height: 1.6; margin: 0 0 20px;">
              Great news! A spot has opened up for you to join us for the complete Cosmico experience — dinner included.
            </p>
            
            <div style="background: #F3EEE6; border-left: 4px solid #C7A97A; padding: 20px; margin: 25px 0;">
              <p style="margin: 0; color: #7B6E61; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                Your Invitation
              </p>
              <p style="margin: 8px 0 0; color: #322821; font-size: 20px; font-weight: 600;">
                Dinner + Party Ticket
              </p>
              <p style="margin: 8px 0 0; color: #A37552; font-size: 24px; font-weight: bold;">
                ${priceFormatted}
              </p>
            </div>

            <div style="background: #FAF8F5; padding: 20px; border-radius: 6px; margin: 25px 0;">
              <p style="margin: 0 0 10px; color: #7B6E61; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                Event Details
              </p>
              <p style="margin: 0; color: #322821; font-size: 16px;">
                <strong>${eventData.title}</strong><br/>
                ${formattedDate}<br/>
                ${eventData.venue_name}
              </p>
            </div>
            
            <p style="color: #7B6E61; font-size: 16px; line-height: 1.6; margin: 25px 0;">
              This special invitation is just for you. Secure your spot before it's gone — this offer expires in 48 hours.
            </p>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="${session.url}" 
                 style="display: inline-block; background: #A37552; color: #FFFFFF; text-decoration: none; padding: 16px 40px; border-radius: 4px; font-size: 16px; font-weight: 500;">
                Claim Your Spot
              </a>
            </div>
            
            <p style="color: #7B6E61; font-size: 14px; line-height: 1.6; margin: 30px 0 0; text-align: center;">
              ${signatureLine}<br/>
              <strong>${signatureName}</strong>
            </p>
          </div>
          
          <div style="background: #322821; padding: 25px 30px; text-align: center;">
            <p style="color: #C7A97A; margin: 0; font-size: 14px;">
              ${eventData.title}
            </p>
            <p style="color: rgba(255,255,255,0.6); margin: 8px 0 0; font-size: 12px;">
              You received this because you signed up for our waitlist.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [waitlistEntry.email],
      subject: `🎉 Your Exclusive Dinner + Party Invitation`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Failed to send email:", emailError);
      return new Response(JSON.stringify({ error: "Failed to send invitation email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark waitlist entry as notified
    await supabaseAdmin
      .from("ticket_waitlist")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", waitlist_entry_id);

    console.log(`Successfully sent upgrade offer to ${waitlistEntry.email}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Upgrade offer sent to ${waitlistEntry.email}`,
      checkout_url: session.url
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in send-waitlist-upgrade-offer:", error);
    return new Response(JSON.stringify({ error: errMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
