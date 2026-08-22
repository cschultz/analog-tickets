import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { completeJob, isJobRunning, startJob } from "../_shared/job-tracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "funnel-dropoff-monitor";
const WINDOW_HOURS = 24;
const PAGE_SIZE = 1000;

type FunnelEventRow = {
  session_id: string;
  step: string;
  created_at: string;
};

type FunnelAlertRow = {
  id: string;
  step_name: string;
  preceding_step_name: string;
  min_completion_rate: number;
  min_sessions: number;
  sustain_hours: number;
  is_active: boolean;
  breach_started_at: string | null;
  alert_active: boolean;
  last_alerted_at: string | null;
  metadata: { label?: string } | null;
};

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

async function fetchEvents(
  supabase: ReturnType<typeof createClient>,
  stepNames: string[],
  sinceIso: string,
): Promise<FunnelEventRow[]> {
  const rows: FunnelEventRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("funnel_events")
      .select("session_id,step,created_at")
      .in("step", stepNames)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as FunnelEventRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
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

  if (await isJobRunning(supabase, JOB_NAME, 55 * 60 * 1000)) {
    return new Response(JSON.stringify({ success: true, skipped: true, reason: "job_already_running" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  const job = await startJob(supabase, JOB_NAME, { window_hours: WINDOW_HOURS });

  try {
    const { data: alertConfigs, error: alertError } = await supabase
      .from("funnel_step_alerts")
      .select("id,step_name,preceding_step_name,min_completion_rate,min_sessions,sustain_hours,is_active,breach_started_at,alert_active,last_alerted_at,metadata")
      .eq("is_active", true)
      .order("step_name", { ascending: true });

    if (alertError) throw alertError;

    const configs = (alertConfigs ?? []) as FunnelAlertRow[];
    if (configs.length === 0) {
      await completeJob(job, "success", 0);
      return new Response(JSON.stringify({ success: true, monitoredSteps: 0, alertsSent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const monitoredSteps = Array.from(new Set(configs.flatMap((row) => [row.step_name, row.preceding_step_name])));
    const now = new Date();
    const currentWindowStart = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000);
    const previousWindowStart = new Date(currentWindowStart.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

    const events = await fetchEvents(supabase, monitoredSteps, previousWindowStart.toISOString());

    const currentSets = new Map<string, Set<string>>();
    const previousSets = new Map<string, Set<string>>();

    for (const event of events) {
      const eventTime = new Date(event.created_at).getTime();
      const currentBoundary = currentWindowStart.getTime();
      const previousBoundary = previousWindowStart.getTime();
      const nowBoundary = now.getTime();

      if (eventTime >= currentBoundary && eventTime <= nowBoundary) {
        const set = currentSets.get(event.step) ?? new Set<string>();
        set.add(event.session_id);
        currentSets.set(event.step, set);
      } else if (eventTime >= previousBoundary && eventTime < currentBoundary) {
        const set = previousSets.get(event.step) ?? new Set<string>();
        set.add(event.session_id);
        previousSets.set(event.step, set);
      }
    }

    let alertsSent = 0;
    const evaluations: Array<Record<string, unknown>> = [];

    for (const config of configs) {
      const sourceSessions = currentSets.get(config.preceding_step_name)?.size ?? 0;
      const targetSessions = currentSets.get(config.step_name)?.size ?? 0;
      const currentRate = toPercent(targetSessions, sourceSessions);

      const previousSourceSessions = previousSets.get(config.preceding_step_name)?.size ?? 0;
      const previousTargetSessions = previousSets.get(config.step_name)?.size ?? 0;
      const previousRate = toPercent(previousTargetSessions, previousSourceSessions);

      const hasEnoughVolume = sourceSessions >= config.min_sessions;
      const isBelowThreshold = hasEnoughVolume && currentRate !== null && currentRate < config.min_completion_rate;

      let breachStartedAt = config.breach_started_at;
      let alertActive = config.alert_active;
      let lastAlertedAt = config.last_alerted_at;
      let resolvedAt: string | null = null;
      let lastStatusMessage = "Operating within threshold.";

      if (!hasEnoughVolume) {
        breachStartedAt = null;
        alertActive = false;
        lastStatusMessage = `Monitoring paused — only ${sourceSessions} source sessions in the last 24h.`;
      } else if (isBelowThreshold) {
        const breachDate = breachStartedAt ? new Date(breachStartedAt) : now;
        if (!breachStartedAt) {
          breachStartedAt = now.toISOString();
        }

        const sustainedMs = now.getTime() - breachDate.getTime();
        const sustainTargetMs = config.sustain_hours * 60 * 60 * 1000;
        lastStatusMessage = `${config.preceding_step_name} → ${config.step_name} is at ${currentRate?.toFixed(2)}% (${targetSessions}/${sourceSessions}), below ${config.min_completion_rate.toFixed(2)}%.`;

        if (sustainedMs >= sustainTargetMs && !alertActive) {
          const label = config.metadata?.label ?? `${config.preceding_step_name} → ${config.step_name}`;
          const durationHours = Math.floor(sustainedMs / (60 * 60 * 1000));

          const { error: notifyError } = await supabase.from("admin_notifications").insert({
            type: "funnel_dropoff_alert",
            title: `⚠️ Funnel drop detected: ${label}`,
            message: `${label} has stayed below threshold for ${durationHours}h. Current completion is ${currentRate?.toFixed(2)}% across ${sourceSessions} sessions.` ,
            metadata: {
              alert_type: "funnel_dropoff_alert",
              step_name: config.step_name,
              preceding_step_name: config.preceding_step_name,
              label,
              current_completion_rate: currentRate,
              previous_completion_rate: previousRate,
              min_completion_rate: config.min_completion_rate,
              source_sessions: sourceSessions,
              target_sessions: targetSessions,
              previous_source_sessions: previousSourceSessions,
              previous_target_sessions: previousTargetSessions,
              breach_started_at: breachStartedAt,
              sustain_hours: config.sustain_hours,
              checked_at: now.toISOString(),
            },
          });

          if (notifyError) throw notifyError;

          alertActive = true;
          lastAlertedAt = now.toISOString();
          alertsSent += 1;
        }
      } else {
        resolvedAt = now.toISOString();
        breachStartedAt = null;
        alertActive = false;
        lastStatusMessage = `${config.preceding_step_name} → ${config.step_name} recovered to ${currentRate?.toFixed(2)}% (${targetSessions}/${sourceSessions}).`;
      }

      const { error: updateError } = await supabase
        .from("funnel_step_alerts")
        .update({
          current_completion_rate: currentRate,
          current_sessions: sourceSessions,
          last_checked_at: now.toISOString(),
          breach_started_at: breachStartedAt,
          alert_active: alertActive,
          last_alerted_at: lastAlertedAt,
          resolved_at: resolvedAt,
          last_status_message: lastStatusMessage,
          metadata: {
            ...(config.metadata ?? {}),
            previous_completion_rate: previousRate,
            previous_source_sessions: previousSourceSessions,
            previous_target_sessions: previousTargetSessions,
            current_target_sessions: targetSessions,
            checked_at: now.toISOString(),
          },
        })
        .eq("id", config.id);

      if (updateError) throw updateError;

      evaluations.push({
        step_name: config.step_name,
        preceding_step_name: config.preceding_step_name,
        current_completion_rate: currentRate,
        threshold: config.min_completion_rate,
        source_sessions: sourceSessions,
        target_sessions: targetSessions,
        below_threshold: isBelowThreshold,
        alert_active: alertActive,
        breach_started_at: breachStartedAt,
      });
    }

    await completeJob(job, "success", configs.length);

    return new Response(JSON.stringify({
      success: true,
      monitoredSteps: configs.length,
      alertsSent,
      checkedAt: now.toISOString(),
      evaluations,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[funnel-dropoff-monitor]", error);
    await completeJob(job, "failed", 0, message);

    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});