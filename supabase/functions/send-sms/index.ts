import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendSmsV2 } from "../_shared/sms-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden: Admin role required" }, 403);

    const { to, message, leadEmail } = await req.json();
    if (!to || !message) return json({ error: "Missing required fields: to, message" }, 400);

    // Send via v2 API + log
    const result = await sendSmsV2({
      phone: to,
      message,
      source: "send-sms",
      relatedEmail: leadEmail,
    });

    if (!result.ok) {
      console.error(`[SEND-SMS] failed [${result.status}]:`, result.error);
      return json({ error: result.error || "SMS send failed" }, 500);
    }

    // Log to lead_notes if we have the lead email
    if (leadEmail) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: leadTracking } = await supabaseAdmin
        .from("lead_tracking")
        .select("id")
        .eq("email", leadEmail)
        .maybeSingle();

      if (leadTracking) {
        await supabaseAdmin.from("lead_notes").insert({
          lead_id: leadTracking.id,
          note: `📱 SMS sent to ${to}: "${message.substring(0, 100)}${message.length > 100 ? "..." : ""}"`,
          created_by: user.id,
        });

        await supabaseAdmin.from("lead_tracking")
          .update({ last_contacted_at: new Date().toISOString(), status: "contacted" })
          .eq("id", leadTracking.id)
          .eq("status", "new");
      }
    }

    console.log(`SMS sent to ${to} (msgId=${result.messageId})`);
    return json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    console.error("Error sending SMS:", error);
    return json({ error: error?.message || "Failed to send SMS" }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
