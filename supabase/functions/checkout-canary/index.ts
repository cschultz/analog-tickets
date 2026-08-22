import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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
  const checks: HealthCheck[] = [];
  let overallStatus = "healthy" as "healthy" | "degraded" | "unhealthy";
  let alertSent = false;

  // Transient error patterns that should be retried automatically
  const isTransientError = (msg: string): boolean => {
    const transientPatterns = [
      "dns", "temporary failure", "name resolution",
      "econnreset", "etimedout", "enotfound",
      "fetch failed", "network", "socket hang up",
      "bad gateway", "error code 502", " 502 ", " 503 ",
      "cloudflare", "host error", "upstream", "gateway",
      "signal has been aborted", "aborted",
    ];
    const lower = msg.toLowerCase();
    return transientPatterns.some((p) => lower.includes(p.toLowerCase()));
  };

  // Helper to run a check with timing and automatic retry for transient errors
  const runCheck = async (
    name: string,
    fn: () => Promise<{ status: "passed" | "failed" | "warning"; message?: string; error?: string }>,
    maxRetries = 2
  ) => {
    const checkStart = Date.now();
    let lastError = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();

        // If it failed but the error looks transient, retry
        if (result.status === "failed" && result.error && isTransientError(result.error) && attempt < maxRetries) {
          lastError = result.error;
          console.log(`[checkout-canary] Transient failure on "${name}" (attempt ${attempt + 1}/${maxRetries + 1}), retrying in 3s...`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        const retryNote = attempt > 0 ? ` (recovered after ${attempt} retry)` : "";
        checks.push({
          name,
          ...result,
          message: result.message ? result.message + retryNote : retryNote || undefined,
          duration_ms: Date.now() - checkStart,
        });
        if (result.status === "failed") overallStatus = "unhealthy";
        else if (result.status === "warning" && overallStatus === "healthy") overallStatus = "degraded";
        return;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        lastError = errorMessage;

        if (isTransientError(errorMessage) && attempt < maxRetries) {
          console.log(`[checkout-canary] Transient error on "${name}" (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}, retrying in 3s...`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        checks.push({
          name,
          status: "failed",
          error: errorMessage,
          duration_ms: Date.now() - checkStart,
        });
        overallStatus = "unhealthy";
        return;
      }
    }

    // Exhausted retries
    checks.push({
      name,
      status: "failed",
      error: `${lastError} (failed after ${maxRetries + 1} attempts)`,
      duration_ms: Date.now() - checkStart,
    });
    overallStatus = "unhealthy";
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const alertEmail = "hello@example.invalid";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    await runCheck("Stripe API Connection", async () => {
      if (!stripeKey) return { status: "failed", error: "STRIPE_SECRET_KEY not configured" };
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const balance = await stripe.balance.retrieve();
      return { status: "passed", message: `Connected to Stripe (${balance.available.length} currency balances)` };
    });

    // Check 3: Supabase Connection
    await runCheck("Database Connection", async () => {
      const { error } = await supabase.from("event_details").select("id").limit(1);
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
    }, 4);

    // Check 5: Ticket Types with Stripe Price IDs
    // Note: Youth/child tickets use dynamic price_data, not fixed Stripe Price IDs
    await runCheck("Ticket Type Configuration", async () => {
      if (!activeEvent) return { status: "warning", message: "Skipped - no active event" };
      
      const { data: ticketTypes, error } = await supabase
        .from("ticket_types")
        .select("key, label, stripe_price_id, is_active, price")
        .eq("event_id", activeEvent.id)
        .eq("is_active", true)
        .gt("price", 0);

      if (error) return { status: "failed", error: error.message };
      if (!ticketTypes || ticketTypes.length === 0) {
        return { status: "warning", message: "No active paid ticket types configured" };
      }

      // Exclude youth/child tickets - they use dynamic price_data instead of fixed Stripe Price IDs
      const requiresPriceId = ticketTypes.filter((t) => 
        !t.key.startsWith("youth") && !t.key.startsWith("child")
      );
      const missingPriceIds = requiresPriceId.filter((t) => !t.stripe_price_id);
      if (missingPriceIds.length > 0) {
        return { 
          status: "failed", 
          error: `Missing stripe_price_id: ${missingPriceIds.map((t) => t.key).join(", ")}` 
        };
      }
      return { status: "passed", message: `${requiresPriceId.length} ticket types configured with Stripe prices` };
    });

    // Check 6: Validate Stripe Prices are Active
    // Note: Youth/child tickets use dynamic price_data, so we exclude them from validation
    await runCheck("Stripe Price Validation", async () => {
      if (!stripeKey || !activeEvent) return { status: "warning", message: "Skipped" };
      
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      
      const { data: ticketTypes } = await supabase
        .from("ticket_types")
        .select("key, stripe_price_id")
        .eq("event_id", activeEvent.id)
        .eq("is_active", true)
        .not("stripe_price_id", "is", null);

      // Exclude youth/child tickets - they use dynamic price_data
      const ticketsToValidate = (ticketTypes || []).filter((t) =>
        !t.key.startsWith("youth") && !t.key.startsWith("child")
      );

      const invalidPrices: string[] = [];
      for (const ticket of ticketsToValidate) {
        if (!ticket.stripe_price_id) continue;
        try {
          const price = await stripe.prices.retrieve(ticket.stripe_price_id);
          if (!price.active) {
            invalidPrices.push(`${ticket.key} (inactive)`);
          }
        } catch {
          invalidPrices.push(`${ticket.key} (not found)`);
        }
      }

      if (invalidPrices.length > 0) {
        return { status: "failed", error: `Invalid Stripe prices: ${invalidPrices.join(", ")}` };
      }
      return { status: "passed", message: `${ticketsToValidate.length} Stripe prices validated` };
    });

    // Check 7: Ticket Inventory
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

    // Check 8: Patrons Package Prices
    await runCheck("Patrons Package Prices", async () => {
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
          const price = await stripe.prices.retrieve(priceId);
          if (!price.active) errors.push(`${priceId} (inactive)`);
        } catch {
          errors.push(priceId);
        }
      }
      if (errors.length > 0) return { status: "failed", error: `Invalid prices: ${errors.join(", ")}` };
      return { status: "passed", message: `${priceIds.length} patron price IDs verified` };
    });

    // Check 9: Recent Registration Activity
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

    // Check 10: Email Service (Resend API)
    await runCheck("Email Service (Resend)", async () => {
      if (!resendApiKey) return { status: "warning", message: "RESEND_API_KEY not configured" };
      if (!resendApiKey.startsWith("re_")) return { status: "warning", message: "Invalid Resend key format" };
      return { status: "passed", message: "Resend API key configured" };
    });

    // Check 11: Webhook Secret
    await runCheck("Stripe Webhook Secret", async () => {
      if (!webhookSecret) return { status: "warning", message: "Webhook secret not configured - payments may not process" };
      if (!webhookSecret.startsWith("whsec_")) return { status: "warning", message: "Invalid webhook secret format" };
      return { status: "passed", message: "Webhook secret configured" };
    });

    // Check 12: Stale Pending Payments
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

    // Check 13: Auto-expire stale crew bids
    await runCheck("Crew Bid Expiry Cleanup", async () => {
      const { data: expiredCount, error } = await supabase.rpc("expire_stale_crew_bids");
      if (error) return { status: "warning", message: `Cleanup error: ${error.message}` };
      if (expiredCount > 0) {
        return { status: "warning", message: `${expiredCount} crew bid(s) auto-expired` };
      }
      return { status: "passed", message: "No expired crew bids" };
    });

    // Check 14: Checkout Edge Functions Deployed
    await runCheck("Checkout Edge Functions", async () => {
      const functionsToCheck = [
        "create-cosmico-checkout",
        "create-patrons-checkout",
        "create-crew-checkout",
        "stripe-webhook",
      ];
      const missingFunctions: string[] = [];

      for (const fnName of functionsToCheck) {
        // Retry up to 2x with 3s delay to avoid false positives from
        // transient deploy propagation, cold-starts, or 502/503 blips.
        let confirmedMissing = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              },
              body: JSON.stringify({ healthCheck: true }),
            });
            // 404 = function not deployed; anything else (200, 400, 401, 500) means it exists
            if (response.status === 404) {
              if (attempt === 2) {
                confirmedMissing = true;
              } else {
                await new Promise((r) => setTimeout(r, 3000));
                continue;
              }
            }
            break; // function exists, stop retrying
          } catch {
            if (attempt === 2) {
              confirmedMissing = true;
            } else {
              await new Promise((r) => setTimeout(r, 3000));
            }
          }
        }
        if (confirmedMissing) missingFunctions.push(fnName);
      }

      if (missingFunctions.length > 0) {
        return { status: "failed", error: `Missing functions: ${missingFunctions.join(", ")}` };
      }
      return { status: "passed", message: `All ${functionsToCheck.length} checkout functions deployed` };
    });

    // Check 14: Checkout Session Creation Test
    await runCheck("Checkout Session Creation", async () => {
      if (!stripeKey) return { status: "failed", error: "No Stripe key" };
      
      // Get a valid price ID from ticket_types
      const { data: ticketType } = await supabase
        .from("ticket_types")
        .select("stripe_price_id")
        .eq("is_active", true)
        .not("stripe_price_id", "is", null)
        .limit(1)
        .single();

      if (!ticketType?.stripe_price_id) {
        return { status: "warning", message: "No valid ticket type to test with" };
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      try {
        const session = await stripe.checkout.sessions.create({
          line_items: [{ price: ticketType.stripe_price_id, quantity: 1 }],
          mode: "payment",
          success_url: `${supabaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${supabaseUrl}/cancel`,
          metadata: { test: "canary_health_check", event_id: activeEvent?.id || "test" },
        });
        await stripe.checkout.sessions.expire(session.id);
        return { status: "passed", message: "Checkout session creation verified" };
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        return { status: "failed", error: `Session creation failed: ${errorMessage}` };
      }
    });

    // Check 15: Ticket Generation Integrity
    await runCheck("Ticket Generation Integrity", async () => {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: paidRegs, error: regError } = await supabase
        .from("registrations")
        .select("id, quantity, name, ticket_type")
        .eq("payment_status", "paid")
        .neq("ticket_type", "custom_offer")
        .gte("created_at", last24h);

      if (regError) return { status: "failed", error: regError.message };
      if (!paidRegs || paidRegs.length === 0) {
        return { status: "passed", message: "No recent paid registrations to verify" };
      }

      let missingTickets = 0;
      for (const reg of paidRegs.slice(0, 10)) {
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

    // Check 16: Checkout Endpoint Responsiveness
    await runCheck("Checkout Endpoint Health", async () => {
      const checkoutTestStart = Date.now();
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/create-cosmico-checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            ticketType: "canary_test_invalid",
            quantity: 1,
            name: "Canary Test",
            email: "canary@test.internal",
          }),
        });
        const latency = Date.now() - checkoutTestStart;
        if (response.status === 500) {
          return { status: "failed", error: `Checkout returned 500 (${latency}ms)` };
        }
        return { status: "passed", message: `Endpoint responsive (${response.status}, ${latency}ms)` };
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        return { status: "failed", error: `Endpoint unreachable: ${errorMessage}` };
      }
    });

    // Determine overall health and send alerts
    const failedChecks = checks.filter((c) => c.status === "failed");
    const warningChecks = checks.filter((c) => c.status === "warning");

    if (overallStatus === "unhealthy" && resendApiKey) {
      // Send SMS alert in parallel (best-effort)
      const simplyTextKey = Deno.env.get("SIMPLYTEXT_API_KEY");
      const ALERT_PHONE = getAlertPhone(); // OPERATOR_ALERT_PHONE; empty = SMS disabled
      if (simplyTextKey && ALERT_PHONE) {
        try {
          const failedNames = failedChecks.map((c) => c.name).join(", ");
          const smsMsg = `🚨 Cosmico checkout DOWN — ${failedChecks.length} failed: ${failedNames.slice(0, 100)}. Check email for details.`;
          const params = new URLSearchParams({ token: simplyTextKey, phone: ALERT_PHONE, message: smsMsg });
          const smsResp = await fetch(`https://app2.simpletexting.com/v1/send?${params.toString()}`, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          });
          const smsData = await smsResp.json().catch(() => ({}));
          if (smsData.code === 1) {
            console.log("[checkout-canary] SMS alert sent to", ALERT_PHONE);
          } else {
            console.error("[checkout-canary] SMS alert failed:", smsData);
          }
        } catch (smsErr) {
          console.error("[checkout-canary] SMS alert exception:", smsErr);
        }
      }

      try {
        const resend = new Resend(resendApiKey);

        await resend.emails.send({
          from: "Cosmico Alerts <alerts@example.invalid>",
          to: [alertEmail],
          subject: `🚨 CRITICAL: Checkout Health Alert - ${failedChecks.length} failures`,
          html: `
            <h1 style="color: #dc2626;">Checkout System Health Alert</h1>
            <p>The checkout canary detected ${failedChecks.length} critical issue(s) at ${new Date().toISOString()}.</p>
            
            <h2 style="color: #dc2626;">❌ Failed Checks (${failedChecks.length}):</h2>
            <ul style="color: #dc2626;">
              ${failedChecks.map((c) => `<li><strong>${c.name}:</strong> ${c.error || c.message}</li>`).join("")}
            </ul>
            
            ${warningChecks.length > 0 ? `
            <h2 style="color: #f59e0b;">⚠️ Warnings (${warningChecks.length}):</h2>
            <ul style="color: #f59e0b;">
              ${warningChecks.map((c) => `<li><strong>${c.name}:</strong> ${c.message}</li>`).join("")}
            </ul>
            ` : ""}
            
            <h2>📋 All Checks Summary:</h2>
            <table style="border-collapse: collapse; width: 100%;">
              <tr style="background: #f3f4f6;">
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Check</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Status</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Details</th>
                <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Time</th>
              </tr>
              ${checks.map((c) => `
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${c.name}</td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${c.status === "passed" ? "✅" : c.status === "warning" ? "⚠️" : "❌"}</td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${c.error || c.message || "-"}</td>
                  <td style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">${c.duration_ms}ms</td>
                </tr>
              `).join("")}
            </table>
            
            <p style="margin-top: 20px;">
              <a href="https://example.invalid/admin/tickets" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                Open Admin Dashboard
              </a>
            </p>
            
            <hr />
            <p style="color: #6b7280; font-size: 12px;">
              Automated alert from Cosmico checkout canary.<br />
              Total execution time: ${Date.now() - startTime}ms
            </p>
          `,
        });

        alertSent = true;
        console.log("[checkout-canary] Alert email sent successfully");
      } catch (emailError) {
        console.error("[checkout-canary] Failed to send alert email:", emailError);
      }
    }

    // Log job execution
    await supabase.rpc("start_scheduled_job", {
      p_job_name: "checkout-canary",
      p_metadata: { 
        checks_count: checks.length, 
        passed: checks.filter(c => c.status === "passed").length,
        warnings: warningChecks.length,
        failed: failedChecks.length,
        alert_sent: alertSent 
      },
    }).then(async ({ data: jobId }) => {
      if (jobId) {
        await supabase.rpc("complete_scheduled_job", {
          p_job_id: jobId,
          p_status: overallStatus === "healthy" ? "success" : "failed",
          p_records_processed: checks.length,
          p_error_message: failedChecks.length > 0 
            ? failedChecks.map((c) => `${c.name}: ${c.error}`).join("; ") 
            : null,
        });
      }
    });

    const totalDuration = Date.now() - startTime;

    const response = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      alertSent,
      summary: {
        total: checks.length,
        passed: checks.filter((c) => c.status === "passed").length,
        warnings: warningChecks.length,
        failed: failedChecks.length,
        duration_ms: totalDuration,
      },
      checks,
    };

    console.log(`[checkout-canary] Complete: ${overallStatus}, ${checks.length} checks in ${totalDuration}ms`);

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: overallStatus === "unhealthy" ? 503 : 200,
    });
  } catch (error: unknown) {
    console.error("[checkout-canary] Fatal error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        status: "error",
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
