// Promo Code Monitor
// Runs hourly. Detects:
//  1) Validation failure spikes (high reject volume, or high reject-rate vs. attempts)
//  2) Per-code failure storms (one specific code failing repeatedly)
//  3) Redemption drops (significantly fewer redemptions vs. trailing baseline)
// Writes alerts to admin_notifications with a 6h cooldown per alert key
// to avoid noise. Tracked via scheduled_job_history.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { completeJob, startJob } from "../_shared/job-tracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "promo-code-monitor";

// Tunables — kept conservative given current low base rates.
const WINDOW_MIN = 60;                 // look at the last hour for spikes
const MIN_REJECTS_FOR_SPIKE = 8;       // absolute floor before considering a spike
const MIN_REJECT_RATE = 0.5;           // 50%+ of attempts failing in window
const MIN_ATTEMPTS_FOR_RATE = 10;      // need this many attempts before rate matters
const PER_CODE_REJECT_THRESHOLD = 5;   // single code rejected this many times in window
const REDEMPTION_BASELINE_DAYS = 14;   // trailing baseline window
const REDEMPTION_DROP_RATIO = 0.4;     // today < 40% of avg daily baseline
const REDEMPTION_BASELINE_MIN = 1;     // need at least 1/day on average to alert
const COOLDOWN_HOURS = 6;              // re-alert cooldown per alert_key

type RejectRow = {
  error_code: string | null;
  user_email: string | null;
  request_payload: Record<string, unknown> | null;
  created_at: string;
};

function alertKey(kind: string, detail: string) {
  return `promo_monitor:${kind}:${detail}`;
}

async function recentlyAlerted(
  supabase: ReturnType<typeof createClient>,
  key: string,
): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("admin_notifications")
    .select("id")
    .eq("type", "promo_code_alert")
    .gte("created_at", since)
    .contains("metadata", { alert_key: key })
    .limit(1);
  if (error) {
    console.error("[promo-monitor] cooldown lookup failed", error);
    return false;
  }
  return (data ?? []).length > 0;
}

