// Sends an SMS alert to ops when a QR check-in fails with a high-severity result.
// Invoked from a Postgres trigger via pg_net on check_in_events insert.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendSmsV2 } from "../_shared/sms-v2.ts";
import { getAlertPhone } from "../_shared/operator-config.ts";

const ALERT_PHONE = getAlertPhone(); // OPERATOR_ALERT_PHONE; empty = alert disabled

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      result_code = "unknown",
      station_label = "",
      holder_name = "",
      ticket_type = "",
      message = "",
    } = body ?? {};

    if (!ALERT_PHONE) {
      return new Response(
        JSON.stringify({ ok: false, skipped: "OPERATOR_ALERT_PHONE is not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Keep message GSM-7 + under 160 chars so SimpleTexting SINGLE_SMS_STRICTLY accepts it.
    const label =
      result_code === "db_error" ? "CHECKIN DB ERROR"
      : result_code === "not_found" ? "QR NOT FOUND"
      : `CHECKIN ${result_code}`;

    const time = new Date().toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
    });

    let text = `${label} @${time}`;
    if (station_label) text += ` [${String(station_label).slice(0, 20)}]`;
    if (holder_name) text += ` ${String(holder_name).slice(0, 30)}`;
    if (ticket_type) text += ` ${String(ticket_type).slice(0, 20)}`;
    if (message) text += ` - ${String(message).slice(0, 60)}`;
    text = text.slice(0, 155);

    const result = await sendSmsV2({
      phone: ALERT_PHONE,
      message: text,
      source: "checkin-alert",
    });

    return new Response(JSON.stringify({ ok: result.ok, sms: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("[send-checkin-alert]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
