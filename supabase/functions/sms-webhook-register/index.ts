// Admin-only: registers (or lists/deletes) the SMS delivery webhook with SimpleTexting v2.
// Called from /admin/sms-webhook UI.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ST_BASE = "https://api-app2.simpletexting.com/v2/api";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden: admin only" }, 403);

    const apiKey = Deno.env.get("SIMPLYTEXT_API_KEY");
    if (!apiKey) return json({ error: "SIMPLYTEXT_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const action: "list" | "register" | "delete" = body.action || "list";

    if (action === "list") {
      const resp = await fetch(`${ST_BASE}/webhooks?size=500`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return json({ error: `List failed: ${resp.status}`, details: data }, resp.status);
      return json({ webhooks: data.content ?? data ?? [] });
    }

    if (action === "register") {
      const projectId = Deno.env.get("SUPABASE_URL")!.match(/https:\/\/([^.]+)/)?.[1];
      const url =
        body.url ||
        `https://${projectId}.functions.supabase.co/sms-delivery-webhook`;
      const triggers: string[] = body.triggers || ["DELIVERY_REPORT", "NON_DELIVERED_REPORT"];

      const results: any[] = [];
      // SimpleTexting requires one webhook per trigger type
      for (const trigger of triggers) {
        const resp = await fetch(`${ST_BASE}/webhooks`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            url,
            triggers: [trigger],
            requestPerSecLimit: 25,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        results.push({ trigger, status: resp.status, data });
        console.log(`[REGISTER] ${trigger} -> ${resp.status}`, JSON.stringify(data));
      }
      return json({ url, results });
    }

    if (action === "delete") {
      const id = body.webhook_id;
      if (!id) return json({ error: "webhook_id required" }, 400);
      const resp = await fetch(`${ST_BASE}/webhooks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return json({ ok: resp.ok, status: resp.status });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error: any) {
    console.error("[REGISTER] Error:", error);
    return json({ error: error.message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
