import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Lightweight edge function that returns the caller's real IP address.
 * Used by the frontend to capture client IP for Meta CAPI match quality,
 * since browser JS cannot reliably determine its own public IP.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  return new Response(
    JSON.stringify({ ip: clientIp }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
