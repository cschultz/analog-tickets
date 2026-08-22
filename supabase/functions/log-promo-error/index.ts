import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      attempted_code,
      email,
      ticket_type,
      order_total,
      reason,
      error_code,
      page,
    } = body ?? {};

    if (!attempted_code || !reason || !error_code) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userAgent = req.headers.get("user-agent") || null;

    await supabase.from("checkout_errors").insert({
      error_type: "promo_code_rejected",
      error_message: String(reason).slice(0, 500),
      error_code: String(error_code).slice(0, 50),
      ticket_type: ticket_type || null,
      user_email: typeof email === "string" ? email.toLowerCase() : null,
      user_agent: userAgent,
      request_payload: {
        attempted_code: String(attempted_code).slice(0, 100),
        order_total: order_total ?? null,
        page: page ?? null,
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
