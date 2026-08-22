import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { corsHeaders, escapeHtml, getFirstName } from "../_shared/email-template.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email } = await req.json();

    if (!name || !email) {
      return new Response(
        JSON.stringify({ error: "Name and email are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const firstName = getFirstName(name);
    const safeName = escapeHtml(firstName);

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#E5E0D3;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#E5E0D3;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">
        
        <!-- Header -->
        <tr><td style="padding:32px 0;text-align:center;">
          <h1 style="margin:0;font-size:28px;color:#2C2F2F;font-weight:normal;">You're in, ${safeName}.</h1>
        </td></tr>
        
        <!-- Body -->
        <tr><td style="padding:0 0 24px;color:#2C2F2F;font-size:16px;line-height:1.7;">
          <p style="margin:0 0 16px;">We're looking forward to seeing you at <strong>Analog Sessions × h2hotel</strong> in Healdsburg.</p>
          
          <table width="100%" cellpadding="16" cellspacing="0" style="background-color:#2C2F2F;margin:24px 0;">
            <tr><td style="color:#E5E0D3;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 12px;color:#80BDBC;text-transform:uppercase;font-size:12px;letter-spacing:2px;">Friday, March 6 · 5:30 pm</p>
              <p style="margin:0 0 16px;">Welcome evening with DJ Timoteo Giganté<br/>h2hotel Lounge</p>
              
              <p style="margin:0 0 12px;color:#80BDBC;text-transform:uppercase;font-size:12px;letter-spacing:2px;">Saturday, March 7 · 10:30 am</p>
              <p style="margin:0;">Analog Reading + Healdsburg Community Panel<br/>h2hotel Green Room</p>
            </td></tr>
          </table>

          <p style="margin:0 0 16px;">Both events are free. We'll send more details as we get closer.</p>
          
          <p style="margin:0 0 8px;color:#2C2F2F;font-size:14px;">
            Planning to stay the weekend? Both Hotel Healdsburg &amp; h2hotel are offering <strong>20% off</strong> for Analog Sessions attendees.
          </p>
          <p style="margin:0 0 16px;color:#2C2F2F;font-size:14px;">
            Use code <strong>ANALOG</strong> when booking.
          </p>
          <p style="margin:0 0 16px;font-size:14px;">
            <a href="https://be.synxis.com/?Hotel=80244&Chain=17448&arrive=2026-03-06&depart=2026-03-08&adult=2&child=0&promo=ANALOG" style="color:#2C2F2F;">h2hotel →</a>
            &nbsp;&nbsp;·&nbsp;&nbsp;
            <a href="https://be.synxis.com/?Hotel=79927&Chain=5154&arrive=2026-03-06&depart=2026-03-08&adult=2&child=0&promo=ANALOG" style="color:#2C2F2F;">Hotel Healdsburg →</a>
          </p>
        </td></tr>
        
        <!-- Footer -->
        <tr><td style="padding:24px 0;border-top:1px solid #2C2F2F20;text-align:center;color:#2C2F2F;opacity:0.5;font-size:12px;">
          Analog Sessions × h2hotel · March 6–7 · Healdsburg, CA
        </td></tr>
        
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailResult = await resend.emails.send({
      from: "Analog <hello@example.invalid>",
      to: [email],
      subject: `You're in, ${safeName} — Analog Sessions × h2hotel`,
      html,
    });

    console.log("[send-session-rsvp-confirmation] Email sent:", emailResult);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[send-session-rsvp-confirmation] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