async function emitAlert(
  supabase: ReturnType<typeof createClient>,
  key: string,
  title: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  if (await recentlyAlerted(supabase, key)) {
    console.log(`[promo-monitor] suppressed (cooldown) ${key}`);
    return false;
  }
  const { error } = await supabase.from("admin_notifications").insert({
    type: "promo_code_alert",
    title,
    message,
    metadata: { ...metadata, alert_key: key },
  });
  if (error) {
    console.error("[promo-monitor] failed to insert alert", error);
    return false;
  }
  console.log(`[promo-monitor] alert emitted: ${key}`);
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing backend configuration" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const ctx = await startJob(supabase, JOB_NAME, { window_min: WINDOW_MIN });

  const alerts: Array<{ key: string; emitted: boolean }> = [];

  try {
    const windowStart = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString();

    // --- 1) Pull recent promo rejections from checkout_errors ---
    const { data: rejectsRaw, error: rejectsErr } = await supabase
      .from("checkout_errors")
      .select("error_code, user_email, request_payload, created_at")
      .eq("error_type", "promo_code_rejected")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (rejectsErr) throw rejectsErr;
    const rejects = (rejectsRaw ?? []) as RejectRow[];

    // Total attempts in window — successes + rejections.
    // promo_code_uses = successful redemptions.
    const { count: successCount, error: successErr } = await supabase
      .from("promo_code_uses")
      .select("id", { count: "exact", head: true })
      .gte("used_at", windowStart);
    if (successErr) throw successErr;

    const rejectCount = rejects.length;
    const attemptCount = rejectCount + (successCount ?? 0);
    const rejectRate = attemptCount > 0 ? rejectCount / attemptCount : 0;

    // --- 2) Spike rule: absolute volume OR high rate of failed validation ---
    if (
      rejectCount >= MIN_REJECTS_FOR_SPIKE ||
      (attemptCount >= MIN_ATTEMPTS_FOR_RATE && rejectRate >= MIN_REJECT_RATE)
    ) {
      const key = alertKey("spike", new Date().toISOString().slice(0, 13)); // hourly key
      const byCode: Record<string, number> = {};
      for (const r of rejects) {
        const c = r.error_code ?? "UNKNOWN";
        byCode[c] = (byCode[c] ?? 0) + 1;
      }
      const emitted = await emitAlert(
        supabase,
        key,
        "Promo code validation failures spiking",
        `${rejectCount} promo rejections in the last ${WINDOW_MIN}m` +
          (attemptCount > 0
            ? ` (${Math.round(rejectRate * 100)}% of ${attemptCount} attempts failed)`
            : ""),
        {
          window_minutes: WINDOW_MIN,
          reject_count: rejectCount,
          attempt_count: attemptCount,
          reject_rate_pct: Math.round(rejectRate * 100),
          breakdown_by_error_code: byCode,
        },
      );
      alerts.push({ key, emitted });
    }

    // --- 3) Per-code failure storms ---
    const byCode: Record<string, { count: number; emails: Set<string> }> = {};
    for (const r of rejects) {
      const code =
        ((r.request_payload as { attempted_code?: string } | null)?.attempted_code ?? "")
          .toString()
          .trim()
          .toUpperCase();
      if (!code) continue;
      const slot = byCode[code] ?? { count: 0, emails: new Set<string>() };
      slot.count += 1;
      if (r.user_email) slot.emails.add(r.user_email.toLowerCase());
      byCode[code] = slot;
    }
    for (const [code, info] of Object.entries(byCode)) {
      if (info.count < PER_CODE_REJECT_THRESHOLD) continue;
      const key = alertKey("code", code);
      const emitted = await emitAlert(
        supabase,
        key,
        `Promo code "${code}" is failing repeatedly`,
        `${info.count} rejections in the last ${WINDOW_MIN}m across ${info.emails.size} email(s).`,
        {
          attempted_code: code,
          reject_count: info.count,
          unique_emails: info.emails.size,
          window_minutes: WINDOW_MIN,
        },
      );
      alerts.push({ key, emitted });
    }

    // --- 4) Redemption drop vs. trailing baseline ---
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const baselineStart = new Date(
      dayStart.getTime() - REDEMPTION_BASELINE_DAYS * 24 * 60 * 60 * 1000,
    );

    const { count: todayRedemptions, error: todayErr } = await supabase
      .from("promo_code_uses")
      .select("id", { count: "exact", head: true })
      .gte("used_at", dayStart.toISOString());
    if (todayErr) throw todayErr;

    const { count: baselineRedemptions, error: baseErr } = await supabase
      .from("promo_code_uses")
      .select("id", { count: "exact", head: true })
      .gte("used_at", baselineStart.toISOString())
      .lt("used_at", dayStart.toISOString());
    if (baseErr) throw baseErr;

    const baselineDailyAvg = (baselineRedemptions ?? 0) / REDEMPTION_BASELINE_DAYS;
    const hourFraction = Math.max(
      0.05,
      Math.min(1, (Date.now() - dayStart.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const expectedSoFar = baselineDailyAvg * hourFraction;

    // Only consider once we're past mid-day UTC so we don't false-alert overnight.
    if (
      hourFraction >= 0.5 &&
      baselineDailyAvg >= REDEMPTION_BASELINE_MIN &&
      (todayRedemptions ?? 0) < REDEMPTION_DROP_RATIO * expectedSoFar
    ) {
      const key = alertKey("drop", dayStart.toISOString().slice(0, 10));
      const emitted = await emitAlert(
        supabase,
        key,
        "Promo redemptions are running well below normal",
        `${todayRedemptions ?? 0} redemptions today vs. expected ~${expectedSoFar.toFixed(1)} ` +
          `by now (baseline avg ${baselineDailyAvg.toFixed(2)}/day over ${REDEMPTION_BASELINE_DAYS}d).`,
        {
          today_count: todayRedemptions ?? 0,
          expected_so_far: Number(expectedSoFar.toFixed(2)),
          baseline_daily_avg: Number(baselineDailyAvg.toFixed(2)),
          baseline_days: REDEMPTION_BASELINE_DAYS,
          day_fraction: Number(hourFraction.toFixed(2)),
        },
      );
      alerts.push({ key, emitted });
    }

    await completeJob(ctx, "success", alerts.length);

    return new Response(
      JSON.stringify({
        ok: true,
        window_minutes: WINDOW_MIN,
        reject_count: rejectCount,
        attempt_count: attemptCount,
        reject_rate_pct: Math.round(rejectRate * 100),
        today_redemptions: todayRedemptions ?? 0,
        baseline_daily_avg: Number(baselineDailyAvg.toFixed(2)),
        alerts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err: any) {
    console.error("[promo-monitor] failed", err);
    await completeJob(ctx, "failed", 0, err?.message ?? String(err));
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
