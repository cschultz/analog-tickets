import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { getAlertPhone } from "../_shared/operator-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENTINEL_PHONE = getAlertPhone(); // OPERATOR_ALERT_PHONE; empty = canary SMS skipped
const ALERT_EMAIL = "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

  const checks: { name: string; status: "pass" | "fail"; detail?: string }[] = [];
  let overallStatus: "healthy" | "degraded" | "down" = "healthy";

  // ---- Check 1: SMS API key configured ----
  const apiKey = Deno.env.get("SIMPLYTEXT_API_KEY");
  if (!apiKey) {
    checks.push({ name: "sms_api_key", status: "fail", detail: "SIMPLYTEXT_API_KEY missing" });
    overallStatus = "down";
  } else {
    checks.push({ name: "sms_api_key", status: "pass" });
  }

  // ---- Check 2: Send canary SMS to sentinel number ----
  if (!apiKey || !SENTINEL_PHONE) {
    if (apiKey && !SENTINEL_PHONE) {
      checks.push({ name: "sentinel_sms_send", status: "fail", detail: "OPERATOR_ALERT_PHONE not configured" });
      overallStatus = "down";
    }
  } else {
    try {
      const message = `[CANARY ${new Date().toISOString().slice(11, 16)}Z] Analog SMS pipeline healthy. Reply STOP to opt out.`;
      const params = new URLSearchParams({ token: apiKey, phone: SENTINEL_PHONE, message });
      const resp = await fetch(`https://app2.simpletexting.com/v1/send?${params.toString()}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      });
      const data = await resp.json().catch(() => ({}));
      if (data.code === 1) {
        checks.push({ name: "sentinel_sms_send", status: "pass", detail: `smsid=${data.smsid}` });
      } else {
        checks.push({ name: "sentinel_sms_send", status: "fail", detail: `code=${data.code} msg=${data.message}` });
        overallStatus = "down";
      }
    } catch (e: any) {
      checks.push({ name: "sentinel_sms_send", status: "fail", detail: e.message });
      overallStatus = "down";
    }
  }

  // ---- Check 3: Funnel integrity — SMS sent vs popup leads captured (last 24h) ----
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: popupCodes } = await supabase
    .from("promo_codes")
    .select("id, recipient_phone")
    .eq("source", "exit_intent_popup")
    .not("recipient_phone", "is", null)
    .gte("created_at", since);

  const leadsWithPhone = (popupCodes || []).length;

  // Pull SimpleTexting send logs from edge logs is not feasible in real-time;
  // proxy: we trust send-promo-sms-batch logs invocations. Use a heuristic:
  // if leadsWithPhone > 0 in last 24h, expect at least 1 invocation of send-promo-sms-batch.
  // For now we approximate funnel health: alert if leadsWithPhone >= 5 AND we have no recent successful canary.
  // Future: when we add an `sms_send_log` table this becomes exact.
  if (leadsWithPhone >= 5 && overallStatus !== "healthy") {
    checks.push({
      name: "funnel_integrity",
      status: "fail",
      detail: `${leadsWithPhone} popup leads in 24h but SMS pipeline is ${overallStatus}`,
    });
  } else {
    checks.push({
      name: "funnel_integrity",
      status: "pass",
      detail: `${leadsWithPhone} popup leads in 24h, pipeline ${overallStatus}`,
    });
  }

  // ---- Persist run history ----
  const failedChecks = checks.filter(c => c.status === "fail");
  const passedChecks = checks.filter(c => c.status === "pass").length;

  await supabase.from("canary_run_history").insert({
    status: overallStatus === "healthy" ? "healthy" : "failed",
    total_checks: checks.length,
    passed_checks: passedChecks,
    failed_checks: failedChecks.length,
    warning_checks: 0,
    duration_ms: Date.now() - startedAt,
    failed_check_names: failedChecks.map(c => c.name),
    check_details: { checks, source: "sms-health-canary" },
    alert_sent: failedChecks.length > 0,
  }).then(({ error }) => { if (error) console.error("[sms-canary] history insert failed:", error); });

  // ---- Alert on failure ----
  if (failedChecks.length > 0) {
    await supabase.from("admin_notifications").insert({
      type: "sms_pipeline_failure",
      title: "🚨 SMS Pipeline Health Check Failed",
      message: `Failed: ${failedChecks.map(c => c.name).join(", ")}`,
      metadata: { checks, leadsWithPhone },
    });

    try {
      await resend.emails.send({
        from: "Analog Alerts <alerts@example.invalid>",
        to: [ALERT_EMAIL],
        subject: `🚨 SMS Pipeline Down — ${failedChecks.length} check(s) failed`,
        html: `<h2>SMS Pipeline Health Failure</h2>
          <p>The daily SMS canary detected failures:</p>
          <ul>${failedChecks.map(c => `<li><strong>${c.name}</strong>: ${c.detail || "no detail"}</li>`).join("")}</ul>
          <p>${leadsWithPhone} popup leads captured in last 24h are at risk of not receiving SMS.</p>
          <p>Check logs: https://supabase.com/dashboard/project/hglwwpcwlndozzahyuyx/functions/sms-health-canary/logs</p>`,
      });
    } catch (e: any) {
      console.error("[sms-canary] alert email failed:", e.message);
    }
  }

  console.log(`[sms-canary] ${overallStatus} | ${passedChecks}/${checks.length} passed | ${Date.now() - startedAt}ms`);

  return new Response(JSON.stringify({ status: overallStatus, checks, leadsWithPhone }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
