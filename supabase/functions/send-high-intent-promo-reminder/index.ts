import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const siteUrl = "https://example.invalid";

    // Find codes created 46-50 hours ago (≈24hrs before 72hr expiry) that haven't been used and haven't been reminded
    const now = new Date();
    const windowStart = new Date(now.getTime() - 50 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() - 46 * 60 * 60 * 1000);

    const { data: codes, error: fetchError } = await supabase
      .from("promo_codes")
      .select("id, code, recipient_email, recipient_name, valid_until")
      .in("source", ["high_intent_popup", "exit_intent_popup", "abandonment_sms"])
      .eq("is_active", true)
      .eq("current_uses", 0)
      .is("reminder_sent_at", null)
      .gte("created_at", windowStart.toISOString())
      .lte("created_at", windowEnd.toISOString())
      .gte("valid_until", now.toISOString());

    if (fetchError) throw fetchError;

    console.log(`[PROMO-REMINDER] Found ${codes?.length || 0} codes to remind`);

    let sent = 0;
    for (const promo of codes || []) {
      const displayName = promo.recipient_name || "friend";

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
        Your exclusive 20% off tickets to Cosmico runs out in 24 hours. We saved you a spot, but the clock's ticking.
      </p>
      
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
        <tr><td style="background:#EEF1FF;border-radius:12px;padding:24px;text-align:center;">
          <p style="font-size:11px;color:#AEBDC5;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Your Code</p>
          <p style="font-size:32px;font-weight:600;color:#2F2F2F;letter-spacing:0.05em;margin:0;">${promo.code}</p>
          <p style="font-size:14px;color:#E9835E;font-weight:500;margin:8px 0 0;">Expires tomorrow</p>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="text-align:center;">
          <a href="${siteUrl}/tickets" style="display:inline-block;background:#E9835E;color:#ffffff;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-decoration:none;padding:14px 40px;border-radius:8px;">
            Lock It In →
          </a>
        </td></tr>
      </table>

      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0;">
        See you out there,<br>
        The Cosmico Team
      </p>
    </td></tr>
  </table>
</body>
</html>`;

      try {
        await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [promo.recipient_email],
          subject: "Your hookup expires tomorrow",
          html,
        });

        await supabase
          .from("promo_codes")
          .update({ reminder_sent_at: now.toISOString() })
          .eq("id", promo.id);

        sent++;
        // Rate limit
        await new Promise((r) => setTimeout(r, 550));
      } catch (emailErr) {
        console.error(`[PROMO-REMINDER] Failed to send to ${promo.recipient_email}:`, emailErr);
      }
    }

    return new Response(JSON.stringify({ sent, total: codes?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[PROMO-REMINDER] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
