// Daily incident digest — runs once per morning via cron.
// Summarizes the last 24h of edge_function_incidents and texts a one-line
// summary to the admin phone, plus emails the full breakdown via Resend
// (best-effort; SMS is the primary channel).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { sendSmsV2 } from "../_shared/sms-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const ALERT_EMAIL = "hello@example.invalid";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 24 * 3600_000);

  const { data: incidents, error } = await supabase
    .from("edge_function_incidents")
    .select("id, function_name, message, severity, status, occurrence_count, auto_remediation_status, auto_remediation_rule, last_seen_at")
    .gte("last_seen_at", windowStart.toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = incidents ?? [];
  const total = rows.length;
  const autoResolved = rows.filter((r) => r.status === "auto_resolved" || r.auto_remediation_status === "succeeded").length;
  const needsAttention = rows.filter(
    (r) => ["open"].includes(r.status) && ["no_rule", "failed", "attempted"].includes(r.auto_remediation_status),
  );
  const critical = rows.filter((r) => r.severity === "critical").length;
  const high = rows.filter((r) => r.severity === "high").length;

  const { data: cfg } = await supabase.from("incident_alert_config").select("*").eq("id", 1).maybeSingle();
  const channels: string[] = [];

  // --- SMS digest (always send so you have a heartbeat) ---
  if (cfg?.sms_enabled) {
    const sms = `[Cosmico daily digest] 24h: ${total} incidents · ${autoResolved} auto-fixed · ${needsAttention.length} need review · ${critical} critical · ${high} high\nhttps://example.invalid/admin/incidents`;
    const smsRes = await sendSmsV2({
      phone: cfg.admin_phone,
      message: sms,
      source: "incident-daily-digest",
    });
    if (smsRes.ok) channels.push("sms");
  }

  // --- Email digest ---
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const rowsHtml = needsAttention.slice(0, 25).map((r) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee"><strong>${r.severity.toUpperCase()}</strong></td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee"><code>${r.function_name}</code></td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${(r.message ?? "").replace(/[<>]/g, (c) => c === "<" ? "&lt;" : "&gt;").slice(0, 160)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">×${r.occurrence_count}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${r.auto_remediation_status}</td>
        </tr>
      `).join("");
      await resend.emails.send({
        from: "Cosmico Alerts <alerts@example.invalid>",
        to: [ALERT_EMAIL],
        subject: `Cosmico daily digest — ${total} incidents (${needsAttention.length} need review)`,
        html: `
          <h1 style="margin:0 0 8px">Daily incident digest</h1>
          <p style="color:#374151">Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}</p>
          <ul>
            <li><strong>Total incidents:</strong> ${total}</li>
            <li><strong>Auto-resolved by rules engine:</strong> ${autoResolved}</li>
            <li><strong>Needs review:</strong> ${needsAttention.length}</li>
            <li><strong>Critical:</strong> ${critical} · <strong>High:</strong> ${high}</li>
          </ul>
          ${needsAttention.length ? `
            <h2 style="font-size:16px;margin:24px 0 8px">Open / not auto-fixed (top 25)</h2>
            <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:13px;width:100%">
              <thead><tr style="background:#f3f4f6;text-align:left">
                <th style="padding:6px 10px">Sev</th><th style="padding:6px 10px">Function</th>
                <th style="padding:6px 10px">Message</th><th style="padding:6px 10px">Count</th>
                <th style="padding:6px 10px">Remediation</th>
              </tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          ` : `<p>No open incidents requiring review. 🎉</p>`}
          <p style="margin-top:24px"><a href="https://example.invalid/admin/incidents" style="background:#2563eb;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px">Open Incidents Dashboard</a></p>
        `,
      });
      channels.push("email");
    } catch (err) {
      console.error("[daily-digest] email failed:", err);
    }
  }

  await supabase.from("incident_digest_log").insert({
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    total_incidents: total,
    auto_resolved: autoResolved,
    needs_attention: needsAttention.length,
    channels_sent: channels,
    payload: { critical, high, sample_needs_attention: needsAttention.slice(0, 10) },
  });

  return new Response(JSON.stringify({
    ok: true,
    total, autoResolved, needsAttention: needsAttention.length, critical, high, channels,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
