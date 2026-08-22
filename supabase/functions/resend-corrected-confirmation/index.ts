// One-off function: resend Cosmico confirmation with a correction
// banner at the top, for guests who received an earlier email referencing
// the wrong venue (Dawn Ranch). Mirrors send-cosmico-confirmation styling.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getEmailSenderConfig } from "../_shared/email-sender-config.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TICKET_NAMES: Record<string, string> = {
  tier_1_krewe_3day: "Krewe — 3 Day Pass",
  tier_1_vip_3day: "VIP — 3 Day Pass",
  tier_1_ga_2day: "GA — 2 Day Pass",
  tier_1_ga_friday: "GA — Friday",
  tier_1_ga_saturday: "GA — Saturday",
};

const getFirstName = (n: string) => n.split(" ")[0] || n;

const buildHtml = (name: string, ticketType: string, quantity: number, totalAmount: number) => {
  const ticketName = TICKET_NAMES[ticketType] || ticketType;
  const formattedTotal = `$${(totalAmount / 100).toFixed(0)}`;
  const firstName = getFirstName(name);
  const ticketWord = quantity > 1 ? "tickets" : "ticket";

  return `
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Correction — Cosmico</title></head>
<body style="margin:0;padding:0;font-family:Georgia,'Times New Roman',serif;background-color:#f5f0e8;color:#2f2f2f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f0e8;"><tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">

  <tr><td style="padding-bottom:24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#fff7e6;border:1px solid #e6c98a;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#8a6a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">A quick correction</p>
        <p style="margin:0;font-size:14px;color:#4a3a10;line-height:1.6;">
          ${firstName}, our earlier confirmation listed the wrong venue. Cosmico 2026 is at <strong>Wildhaven Sonoma in Healdsburg, CA</strong> — not Dawn Ranch. Apologies for the mix-up. Your updated confirmation is below.
        </p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" style="padding-bottom:8px;"><p style="margin:0;font-size:18px;font-weight:400;letter-spacing:0.15em;color:#2f2f2f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">COSMICO</p></td></tr>
  <tr><td align="center" style="padding-bottom:40px;"><p style="margin:0;font-size:13px;color:#888;font-style:italic;">You're officially part of it.</p></td></tr>

  <tr><td style="padding-bottom:28px;"><p style="margin:0;font-size:22px;color:#2f2f2f;font-weight:400;">You're in, ${firstName}.</p></td></tr>
  <tr><td style="padding-bottom:32px;"><p style="margin:0;font-size:16px;color:#444;line-height:1.7;">Your ${quantity > 1 ? quantity + " " : ""}${ticketName} ${ticketWord} ${quantity > 1 ? "are" : "is"} confirmed. We're glad you're coming.</p></td></tr>

  <tr><td style="padding-bottom:36px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #d4cdc0;border-bottom:1px solid #d4cdc0;"><tr><td style="padding:20px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr><td style="padding:6px 0;color:#888;font-size:14px;">Ticket</td><td align="right" style="padding:6px 0;color:#2f2f2f;font-size:14px;">${ticketName}${quantity > 1 ? " × " + quantity : ""}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:14px;">When</td><td align="right" style="padding:6px 0;color:#2f2f2f;font-size:14px;">May 15–17, 2026</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:14px;">Where</td><td align="right" style="padding:6px 0;color:#2f2f2f;font-size:14px;"><a href="https://maps.google.com/?q=Wildhaven+Sonoma,+Healdsburg,+CA" style="color:#3C6189;text-decoration:none;">Wildhaven, Healdsburg, CA</a></td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:14px;">Total</td><td align="right" style="padding:6px 0;color:#2f2f2f;font-size:16px;font-weight:600;">${formattedTotal}</td></tr>
      </table>
    </td></tr></table>
  </td></tr>

  <tr><td style="padding-bottom:36px;"><p style="margin:0;font-size:16px;color:#444;line-height:1.7;">This isn't just a festival.<br>It's a weekend built around music, connection, and showing up.</p></td></tr>

  <tr><td style="padding-bottom:36px;">
    <p style="margin:0 0 16px 0;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#2f2f2f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Your Ticket</p>
    <p style="margin:0;font-size:16px;color:#444;line-height:1.7;">Your ${ticketWord} with QR codes will be delivered to your inbox 7 days before the event.</p>
  </td></tr>

  <tr><td style="padding-bottom:40px;">
    <p style="margin:0 0 16px 0;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#2f2f2f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Questions?</p>
    <p style="margin:0;font-size:16px;color:#444;line-height:1.7;">Just hit reply. We actually read these.</p>
  </td></tr>

  <tr><td style="padding-bottom:40px;"><p style="margin:0;font-size:16px;color:#444;line-height:1.7;">See you in May,<br>Chris &amp; Anne</p></td></tr>

  <tr><td align="center" style="padding-top:24px;border-top:1px solid #d4cdc0;">
    <p style="margin:0 0 6px 0;font-size:12px;color:#aaa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Cosmico</p>
    <p style="margin:0;font-size:11px;color:#bbb;">Produced by the Launch Pad Foundation, a 501(c)(3) public charity.</p>
  </td></tr>

</table></td></tr></table></body></html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { registrationIds } = await req.json();
    if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
      throw new Error("registrationIds (array) is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const sender = await getEmailSenderConfig("guest");
    const results: Array<Record<string, unknown>> = [];

    for (const rid of registrationIds) {
      const { data: reg, error } = await supabase
        .from("registrations")
        .select("*")
        .eq("id", rid)
        .single();
      if (error || !reg) {
        results.push({ rid, ok: false, error: error?.message || "not found" });
        continue;
      }

      const html = buildHtml(reg.name, reg.ticket_type, reg.quantity, reg.total_amount);
      const sent = await resend.emails.send({
        from: sender.fromAddress,
        to: [reg.email],
        reply_to: sender.replyTo || "hello@example.invalid",
        subject: "Correction: your Cosmico details (right venue inside)",
        html,
      });

      await supabase.from("email_logs").insert({
        registration_id: rid,
        email_type: "cosmico_confirmation_correction",
        status: sent.error ? "failed" : "sent",
        email_content: `Corrected Cosmico confirmation sent to ${reg.email}`,
        error_message: sent.error?.message,
      });

      results.push({ rid, email: reg.email, ok: !sent.error, id: sent.data?.id, error: sent.error?.message });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
