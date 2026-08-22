import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sendSmsV2 } from "../_shared/sms-v2.ts";
import { completeJob, isJobRunning, startJob } from "../_shared/job-tracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "stripe-payment-health-alerts";
const WINDOW_HOURS = 24;

const BodySchema = z.object({
  force: z.boolean().optional(),
});

type AlertSettingRow = {
  id: string;
  name: string;
  redirect_starts_threshold: number;
  verification_failures_threshold: number;
  alert_cooldown_minutes: number;
  sms_phone: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
};

type AlertRunRow = {
  checked_at: string;
  redirect_threshold_breached: boolean;
  verification_threshold_breached: boolean;
  sms_sent: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

async function countRedirectStarts(supabase: ReturnType<typeof createClient>, sinceIso: string) {
  const { count, error } = await supabase
    .from("funnel_events")
    .select("id", { count: "exact", head: true })
    .eq("step", "payment_redirect")
    .gte("created_at", sinceIso);

  if (error) throw error;
  return count ?? 0;
}

async function countVerificationFailures(supabase: ReturnType<typeof createClient>, sinceIso: string) {
  const verificationCodes = [
    "verify_payment_failed",
    "payment_not_completed",
    "ticket_success_verification_exception",
  ];

  const [{ count: verificationCount, error: verificationError }, { count: stripeCount, error: stripeError }] = await Promise.all([
    supabase
      .from("checkout_errors")
      .select("id", { count: "exact", head: true })
      .eq("error_type", "payment_verification")
      .gte("created_at", sinceIso),
    supabase
      .from("checkout_errors")
      .select("id", { count: "exact", head: true })
      .eq("error_type", "stripe")
      .in("error_code", verificationCodes)
      .gte("created_at", sinceIso),
  ]);

  if (verificationError) throw verificationError;
  if (stripeError) throw stripeError;

  return (verificationCount ?? 0) + (stripeCount ?? 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing backend configuration" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const force = parsed.data.force ?? false;

  if (!force && await isJobRunning(supabase, JOB_NAME, 55 * 60 * 1000)) {
    return json({ success: true, skipped: true, reason: "job_already_running" });
  }

  const job = await startJob(supabase, JOB_NAME, { window_hours: WINDOW_HOURS, force });

  try {
    const { data: settingsData, error: settingsError } = await supabase
      .from("stripe_payment_health_alert_settings")
      .select("id,name,redirect_starts_threshold,verification_failures_threshold,alert_cooldown_minutes,sms_phone,is_active,metadata")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (settingsError) throw settingsError;

    const settings = (settingsData ?? []) as AlertSettingRow[];
    if (settings.length === 0) {
      await completeJob(job, "success", 0);
      return json({ success: true, monitored: 0, alertsTriggered: 0 });
    }

    const sinceIso = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const [redirectStarts, verificationFailures] = await Promise.all([
      countRedirectStarts(supabase, sinceIso),
      countVerificationFailures(supabase, sinceIso),
    ]);

    const evaluations: Array<Record<string, unknown>> = [];
    let alertsTriggered = 0;

    for (const setting of settings) {
      const redirectThresholdBreached = redirectStarts >= setting.redirect_starts_threshold;
      const verificationThresholdBreached = verificationFailures >= setting.verification_failures_threshold;
      const thresholdBreached = redirectThresholdBreached || verificationThresholdBreached;

      let smsSent = false;
      let notificationId: string | null = null;
      let cooldownActive = false;

      const { data: recentRunData, error: recentRunError } = await supabase
        .from("stripe_payment_health_alert_runs")
        .select("checked_at,redirect_threshold_breached,verification_threshold_breached,sms_sent")
        .eq("setting_id", setting.id)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentRunError) throw recentRunError;

      const recentRun = recentRunData as AlertRunRow | null;
      if (recentRun?.sms_sent) {
        const msSinceLastAlert = Date.now() - new Date(recentRun.checked_at).getTime();
        cooldownActive = msSinceLastAlert < setting.alert_cooldown_minutes * 60 * 1000;
      }

      if (thresholdBreached && (!cooldownActive || force)) {
        const breachedLabels = [
          redirectThresholdBreached
            ? `redirect starts ${redirectStarts}/${setting.redirect_starts_threshold}`
            : null,
          verificationThresholdBreached
            ? `verification failures ${verificationFailures}/${setting.verification_failures_threshold}`
            : null,
        ].filter(Boolean);

        const { data: notification, error: notificationError } = await supabase
          .from("admin_notifications")
          .insert({
            type: "stripe_payment_health_alert",
            title: "🚨 Stripe redirect alert threshold hit",
            message: `Last 24h exceeded ${breachedLabels.join(" and ")}.`,
            metadata: {
              alert_type: "stripe_payment_health_alert",
              setting_name: setting.name,
              window_hours: WINDOW_HOURS,
              redirect_starts_count: redirectStarts,
              redirect_starts_threshold: setting.redirect_starts_threshold,
              redirect_threshold_breached: redirectThresholdBreached,
              verification_failures_count: verificationFailures,
              verification_failures_threshold: setting.verification_failures_threshold,
              verification_threshold_breached: verificationThresholdBreached,
              checked_at: new Date().toISOString(),
              cooldown_minutes: setting.alert_cooldown_minutes,
              sms_phone: normalizePhone(setting.sms_phone),
            },
          })
          .select("id")
          .single();

        if (notificationError) throw notificationError;
        notificationId = notification.id;

        const smsPhone = normalizePhone(setting.sms_phone);
        if (smsPhone) {
          const smsResult = await sendSmsV2({
            phone: smsPhone,
            message: `Stripe alert: 24h redirect starts ${redirectStarts}/${setting.redirect_starts_threshold}, verification failures ${verificationFailures}/${setting.verification_failures_threshold}. See admin widget for details.`,
            source: "stripe-payment-health-alerts",
          });

          if (!smsResult.ok) {
            console.error("[stripe-payment-health-alerts] SMS send failed:", smsResult.error);
          } else {
            smsSent = true;
          }
        }

        alertsTriggered += 1;
      }

      const { error: runInsertError } = await supabase
        .from("stripe_payment_health_alert_runs")
        .insert({
          setting_id: setting.id,
          window_hours: WINDOW_HOURS,
          redirect_starts_count: redirectStarts,
          verification_failures_count: verificationFailures,
          redirect_threshold_breached: redirectThresholdBreached,
          verification_threshold_breached: verificationThresholdBreached,
          sms_sent: smsSent,
          notification_id: notificationId,
          metadata: {
            cooldown_active: cooldownActive,
            checked_forced: force,
            checked_at: new Date().toISOString(),
          },
        });

      if (runInsertError) throw runInsertError;

      evaluations.push({
        setting_name: setting.name,
        redirect_starts: redirectStarts,
        redirect_starts_threshold: setting.redirect_starts_threshold,
        redirect_threshold_breached: redirectThresholdBreached,
        verification_failures: verificationFailures,
        verification_failures_threshold: setting.verification_failures_threshold,
        verification_threshold_breached: verificationThresholdBreached,
        cooldown_active: cooldownActive,
        sms_sent: smsSent,
      });
    }

    await completeJob(job, "success", settings.length);
    return json({
      success: true,
      monitored: settings.length,
      alertsTriggered,
      checkedAt: new Date().toISOString(),
      evaluations,
    });
  } catch (error) {
    console.error("[stripe-payment-health-alerts] Error:", error);
    await completeJob(job, "failed", 0, error instanceof Error ? error.message : String(error));
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});