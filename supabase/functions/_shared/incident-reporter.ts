// Lightweight incident reporter used by edge functions to log structured errors
// into the `edge_function_incidents` table. Dedupes by a stable signature so
// the same error doesn't create a new row every time — it just bumps the count.
//
// Usage:
//   try { ... } catch (err) {
//     await reportIncident({ functionName: 'my-fn', error: err, severity: 'high' });
//     throw err;
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

type Severity = "low" | "medium" | "high" | "critical";

export interface ReportIncidentArgs {
  functionName: string;
  error: unknown;
  message?: string;
  severity?: Severity;
  source?: "edge_function" | "frontend" | "webhook";
  context?: Record<string, unknown>;
}

const PROJECT_ID = "hglwwpcwlndozzahyuyx";

// Normalize an error message into a stable signature (strip ids, urls, numbers,
// hashes) so transient runtime values don't fragment the dedupe.
function buildSignature(functionName: string, raw: string): string {
  const cleaned = raw
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "<uuid>")
    .replace(/\b\d{6,}\b/g, "<num>")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[a-f0-9]{16,}/gi, "<hash>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return `${functionName}::${cleaned}`;
}

export async function reportIncident(args: ReportIncidentArgs): Promise<void> {
  try {
    const errAny = args.error as any;
    let rawMessage =
      args.message ||
      (errAny instanceof Error ? errAny.message : String(errAny?.message ?? args.error ?? ""));
    const stack = errAny?.stack ? String(errAny.stack).split("\n").slice(0, 8).join("\n") : null;

    // Never log a bare "unknown error" — try to recover something useful so
    // the incident has signal worth investigating.
    if (!rawMessage || rawMessage === "unknown error" || rawMessage === "[object Object]") {
      if (stack) {
        rawMessage = stack.split("\n")[0] || "unknown error";
      } else if (errAny && typeof errAny === "object") {
        try {
          const json = JSON.stringify(errAny).slice(0, 300);
          if (json && json !== "{}") rawMessage = `unstructured error: ${json}`;
        } catch { /* ignore */ }
      }
      // Still nothing useful? Skip — don't pollute the dashboard.
      if (!rawMessage || rawMessage === "unknown error") {
        console.warn("[incident-reporter] skipped empty error for", args.functionName);
        return;
      }
    }

    const signature = buildSignature(args.functionName, rawMessage);
    const severity = args.severity ?? "medium";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error: rpcErr } = await supabase.rpc("report_incident", {
      p_signature: signature,
      p_function_name: args.functionName,
      p_message: rawMessage.slice(0, 2000),
      p_source: args.source ?? "edge_function",
      p_severity: severity,
      p_sample_stack: stack,
      p_sample_context: args.context ?? null,
    });

    if (rpcErr) {
      console.error("[incident-reporter] rpc failed:", rpcErr.message);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;

    // Fire-and-forget remediator (it classifies + auto-fixes if possible,
    // then forwards to incident-notifier with the resolved status so SMS
    // routing reflects whether the system was able to self-heal).
    const remediateUrl = `https://${PROJECT_ID}.supabase.co/functions/v1/incident-remediator`;
    fetch(remediateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
      },
      body: JSON.stringify({
        incident_id: row.id,
        is_new: row.is_new,
        occurrence_count: row.occurrence_count,
        severity: row.severity,
        function_name: args.functionName,
        message: rawMessage.slice(0, 500),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {
    // Reporter must never throw.
    console.error("[incident-reporter] swallowed:", (e as Error)?.message);
  }
}
