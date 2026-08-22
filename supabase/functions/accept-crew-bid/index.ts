import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TICKET_LABELS: Record<string, string> = {
  "2day_ga": "2-Day GA",
  "saturday_ga": "Saturday GA",
  "friday_ga": "Friday GA",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin auth
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Not authenticated");

    // Check admin role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: hasRole } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!hasRole) throw new Error("Not authorized");

    const { bid_id, action, accepted_price } = await req.json();

    if (action === "accept") {
      const finalPrice = accepted_price;
      
      // Update bid status
      const { data: bid, error: updateErr } = await adminClient
        .from("crew_bids")
        .update({
          status: "accepted",
          accepted_price: finalPrice,
          checkout_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", bid_id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Send acceptance email with checkout link
      const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";
      const checkoutUrl = `${siteUrl}/crew/checkout?token=${bid.checkout_token}`;
      const firstName = bid.captain_name?.split(" ")[0] || "Captain";
      const ticketLabel = TICKET_LABELS[bid.ticket_type] || bid.ticket_type;
      const total = bid.crew_size * finalPrice;

      // Calculate deadline display
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const deadlineStr = deadline.toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: "America/Chicago",
      });

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #2F2F2F; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">

<p style="margin: 0 0 24px;">Hey ${firstName},</p>

<p style="margin: 0 0 16px;">Good news — your crew bid has been accepted for Cosmico.</p>

<p style="margin: 0 0 16px;">Here's what we've locked in for your crew:</p>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr><td style="padding: 8px 0; color: #7B6E61;">Crew Size</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${bid.crew_size} tickets</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Ticket Type</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${ticketLabel}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Price Per Ticket</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">$${finalPrice}</td></tr>
  <tr style="border-top: 1px solid #D1C2AE;"><td style="padding: 12px 0; font-weight: 600;">Total</td><td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 20px;">$${total.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</td></tr>
</table>

<p style="margin: 0 0 24px;">Click below to complete your crew's purchase. This link expires <strong>${deadlineStr}</strong> — so don't wait on it.</p>

<p style="margin: 0 0 32px;">
  <a href="${checkoutUrl}" style="display: inline-block; background: #E9835E; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: 600; font-size: 16px;">Complete Your Purchase</a>
</p>

<p style="margin: 0 0 16px; font-size: 13px; color: #7B6E61;">After checkout, you'll be able to assign each ticket to your crew members by name and email. Everyone gets their own ticket and can arrive independently — no need to walk in together.</p>

<p style="margin: 32px 0 0;">See you out there,<br>The Cosmico Team</p>

</body></html>`;

      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      await resend.emails.send({
        from: "The Cosmico Team <hello@example.invalid>",
        to: [bid.email],
        reply_to: "hello@example.invalid",
        subject: `You're in, ${firstName} — complete your crew's tickets`,
        html,
      });

      return new Response(JSON.stringify({ success: true, bid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "resend") {
      // Extend checkout deadline by 48 hours from now
      const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      
      const { data: bid, error: updateErr } = await adminClient
        .from("crew_bids")
        .update({
          status: "accepted",
          checkout_expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bid_id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Re-send checkout email
      const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";
      const checkoutUrl = `${siteUrl}/bringyourcrew/checkout?token=${bid.checkout_token}`;
      const firstName = bid.captain_name?.split(" ")[0] || "Captain";
      const ticketLabel = TICKET_LABELS[bid.ticket_type] || bid.ticket_type;
      const finalPrice = bid.accepted_price;
      const total = bid.crew_size * finalPrice;

      const deadline = new Date(newExpiry);
      const deadlineStr = deadline.toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: "America/Chicago",
      });

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #2F2F2F; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">

<p style="margin: 0 0 24px;">Hey ${firstName},</p>

<p style="margin: 0 0 16px;">Just a heads up — your crew checkout link has been extended. You've got a fresh window to complete your purchase.</p>

<p style="margin: 0 0 16px;">Here's what we've locked in for your crew:</p>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr><td style="padding: 8px 0; color: #7B6E61;">Crew Size</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${bid.crew_size} tickets</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Ticket Type</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${ticketLabel}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Price Per Ticket</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">$${finalPrice}</td></tr>
  <tr style="border-top: 1px solid #D1C2AE;"><td style="padding: 12px 0; font-weight: 600;">Total</td><td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 20px;">$${total.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</td></tr>
</table>

<p style="margin: 0 0 24px;">Click below to complete your crew's purchase. This link now expires <strong>${deadlineStr}</strong>.</p>

<p style="margin: 0 0 32px;">
  <a href="${checkoutUrl}" style="display: inline-block; background: #E9835E; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: 600; font-size: 16px;">Complete Your Purchase</a>
</p>

<p style="margin: 0 0 16px; font-size: 13px; color: #7B6E61;">After checkout, you'll be able to assign each ticket to your crew members by name and email. Everyone gets their own ticket and can arrive independently.</p>

<p style="margin: 32px 0 0;">See you out there,<br>The Cosmico Team</p>

</body></html>`;

      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      await resend.emails.send({
        from: "The Cosmico Team <hello@example.invalid>",
        to: [bid.email],
        reply_to: "hello@example.invalid",
        subject: `Your crew checkout link has been extended, ${firstName}`,
        html,
      });

      return new Response(JSON.stringify({ success: true, bid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "decline") {
      const { error: updateErr } = await adminClient
        .from("crew_bids")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", bid_id);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error) {
    console.error("Error in accept-crew-bid:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
