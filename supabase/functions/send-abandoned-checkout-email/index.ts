import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Wave = 1;

const WAVE_CONFIG: Record<Wave, {
  ageHours: number;
  fromCol: string | null; // null = captured_at
  markCol: string;
  emailType: string;
  subject: string;
  build: (firstName: string | null, siteUrl: string) => string;
}> = {
  1: {
    ageHours: 1,
    fromCol: null,
    markCol: "email_sent_at",
    emailType: "abandoned_checkout",
    subject: "still thinking about it?",
    build: (firstName, siteUrl) => {
      const greeting = firstName ? `Hey ${firstName}—` : "Hey—";
      return `${greeting}

If you're still on the fence, that's completely normal.

A lot of people aren't sure what to expect… until they're there.

And then by Monday morning, it's usually the same feeling:
"Wow… I needed that. That was my favorite weekend of the year."

If something about this has been sitting with you, that's usually a good sign.

And if you have questions—about the vibe, parking, what the weekend actually feels like—just hit reply.

We read every message and we're happy to talk it through with you.

We want you there, and we want it to feel right.

You can take another look here:
${siteUrl}/tickets

— The Cosmico Team`;
    },
  },
};

async function processWave(
  supabase: ReturnType<typeof createClient>,
  resend: Resend,
  siteUrl: string,
  wave: Wave,
  manualEmail: string | null,
) {
  const cfg = WAVE_CONFIG[wave];
  const cutoff = new Date(Date.now() - cfg.ageHours * 60 * 60 * 1000).toISOString();
  const results = { wave, sent: 0, skipped: 0, errors: 0 };

  let query = supabase
    .from("checkout_abandonment")
    .select("*")
    .is(cfg.markCol, null)
    .is("converted_at", null);

  if (manualEmail) {
    query = query.eq("email", manualEmail);
  } else {
    // Wave 1: gate on captured_at; Waves 2/3: gate on previous email's sent timestamp
    const ageCol = cfg.fromCol ?? "captured_at";
    query = query.not(ageCol, "is", null).lt(ageCol, cutoff);
  }

  const { data: abandoned, error } = await query.limit(50);
  if (error) {
    console.error(`[abandoned-checkout][wave ${wave}] fetch error:`, error.message);
    return results;
  }
  if (!abandoned?.length) return results;

  for (const record of abandoned) {
    try {
      // Skip converted leads
      const { data: paidRegs } = await supabase
        .from("registrations")
        .select("id")
        .eq("email", record.email as string)
        .eq("payment_status", "paid")
        .limit(1);

      if (paidRegs?.length) {
        await supabase
          .from("checkout_abandonment")
          .update({ converted_at: new Date().toISOString() })
          .eq("id", record.id as string);
        results.skipped++;
        continue;
      }

      const recordName = typeof record.name === "string" ? record.name : null;
      const recordEmail = typeof record.email === "string" ? record.email : "";
      const firstName = recordName ? recordName.split(" ")[0] : null;

      const { error: sendError } = await resend.emails.send({
        from: "The Cosmico Team <hello@example.invalid>",
        to: [recordEmail],
        subject: cfg.subject,
        text: cfg.build(firstName, siteUrl),
        reply_to: "hello@example.invalid",
      });

      if (sendError) {
        console.error(`[abandoned-checkout][wave ${wave}] send error ${recordEmail}:`, sendError);
        results.errors++;
        continue;
      }

      await supabase
        .from("checkout_abandonment")
        .update({ [cfg.markCol]: new Date().toISOString() })
        .eq("id", record.id as string);

      await supabase.from("email_logs").insert({
        registration_id: record.id as string,
        email_type: cfg.emailType,
        status: "sent",
      });

      results.sent++;
      // Resend rate limit safety: 2/1100ms
      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      console.error(`[abandoned-checkout][wave ${wave}] error ${record.email}:`, err);
      results.errors++;
    }
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");
    const resend = new Resend(resendApiKey);

    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const manualEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    // Single wave only: 1h after capture. SMS is the second touchpoint.
    // Capped at max 2 messages per lead (Email #1 + SMS).
    const w1 = await processWave(supabase, resend, siteUrl, 1, manualEmail);

    return new Response(JSON.stringify({
      wave_1: w1,
      total_sent: w1.sent,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[abandoned-checkout] Fatal error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
