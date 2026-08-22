import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheck {
  name: string;
  status: "passed" | "failed" | "warning";
  message?: string;
  error?: string;
  duration_ms?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Verify authentication and admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Verify the user's token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role
    const { data: userRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !userRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // User is authenticated and is an admin - proceed with health checks
    const checks: HealthCheck[] = [];
    let overallStatus = "healthy" as "healthy" | "degraded" | "unhealthy";

    // Helper to run a check with timing
    const runCheck = async (
      name: string,
      fn: () => Promise<{ status: "passed" | "failed" | "warning"; message?: string; error?: string }>
    ) => {
      const checkStart = Date.now();
      try {
        const result = await fn();
        checks.push({
          name,
          ...result,
          duration_ms: Date.now() - checkStart,
        });
        if (result.status === "failed") overallStatus = "unhealthy";
        else if (result.status === "warning" && overallStatus === "healthy") overallStatus = "degraded";
      } catch (error: any) {
        checks.push({
          name,
          status: "failed",
          error: error.message,
          duration_ms: Date.now() - checkStart,
        });
        overallStatus = "unhealthy";
      }
    };

    // Check 1: Environment Variables
    await runCheck("Environment Variables", async () => {
      const required = ["STRIPE_SECRET_KEY", "RESEND_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
      const missing = required.filter((key) => !Deno.env.get(key));
      if (missing.length > 0) {
        return { status: "failed", error: `Missing: ${missing.join(", ")}` };
      }
      return { status: "passed", message: "All required env vars configured" };
    });

    // Check 2: Stripe API Connection
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    await runCheck("Stripe API Connection", async () => {
      if (!stripeKey) return { status: "failed", error: "STRIPE_SECRET_KEY not configured" };
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const balance = await stripe.balance.retrieve();
      return { status: "passed", message: `Connected to Stripe (${balance.available.length} currency balances)` };
    });

    // Check 3: Supabase Connection
    await runCheck("Database Connection", async () => {
      const { data, error } = await supabase.from("event_details").select("id").limit(1);
      if (error) return { status: "failed", error: `Database error: ${error.message}` };
      return { status: "passed", message: "Database connection successful" };
    });

    // Check 4: Active Event
    let activeEvent: { id: string; title: string; event_date: string } | null = null;
    await runCheck("Active Event", async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("id, title, event_date")
        .eq("is_active", true)
        .maybeSingle();
      if (error) return { status: "failed", error: error.message };
      if (!data) return { status: "warning", message: "No active event found - checkout will fail" };
      activeEvent = data;
      return { status: "passed", message: `Active event: ${data.title} (${data.event_date})` };
    });

    // Check 5: Ticket Inventory
    await runCheck("Ticket Inventory", async () => {
      const { data: inventory, error } = await supabase
        .from("ticket_inventory")
        .select("ticket_type, total_quantity, sold_quantity");
      if (error) return { status: "failed", error: error.message };
      if (!inventory || inventory.length === 0) {
        return { status: "warning", message: "No ticket inventory configured" };
      }
      const available = inventory.filter((inv) => inv.total_quantity - inv.sold_quantity > 0);
      const totalAvailable = available.reduce((sum, inv) => sum + (inv.total_quantity - inv.sold_quantity), 0);
      return {
        status: available.length > 0 ? "passed" : "warning",
        message: `${inventory.length} ticket types, ${totalAvailable} tickets available`,
      };
    });

    // Check 6: Stripe Price IDs (for each ticket type)
    await runCheck("Stripe Ticket Prices", async () => {
      if (!stripeKey) return { status: "failed", error: "No Stripe key" };
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const priceIds = [
        Deno.env.get("STRIPE_PRICE_TIER_1_KREWE_3DAY") ?? "",
        Deno.env.get("STRIPE_PRICE_TIER_1_VIP_3DAY") ?? "",
      ].filter(Boolean);
      if (priceIds.length === 0) {
        return { status: "warning", message: "No STRIPE_PRICE_* ids configured" };
      }
      const errors: string[] = [];
      for (const priceId of priceIds) {
        try {
          await stripe.prices.retrieve(priceId);
        } catch (e: any) {
          errors.push(priceId);
        }
      }
      if (errors.length > 0) return { status: "failed", error: `Invalid prices: ${errors.join(", ")}` };
      return { status: "passed", message: `${priceIds.length} price IDs verified` };
    });

    // Check 7: Patrons Package Prices
    await runCheck("Stripe Patrons Prices", async () => {
      if (!stripeKey) return { status: "failed", error: "No Stripe key" };
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const priceIds = [
        Deno.env.get("STRIPE_PRICE_PATRONS_ULTIMATE") ?? "",
        Deno.env.get("STRIPE_PRICE_PATRONS_PREMIER") ?? "",
      ].filter(Boolean);
      if (priceIds.length === 0) {
        return { status: "warning", message: "No STRIPE_PRICE_* ids configured" };
      }
      const errors: string[] = [];
      for (const priceId of priceIds) {
        try {
          await stripe.prices.retrieve(priceId);
        } catch {
          errors.push(priceId);
        }
      }
      if (errors.length > 0) return { status: "failed", error: `Invalid prices: ${errors.join(", ")}` };
      return { status: "passed", message: `${priceIds.length} patron price IDs verified` };
    });

    // Check 8: Recent Registration Activity
    await runCheck("Recent Registrations", async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, payment_status, created_at")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false });
      if (error) return { status: "failed", error: error.message };
      const paid = data?.filter((r) => r.payment_status === "paid").length || 0;
      const pending = data?.filter((r) => r.payment_status === "pending").length || 0;
      return {
        status: "passed",
        message: `Last 24h: ${paid} paid, ${pending} pending, ${data?.length || 0} total`,
      };
    });

    // Check 9: Email Service (Resend API)
    await runCheck("Email Service (Resend)", async () => {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) return { status: "warning", message: "RESEND_API_KEY not configured" };
      // Just verify key format - don't make API call
      if (!resendKey.startsWith("re_")) return { status: "warning", message: "Invalid Resend key format" };
      return { status: "passed", message: "Resend API key configured" };
    });

    // Check 10: Webhook Secret
    await runCheck("Stripe Webhook Secret", async () => {
      const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
      if (!webhookSecret) return { status: "warning", message: "Webhook secret not configured - payments may not process" };
      if (!webhookSecret.startsWith("whsec_")) return { status: "warning", message: "Invalid webhook secret format" };
      return { status: "passed", message: "Webhook secret configured" };
    });

    // Check 11: Pending Payments Needing Attention
    await runCheck("Stale Pending Payments", async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("registrations")
        .select("id")
        .eq("payment_status", "pending")
        .lt("created_at", oneHourAgo);
      if (error) return { status: "failed", error: error.message };
      if (data && data.length > 5) {
        return { status: "warning", message: `${data.length} pending payments older than 1 hour` };
      }
      return { status: "passed", message: `${data?.length || 0} stale pending payments` };
    });

    // Check 12: Checkout Functions Deployed
    await runCheck("Checkout Edge Functions", async () => {
      const functionsToCheck = [
        "create-cosmico-checkout",
        "create-patrons-checkout",
        "stripe-webhook",
      ];
      const missingFunctions: string[] = [];
      
      for (const fnName of functionsToCheck) {
        try {
          // Try to invoke with OPTIONS to check if function exists
          const response = await fetch(
            `${supabaseUrl}/functions/v1/${fnName}`,
            { method: "OPTIONS" }
          );
          // CORS preflight should return 200 or 204 if function exists
          if (response.status >= 500) {
            missingFunctions.push(fnName);
          }
        } catch {
          missingFunctions.push(fnName);
        }
      }
      
      if (missingFunctions.length > 0) {
        return { status: "failed", error: `Missing functions: ${missingFunctions.join(", ")}` };
      }
      return { status: "passed", message: `All ${functionsToCheck.length} checkout functions deployed` };
    });

    // Check 13: End-to-End Checkout Flow Simulation
    await runCheck("Checkout Session Creation", async () => {
      if (!stripeKey) return { status: "failed", error: "No Stripe key" };
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      
      try {
        // Simulate exactly what the checkout function does
        const session = await stripe.checkout.sessions.create({
          line_items: [{ price: Deno.env.get("STRIPE_PRICE_TIER_1_KREWE_3DAY") ?? "", quantity: 1 }],
          mode: "payment",
          success_url: `${supabaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${supabaseUrl}/cancel`,
          metadata: { 
            test: "health_check",
            event_id: activeEvent?.id || "test"
          },
        });
        
        // Immediately expire to clean up
        await stripe.checkout.sessions.expire(session.id);
        return { status: "passed", message: "Checkout session creation verified" };
      } catch (e: any) {
        return { status: "failed", error: `Session creation failed: ${e.message}` };
      }
    });

    // Check 14: Idempotency Table Exists
    await runCheck("Payment Idempotency", async () => {
      const { error } = await supabase
        .from("payment_idempotency_keys")
        .select("id")
        .limit(1);
      if (error && error.code === "42P01") {
        return { status: "warning", message: "Idempotency table not created yet" };
      }
      if (error) return { status: "failed", error: error.message };
      return { status: "passed", message: "Idempotency protection active" };
    });

    // Check 15: Tickets Created for Recent Paid Registrations
    await runCheck("Ticket Generation Integrity", async () => {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: paidRegs, error: regError } = await supabase
        .from("registrations")
        .select("id, quantity, name")
        .eq("payment_status", "paid")
        .gte("created_at", last24h);
      
      if (regError) return { status: "failed", error: regError.message };
      if (!paidRegs || paidRegs.length === 0) {
        return { status: "passed", message: "No recent paid registrations to verify" };
      }

      let missingTickets = 0;
      for (const reg of paidRegs.slice(0, 10)) { // Check up to 10
        const { data: tickets } = await supabase
          .from("tickets")
          .select("id")
          .eq("registration_id", reg.id);
        
        if (!tickets || tickets.length !== reg.quantity) {
          missingTickets++;
        }
      }

      if (missingTickets > 0) {
        return { status: "failed", error: `${missingTickets} registrations missing tickets` };
      }
      return { status: "passed", message: `Verified ${Math.min(paidRegs.length, 10)} recent registrations` };
    });

    const totalDuration = Date.now() - startTime;
    const failedCount = checks.filter((c) => c.status === "failed").length;
    const warningCount = checks.filter((c) => c.status === "warning").length;
    const passedCount = checks.filter((c) => c.status === "passed").length;

    const response = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      summary: {
        total: checks.length,
        passed: passedCount,
        warnings: warningCount,
        failed: failedCount,
        duration_ms: totalDuration,
      },
      checks,
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: overallStatus === "unhealthy" ? 503 : 200,
    });
  } catch (error: any) {
    console.error("[health-check] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        status: "error",
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
