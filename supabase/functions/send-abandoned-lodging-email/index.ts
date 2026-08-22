import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://example.invalid";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function unsubToken(email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`unsub:${email.trim().toLowerCase()}`),
  );
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function buildEmail(firstName: string | null, zoneLabel: string, unsubUrl: string) {
  const greeting = firstName ? `Hey ${firstName}—` : "Hey—";
  return `${greeting}

Looks like you started booking ${zoneLabel || "your stay"} for Cosmico and didn't quite finish.

Tents and zones are going fast — once they're gone, they're gone.

If you ran into a snag, hit reply and we'll help.
If life got in the way, you can pick up right where you left off:

${SITE_URL}/my-tickets

— The Cosmico Team

---
Don't want these reminders? Unsubscribe: ${unsubUrl}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

    let dryRun = false;
    try { const body = await req.json(); dryRun = body?.dryRun === true; } catch (_) {}

    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: bookings, error } = await supabase
      .from("lodging_bookings")
      .select("id, email, name, zone_key, recovery_email_sent_at, updated_at, payment_status")
      .eq("payment_status", "expired")
      .is("recovery_email_sent_at", null)
      .lt("updated_at", cutoff)
      .limit(25);

    if (error) throw error;

    const results: any[] = [];
    for (const b of bookings || []) {
      if (!b.email || b.email.includes("+test") || b.email.includes("smoke")) continue;

      const emailLower = b.email.trim().toLowerCase();

      // Per-email cooldown / cap
      const COOLDOWN_HOURS = 72;
      const MAX_SENDS = 2;
      const { data: sendRec } = await supabase
        .from("recovery_email_sends")
        .select("send_count, last_sent_at")
        .eq("email", emailLower)
        .eq("scope", "lodging")
        .maybeSingle();
      if (sendRec) {
        const hoursSince = (Date.now() - new Date(sendRec.last_sent_at).getTime()) / 3600000;
        if (sendRec.send_count >= MAX_SENDS) {
          results.push({ id: b.id, email: b.email, action: "SKIPPED_MAX_SENDS" });
          await supabase
            .from("lodging_bookings")
            .update({ recovery_email_sent_at: new Date().toISOString() })
            .eq("id", b.id);
          continue;
        }
        if (hoursSince < COOLDOWN_HOURS) {
          results.push({ id: b.id, email: b.email, action: "SKIPPED_COOLDOWN" });
          continue;
        }
      }

      const { data: unsub } = await supabase
        .from("recovery_email_unsubscribes")
        .select("email")
        .eq("email", emailLower)
        .limit(1);
      if (unsub?.length) {
        await supabase
          .from("lodging_bookings")
          .update({ recovery_email_sent_at: new Date().toISOString() })
          .eq("id", b.id);
        results.push({ id: b.id, email: b.email, action: "SKIPPED_UNSUBSCRIBED" });
        continue;
      }

      const firstName = (b.name || "").split(" ")[0] || null;
      const zoneLabel = (b.zone_key || "").replace(/_/g, " ");
      const uToken = await unsubToken(emailLower);
      const unsubUrl = `${SUPABASE_URL}/functions/v1/recovery-email-unsubscribe?e=${encodeURIComponent(emailLower)}&t=${uToken}`;

      if (dryRun) {
        results.push({ id: b.id, email: b.email, action: "WOULD_SEND", unsubUrl });
        continue;
      }

      try {
        await resend.emails.send({
          from: "Cosmico <hello@example.invalid>",
          to: [b.email],
          reply_to: "hello@example.invalid",
          subject: "still want that spot?",
          text: buildEmail(firstName, zoneLabel, unsubUrl),
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        await supabase
          .from("lodging_bookings")
          .update({ recovery_email_sent_at: new Date().toISOString() })
          .eq("id", b.id);
        await supabase.from("recovery_email_sends").upsert({
          email: emailLower,
          scope: "lodging",
          last_sent_at: new Date().toISOString(),
          send_count: (sendRec?.send_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: "email,scope" });
        results.push({ id: b.id, email: b.email, action: "SENT" });
        await new Promise((r) => setTimeout(r, 1100));
      } catch (e: any) {
        console.error(`[send-abandoned-lodging-email] send failed ${b.id}:`, e.message);
        results.push({ id: b.id, email: b.email, action: "FAILED", error: e.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: bookings?.length || 0, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    console.error("[send-abandoned-lodging-email] error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
