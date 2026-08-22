import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const supabaseClient = createClient(supabaseUrl, serviceKey);

    let authorized = false;
    let actor = "cron";
    if (bearer && (bearer === serviceKey || bearer === anonKey)) {
      authorized = true;
    } else if (bearer) {
      const { data: { user } } = await supabaseAuth.auth.getUser(bearer);
      if (user) {
        const { data: isAdmin } = await supabaseClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (isAdmin) { authorized = true; actor = user.email ?? "admin"; }
      }
    }
    if (!authorized) return new Response(JSON.stringify({ error: "Unauthorized" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });

    let dryRun = false;
    try { const body = await req.json(); dryRun = body?.dryRun === true; } catch (_) {}

    console.log(`[verify-upgrades] actor=${actor} dryRun=${dryRun}`);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    // Look back up to 30 days for stale pending/invited upgrade offers with a Stripe session
    const { data: pending } = await supabaseClient
      .from("upgrade_offers")
      .select("id, status, stripe_session_id, total_amount, upgrade_from, upgrade_to, created_at")
      .in("status", ["pending", "invited"])
      .not("stripe_session_id", "is", null);

    const results = { finalized: [] as any[], notPaid: [] as any[], failed: [] as any[] };

    for (const o of pending || []) {
      try {
        const session = await stripe.checkout.sessions.retrieve(o.stripe_session_id);
        const detail = {
          id: o.id,
          upgrade: `${o.upgrade_from} → ${o.upgrade_to}`,
          amount: o.total_amount,
          stripe_status: session.payment_status,
          age_days: Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000),
        };

        if (session.payment_status === "paid") {
          if (dryRun) { results.finalized.push({ ...detail, action: "WOULD_FINALIZE" }); continue; }

          // Delegate to the existing finalizer to keep one source of truth (tickets, inventory, email)
          const { data: finalize, error: fnErr } = await supabaseClient.functions.invoke("process-upgrade-payment", {
            body: { sessionId: o.stripe_session_id },
          });
          if (fnErr) {
            console.error(`[verify-upgrades] finalize error ${o.id}:`, fnErr);
            results.failed.push({ ...detail, error: fnErr.message });
            continue;
          }
          results.finalized.push({ ...detail, action: "FINALIZED", result: finalize });
        } else {
          results.notPaid.push(detail);
        }
      } catch (e: any) {
        console.error(`[verify-upgrades] error ${o.id}:`, e.message);
        results.failed.push({ id: o.id, error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, total: pending?.length || 0, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
