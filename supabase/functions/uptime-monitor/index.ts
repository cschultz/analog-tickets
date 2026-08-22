import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAGES_TO_CHECK = [
  { path: "/", name: "Homepage" },
  { path: "/reserve", name: "Reserve" },
  { path: "/tickets", name: "Tickets" },
  { path: "/lineup", name: "Lineup" },
];

const SITE_URL = "https://example.invalid";
const TIMEOUT_MS = 15000;
const EDGE_TIMEOUT_MS = 25000;
const EDGE_RETRY_COUNT = 2;
const EDGE_RETRY_DELAY_MS = 3000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Array<{
    page: string;
    url: string;
    status: number | null;
    ok: boolean;
    latency_ms: number;
    error?: string;
  }> = [];

  console.log("[uptime-monitor] Pinging critical pages");

  for (const page of PAGES_TO_CHECK) {
    const url = `${SITE_URL}${page.path}`;
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": "Cosmico-Uptime-Monitor/1.0" },
        redirect: "follow",
      });

      clearTimeout(timeout);
      const latency = Date.now() - start;

      // Consume body to prevent resource leak
      await response.text();

      results.push({
        page: page.name,
        url,
        status: response.status,
        ok: response.status >= 200 && response.status < 400,
        latency_ms: latency,
      });
    } catch (error) {
      const latency = Date.now() - start;
      const msg = error instanceof Error ? error.message : String(error);
      results.push({
        page: page.name,
        url,
        status: null,
        ok: false,
        latency_ms: latency,
        error: msg,
      });
    }
  }

  // Also check critical edge functions
  const edgeFunctions = [
    { name: "system-health", path: "/functions/v1/system-health" },
  ];

  for (const fn of edgeFunctions) {
    const url = `${Deno.env.get("SUPABASE_URL")}${fn.path}`;
    let lastError: string | undefined;
    let succeeded = false;

    for (let attempt = 0; attempt <= EDGE_RETRY_COUNT; attempt++) {
      if (attempt > 0) {
        console.log(`[uptime-monitor] Retrying Edge: ${fn.name} (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, EDGE_RETRY_DELAY_MS));
      }

      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);

        const response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
        });

        clearTimeout(timeout);
        const latency = Date.now() - start;
        await response.text();

        results.push({
          page: `Edge: ${fn.name}`,
          url: fn.path,
          status: response.status,
          ok: response.status >= 200 && response.status < 400,
          latency_ms: latency,
        });
        succeeded = true;
        break;
      } catch (error) {
        const latency = Date.now() - start;
        lastError = error instanceof Error ? error.message : String(error);
        console.warn(`[uptime-monitor] Edge: ${fn.name} attempt ${attempt + 1} failed (${latency}ms): ${lastError}`);
      }
    }

    if (!succeeded) {
      results.push({
        page: `Edge: ${fn.name}`,
        url: fn.path,
        status: null,
        ok: false,
        latency_ms: 0,
        error: lastError,
      });
    }
  }

  // Treat internal edge health endpoints as informational, not "site down".
  // Only public user-facing pages count toward the outage alert.
  const INTERNAL_EDGE_NAMES = new Set(["Edge: system-health"]);
  const failedPages = results.filter(r => !r.ok && !INTERNAL_EDGE_NAMES.has(r.page));
  const failedInternal = results.filter(r => !r.ok && INTERNAL_EDGE_NAMES.has(r.page));
  const slowPages = results.filter(r => r.ok && r.latency_ms > 5000);
  const allOk = failedPages.length === 0;

  if (failedInternal.length > 0) {
    console.warn(`[uptime-monitor] Internal edge degraded (no alert): ${failedInternal.map(p => `${p.page} ${p.error || `HTTP ${p.status}`}`).join(", ")}`);
  }

  // Only alert if a public page is actually down
  if (!allOk) {
    // Check if we sent an alert recently (within 30 min)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentAlerts } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("type", "uptime_alert")
      .gte("created_at", thirtyMinAgo)
      .limit(1);

    if (!recentAlerts || recentAlerts.length === 0) {
      await supabase.from("admin_notifications").insert({
        type: "uptime_alert",
        title: `🚨 ${failedPages.length} page(s) down`,
        message: failedPages.map(p => `${p.page}: ${p.error || `HTTP ${p.status}`}`).join(", "),
        metadata: { failed: failedPages, slow: slowPages },
      });

      // Email alert
      try {
        const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
        await resend.emails.send({
          from: "Cosmico Platform <alerts@example.invalid>",
          to: ["hello@example.invalid"],
          subject: `🚨 Site Down: ${failedPages.map(p => p.page).join(", ")}`,
          html: `
            <h2>Uptime Alert</h2>
            <p>${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</p>
            <h3>Down Pages</h3>
            <ul>${failedPages.map(p => `<li><strong>${p.page}</strong> (${p.url}): ${p.error || `HTTP ${p.status}`} — ${p.latency_ms}ms</li>`).join("")}</ul>
            ${slowPages.length > 0 ? `<h3>Slow Pages (>5s)</h3><ul>${slowPages.map(p => `<li>${p.page}: ${p.latency_ms}ms</li>`).join("")}</ul>` : ""}
          `,
        });
      } catch (e) {
        console.error("[uptime-monitor] Email alert failed:", e);
      }
    }
  }

  // Log slow pages as warnings
  if (slowPages.length > 0) {
    await supabase.from("platform_auto_fixes").insert(
      slowPages.map(p => ({
        fix_type: "slow_page_warning",
        description: `${p.page} responded in ${p.latency_ms}ms (>5s threshold)`,
        affected_entity: "uptime",
        affected_id: p.url,
        new_value: { latency_ms: p.latency_ms },
        status: "info",
      }))
    );
  }

  const response = {
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    pages_checked: results.length,
    pages_up: results.filter(r => r.ok).length,
    pages_down: failedPages.length,
    pages_slow: slowPages.length,
    results,
  };

  console.log(`[uptime-monitor] Complete: ${results.filter(r => r.ok).length}/${results.length} pages up`);

  return new Response(JSON.stringify(response, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
