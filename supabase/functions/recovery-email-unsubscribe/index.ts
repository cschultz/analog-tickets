// Public unsubscribe endpoint for abandoned-checkout recovery emails.
// GET /recovery-email-unsubscribe?e=<email>&t=<hmac>  -> renders confirmation page + records opt-out
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export async function unsubToken(email: string): Promise<string> {
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
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function page(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
  body{font-family:Georgia,serif;background:#f7f3ec;color:#1a1a1a;margin:0;padding:48px 20px;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{max-width:520px;background:#fff;padding:40px 32px;border:1px solid #e5dfd2;border-radius:4px;text-align:center}
  h1{font-size:22px;margin:0 0 16px;font-weight:500;letter-spacing:.02em}
  p{font-size:15px;line-height:1.6;color:#4a4a4a;margin:0 0 12px}
  .sig{margin-top:28px;font-style:italic;color:#7a7a7a;font-size:13px}
</style></head><body><div class="card"><h1>${title}</h1>${body}<p class="sig">— Chris &amp; Anne, Cosmico</p></div></body></html>`;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const email = (url.searchParams.get("e") || "").trim().toLowerCase();
    const token = url.searchParams.get("t") || "";
    if (!email || !token) {
      return new Response(page("Invalid link", "<p>This unsubscribe link is missing information.</p>"), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }
    const expected = await unsubToken(email);
    if (token !== expected) {
      return new Response(page("Invalid link", "<p>This unsubscribe link is invalid or has expired.</p>"), {
        status: 400, headers: { "Content-Type": "text/html" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await supabase.from("recovery_email_unsubscribes").upsert(
      { email, scope: "abandoned_checkout", source: "email_link" },
      { onConflict: "email" },
    );
    if (error) throw error;

    return new Response(
      page(
        "You're unsubscribed",
        `<p><strong>${email}</strong> won't receive any more abandoned checkout reminders.</p><p>You'll still receive transactional emails (receipts, ticket confirmations) related to any purchase you complete.</p>`,
      ),
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
  } catch (e: any) {
    console.error("[recovery-email-unsubscribe] error:", e?.message);
    return new Response(page("Something went wrong", "<p>Please email hello@example.invalid and we'll take care of it.</p>"), {
      status: 500, headers: { "Content-Type": "text/html" },
    });
  }
});
