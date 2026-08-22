import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sendSmsV2 } from "../_shared/sms-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { leads } = await req.json();
    // leads: [{ phone, name, code, email? }]

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return new Response(JSON.stringify({ error: "No leads provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { phone: string; success: boolean; messageId?: string; error?: string }[] = [];

    for (const lead of leads) {
      const firstName = (lead.name || "").trim().split(/\s+/)[0];
      const message = firstName
        ? `${firstName}, Chris from Analog. Here's your 20% off tix code, good for 48hrs:\n\n${lead.code}\n\nA month out, hope you're in. https://example.invalid/tickets`
        : `Chris from Analog. Here's your 20% off tix code, good for 48hrs:\n\n${lead.code}\n\nA month out, hope you're in. https://example.invalid/tickets`;

      const result = await sendSmsV2({
        phone: lead.phone,
        message,
        source: "send-promo-sms-batch",
        relatedEmail: lead.email,
        relatedPromoCode: lead.code,
      });

      results.push({
        phone: lead.phone.replace(/\D/g, ""),
        success: result.ok,
        messageId: result.messageId,
        error: result.error,
      });

      // Rate limit between sends
      await new Promise((r) => setTimeout(r, 500));
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-promo-sms-batch:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
