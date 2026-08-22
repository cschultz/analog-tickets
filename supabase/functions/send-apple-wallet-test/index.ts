// Sends a test Apple Wallet pass as an email attachment.
// POST /send-apple-wallet-test
// Body: { ticket_id?: string, to: string }
// If ticket_id omitted, uses the most recent active ticket.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const FROM = "Cosmico <noreply@example.invalid>";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const to: string = body.to;
    let ticketId: string | undefined = body.ticket_id;

    if (!to) {
      return json({ error: "to is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    if (!ticketId) {
      const { data } = await supabase
        .from("tickets")
        .select("id")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      ticketId = data?.id;
      if (!ticketId) return json({ error: "no active ticket found" }, 404);
    }

    // Generate the .pkpass via the existing function
    const passUrl = `${SUPABASE_URL}/functions/v1/generate-apple-wallet-pass?ticket_id=${ticketId}`;
    const passRes = await fetch(passUrl, {
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
    });
    if (!passRes.ok) {
      const errText = await passRes.text();
      return json(
        { error: `pass generation failed: ${passRes.status} ${errText}` },
        500,
      );
    }
    const passBytes = new Uint8Array(await passRes.arrayBuffer());

    // base64 encode
    let bin = "";
    for (let i = 0; i < passBytes.length; i++) {
      bin += String.fromCharCode(passBytes[i]);
    }
    const passBase64 = btoa(bin);

    const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f0e6;font-family:Georgia,serif;color:#141414;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;padding:40px 0;">
      <tr><td align="center">
        <div style="color:#f5f0e6;font-size:14px;letter-spacing:0.4em;text-transform:uppercase;">Cosmico 2026</div>
        <div style="color:#b4aa96;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin-top:8px;">Apple Wallet · Test Pass</div>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e6;padding:40px 24px;">
      <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr><td style="font-size:18px;line-height:1.6;color:#141414;padding-bottom:24px;">
            Your Apple Wallet ticket is attached.
          </td></tr>
          <tr><td style="font-size:15px;line-height:1.7;color:#3a3a3a;padding-bottom:24px;">
            On iPhone, open the attached <strong>.pkpass</strong> file. Apple Wallet will prompt
            you to add it. The pass shows your name, ticket type, event date, and a QR code our
            box office scans for check-in at Wildhaven.
          </td></tr>
          <tr><td style="font-size:13px;line-height:1.7;color:#7a7060;padding-top:16px;border-top:1px solid #d8cfbe;">
            This is a test from the Cosmico build. Reply to this thread if anything looks off — wrong name, wrong tier, broken artwork.
          </td></tr>
          <tr><td style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#9a8d75;padding-top:32px;text-align:center;">
            example.invalid
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

    const resend = new Resend(RESEND_API_KEY);
    const { data: sent, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: "Your Cosmico Apple Wallet pass (test)",
      html,
      attachments: [
        {
          filename: `analog-reunion-${ticketId.slice(0, 8)}.pkpass`,
          content: passBase64,
        },
      ],
    });

    if (error) {
      console.error("resend error", error);
      return json({ error: error.message ?? String(error) }, 500);
    }

    return json({ ok: true, ticket_id: ticketId, message_id: sent?.id });
  } catch (e) {
    console.error("send-apple-wallet-test error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
