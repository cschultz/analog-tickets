import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, phone, name, code } = await req.json();
    const displayName = name || "friend";
    const siteUrl = "https://example.invalid";

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const simplyTextKey = Deno.env.get("SIMPLYTEXT_API_KEY");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">Hey ${displayName} —</p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">
        We noticed you grabbed a code but haven't locked in your spot yet. We get it — life gets busy.
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">
        So we extended your exclusive 20% off for another 48 hours. But this is the last time — after that, it's gone for good.
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 8px;">
        We're one month out. Only a few spots remain out of 700.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
        <tr><td style="background:#EEF1FF;border-radius:12px;padding:24px;text-align:center;">
          <p style="font-size:11px;color:#AEBDC5;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Your Code — Extended</p>
          <p style="font-size:32px;font-weight:600;color:#2F2F2F;letter-spacing:0.05em;margin:0;">${code}</p>
          <p style="font-size:14px;color:#E9835E;font-weight:500;margin:8px 0 0;">20% off · Final 48 hours</p>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="text-align:center;">
          <a href="${siteUrl}/tickets" style="display:inline-block;background:#E9835E;color:#ffffff;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-decoration:none;padding:14px 40px;border-radius:8px;">
            Grab Your Spot →
          </a>
        </td></tr>
      </table>
      <p style="font-size:14px;color:#777;line-height:1.5;margin:0 0 20px;">
        700-person cap. One-time use code. No extensions after this.
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0;">
        Hope to see you there,<br>The Cosmico Team
      </p>
    </td></tr>
  </table>
</body>
</html>`;

    const emailRes = await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [email],
      subject: `${displayName === "friend" ? "Your" : displayName + ", your"} 20% off just got extended — last chance`,
      html,
    });

    let smsResult: any = { skipped: true };
    if (simplyTextKey && phone) {
      const cleanPhone = phone.replace(/\D/g, "");
      const smsMessage = displayName !== "friend"
        ? `Hey ${displayName} — we extended your 20% off Cosmico for 48 more hrs. Code: ${code}. We really want you there! https://example.invalid/tickets`
        : `Hey — we extended your 20% off Cosmico for 48 more hrs. Code: ${code}. We really want you there! https://example.invalid/tickets`;

      const smsResp = await fetch("https://api-app2.simpletexting.com/v2/api/messages", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${simplyTextKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contactPhone: cleanPhone,
          text: smsMessage,
          mode: "SINGLE_SMS",
        }),
      });
      smsResult = { status: smsResp.status, body: await smsResp.text() };
    }

    return new Response(JSON.stringify({ success: true, email: emailRes, sms: smsResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[TEST-REENGAGE] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
