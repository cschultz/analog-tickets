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

    // Find codes created 64-68 hours ago (≈4-8hrs before 72hr expiry), already got first reminder, still unused
    const now = new Date();
    const windowStart = new Date(now.getTime() - 68 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() - 64 * 60 * 60 * 1000);

    const { data: codes, error: fetchError } = await supabase
      .from("promo_codes")
      .select("id, code, recipient_email, recipient_name, valid_until")
      .in("source", ["high_intent_popup", "exit_intent_popup", "abandonment_sms"])
      .eq("is_active", true)
      .eq("current_uses", 0)
      .not("reminder_sent_at", "is", null)
      .is("second_reminder_sent_at", null)
      .gte("created_at", windowStart.toISOString())
      .lte("created_at", windowEnd.toISOString())
      .gte("valid_until", now.toISOString());

    if (fetchError) throw fetchError;

    console.log(`[PROMO-FINAL] Found ${codes?.length || 0} codes for final nudge`);

    let sent = 0;
    for (const promo of codes || []) {
      const displayName = promo.recipient_name || "friend";
      const expiresAt = new Date(promo.valid_until);
      const hoursLeft = Math.max(1, Math.round((expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000)));

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
        Last call. Your 20% off tickets expires in about ${hoursLeft} hours and we can't hold it after that.
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">
        Tier 2 pricing won't last forever either — once it's gone, prices go up.
      </p>
      
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
        <tr><td style="background:#FFF8F5;border:2px solid #E9835E;border-radius:12px;padding:24px;text-align:center;">
          <p style="font-size:11px;color:#AEBDC5;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Your Code</p>
          <p style="font-size:32px;font-weight:600;color:#2F2F2F;letter-spacing:0.05em;margin:0;">${promo.code}</p>
          <p style="font-size:14px;color:#E9835E;font-weight:600;margin:8px 0 0;">⏳ ~${hoursLeft} hours left</p>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="text-align:center;">
          <a href="${siteUrl}/tickets" style="display:inline-block;background:#E9835E;color:#ffffff;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-decoration:none;padding:14px 40px;border-radius:8px;">
            Use It Before It's Gone →
          </a>
        </td></tr>
      </table>

      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0;">
        No pressure — just didn't want you to miss it,<br>
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
          subject: `⏳ ${hoursLeft}hrs left on your 20% off tickets`,
          html,
        });

        await supabase
          .from("promo_codes")
          .update({ second_reminder_sent_at: now.toISOString() })
          .eq("id", promo.id);

        sent++;
        await new Promise((r) => setTimeout(r, 550));
      } catch (emailErr) {
        console.error(`[PROMO-FINAL] Failed to send to ${promo.recipient_email}:`, emailErr);
      }
    }

    return new Response(JSON.stringify({ sent, total: codes?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[PROMO-FINAL] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
