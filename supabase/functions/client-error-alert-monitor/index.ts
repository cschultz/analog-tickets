import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getAlertPhone } from "../_shared/operator-config.ts";

/**
 * client-error-alert-monitor
 *
 * Runs every 5 minutes via pg_cron. Counts rows in `client_errors` over the
 * last 5 / 15 / 60 minutes, and fires alerts when crashes spike past
 * configured thresholds. Supports email (Resend), SMS (SimpleTexting), and
 * Slack webhook (if SLACK_ALERT_WEBHOOK_URL is set as a secret).
 *
 * Throttle: each `alert_key` (e.g. "spike_5m", "chunk_failures_15m") only
 * fires once per cooldown window, tracked in `public.alert_throttle`.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Tunable thresholds
const THRESHOLDS = {
  total_5m: 10,           // ≥10 errors in last 5 min → spike
  total_15m: 25,          // ≥25 errors in last 15 min → sustained spike
  blank_page_5m: 5,       // ≥5 chunk failures / blank-page recoveries in 5 min
  unique_routes_5m: 5,    // ≥5 distinct routes erroring in 5 min → systemic
};

const COOLDOWN_MINUTES = 30;
const ALERT_EMAIL = "hello@example.invalid";
const ALERT_PHONE = getAlertPhone(); // OPERATOR_ALERT_PHONE; empty = SMS disabled

interface AlertCheck {
  key: string;
  triggered: boolean;
  count: number;
  threshold: number;
  label: string;
  details?: string;
}

function isBlankPageContext(ctx: unknown): boolean {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as { kind?: string; tag?: string; src?: string; rel?: string };
  if (c.kind === "resource_load_failure") {
    // <img> 404s self-heal on reload
    if (c.tag === "img") return false;
    if (c.src && /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(c.src)) return false;
    // <link rel=modulepreload/preload/prefetch> are advisory hints — the real
    // chunk fetch retries on demand and would surface as an unhandledrejection.
    if (c.tag === "link") return false;
    // Third-party <script> failures (fbevents, amazon-adsystem, gtag, etc.)
    // are out of our control and frequently blocked by ad blockers / flaky nets.
    if (c.tag === "script" && c.src) {
      try {
        const host = new URL(c.src).hostname;
        if (host !== "example.invalid" && !host.endsWith(".example.invalid")) return false;
      } catch { /* fall through */ }
    }
    return true;
  }
  return c.kind === "lazy_chunk_failure" || c.kind === "unhandled_rejection";
}

