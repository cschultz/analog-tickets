// Sends an SMS alert to the admin when a new/severe incident is recorded.
// Now aware of auto-remediation status so we can:
//   - SKIP SMS when the incident was auto-resolved
//   - Use a "caught but NOT auto-fixed" template when remediation_status is
//     `no_rule` or `failed` (this is the user's explicit ask)
//   - Use the original severe-incident template otherwise
//
// Rate-limit (read from `incident_alert_config`):
//   - severity gate via min_sms_severity
//   - per-incident cooldown
//   - global mute via sms_enabled

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendSmsV2 } from "../_shared/sms-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!bearer || bearer !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const {
      incident_id, is_new, occurrence_count, severity, function_name, message,
      remediation_status, remediation_rule,
    } = body ?? {};
    if (!incident_id || !severity) {
      return new Response(JSON.stringify({ error: "incident_id and severity required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

    const [{ data: cfg }, { data: incident }] = await Promise.all([
      supabase.from("incident_alert_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("edge_function_incidents").select("last_sms_at, status").eq("id", incident_id).maybeSingle(),
    ]);

    if (!cfg || !cfg.sms_enabled) {
      return new Response(JSON.stringify({ skipped: "sms_disabled" }), { headers: corsHeaders });
    }

    // Auto-resolved? Don't text — the system fixed it.
    if (remediation_status === "succeeded") {
      return new Response(JSON.stringify({ skipped: "auto_resolved" }), { headers: corsHeaders });
    }

    // Acknowledged / resolved manually? Don't text again unless brand-new spike.
    if (!is_new && incident?.status && ["acknowledged","resolved","auto_resolved"].includes(incident.status)) {
      return new Response(JSON.stringify({ skipped: "ack_or_resolved" }), { headers: corsHeaders });
    }

    // "Caught but not auto-fixed" → relax severity gate to MEDIUM so user is
    // notified even on medium-severity caught incidents (per user's request).
    const isCaughtNotFixed = remediation_status === "no_rule" || remediation_status === "failed";
    const minRank = isCaughtNotFixed
      ? Math.min(SEVERITY_RANK["medium"], SEVERITY_RANK[cfg.min_sms_severity] ?? 3)
      : (SEVERITY_RANK[cfg.min_sms_severity] ?? 3);

    if ((SEVERITY_RANK[severity] ?? 0) < minRank) {
      return new Response(JSON.stringify({ skipped: "below_severity_threshold" }), { headers: corsHeaders });
    }

    // Per-incident cooldown
    if (incident?.last_sms_at) {
      const cooldownMs = (cfg.per_incident_cooldown_minutes ?? 60) * 60_000;
      const since = Date.now() - new Date(incident.last_sms_at).getTime();
      if (since < cooldownMs) {
        return new Response(JSON.stringify({ skipped: "cooldown" }), { headers: corsHeaders });
      }
    }

    const sevTag = String(severity).toUpperCase();
    const newOrSpike = is_new ? "NEW" : `x${occurrence_count}`;
    const msgClip = String(message ?? "").slice(0, 120);

    let text: string;
    if (isCaughtNotFixed) {
      text = `[Cosmico ${sevTag} ${newOrSpike}] CAUGHT - no auto-fix\n${function_name}: ${msgClip}\nReview: https://example.invalid/admin/incidents`;
    } else if (remediation_status === "attempted") {
      text = `[Cosmico ${sevTag} ${newOrSpike}] Auto-remediation attempted (${remediation_rule})\n${function_name}: ${msgClip}\nhttps://example.invalid/admin/incidents`;
    } else {
      text = `[Cosmico ${sevTag} ${newOrSpike}] ${function_name}: ${msgClip} - https://example.invalid/admin/incidents`;
    }
    // SimpleTexting rejects emoji + some unicode; force ASCII
    text = text.replace(/[^\x00-\x7F]/g, "");

    const result = await sendSmsV2({
      phone: cfg.admin_phone,
      message: text,
      source: "incident-notifier",
    });

    if (result.ok) {
      await supabase.rpc("mark_incident_sms_sent", { p_incident_id: incident_id });
    }

    return new Response(JSON.stringify({ ok: result.ok, messageId: result.messageId, error: result.error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[incident-notifier] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
