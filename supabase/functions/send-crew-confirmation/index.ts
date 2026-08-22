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
    const { type, data } = await req.json();

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    if (type === "crew_bid") {
      const { captain_name, email, crew_size, ticket_type, bid_price } = data;
      const firstName = captain_name?.split(" ")[0] || "there";
      const ticketLabel = TICKET_LABELS[ticket_type] || ticket_type;
      const total = crew_size * bid_price;

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #2F2F2F; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">

<p style="margin: 0 0 24px;">Hey ${firstName},</p>

<p style="margin: 0 0 16px;">We received your crew bid. Here's what you submitted:</p>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr><td style="padding: 8px 0; color: #7B6E61;">Crew Size</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${crew_size} people</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Ticket Type</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${ticketLabel}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Bid Per Ticket</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">$${bid_price}</td></tr>
  <tr style="border-top: 1px solid #D1C2AE;"><td style="padding: 12px 0; color: #7B6E61;">Estimated Total</td><td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 18px;">$${total.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</td></tr>
</table>

<p style="margin: 0 0 16px;">We'll review all crew bids once the window closes on <strong>Wednesday at 5 PM</strong>.</p>

<p style="margin: 0 0 16px;">If your bid is accepted, you'll receive a link to complete your crew's ticket purchase. You'll have <strong>24 hours</strong> to secure your tickets.</p>

<p style="margin: 0 0 8px;">Make sure your crew is ready.</p>

<p style="margin: 32px 0 0;">— The Cosmico Team</p>

</body></html>`;

      await resend.emails.send({
        from: "Cosmico <hello@example.invalid>",
        to: [email],
        reply_to: "hello@example.invalid",
        subject: "Crew Bid Received — Cosmico",
        html,
      });

      // Send admin notification email
      const adminHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #2F2F2F; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">

<p style="margin: 0 0 16px; font-size: 18px; font-weight: 600;">New Crew Bid Submitted</p>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr><td style="padding: 8px 0; color: #7B6E61;">Captain</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${captain_name}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Email</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${email}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Crew Size</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${crew_size} people</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Ticket Type</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${ticketLabel}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Bid Per Ticket</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">$${bid_price}</td></tr>
  <tr style="border-top: 1px solid #D1C2AE;"><td style="padding: 12px 0; font-weight: 600;">Estimated Total</td><td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 20px;">$${total.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</td></tr>
</table>

<p style="margin: 0 0 16px;"><a href="https://example.invalid/admin/crew-bids" style="color: #E9835E; font-weight: 600;">Review in Admin →</a></p>

</body></html>`;

      await resend.emails.send({
        from: "Cosmico <hello@example.invalid>",
        to: ["hello@example.invalid"],
        subject: `New Crew Bid: ${captain_name} — ${crew_size} × ${ticketLabel} @ $${bid_price}`,
        html: adminHtml,
      }).catch((err: any) => console.error("Admin notification email failed:", err));

    } else if (type === "crew_payment_confirmation") {
      const { captain_name, email, crew_size, ticket_type, accepted_price, assignees } = data;
      const firstName = captain_name?.split(" ")[0] || "Captain";
      const ticketLabel = TICKET_LABELS[ticket_type] || ticket_type;
      const total = crew_size * accepted_price;

      // Build assignee list if available
      const validAssignees = (assignees || []).filter((a: any) => a.name || a.email);
      let assigneeSection = "";
      if (validAssignees.length > 0) {
        const rows = validAssignees.map((a: any, i: number) => 
          `<tr><td style="padding: 6px 0; color: #7B6E61;">Ticket ${i + 1}</td><td style="padding: 6px 0; text-align: right;">${a.name || "—"}${a.email ? ` (${a.email})` : ""}</td></tr>`
        ).join("");
        assigneeSection = `
          <p style="margin: 24px 0 8px; font-weight: 600;">Your Crew:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">${rows}</table>
        `;
      }

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #2F2F2F; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">

<p style="margin: 0 0 24px;">Hey ${firstName},</p>

<p style="margin: 0 0 16px; font-size: 18px; font-weight: 600;">Your crew's tickets are confirmed! 🎉</p>

<p style="margin: 0 0 16px;">Payment has been received. Here's your order summary:</p>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr><td style="padding: 8px 0; color: #7B6E61;">Crew Size</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${crew_size} tickets</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Ticket Type</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${ticketLabel}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Price Per Ticket</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">$${accepted_price}</td></tr>
  <tr style="border-top: 1px solid #D1C2AE;"><td style="padding: 12px 0; font-weight: 600;">Total Paid</td><td style="padding: 12px 0; text-align: right; font-weight: 700; font-size: 20px;">$${total.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</td></tr>
</table>

${assigneeSection}

<p style="margin: 0 0 16px;">Each crew member will receive their own ticket with a unique QR code closer to the event. Tickets are transferable — you can update assignments anytime.</p>

<p style="margin: 0 0 8px;">See you and the crew at Cosmico.</p>

<p style="margin: 32px 0 0;">— The Cosmico Team</p>

</body></html>`;

      await resend.emails.send({
        from: "Cosmico <hello@example.invalid>",
        to: [email],
        reply_to: "hello@example.invalid",
        subject: "Tickets Confirmed — Your Crew is In! 🎉",
        html,
      });
    } else if (type === "community_request") {
      const { organizer_name, email } = data;
      const firstName = organizer_name?.split(" ")[0] || "there";

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #2F2F2F; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">

<p style="margin: 0 0 24px;">Hey ${firstName},</p>

<p style="margin: 0 0 16px;">We received your community request for Cosmico. Thank you for reaching out.</p>

<p style="margin: 0 0 16px;">Our team will review your submission and follow up directly if we can make something happen for your group.</p>

<p style="margin: 0 0 8px;">We appreciate you wanting to bring your people into the Analog circle.</p>

<p style="margin: 32px 0 0;">— The Cosmico Team</p>

</body></html>`;

      await resend.emails.send({
        from: "Cosmico <hello@example.invalid>",
        to: [email],
        reply_to: "hello@example.invalid",
        subject: "Community Request Received — Cosmico",
        html,
      });
    } else if (type === "crew_member_ticket") {
      // Individual email to each assigned crew member
      const { member_name, email, captain_name, ticket_type, ticket_number, total_crew } = data;
      const firstName = member_name?.split(" ")[0] || "there";
      const ticketLabel = TICKET_LABELS[ticket_type] || ticket_type;

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #2F2F2F; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">

<p style="margin: 0 0 24px;">Hey ${firstName},</p>

<p style="margin: 0 0 16px; font-size: 18px; font-weight: 600;">You're going to Cosmico! 🎉</p>

<p style="margin: 0 0 16px;">${captain_name} secured a ${ticketLabel} ticket for you as part of their crew.</p>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <tr><td style="padding: 8px 0; color: #7B6E61;">Ticket Type</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${ticketLabel}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Your Ticket</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${ticket_number} of ${total_crew}</td></tr>
  <tr><td style="padding: 8px 0; color: #7B6E61;">Crew Captain</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${captain_name}</td></tr>
</table>

<p style="margin: 0 0 16px;">You'll receive your individual ticket with a unique QR code closer to the event. No action needed from you right now.</p>

<p style="margin: 0 0 8px;">See you at Cosmico.</p>

<p style="margin: 32px 0 0;">— The Cosmico Team</p>

</body></html>`;

      await resend.emails.send({
        from: "Cosmico <hello@example.invalid>",
        to: [email],
        reply_to: "hello@example.invalid",
        subject: "You're In! 🎉 — Cosmico",
        html,
      });
    } else if (type === "community_reply") {
      const { organizer_name, email, message } = data;
      const firstName = organizer_name?.split(" ")[0] || "there";

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; color: #2F2F2F; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">

<p style="margin: 0 0 24px;">Hey ${firstName},</p>

<p style="margin: 0 0 16px;">Thank you for your community request for Cosmico. Here's an update from our team:</p>

<div style="padding: 16px 20px; border-left: 3px solid #C2A36F; margin: 20px 0; background: #FDFAF5;">
${message.split("\n").map((line: string) => `<p style="margin: 0 0 8px;">${line}</p>`).join("")}
</div>

<p style="margin: 0 0 16px;">If you have any questions, just reply to this email.</p>

<p style="margin: 32px 0 0;">— The Cosmico Team</p>

</body></html>`;

      await resend.emails.send({
        from: "Cosmico <hello@example.invalid>",
        to: [email],
        reply_to: "hello@example.invalid",
        subject: "Re: Community Request — Cosmico",
        html,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending crew confirmation:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
