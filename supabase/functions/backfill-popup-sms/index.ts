import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendSmsV2 } from "../_shared/sms-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const testPhone: string | undefined = body.test_phone;

    const { data: promos, error } = await supabase
      .from("promo_codes")
      .select("id, code, recipient_email, recipient_name, recipient_phone, valid_until, current_uses, created_at")
      .eq("source", "exit_intent_popup")
      .eq("is_active", true)
      .eq("current_uses", 0)
      .not("recipient_phone", "is", null)
      .gte("created_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;

    const emails = (promos || []).map(p => p.recipient_email).filter(Boolean) as string[];
    const { data: purchasers } = await supabase
      .from("registrations")
      .select("email")
      .in("email", emails)
      .in("payment_status", ["paid", "completed"]);
    const purchased = new Set((purchasers || []).map(r => r.email.toLowerCase()));

    let leads = (promos || []).filter(p => p.recipient_email && !purchased.has(p.recipient_email.toLowerCase()));

    if (testPhone) {
      const clean = testPhone.replace(/\D/g, "");
      leads = leads.filter(p => p.recipient_phone?.replace(/\D/g, "") === clean).slice(0, 1);
      if (leads.length === 0 && (promos || []).length > 0) {
        const sample = promos![0];
        leads = [{ ...sample, recipient_phone: testPhone, recipient_name: "Chris" }];
      }
    }

    console.log(`[BACKFILL-SMS] ${leads.length} leads | dry_run=${dryRun} | test=${testPhone || "none"}`);

    if (dryRun) {
      return new Response(JSON.stringify({
        dry_run: true,
        count: leads.length,
        sample: leads.slice(0, 5).map(l => ({ name: l.recipient_name, phone: l.recipient_phone, code: l.code })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    let sent = 0, failed = 0, extended = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      const cleanPhone = (lead.recipient_phone || "").replace(/\D/g, "");
      if (cleanPhone.length < 10) { failed++; errors.push(`Bad phone: ${lead.recipient_phone}`); continue; }

      if (!testPhone || leads[0].id === lead.id) {
        const { error: upErr } = await supabase
          .from("promo_codes")
          .update({ valid_until: newExpiry, second_reminder_sent_at: new Date().toISOString() })
          .eq("id", lead.id);
        if (!upErr) extended++;
      }

      const firstName = (lead.recipient_name || "").trim().split(/\s+/)[0];
      const message = firstName
        ? `${firstName}, Chris from Analog. We never texted your 20% off tix code — sorry. Fresh for 48hrs:\n\n${lead.code}\n\nA month out, hope you're in. https://example.invalid/tickets`
        : `Chris from Analog. We never texted your 20% off tix code — sorry. Fresh for 48hrs:\n\n${lead.code}\n\nA month out, hope you're in. https://example.invalid/tickets`;

      const result = await sendSmsV2({
        phone: cleanPhone,
        message,
        source: "backfill-popup-sms",
        relatedEmail: lead.recipient_email ?? undefined,
        relatedPromoCode: lead.code,
      });
      console.log(`[BACKFILL-SMS] ${cleanPhone} (${lead.code}): ok=${result.ok} msgId=${result.messageId} err=${result.error}`);
      if (result.ok) sent++;
      else { failed++; errors.push(`${cleanPhone}: ${result.error}`); }

      await new Promise(r => setTimeout(r, 600));
    }

    const summary = { total: leads.length, sent, failed, codes_extended: extended };
    console.log("[BACKFILL-SMS] Done:", JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, summary, errors: errors.slice(0, 10) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[BACKFILL-SMS] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
