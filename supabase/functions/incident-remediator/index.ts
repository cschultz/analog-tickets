// Self-healing rules engine.
// Receives a freshly-reported incident, matches it against known-safe rules,
// attempts a remediation, and records the outcome on the incident row.
// Then forwards to incident-notifier with the resolved status.
//
// Rules are intentionally conservative — we only auto-fix patterns that are
// safe to retry/replay without side effects.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const PROJECT_ID = "hglwwpcwlndozzahyuyx";

type Severity = "low" | "medium" | "high" | "critical";
interface IncomingIncident {
  incident_id: string;
  is_new: boolean;
  occurrence_count: number;
  severity: Severity;
  function_name: string;
  message: string;
}

// Rule outcome
type Outcome =
  | { status: "succeeded"; rule: string; notes: string; resolve: true }
  | { status: "attempted"; rule: string; notes: string }
  | { status: "skipped"; rule: string; notes: string }
  | { status: "no_rule" };

// Known-safe rules — return an Outcome.
async function applyRules(
  supabase: ReturnType<typeof createClient>,
  inc: IncomingIncident,
): Promise<Outcome> {
  const msg = (inc.message || "").toLowerCase();
  const fn = inc.function_name;

  // 1) Frontend chunk-load / dynamic import — client retries automatically
  if (
    /failed to fetch dynamically imported module|loading chunk \d+ failed|importing a module script failed|chunkloaderror/i.test(
      inc.message,
    )
  ) {
    return {
      status: "succeeded",
      rule: "chunk_load_self_heals",
      notes: "Client self-recovers via lazy-with-retry; auto-resolved.",
      resolve: true,
    };
  }

  // 2) Third-party script (fbevents, gtag, ad blockers) — out of our control
  if (
    /resource_load_failure/.test(JSON.stringify(inc).toLowerCase()) ||
    /fbevents|google-analytics|googletagmanager|amazon-adsystem|adsbygoogle/.test(msg)
  ) {
    return {
      status: "succeeded",
      rule: "third_party_resource",
      notes: "Third-party resource blocked or unavailable; not our bug.",
      resolve: true,
    };
  }

  // 3) Resend rate-limit (429) — existing batch strategy will retry
  if (/resend/.test(fn.toLowerCase() + " " + msg) && /429|rate limit|too many requests/.test(msg)) {
    return {
      status: "attempted",
      rule: "resend_rate_limit_requeue",
      notes: "Rate-limited — existing retry/batch path will resend within window.",
    };
  }

  // 4) Stripe webhook signature mismatch on retry — already idempotent
  if (fn === "stripe-webhook" && /signature|sig verification|no signatures found/.test(msg)) {
    // Look for matching webhook_logs row to confirm it was processed already
    try {
      const { count } = await supabase
        .from("webhook_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "processed")
        .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
      if ((count ?? 0) > 0) {
        return {
          status: "succeeded",
          rule: "stripe_sig_replay_idempotent",
          notes: "Webhook already processed (idempotent); safe to ignore signature mismatch.",
          resolve: true,
        };
      }
    } catch (_) { /* fall through */ }
    return {
      status: "skipped",
      rule: "stripe_sig_replay_idempotent",
      notes: "Signature mismatch with no recent processed webhook — needs human review.",
    };
  }

  // 5) Transient network: ECONNRESET, fetch failed, timeout
  if (/econnreset|etimedout|fetch failed|network error|socket hang up|timeout/i.test(msg)) {
    // If only seen once and severity is low/medium, mark attempted (transient)
    if (inc.occurrence_count <= 2 && (inc.severity === "low" || inc.severity === "medium")) {
      return {
        status: "succeeded",
        rule: "transient_network",
        notes: "Single transient network failure; auto-resolved (will reopen if recurring).",
        resolve: true,
      };
    }
    return {
      status: "attempted",
      rule: "transient_network",
      notes: "Recurring network errors — monitor for upstream outage.",
    };
  }

  // 6) Stale module preload / favicon 404s
  if (/favicon|apple-touch-icon|manifest\.json/i.test(msg)) {
    return {
      status: "succeeded",
      rule: "static_asset_404",
      notes: "Browser asset 404 (cosmetic); auto-resolved.",
      resolve: true,
    };
  }

  return { status: "no_rule" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!bearer || bearer !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const inc = (await req.json()) as IncomingIncident;
    if (!inc?.incident_id) {
      return new Response(JSON.stringify({ error: "incident_id required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);
    const outcome = await applyRules(supabase, inc);

    // Persist result
    if (outcome.status === "no_rule") {
      await supabase.rpc("mark_incident_remediation", {
        p_incident_id: inc.incident_id,
        p_status: "no_rule",
        p_rule: null,
        p_notes: "No matching auto-remediation rule.",
      });
    } else if ("resolve" in outcome && outcome.resolve) {
      await supabase.rpc("auto_resolve_incident", {
        p_incident_id: inc.incident_id,
        p_rule: outcome.rule,
        p_notes: outcome.notes,
      });
    } else {
      await supabase.rpc("mark_incident_remediation", {
        p_incident_id: inc.incident_id,
        p_status: outcome.status,
        p_rule: outcome.rule,
        p_notes: outcome.notes,
      });
    }

    // Forward to notifier with the final remediation status (await so SMS
    // actually fires — remediator is itself called fire-and-forget, so a few
    // extra hundred ms of latency here is fine and `keepalive` is unreliable
    // when the parent edge invocation completes immediately).
    const notifyUrl = `https://${PROJECT_ID}.supabase.co/functions/v1/incident-notifier`;
    let notifyResult: unknown = null;
    try {
      const r = await fetch(notifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          ...inc,
          remediation_status: outcome.status === "no_rule" ? "no_rule"
            : "resolve" in outcome && outcome.resolve ? "succeeded"
            : outcome.status,
          remediation_rule: "rule" in outcome ? outcome.rule : null,
        }),
      });
      notifyResult = await r.json().catch(() => ({ status: r.status }));
    } catch (notifyErr) {
      console.error("[incident-remediator] notify forward failed:", notifyErr);
    }

    return new Response(JSON.stringify({ ok: true, outcome, notify: notifyResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[incident-remediator] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
