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
    const simplyTextKey = Deno.env.get("SIMPLYTEXT_API_KEY");
    const siteUrl = "https://example.invalid";

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const sendSms = body.send_sms !== false; // default true

    // Find all unconverted exit_intent_popup promo codes from last 14 days
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: promos, error: fetchError } = await supabase
      .from("promo_codes")
      .select("id, code, recipient_email, recipient_name, recipient_phone, valid_until, current_uses, reminder_sent_at, second_reminder_sent_at, created_at")
      .eq("source", "exit_intent_popup")
      .eq("is_active", true)
      .eq("current_uses", 0)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    if (fetchError) throw fetchError;

    // Filter out already re-engaged (second_reminder_sent_at set)
    const eligiblePromos = (promos || []).filter(p => !p.second_reminder_sent_at);

    // Also exclude any emails that already purchased
    const emails = eligiblePromos.map(p => p.recipient_email).filter(Boolean);
    const { data: purchasers } = await supabase
      .from("registrations")
      .select("email")
      .in("email", emails)
      .in("payment_status", ["paid", "completed"]);

    const purchasedEmails = new Set((purchasers || []).map(r => r.email.toLowerCase()));

    const leadsToReengage = eligiblePromos.filter(
      p => p.recipient_email && !purchasedEmails.has(p.recipient_email.toLowerCase())
    );

    console.log(`[RE-ENGAGE] Found ${leadsToReengage.length} leads to re-engage (dry_run=${dryRun})`);

    if (dryRun) {
      return new Response(JSON.stringify({
        dry_run: true,
        leads_found: leadsToReengage.length,
        leads: leadsToReengage.map(l => ({
          name: l.recipient_name,
          email: l.recipient_email,
          phone: l.recipient_phone ? "✓" : "✗",
          code: l.code,
          expired: new Date(l.valid_until) < new Date(),
          created: l.created_at,
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailsSent = 0;
    let smsSent = 0;
    let codesExtended = 0;
    const errors: string[] = [];

    const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    for (const promo of leadsToReengage) {
      const displayName = promo.recipient_name || "friend";

      // 1. Extend the promo code expiry by 48 hours from now
      const { error: updateError } = await supabase
        .from("promo_codes")
        .update({
          valid_until: newExpiry,
          second_reminder_sent_at: new Date().toISOString(),
        })
        .eq("id", promo.id);

      if (updateError) {
        errors.push(`Failed to extend code ${promo.code}: ${updateError.message}`);
        continue;
      }
      codesExtended++;

      // 2. Send re-engagement email
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
        We noticed you grabbed a code but haven't locked in your spot yet. We get it — life gets busy.
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">
        So we extended your exclusive 20% off tickets — fresh 24 hours, starting now. After that, it's gone for good.
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 8px;">
        We're one month out. Only a few spots remain out of 700.
      </p>
      
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
        <tr><td style="background:#EEF1FF;border-radius:12px;padding:24px;text-align:center;">
          <p style="font-size:11px;color:#AEBDC5;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Your Code — Extended</p>
          <p style="font-size:32px;font-weight:600;color:#2F2F2F;letter-spacing:0.05em;margin:0;">${promo.code}</p>
          <p style="font-size:14px;color:#E9835E;font-weight:500;margin:8px 0 0;">20% off tickets · Final 24 hours</p>
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
        Hope to see you there,<br>
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
          subject: `${displayName === "friend" ? "Your" : displayName + ", your"} 20% off tickets — fresh 24 hours, last chance`,
          html,
        });
        emailsSent++;
      } catch (emailErr: any) {
        errors.push(`Email failed for ${promo.recipient_email}: ${emailErr.message}`);
      }

      // 3. Send SMS if phone available and SMS enabled
      if (sendSms && simplyTextKey && promo.recipient_phone) {
        const cleanPhone = promo.recipient_phone.replace(/\D/g, "");
        if (cleanPhone.length >= 10) {
          // ── Per-phone cooldown: skip if this phone got any marketing SMS in last 7 days ──
          // Prevents spamming users tied to multiple email aliases (abandonment + re-engage stack).
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: recentAbandon } = await supabase
            .from("promo_codes")
            .select("id")
            .eq("recipient_phone", cleanPhone)
            .eq("source", "abandonment_sms")
            .gte("created_at", sevenDaysAgo)
            .limit(1);
          const { data: recentReengage } = await supabase
            .from("promo_codes")
            .select("id")
            .eq("recipient_phone", cleanPhone)
            .gte("second_reminder_sent_at", sevenDaysAgo)
            .neq("id", promo.id)
            .limit(1);
          if ((recentAbandon && recentAbandon.length > 0) || (recentReengage && recentReengage.length > 0)) {
            console.log(`[RE-ENGAGE] Phone ${cleanPhone} already received SMS in last 7 days, skipping SMS for ${promo.recipient_email}`);
            await new Promise(r => setTimeout(r, 300));
            continue;
          }
          const smsMessage = displayName !== "friend"
            ? `${displayName}, Chris from Analog. Last chance — your 20% off tix code is good for 24 more hrs:\n\n${promo.code}\n\nA month out, hope you're in. https://example.invalid/tickets`
            : `Chris from Analog. Last chance — your 20% off tix code is good for 24 more hrs:\n\n${promo.code}\n\nA month out, hope you're in. https://example.invalid/tickets`;

          try {
            const params = new URLSearchParams({
              token: simplyTextKey,
              phone: cleanPhone,
              message: smsMessage,
            });
            const smsResp = await fetch(
              `https://app2.simpletexting.com/v1/send?${params.toString()}`,
              {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/x-www-form-urlencoded",
                },
              }
            );
            const smsData = await smsResp.json().catch(() => ({}));
            if (smsResp.ok && smsData.code === 1) {
              smsSent++;
            } else {
              errors.push(`SMS failed for ${cleanPhone}: ${smsData.message || smsResp.status}`);
            }
          } catch (smsErr: any) {
            errors.push(`SMS error for ${cleanPhone}: ${smsErr.message}`);
          }

          // Rate limit between SMS sends
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Rate limit between email sends
      await new Promise(r => setTimeout(r, 300));
    }

    const result = {
      success: true,
      summary: {
        total_leads: leadsToReengage.length,
        codes_extended: codesExtended,
        emails_sent: emailsSent,
        sms_sent: smsSent,
        errors_count: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log("[RE-ENGAGE] Complete:", JSON.stringify(result.summary));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[RE-ENGAGE] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
