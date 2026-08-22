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

    console.log(`[verify-lodging] actor=${actor} dryRun=${dryRun}`);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    const { data: pending } = await supabaseClient
      .from("lodging_bookings")
      .select("*")
      .eq("payment_status", "pending")
      .not("stripe_session_id", "is", null);

    const results = { verified: [] as any[], notPaid: [] as any[], failed: [] as string[] };

    for (const b of pending || []) {
      try {
        const session = await stripe.checkout.sessions.retrieve(b.stripe_session_id);
        const sessionStatus = (session as any).status as string | undefined;
        let pi: any = null;
        if (typeof session.payment_intent === "string") {
          try { pi = await stripe.paymentIntents.retrieve(session.payment_intent); } catch (_) {}
        }
        const piStatus = pi?.status as string | undefined;
        const detail = { id: b.id, email: b.email, zone_key: b.zone_key, quantity: b.quantity, amount: b.total_amount, stripe_status: session.payment_status, session_status: sessionStatus, pi_status: piStatus };

        if (session.payment_status === "paid") {
          if (dryRun) { results.verified.push({ ...detail, action: "WOULD_MARK_PAID" }); continue; }
          const { error: upErr } = await supabaseClient.from("lodging_bookings").update({ payment_status: "paid" }).eq("id", b.id);
          if (upErr) { results.failed.push(b.id); continue; }
          // decrement zone inventory
          await supabaseClient.rpc("decrement_zone_inventory", { p_zone_key: b.zone_key, p_quantity: b.quantity });
          results.verified.push({ ...detail, action: "MARKED_PAID" });
        } else if (sessionStatus === "expired" || piStatus === "canceled") {
          if (!dryRun) {
            await supabaseClient.from("lodging_bookings").update({ payment_status: "expired" }).eq("id", b.id);
            // Release any held unit
            if (b.assigned_unit_id) {
              await supabaseClient
                .from("accommodation_units")
                .update({ inventory_status: "available" })
                .eq("id", b.assigned_unit_id)
                .in("inventory_status", ["pending_offer", "reserved"]);
            }
          }
          results.notPaid.push({ ...detail, action: dryRun ? "WOULD_MARK_EXPIRED" : "MARKED_EXPIRED" });
        } else if (piStatus === "requires_payment_method" && pi?.last_payment_error) {
          if (!dryRun) {
            await supabaseClient.from("lodging_bookings").update({ payment_status: "failed" }).eq("id", b.id);
          }
          results.notPaid.push({ ...detail, action: dryRun ? "WOULD_MARK_FAILED" : "MARKED_FAILED" });
        } else {
          results.notPaid.push(detail);
        }
      } catch (e: any) {
        console.error(`[verify-lodging] error ${b.id}:`, e.message);
        results.failed.push(b.id);
      }
    }

    return new Response(JSON.stringify({ success: true, total: pending?.length || 0, ...results }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
