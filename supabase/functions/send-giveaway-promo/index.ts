import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "WIN";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const siteUrl = "https://example.invalid";
    const normalizedEmail = email.trim().toLowerCase();

    // Check if they already have a promo code from any source
    const { data: existing } = await supabase
      .from("promo_codes")
      .select("id, code")
      .eq("recipient_email", normalizedEmail)
      .eq("is_active", true)
      .eq("current_uses", 0)
      .gte("valid_until", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (existing) {
      // They already have an active unused code — just remind them
      return new Response(JSON.stringify({ status: "existing", code: existing.code }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a unique promo code (7-day window — gives entrants real time to decide)
    const code = generateCode();
    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const displayName = name || "friend";

    const { error: insertError } = await supabase.from("promo_codes").insert({
      code,
      description: "Giveaway entrant 20% off",
      discount_type: "percentage",
      discount_value: 20,
      is_active: true,
      is_single_use: true,
      max_uses: 1,
      current_uses: 0,
      valid_from: new Date().toISOString(),
      valid_until: validUntil,
      source: "giveaway_bridge",
      recipient_email: normalizedEmail,
      recipient_name: displayName,
    });

    if (insertError) throw insertError;

    // Send the promo email
    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">
        ${displayName === "friend" ? "Hey —" : `Hey ${displayName} —`}
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 20px;">
        You're in for the giveaway. Winner gets announced soon.
      </p>
      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0 0 24px;">
        In the meantime — we're capping at 700 people, and tiers are moving. If you don't want to leave it to chance, here's 20% off. Same code works whether you win or not (we'll refund the difference).
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
        <tr><td style="background:#EEF1FF;border-radius:12px;padding:24px;text-align:center;">
          <p style="font-size:11px;color:#AEBDC5;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Your code</p>
          <p style="font-size:32px;font-weight:600;color:#2F2F2F;letter-spacing:0.05em;margin:0;">${code}</p>
          <p style="font-size:13px;color:#7A8A92;margin:8px 0 0;">Good for 7 days</p>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr><td style="text-align:center;">
          <a href="${siteUrl}/tickets" style="display:inline-block;background:#E9835E;color:#ffffff;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;text-decoration:none;padding:14px 40px;border-radius:8px;">
            Lock in your spot →
          </a>
        </td></tr>
      </table>

      <p style="font-size:16px;color:#2F2F2F;line-height:1.6;margin:0;">
        Either way, hope to see you there.<br>
        The Cosmico Team
      </p>
    </td></tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: "The Cosmico Team <hello@example.invalid>",
      to: [normalizedEmail],
      subject: `You're in — and here's 20% off if you don't want to wait`,
      html,
    });

    return new Response(JSON.stringify({ status: "sent", code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[GIVEAWAY-PROMO] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
