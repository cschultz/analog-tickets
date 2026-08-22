// Sends one-shot recovery emails to abandoned ticket checkouts.
// Targets registrations with payment_status='expired', no recovery_email_sent_at,
// updated >= 2h ago. Includes a signed "Resume booking" link and unsubscribe link.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://example.invalid";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function hmacSlice(input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const hmacToken = (id: string) => hmacSlice(`resume:${id}`);
const unsubToken = (email: string) => hmacSlice(`unsub:${email.trim().toLowerCase()}`);

function buildEmail(firstName: string | null, resumeUrl: string, unsubUrl: string) {
  const greeting = firstName ? `Hey ${firstName}—` : "Hey—";
  return `${greeting}

You started checking out for Cosmico and didn't quite finish.

We're capped at 700 people and tickets are moving — we wanted to make sure life didn't just get in the way.

Pick up right where you left off, your cart is still here:

${resumeUrl}

If you ran into a snag or have a question, hit reply and we'll help you through it.

— The Cosmico Team

---
Don't want these reminders? Unsubscribe: ${unsubUrl}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

    let dryRun = false;
    let registrationIds: string[] | null = null;
    let force = false;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
      force = body?.force === true;
      if (Array.isArray(body?.registrationIds) && body.registrationIds.length > 0) {
        registrationIds = body.registrationIds.filter((x: any) => typeof x === "string").slice(0, 50);
      }
    } catch (_) {}

    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("registrations")
      .select("id, email, name, ticket_type, recovery_email_sent_at, updated_at, payment_status");

    if (registrationIds && registrationIds.length > 0) {
      query = query.in("id", registrationIds);
    } else {
      query = query
        .eq("payment_status", "expired")
        .is("recovery_email_sent_at", null)
        .lt("updated_at", cutoff)
        .limit(25);
    }

    const { data: regs, error } = await query;
    if (error) throw error;

    const results: any[] = [];
    for (const r of regs || []) {
      if (!r.email || r.email.includes("+test") || r.email.includes("smoke")) {
        await supabase
          .from("registrations")
          .update({ recovery_email_sent_at: new Date().toISOString() })
          .eq("id", r.id);
        continue;
      }

      const emailLower = r.email.trim().toLowerCase();

      // Per-email cooldown / cap (skip when force=true via admin)
      const COOLDOWN_HOURS = 72;
      const MAX_SENDS = 2;
      if (!force) {
        const { data: sendRec } = await supabase
          .from("recovery_email_sends")
          .select("send_count, last_sent_at")
          .eq("email", emailLower)
          .eq("scope", "ticket")
          .maybeSingle();
        if (sendRec) {
          const hoursSince = (Date.now() - new Date(sendRec.last_sent_at).getTime()) / 3600000;
          if (sendRec.send_count >= MAX_SENDS) {
            results.push({ id: r.id, email: r.email, action: "SKIPPED_MAX_SENDS", send_count: sendRec.send_count });
            await supabase
              .from("registrations")
              .update({ recovery_email_sent_at: new Date().toISOString() })
              .eq("id", r.id);
            continue;
          }
          if (hoursSince < COOLDOWN_HOURS) {
            results.push({ id: r.id, email: r.email, action: "SKIPPED_COOLDOWN", hours_since: Math.round(hoursSince) });
            continue;
          }
        }
      }

      // Skip if unsubscribed
      const { data: unsub } = await supabase
        .from("recovery_email_unsubscribes")
        .select("email")
        .eq("email", emailLower)
        .limit(1);
      if (unsub?.length) {
        await supabase
          .from("registrations")
          .update({ recovery_email_sent_at: new Date().toISOString() })
          .eq("id", r.id);
        results.push({ id: r.id, email: r.email, action: "SKIPPED_UNSUBSCRIBED" });
        continue;
      }

      // Skip if this email already has a paid registration
      const { data: paid } = await supabase
        .from("registrations")
        .select("id")
        .eq("email", r.email)
        .eq("payment_status", "paid")
        .limit(1);
      if (paid?.length) {
        await supabase
          .from("registrations")
          .update({ recovery_email_sent_at: new Date().toISOString() })
          .eq("id", r.id);
        continue;
      }

      const firstName = (r.name || "").split(" ")[0] || null;
      const token = await hmacToken(r.id);
      const resumeUrl = `${SUPABASE_URL}/functions/v1/resume-ticket-checkout?id=${r.id}&t=${token}`;
      const uToken = await unsubToken(emailLower);
      const unsubUrl = `${SUPABASE_URL}/functions/v1/recovery-email-unsubscribe?e=${encodeURIComponent(emailLower)}&t=${uToken}`;

      if (dryRun) {
        results.push({ id: r.id, email: r.email, action: "WOULD_SEND", resumeUrl, unsubUrl });
        continue;
      }

      try {
        await resend.emails.send({
          from: "The Cosmico Team <hello@example.invalid>",
          to: [r.email],
          reply_to: "hello@example.invalid",
          subject: "your tickets are still here",
          text: buildEmail(firstName, resumeUrl, unsubUrl),
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        await supabase
          .from("registrations")
          .update({ recovery_email_sent_at: new Date().toISOString() })
          .eq("id", r.id);
        await supabase.from("email_logs").insert({
          registration_id: r.id,
          email_type: "abandoned_ticket_recovery",
          status: "sent",
        });
        // Upsert per-email cooldown counter
        const { data: existing } = await supabase
          .from("recovery_email_sends")
          .select("send_count")
          .eq("email", emailLower)
          .eq("scope", "ticket")
          .maybeSingle();
        await supabase.from("recovery_email_sends").upsert({
          email: emailLower,
          scope: "ticket",
          last_sent_at: new Date().toISOString(),
          send_count: (existing?.send_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: "email,scope" });
        results.push({ id: r.id, email: r.email, action: "SENT" });
        await new Promise((res) => setTimeout(res, 1100));
      } catch (e: any) {
        console.error(`[send-abandoned-ticket-email] send failed ${r.id}:`, e.message);
        results.push({ id: r.id, email: r.email, action: "FAILED", error: e.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: regs?.length || 0, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    console.error("[send-abandoned-ticket-email] error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
