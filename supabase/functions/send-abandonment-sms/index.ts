import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Cart abandonment SMS with integrated promo code system.
 * Runs every 30 min via pg_cron.
 *
 * Logic:
 *  1. Find checkout_abandonment rows 2-3 hours old, not converted, no SMS sent
 *  2. Look up phone from promo_codes, registrations, or cart_intent_signals
 *  3. Check if they already have a high-intent promo code → remind them
 *  4. If not → generate a new 20% code (48hr, single-use, non-stackable)
 *  5. Send SMS via SimpleTexting
 */

function generatePromoCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "ANALOG-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function formatCountdown(expiresAt: Date): string {
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return "soon";
  const hours = Math.floor(diff / 3_600_000);
  if (hours > 24) return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) > 1 ? "s" : ""}`;
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("SIMPLYTEXT_API_KEY");

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "SIMPLYTEXT_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  // Find abandoners in the 2-3 hour window
  const { data: abandoners, error: fetchErr } = await supabase
    .from("checkout_abandonment")
    .select("id, email, name, phone")
    .is("converted_at", null)
    .is("sms_sent_at", null)
    .gte("captured_at", threeHoursAgo)
    .lte("captured_at", twoHoursAgo)
    .limit(50);

  if (fetchErr) {
    console.error("Error fetching abandoners:", fetchErr);
    return new Response(
      JSON.stringify({ error: fetchErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let sentCount = 0;
  let codesSent = 0;
  let remindersSent = 0;
  const errors: string[] = [];

  // Run the abandoners loop only if any — the crew-bid pass below always runs.
  const abandonersList = abandoners ?? [];

  for (const abandoner of abandonersList) {
    try {
      const email = abandoner.email.toLowerCase().trim();
      const firstName = abandoner.name?.split(" ")[0] || "";

      // ── Find phone number from multiple sources ──
      let phone: string | null = null;

      // 0. Check the abandonment record itself (captured during checkout)
      if (abandoner.phone) {
        phone = abandoner.phone;
      }

      // 1. Check promo_codes for recipient_phone
      if (!phone) {
        const { data: promos } = await supabase
          .from("promo_codes")
          .select("recipient_phone")
          .eq("recipient_email", email)
          .not("recipient_phone", "is", null)
          .limit(1);

        if (promos?.[0]?.recipient_phone) {
          phone = promos[0].recipient_phone;
        }
      }

      // 2. Check registrations
      if (!phone) {
        const { data: regs } = await supabase
          .from("registrations")
          .select("phone")
          .eq("email", email)
          .not("phone", "is", null)
          .limit(1);
        if (regs?.[0]?.phone) phone = regs[0].phone;
      }

      if (!phone) {
        console.log(`No phone for ${email}, skipping`);
        await supabase
          .from("checkout_abandonment")
          .update({ sms_sent_at: new Date().toISOString() })
          .eq("id", abandoner.id);
        continue;
      }

      const cleanPhone = phone.replace(/\D/g, "");

      // ── Per-phone cooldown: skip if this phone got an abandonment SMS in last 7 days ──
      // Prevents spamming users who abandon checkout under multiple email aliases.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentToPhone } = await supabase
        .from("promo_codes")
        .select("id")
        .eq("recipient_phone", cleanPhone)
        .eq("source", "abandonment_sms")
        .gte("created_at", sevenDaysAgo)
        .limit(1);

      if (recentToPhone && recentToPhone.length > 0) {
        console.log(`Phone ${cleanPhone} already received abandonment SMS in last 7 days, skipping ${email}`);
        await supabase
          .from("checkout_abandonment")
          .update({ sms_sent_at: new Date().toISOString() })
          .eq("id", abandoner.id);
        continue;
      }

      // ── Check for existing active promo code ──
      const { data: existingPromo } = await supabase
        .from("promo_codes")
        .select("code, valid_until")
        .eq("recipient_email", email)
        .eq("is_active", true)
        .gte("valid_until", new Date().toISOString())
        .in("source", ["high_intent_popup", "abandonment_sms"])
        .limit(1);

      let message: string;

      if (existingPromo && existingPromo.length > 0) {
        // ── REMINDER: They already have a code ──
        const code = existingPromo[0].code;
        const expiresIn = formatCountdown(new Date(existingPromo[0].valid_until));

        message = firstName
          ? `Hey ${firstName}! Just a heads up — your 20% off tix code expires in ${expiresIn}:\n\n${code}\n\nUse it before it's gone! https://example.invalid/tickets`
          : `Hey! Your 20% off tix code expires in ${expiresIn}:\n\n${code}\n\nUse it before it's gone! https://example.invalid/tickets`;

        remindersSent++;
      } else {
        // ── NEW CODE: Generate and send a fresh one ──
        const code = generatePromoCode();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

        const { error: insertErr } = await supabase
          .from("promo_codes")
          .insert({
            code,
            description: `Abandonment SMS – ${firstName || email}`,
            discount_type: "percentage",
            discount_value: 20,
            is_active: true,
            is_single_use: true,
            max_uses: 1,
            valid_from: now.toISOString(),
            valid_until: expiresAt.toISOString(),
            source: "abandonment_sms",
            is_stackable: false,
            recipient_email: email,
            recipient_name: firstName || null,
            recipient_phone: cleanPhone,
          });

        if (insertErr) {
          console.error(`Failed to create promo for ${email}:`, insertErr);
          errors.push(`${email}: promo insert failed`);
          continue;
        }

        // Log as lead signal
        const sessionId = `abandonment-sms-${abandoner.id}`;
        await supabase.from("cart_intent_signals").insert({
          session_id: sessionId,
          signal_type: "abandonment_sms_promo",
          email,
          name: firstName || null,
        }).catch(() => {});

        message = firstName
          ? `Hey ${firstName} — we saved you a spot. Here's 20% off tix to Cosmico, just for you:\n\n${code}\n\nGood for 72hrs. We really want you there! https://example.invalid/tickets`
          : `Hey — we saved you a spot. Here's 20% off tix to Cosmico, just for you:\n\n${code}\n\nGood for 72hrs. We really want you there! https://example.invalid/tickets`;

        codesSent++;
      }

      // ── Send via SimpleTexting ──
      const params = new URLSearchParams({
        token: apiKey,
        phone: cleanPhone,
        message,
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

      const smsData = await smsResp.json();
      console.log(`SMS to ${cleanPhone}:`, smsData);

      if (smsData.code === 1 || smsResp.ok) {
        sentCount++;
      } else {
        errors.push(`${email}: ${smsData.message || "SMS failed"}`);
      }

      // Mark SMS sent
      await supabase
        .from("checkout_abandonment")
        .update({ sms_sent_at: new Date().toISOString() })
        .eq("id", abandoner.id);

      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Error processing ${abandoner.email}:`, err);
      errors.push(`${abandoner.email}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // Note: the abandoners loop above already covers ALL ticket types
  // (GA, VIP, Krewe, lodging, add-ons) since `checkout_abandonment` is
  // populated for every checkout regardless of ticket type. One SMS only,
  // gated by `sms_sent_at`. No follow-ups.

  return new Response(
    JSON.stringify({
      sent: sentCount,
      new_codes: codesSent,
      reminders: remindersSent,
      total: abandonersList.length,
      errors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
