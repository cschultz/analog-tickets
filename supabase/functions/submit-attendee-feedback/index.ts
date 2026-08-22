import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FEEDBACK_TO = "hello@example.invalid";
const FROM_ADDRESS = "Cosmico <hello@example.invalid>";

const CATEGORY_LABELS: Record<string, string> = {
  feedback: "General Feedback",
  support_our_work: "Support Our Work",
  participation: "Participation / Get Involved",
  other: "Other",
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = body.name ? String(body.name).trim().slice(0, 200) : null;
    const category = String(body.category ?? "").trim();
    const message = String(body.message ?? "").trim();

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
    if (!emailValid) {
      return new Response(JSON.stringify({ error: "Valid email required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!CATEGORY_LABELS[category]) {
      return new Response(JSON.stringify({ error: "Invalid category." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (message.length < 5 || message.length > 5000) {
      return new Response(JSON.stringify({ error: "Message must be 5–5000 characters." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    const { error: insertError } = await supabase.from("attendee_feedback").insert({
      email,
      name,
      category,
      message,
      source: "photos_page",
      user_agent: userAgent,
    });

    if (insertError) {
      console.error("[submit-attendee-feedback] insert failed", insertError);
      return new Response(JSON.stringify({ error: "Could not save feedback." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      const subject = `[Photos page] ${CATEGORY_LABELS[category]} — ${name || email}`;
      const html = `
        <div style="font-family: -apple-system, sans-serif; color: #1a1a1a; line-height: 1.6;">
          <p style="margin:0 0 16px 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #888;">
            New feedback from the Photos page
          </p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:20px; font-size:14px;">
            <tr><td style="padding:4px 12px 4px 0; color:#888;">Category</td><td><strong>${escapeHtml(CATEGORY_LABELS[category])}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#888;">Name</td><td>${escapeHtml(name || "—")}</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#888;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          </table>
          <div style="padding:16px 20px; background:#f5f3ee; border-left: 3px solid #c2956b; white-space: pre-wrap; font-size:15px;">
${escapeHtml(message)}
          </div>
        </div>
      `;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [FEEDBACK_TO],
            reply_to: email,
            subject,
            html,
          }),
        });
        if (!res.ok) {
          console.error("[submit-attendee-feedback] resend error", res.status, await res.text());
        }
      } catch (err) {
        console.error("[submit-attendee-feedback] resend exception", err);
      }
    } else {
      console.warn("[submit-attendee-feedback] RESEND_API_KEY not set — email skipped");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[submit-attendee-feedback] unexpected", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
