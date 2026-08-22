import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") !== "false"; // default TRUE
    const inventoryFilter = url.searchParams.get("inventory_id"); // optional filter

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Auth: accept (a) service role key, (b) anon key (cron-internal), or (c) authenticated admin user
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    let authorized = false;

    if (bearer && (bearer === serviceKey || bearer === anonKey)) {
      authorized = true;
    } else if (bearer) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        anonKey
      );
      const { data: { user } } = await supabaseAuth.auth.getUser(bearer);
      if (user) {
        const { data: isAdmin } = await supabaseClient.rpc("has_role", {
          _user_id: user.id,
          _role: "admin",
        });
        if (isAdmin) authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    let query = supabaseClient
      .from("addon_purchases")
      .select("id, stripe_session_id, inventory_id, quantity, total_amount, purchase_type, payment_status, purchaser_email, created_at")
      .eq("payment_status", "pending")
      .not("stripe_session_id", "is", null);

    if (inventoryFilter) query = query.eq("inventory_id", inventoryFilter);

    const { data: pending, error: fetchError } = await query;
    if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);

    const sessionMap = new Map<string, any[]>();
    for (const row of pending || []) {
      const arr = sessionMap.get(row.stripe_session_id) || [];
      arr.push(row);
      sessionMap.set(row.stripe_session_id, arr);
    }

    const stripe2 = stripe; // alias for clarity below
    const results = {
      dryRun,
      sessionsChecked: 0,
      sessionsPaid: 0,
      sessionsUnpaid: 0,
      sessionsExpired: 0,
      sessionsFailed: 0,
      sessionsErrored: 0,
      rowsThatWouldUpdate: 0,
      qtyThatWouldUpdate: 0,
      revenueThatWouldUpdate: 0,
      rowsActuallyUpdated: 0,
      rowsMarkedExpired: 0,
      rowsMarkedFailed: 0,
      details: [] as any[],
    };

    for (const [sessionId, rows] of sessionMap.entries()) {
      results.sessionsChecked++;
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const sessionStatus = (session as any).status as string | undefined; // 'open' | 'complete' | 'expired'
        let pi: any = null;
        if (typeof session.payment_intent === "string") {
          try { pi = await stripe2.paymentIntents.retrieve(session.payment_intent); } catch (_) {}
        } else if (session.payment_intent) {
          pi = session.payment_intent;
        }
        const piStatus = pi?.status as string | undefined;

        const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
        const totalRev = rows.reduce((s, r) => s + r.total_amount, 0);
        const detail: any = {
          sessionId,
          email: rows[0].purchaser_email,
          createdAt: rows[0].created_at,
          stripeStatus: session.status,
          stripePaymentStatus: session.payment_status,
          stripeAmountTotal: session.amount_total,
          piStatus,
          rows: rows.length,
          qty: totalQty,
          revenueCents: totalRev,
        };

        if (session.payment_status === "paid") {
          results.sessionsPaid++;
          results.rowsThatWouldUpdate += rows.length;
          results.qtyThatWouldUpdate += totalQty;
          results.revenueThatWouldUpdate += totalRev;
          detail.action = dryRun ? "WOULD_MARK_PAID" : "MARKED_PAID";

          if (!dryRun) {
            const { error: updErr } = await supabaseClient
              .from("addon_purchases")
              .update({ payment_status: "paid" })
              .eq("stripe_session_id", sessionId)
              .eq("payment_status", "pending");
            if (updErr) {
              detail.action = "UPDATE_FAILED";
              detail.error = updErr.message;
              results.sessionsErrored++;
            } else {
              results.rowsActuallyUpdated += rows.length;
              for (const r of rows) {
                const tableName = r.purchase_type === "lodging" ? "lodging_inventory" : "addon_inventory";
                const { data: inv } = await supabaseClient
                  .from(tableName)
                  .select("sold_quantity")
                  .eq("id", r.inventory_id)
                  .single();
                if (inv) {
                  await supabaseClient
                    .from(tableName)
                    .update({ sold_quantity: (inv.sold_quantity || 0) + r.quantity })
                    .eq("id", r.inventory_id);
                }
              }
            }
          }
        } else if (sessionStatus === "expired" || piStatus === "canceled") {
          results.sessionsExpired++;
          detail.action = dryRun ? "WOULD_MARK_EXPIRED" : "MARKED_EXPIRED";
          if (!dryRun) {
            const { error: updErr, count } = await supabaseClient
              .from("addon_purchases")
              .update({ payment_status: "expired" }, { count: "exact" })
              .eq("stripe_session_id", sessionId)
              .eq("payment_status", "pending");
            if (updErr) { detail.error = updErr.message; results.sessionsErrored++; }
            else { results.rowsMarkedExpired += count ?? rows.length; }
          }
        } else if (piStatus === "requires_payment_method" && pi?.last_payment_error) {
          results.sessionsFailed++;
          detail.action = dryRun ? "WOULD_MARK_FAILED" : "MARKED_FAILED";
          detail.lastPaymentError = pi.last_payment_error?.message;
          if (!dryRun) {
            const { error: updErr, count } = await supabaseClient
              .from("addon_purchases")
              .update({ payment_status: "failed" }, { count: "exact" })
              .eq("stripe_session_id", sessionId)
              .eq("payment_status", "pending");
            if (updErr) { detail.error = updErr.message; results.sessionsErrored++; }
            else { results.rowsMarkedFailed += count ?? rows.length; }
          }
        } else {
          results.sessionsUnpaid++;
          detail.action = "SKIP_UNPAID";
        }

        results.details.push(detail);
      } catch (e: any) {
        results.sessionsErrored++;
        results.details.push({ sessionId, error: e.message, action: "STRIPE_ERROR" });
      }
    }

    results.details.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

    return new Response(JSON.stringify({ success: true, ...results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[verify-pending-addons] Error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
