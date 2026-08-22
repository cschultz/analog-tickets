// Shared helper: send SMS via SimpleTexting v2 API and log to sms_delivery_logs.
// Returns the SimpleTexting messageId (when available) so callers can correlate webhook events.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface SendV2Args {
  phone: string;            // any format; will be cleaned to digits
  message: string;
  source: string;           // 'send-sms' | 'send-promo-sms-batch' | 'backfill-popup-sms' | etc.
  relatedEmail?: string;
  relatedLeadId?: string;
  relatedPromoCode?: string;
  accountPhone?: string;    // optional; SimpleTexting uses primary if omitted
}

export interface SendV2Result {
  ok: boolean;
  messageId?: string;
  status: number;
  error?: string;
  logId?: string;
}

export async function sendSmsV2(args: SendV2Args): Promise<SendV2Result> {
  const apiKey = Deno.env.get("SIMPLYTEXT_API_KEY");
  if (!apiKey) return { ok: false, status: 500, error: "SIMPLYTEXT_API_KEY missing" };

  const cleanPhone = args.phone.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    return { ok: false, status: 400, error: `Invalid phone: ${args.phone}` };
  }

  const supabase = getServiceClient();

  // Pre-insert log row in 'queued' state so even a network failure is visible
  const { data: log, error: logErr } = await supabase
    .from("sms_delivery_logs")
    .insert({
      contact_phone: cleanPhone,
      account_phone: args.accountPhone ?? null,
      message_text: args.message,
      source: args.source,
      related_email: args.relatedEmail ?? null,
      related_lead_id: args.relatedLeadId ?? null,
      related_promo_code: args.relatedPromoCode ?? null,
      send_status: "queued",
    })
    .select("id")
    .single();

  if (logErr) console.error("[SMS-V2] Failed to pre-log:", logErr);
  const logId = log?.id as string | undefined;

  // Send via v2 API — returns { id, credits } on success
  const payload: Record<string, unknown> = {
    contactPhone: cleanPhone,
    mode: "SINGLE_SMS_STRICTLY",
    text: args.message,
  };
  if (args.accountPhone) payload.accountPhone = args.accountPhone.replace(/\D/g, "");

  let resp: Response;
  try {
    resp = await fetch("https://api-app2.simpletexting.com/v2/api/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    if (logId) await supabase.from("sms_delivery_logs").update({
      send_status: "failed", send_error: e.message,
    }).eq("id", logId);
    return { ok: false, status: 0, error: e.message, logId };
  }

  const data = await resp.json().catch(() => ({} as any));

  if (resp.ok && data.id) {
    if (logId) await supabase.from("sms_delivery_logs").update({
      simpletexting_message_id: data.id,
      send_status: "sent",
      send_response: data,
    }).eq("id", logId);
    return { ok: true, messageId: data.id, status: resp.status, logId };
  }

  const errMsg = data?.message || data?.error || `HTTP ${resp.status}`;
  if (logId) await supabase.from("sms_delivery_logs").update({
    send_status: "failed",
    send_error: errMsg,
    send_response: data,
  }).eq("id", logId);
  return { ok: false, status: resp.status, error: errMsg, logId };
}

let _client: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  return _client;
}
