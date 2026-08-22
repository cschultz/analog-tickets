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
    console.log("[verify-pending] Starting batch verification");

    // Create Supabase client with anon key for auth verification
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Multi-channel auth: service role, anon (cron), or authenticated admin
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

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

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }

    // Optional dry-run
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
    } catch (_) { /* no body */ }

    console.log(`[verify-pending] Authorized as ${actor}, dryRun=${dryRun}`);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get all pending registrations with session IDs
    const { data: pendingRegistrations, error: fetchError } = await supabaseClient
      .from("registrations")
      .select("*")
      .eq("payment_status", "pending")
      .not("stripe_session_id", "is", null)
      .order("created_at", { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch registrations: ${fetchError.message}`);
    }

    console.log(`[verify-pending] Found ${pendingRegistrations?.length || 0} pending registrations`);

    const results = {
      verified: [] as any[],
      failed: [] as string[],
      notPaid: [] as any[],
    };

    for (const registration of pendingRegistrations || []) {
      try {
        const session = await stripe.checkout.sessions.retrieve(registration.stripe_session_id);
        const detail = {
          id: registration.id,
          email: registration.email,
          name: registration.name,
          ticket_type: registration.ticket_type,
          quantity: registration.quantity,
          amount: registration.total_amount,
          stripe_status: session.payment_status,
        };

        // Determine session-derived terminal status
        const sessionStatus = (session as any).status as string | undefined; // 'open' | 'complete' | 'expired'
        let pi: any = null;
        if (typeof session.payment_intent === "string") {
          try { pi = await stripe.paymentIntents.retrieve(session.payment_intent); } catch (_) {}
        } else if (session.payment_intent) {
          pi = session.payment_intent;
        }
        const piStatus = pi?.status as string | undefined; // 'requires_payment_method' | 'canceled' | 'succeeded' | etc.

        if (session.payment_status === "paid") {
          if (dryRun) {
            results.verified.push({ ...detail, action: "WOULD_MARK_PAID" });
            continue;
          }

          const { error: updateError } = await supabaseClient
            .from("registrations")
            .update({ payment_status: "paid" })
            .eq("id", registration.id);

          if (updateError) { results.failed.push(registration.id); continue; }

          await supabaseClient.rpc("reserve_tickets", {
            p_ticket_type: registration.ticket_type,
            p_quantity: registration.quantity
          });

          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-ticket-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
            body: JSON.stringify({ registrationId: registration.id }),
          }).catch(err => console.error("Error sending email:", err));

          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-admin-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
            body: JSON.stringify({ registrationId: registration.id }),
          }).catch(err => console.error("Error sending admin notification:", err));

          results.verified.push({ ...detail, action: "MARKED_PAID" });
        } else if (sessionStatus === "expired" || piStatus === "canceled") {
          // Stripe session expired or payment intent canceled — abandoned
          if (!dryRun) {
            await supabaseClient
              .from("registrations")
              .update({ payment_status: "expired" })
              .eq("id", registration.id);
          }
          results.notPaid.push({ ...detail, action: dryRun ? "WOULD_MARK_EXPIRED" : "MARKED_EXPIRED", session_status: sessionStatus, pi_status: piStatus });
        } else if (piStatus && ["requires_payment_method"].includes(piStatus) && pi?.last_payment_error) {
          // Card declined / payment failed
          if (!dryRun) {
            await supabaseClient
              .from("registrations")
              .update({ payment_status: "failed" })
              .eq("id", registration.id);
          }
          results.notPaid.push({ ...detail, action: dryRun ? "WOULD_MARK_FAILED" : "MARKED_FAILED", session_status: sessionStatus, pi_status: piStatus });
        } else {
          // Still open / in-flight
          results.notPaid.push({ ...detail, session_status: sessionStatus, pi_status: piStatus });
        }
      } catch (error: any) {
        console.error(`[verify-pending] Error processing ${registration.id}:`, error.message);
        results.failed.push(registration.id);
      }
    }

    console.log(`[verify-pending] Results:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        total: pendingRegistrations?.length || 0,
        verified: results.verified.length,
        failed: results.failed.length,
        notPaid: results.notPaid.length,
        details: results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[verify-pending] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
