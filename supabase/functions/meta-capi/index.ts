import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sendMetaCapiEvent, hashData } from "../_shared/meta-capi-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestBody {
  event_name: string;
  event_id: string;
  event_source_url?: string;
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  user_email?: string;
  user_phone?: string;
  user_first_name?: string;
  user_last_name?: string;
  external_id?: string;
  fbp?: string;
  fbc?: string;
  client_ip?: string;
  client_user_agent?: string;
  test_event_code?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const metaPixelId = Deno.env.get("META_PIXEL_ID");
    const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");

    if (!metaPixelId || !metaAccessToken) {
      console.log("[Meta CAPI] Missing META_PIXEL_ID or META_ACCESS_TOKEN");
      return new Response(
        JSON.stringify({ success: false, error: "CAPI not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();
    const {
      event_name,
      event_id,
      event_source_url,
      value,
      currency = "USD",
      content_ids,
      content_name,
      content_category,
      user_email,
      user_phone,
      user_first_name,
      user_last_name,
      external_id,
      fbp,
      fbc,
      client_ip,
      client_user_agent,
    } = body;

    if (!event_name || !event_id) {
      return new Response(
        JSON.stringify({ success: false, error: "event_name and event_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use real client IP from body (captured on frontend) — fallback to proxy header
    const resolvedClientIp = client_ip ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") || undefined;

    // Delegate to the shared generic CAPI sender
    const result = await sendMetaCapiEvent({
      event_name,
      event_id,
      email: user_email,
      phone: user_phone,
      first_name: user_first_name,
      last_name: user_last_name,
      external_id,
      fbp,
      fbc,
      client_ip: resolvedClientIp,
      client_user_agent,
      value,
      currency,
      content_ids,
      content_name,
      content_category,
      event_source_url: event_source_url || "https://example.invalid",
    });

    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Meta CAPI] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
