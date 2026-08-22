import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, email, name } = await req.json();
    if (!code || !email) {
      return new Response(JSON.stringify({ error: "Missing code or email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const displayName = name || "friend";
    const siteUrl = "https://example.invalid";

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">
        Hey ${displayName} —
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">
        Not everyone gets this. But something tells us you belong at Cosmico.
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 8px;">
        Here's your exclusive hookup:
      </p>
      
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
        <tr><td style="background:#EEF1FF;border-radius:12px;padding:24px;text-align:center;">
          <p style="font-size:11px;color:#AEBDC5;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Your Code</p>
          <p style="font-size:32px;font-weight:600;color:#2F2F2F;letter-spacing:0.05em;margin:0;">${code}</p>
          <p style="font-size:14px;color:#E9835E;font-weight:500;margin:8px 0 0;">20% off tickets · Expires in 72 hours</p>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="text-align:center;">
          <a href="${siteUrl}/tickets" style="display:inline-block;background:#E9835E;color:#ffffff;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-decoration:none;padding:14px 40px;border-radius:8px;">
            Lock It In →
          </a>
        </td></tr>
      </table>

      <p style="font-size:14px;color:#777;line-height:1.5;margin:0 0 20px;">
        Applies to tickets only. One-time use. Cannot be combined with other offers. Clock's ticking.
      </p>

      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0;">
        See you out there,<br>
        The Cosmico Team
      </p>
    </td></tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [email],
      subject: "Your exclusive 20% off tickets — not everyone gets this",
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending high intent promo email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