function isChunkLoadMessage(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed|Importing a module script failed|ChunkLoadError/i.test(
    msg,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull last 60 minutes once, slice in memory
  const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("client_errors")
    .select("id, occurred_at, route, message, context, build_version, user_agent")
    .gte("occurred_at", sixtyMinAgo)
    .order("occurred_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("[alert-monitor] query failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const since5m = now - 5 * 60 * 1000;
  const since15m = now - 15 * 60 * 1000;

  const all = rows ?? [];
  const last5 = all.filter((r) => new Date(r.occurred_at).getTime() >= since5m);
  const last15 = all.filter(
    (r) => new Date(r.occurred_at).getTime() >= since15m,
  );

  const blankPage5 = last5.filter(
    (r) => isBlankPageContext(r.context) || isChunkLoadMessage(r.message),
  );
  const distinctRoutes5 = new Set(last5.map((r) => r.route ?? "")).size;

  const checks: AlertCheck[] = [
    {
      key: "spike_5m",
      label: "Total client errors (last 5 min)",
      count: last5.length,
      threshold: THRESHOLDS.total_5m,
      triggered: last5.length >= THRESHOLDS.total_5m,
    },
    {
      key: "sustained_15m",
      label: "Total client errors (last 15 min)",
      count: last15.length,
      threshold: THRESHOLDS.total_15m,
      triggered: last15.length >= THRESHOLDS.total_15m,
    },
    {
      key: "blank_page_5m",
      label: "Blank-page / chunk-load failures (last 5 min)",
      count: blankPage5.length,
      threshold: THRESHOLDS.blank_page_5m,
      triggered: blankPage5.length >= THRESHOLDS.blank_page_5m,
    },
    {
      key: "many_routes_5m",
      label: "Distinct erroring routes (last 5 min)",
      count: distinctRoutes5,
      threshold: THRESHOLDS.unique_routes_5m,
      triggered: distinctRoutes5 >= THRESHOLDS.unique_routes_5m,
    },
  ];

  const triggered = checks.filter((c) => c.triggered);
  const sentAlerts: string[] = [];
  const skippedAlerts: string[] = [];

  if (triggered.length > 0) {
    // Throttle check
    const cooldownCutoff = new Date(
      Date.now() - COOLDOWN_MINUTES * 60 * 1000,
    ).toISOString();
    const { data: throttleRows } = await supabase
      .from("alert_throttle")
      .select("alert_key, last_sent_at")
      .in("alert_key", triggered.map((c) => c.key));

    const recentlySent = new Set(
      (throttleRows ?? [])
        .filter((r) => r.last_sent_at >= cooldownCutoff)
        .map((r) => r.alert_key),
    );

    const toFire = triggered.filter((c) => !recentlySent.has(c.key));
    triggered
      .filter((c) => recentlySent.has(c.key))
      .forEach((c) => skippedAlerts.push(c.key));

    if (toFire.length > 0) {
      // Build top routes / messages snapshot
      const routeCounts = new Map<string, number>();
      const messageCounts = new Map<string, number>();
      for (const r of last5) {
        routeCounts.set(r.route ?? "(none)", (routeCounts.get(r.route ?? "(none)") ?? 0) + 1);
        const m = (r.message ?? "").slice(0, 120);
        messageCounts.set(m, (messageCounts.get(m) ?? 0) + 1);
      }
      const topRoutes = [...routeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const topMessages = [...messageCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const summary = toFire
        .map((c) => `• ${c.label}: ${c.count} (threshold ${c.threshold})`)
        .join("\n");

      const subject = `🚨 Cosmico crash spike — ${toFire.length} threshold(s) crossed`;
      const plain = `${subject}\n\n${summary}\n\nTop routes (5m):\n${topRoutes
        .map(([r, n]) => `  ${n}× ${r}`)
        .join("\n")}\n\nTop messages (5m):\n${topMessages
        .map(([m, n]) => `  ${n}× ${m}`)
        .join("\n")}`;

      // --- Email via Resend ---
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        try {
          const resend = new Resend(resendKey);
          await resend.emails.send({
            from: "Cosmico Alerts <alerts@example.invalid>",
            to: [ALERT_EMAIL],
            subject,
            html: `
              <h1 style="color:#dc2626;margin:0 0 8px">Crash spike detected</h1>
              <p style="color:#374151;margin:0 0 16px">
                ${toFire.length} alert threshold${toFire.length === 1 ? "" : "s"} crossed at ${new Date().toISOString()}.
              </p>
              <h2 style="color:#dc2626;font-size:16px;margin:16px 0 4px">Triggered checks</h2>
              <ul>${toFire.map((c) => `<li><strong>${c.label}:</strong> ${c.count} (threshold ${c.threshold})</li>`).join("")}</ul>
              <h2 style="font-size:16px;margin:16px 0 4px">Top routes (last 5 min)</h2>
              <ul>${topRoutes.map(([r, n]) => `<li>${n}× <code>${r}</code></li>`).join("")}</ul>
              <h2 style="font-size:16px;margin:16px 0 4px">Top error messages (last 5 min)</h2>
              <ul>${topMessages.map(([m, n]) => `<li>${n}× ${m.replace(/[<>]/g, (c) => c === "<" ? "&lt;" : "&gt;")}</li>`).join("")}</ul>
              <p style="margin-top:24px">
                <a href="https://example.invalid/admin/health" style="background:#2563eb;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px">Open System Health</a>
              </p>
              <p style="color:#6b7280;font-size:12px;margin-top:24px">Cooldown: ${COOLDOWN_MINUTES} min per check.</p>
            `,
          });
          sentAlerts.push("email");
        } catch (err) {
          console.error("[alert-monitor] email failed:", err);
        }
      }

      // --- Slack webhook (optional) ---
      const slackUrl = Deno.env.get("SLACK_ALERT_WEBHOOK_URL");
      if (slackUrl) {
        try {
          await fetch(slackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `🚨 *Cosmico crash spike*\n\`\`\`${plain.slice(0, 2500)}\`\`\``,
            }),
          });
          sentAlerts.push("slack");
        } catch (err) {
          console.error("[alert-monitor] slack failed:", err);
        }
      }

      // --- SMS via SimpleTexting (best-effort, short) ---
      const smsKey = Deno.env.get("SIMPLYTEXT_API_KEY");
      if (smsKey && ALERT_PHONE) {
        try {
          const smsBody = `🚨 Cosmico crash spike: ${toFire
            .map((c) => `${c.key}=${c.count}`)
            .join(", ")}. Check email/admin/health.`.slice(0, 300);
          const params = new URLSearchParams({
            token: smsKey,
            phone: ALERT_PHONE,
            message: smsBody,
          });
          const resp = await fetch(
            `https://app2.simpletexting.com/v1/send?${params.toString()}`,
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
              },
            },
          );
          const data = await resp.json().catch(() => ({}));
          if (data.code === 1) sentAlerts.push("sms");
          else console.error("[alert-monitor] sms failed:", data);
        } catch (err) {
          console.error("[alert-monitor] sms exception:", err);
        }
      }

      // Update throttle for fired keys
      const upserts = toFire.map((c) => ({
        alert_key: c.key,
        last_sent_at: new Date().toISOString(),
        payload: {
          count: c.count,
          threshold: c.threshold,
          label: c.label,
          channels: sentAlerts,
        },
      }));
      const { error: upsertErr } = await supabase
        .from("alert_throttle")
        .upsert(upserts, { onConflict: "alert_key" });
      if (upsertErr) console.error("[alert-monitor] throttle upsert failed:", upsertErr);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      duration_ms: Date.now() - startedAt,
      total_rows_60m: all.length,
      checks,
      triggered: triggered.map((c) => c.key),
      fired: sentAlerts,
      skipped_due_to_cooldown: skippedAlerts,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
