// Receives delivery / non-delivered reports from SimpleTexting.
// Configure this URL in SimpleTexting (or via /admin/sms-webhook auto-register) for
// triggers: DELIVERY_REPORT and NON_DELIVERED_REPORT.
//
// SimpleTexting payload shape:
// {
//   reportId, webhookId,
//   type: "DELIVERY_REPORT" | "NON_DELIVERED_REPORT",
//   values: { messageId, category, referenceType, accountPhone, contactPhone, carrier, errorCode?, reason? }
// }
//
// Public endpoint (verify_jwt = false) — SimpleTexting cannot send a JWT.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    console.log("[SMS-WEBHOOK] Received:", JSON.stringify(payload));

    const type: string = payload?.type || "";
    const values = payload?.values || {};
    const messageId: string | undefined = values.messageId;
    const contactPhone: string | undefined = values.contactPhone;
    const accountPhone: string | undefined = values.accountPhone;
    const carrier: string | undefined = values.carrier;
    const failureReason: string | undefined =
      values.reason || values.errorMessage || values.errorCode;

    if (!type || (!messageId && !contactPhone)) {
      console.warn("[SMS-WEBHOOK] Missing identifier; ack anyway to prevent retries");
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const isDelivered = type === "DELIVERY_REPORT";
    const newStatus = isDelivered ? "delivered" : "undelivered";
    const updates: Record<string, unknown> = {
      send_status: newStatus,
      delivery_payload: payload,
      carrier: carrier ?? null,
      failure_reason: isDelivered ? null : failureReason ?? null,
      updated_at: new Date().toISOString(),
    };
    if (isDelivered) updates.delivered_at = new Date().toISOString();
    else updates.undelivered_at = new Date().toISOString();

    // Try to find existing log row by messageId, else by most recent send to this phone
    let logId: string | null = null;
    if (messageId) {
      const { data: byId } = await supabase
        .from("sms_delivery_logs")
        .select("id")
        .eq("simpletexting_message_id", messageId)
        .maybeSingle();
      if (byId) logId = byId.id;
    }

    if (!logId && contactPhone) {
      const cleanPhone = contactPhone.replace(/\D/g, "");
      const { data: byPhone } = await supabase
        .from("sms_delivery_logs")
        .select("id")
        .eq("contact_phone", cleanPhone)
        .is("delivered_at", null)
        .is("undelivered_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPhone) {
        logId = byPhone.id;
        if (messageId) updates.simpletexting_message_id = messageId;
      }
    }

    if (logId) {
      const { error: upErr } = await supabase
        .from("sms_delivery_logs")
        .update(updates)
        .eq("id", logId);
      if (upErr) console.error("[SMS-WEBHOOK] Update error:", upErr);
      else console.log(`[SMS-WEBHOOK] Updated log ${logId} -> ${newStatus}`);
    } else {
      // No matching send found — insert a standalone delivery row so we still capture it
      const cleanPhone = (contactPhone || "").replace(/\D/g, "");
      const { error: insErr } = await supabase.from("sms_delivery_logs").insert({
        simpletexting_message_id: messageId ?? null,
        contact_phone: cleanPhone || "unknown",
        account_phone: accountPhone ?? null,
        source: "webhook-orphan",
        send_status: newStatus,
        carrier: carrier ?? null,
        failure_reason: isDelivered ? null : failureReason ?? null,
        delivered_at: isDelivered ? new Date().toISOString() : null,
        undelivered_at: isDelivered ? null : new Date().toISOString(),
        delivery_payload: payload,
      });
      if (insErr) console.error("[SMS-WEBHOOK] Insert error:", insErr);
      else console.log(`[SMS-WEBHOOK] Logged orphan ${newStatus} for ${cleanPhone}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[SMS-WEBHOOK] Error:", error);
    // Always 200 to avoid SimpleTexting retry storms; we logged the issue
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
