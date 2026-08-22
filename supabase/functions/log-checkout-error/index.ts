import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { checkRateLimitDb } from "../_shared/error-utils.ts";

const ALLOWED_ERROR_TYPES = new Set(['validation', 'stripe', 'database', 'network', 'unknown', 'promo_code_rejected']);
const MAX_STR = 2000;
const MAX_STACK = 8000;
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s: unknown, n: number) => (s == null ? s : String(s).slice(0, n));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CheckoutErrorPayload {
  error_type: 'validation' | 'stripe' | 'database' | 'network' | 'unknown';
  error_message: string;
  error_code?: string;
  ticket_type?: string;
  user_email?: string;
  user_agent?: string;
  session_id?: string;
  request_payload?: Record<string, unknown>;
  stack_trace?: string;
}

// Parse user agent to extract browser and device info
function parseUserAgent(ua: string | null): { browser: string; device_type: string } {
  if (!ua) return { browser: 'Unknown', device_type: 'unknown' };
  
  // Device type detection
  let device_type = 'desktop';
  if (/Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    device_type = /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile';
  }
  
  // Browser detection
  let browser = 'Unknown';
  if (/Chrome/.test(ua) && !/Edge|Edg/.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox/.test(ua)) {
    browser = 'Firefox';
  } else if (/Edge|Edg/.test(ua)) {
    browser = 'Edge';
  } else if (/Opera|OPR/.test(ua)) {
    browser = 'Opera';
  } else if (/MSIE|Trident/.test(ua)) {
    browser = 'IE';
  }
  
  return { browser, device_type };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const alertEmail = "hello@example.invalid";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limit: per-IP, 30 req / 10 min
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rl = await checkRateLimitDb(clientIp, "log-checkout-error", 30, 600);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawPayload: CheckoutErrorPayload = await req.json();

    // Validate + clip inputs
    const error_type = ALLOWED_ERROR_TYPES.has(rawPayload.error_type as string)
      ? (rawPayload.error_type as string)
      : 'unknown';
    const payload: CheckoutErrorPayload = {
      ...rawPayload,
      error_type: error_type as CheckoutErrorPayload['error_type'],
      error_message: clip(rawPayload.error_message, MAX_STR) ?? "",
      error_code: clip(rawPayload.error_code, 100) as string | undefined,
      ticket_type: clip(rawPayload.ticket_type, 100) as string | undefined,
      user_email: clip(rawPayload.user_email, 320) as string | undefined,
      stack_trace: clip(rawPayload.stack_trace, MAX_STACK) as string | undefined,
      session_id: clip(rawPayload.session_id, 200) as string | undefined,
    };

    const userAgent = req.headers.get("user-agent");
    const { browser, device_type } = parseUserAgent(userAgent || payload.user_agent || null);

    // Get active event ID
    const { data: activeEvent } = await supabase
      .from("event_details")
      .select("id")
      .eq("is_active", true)
      .single();

    // Insert error record
    const { data: errorRecord, error: insertError } = await supabase
      .from("checkout_errors")
      .insert({
        error_type: payload.error_type,
        error_message: payload.error_message,
        error_code: payload.error_code,
        ticket_type: payload.ticket_type,
        user_email: payload.user_email,
        user_agent: clip(userAgent || payload.user_agent, 500),
        browser,
        device_type,
        request_payload: payload.request_payload,
        stack_trace: payload.stack_trace,
        session_id: payload.session_id,
        event_id: activeEvent?.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[log-checkout-error] Insert failed:", insertError);
      throw insertError;
    }

    console.log(`[log-checkout-error] Logged error: ${payload.error_type} - ${payload.error_message.substring(0, 100)}`);

    // For critical errors (stripe, database), check threshold before alerting
    // Only alert if 3+ errors in last 10 minutes
    if ((payload.error_type === 'stripe' || payload.error_type === 'database') && resendApiKey) {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      const { count: recentErrorCount } = await supabase
        .from("checkout_errors")
        .select("*", { count: "exact", head: true })
        .in("error_type", ["stripe", "database"])
        .gte("created_at", tenMinutesAgo);
      
      const errorThreshold = 3;
      
      if ((recentErrorCount ?? 0) >= errorThreshold) {
        // Check if we already sent an alert in the last 10 minutes
        const { data: recentAlerts } = await supabase
          .from("checkout_errors")
          .select("id")
          .eq("error_type", payload.error_type)
          .gte("created_at", tenMinutesAgo)
          .not("id", "eq", errorRecord.id)
          .limit(errorThreshold);
        
        // Only send if this is the threshold-crossing error (avoid duplicate alerts)
        const shouldAlert = (recentAlerts?.length ?? 0) === errorThreshold - 1;
        
        if (shouldAlert) {
          try {
            const resend = new Resend(resendApiKey);
            
            await resend.emails.send({
              from: "Cosmico Alerts <alerts@example.invalid>",
              to: [alertEmail],
              subject: `⚠️ Checkout Alert: ${recentErrorCount} errors in 10 min`,
              html: `
                <h2 style="color: #dc2626;">Checkout Error Threshold Reached</h2>
                <p><strong>${recentErrorCount} checkout errors</strong> detected in the last 10 minutes.</p>
                <h3>Latest Error:</h3>
                <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                  <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Type</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(payload.error_type)}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Message</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(payload.error_message)}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Browser</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(browser)}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Device</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(device_type)}</td></tr>
                  ${payload.ticket_type ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Ticket Type</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(payload.ticket_type)}</td></tr>` : ''}
                  ${payload.user_email ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">User Email</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${esc(payload.user_email)}</td></tr>` : ''}
                </table>
                <p style="margin-top: 20px;">
                  <a href="https://example.invalid/admin/checkout-health" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    View Dashboard
                  </a>
                </p>
              `,
            });
            console.log("[log-checkout-error] Threshold alert email sent");
          } catch (emailError) {
            console.error("[log-checkout-error] Failed to send alert email:", emailError);
          }
        } else {
          console.log(`[log-checkout-error] Threshold reached but alert already sent (${recentErrorCount} errors)`);
        }
      } else {
        console.log(`[log-checkout-error] Below threshold: ${recentErrorCount}/${errorThreshold} errors in 10 min`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        error_id: errorRecord.id,
        message: "Error logged successfully" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[log-checkout-error] Error:", errorMessage);
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
