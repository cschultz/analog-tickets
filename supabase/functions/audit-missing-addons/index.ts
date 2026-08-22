// Daily audit: for each paid registration, fetch the Stripe checkout session line items
// and detect addons that were paid for but never inserted into addon_purchases.
// Writes findings to addon_audit_discrepancies for admin review.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

  const body = await req.json().catch(() => ({}));
  const sessionIds: string[] = Array.isArray(body?.sessionIds) ? body.sessionIds : [];
  const lookbackDays: number = Number.isFinite(body?.lookbackDays) ? body.lookbackDays : 7;
  const persist: boolean = body?.persist !== false; // default true
  const auditRunId = crypto.randomUUID();

  let ids: string[] = sessionIds;
  if (ids.length === 0) {
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("registrations")
      .select("stripe_session_id")
      .eq("payment_status", "paid")
      .not("stripe_session_id", "is", null)
      .gte("created_at", since)
      .limit(5000);
    ids = (data || []).map((r: any) => r.stripe_session_id).filter(Boolean);
  }

  const results: any[] = [];
  const toLog: any[] = [];

  for (const sid of ids) {
    if (!sid || !sid.startsWith("cs_")) continue;
    try {
      const items = await stripe.checkout.sessions.listLineItems(sid, { limit: 100 });
      const lines = items.data.map((li) => ({
        description: li.description,
        amount: li.amount_total,
        quantity: li.quantity,
      }));
      const addonish = lines.filter((l) => {
        const d = (l.description || "").toLowerCase();
        if (!d) return false;
        if (d.includes("service fee") || d.includes("processing")) return false;
        if (d.includes("donation")) return false;
        if (d.includes("ticket") || d.includes("vip") || d.includes("ga ") || d.includes("krewe") || d.includes("party only") || d.includes("youth") || d.includes("child") || d.includes("weekend") || d.includes("3 day") || d.includes("3-day") || d.includes("2 day") || d.includes("2-day") || d.includes("friday") || d.includes("saturday") || d.includes("early bird") || d.includes("patron")) return false;
        return true;
      });
      if (addonish.length > 0) {
        const { data: reg } = await supabase
          .from("registrations")
          .select("id,name,email,order_number,total_amount,ticket_type")
          .eq("stripe_session_id", sid)
          .maybeSingle();
        const { data: aps } = await supabase
          .from("addon_purchases")
          .select("id,total_amount")
          .eq("stripe_session_id", sid);
        const existing = aps?.length || 0;
        const missing = existing === 0;
        const result = {
          session_id: sid,
          registration: reg,
          addonish_lines: addonish,
          existing_addon_rows: existing,
          missing,
        };
        results.push(result);
        if (missing) {
          toLog.push({
            audit_run_id: auditRunId,
            stripe_session_id: sid,
            registration_id: reg?.id ?? null,
            order_number: reg?.order_number ?? null,
            customer_email: reg?.email ?? null,
            customer_name: reg?.name ?? null,
            addonish_lines: addonish,
            existing_addon_rows: existing,
            missing: true,
          });
        }
      }
    } catch (err: any) {
      results.push({ session_id: sid, error: err.message });
    }
  }

  if (persist && toLog.length > 0) {
    const { error: insErr } = await supabase.from("addon_audit_discrepancies").insert(toLog);
    if (insErr) console.error("Failed to log discrepancies:", insErr);

    // Notify admins
    await supabase.from("admin_notifications").insert({
      type: "addon_audit_discrepancy",
      title: "Addon Audit Found Missing Records",
      message: `${toLog.length} paid order(s) have Stripe addon line items missing from addon_purchases. Review required.`,
      metadata: { audit_run_id: auditRunId, missing_count: toLog.length },
    });
  }

  return new Response(JSON.stringify({
    audit_run_id: auditRunId,
    sessions_checked: ids.length,
    discrepancies_found: results.length,
    missing_logged: toLog.length,
    results,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
