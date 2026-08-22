import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-utils.ts";
import { getEventId } from "../_shared/operator-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EVENT_ID = getEventId("PRIMARY_EVENT_ID");
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MIN = 60;
const REFLECTION_MIN = 25;
const REFLECTION_MAX = 5000;

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  if (v.length > 255) return null;
  return v;
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function isRateLimited(
  supabase: ReturnType<typeof getServiceClient>,
  ip: string,
): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
  const { count } = await supabase
    .from("photo_access_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("action", "verify")
    .eq("succeeded", false)
    .gte("created_at", since);
  return (count ?? 0) >= RATE_LIMIT_MAX;
}

async function logAccess(
  supabase: ReturnType<typeof getServiceClient>,
  email: string | null,
  ip: string,
  action: string,
  succeeded: boolean,
) {
  await supabase
    .from("photo_access_log")
    .insert({ email, ip_address: ip, action, succeeded });
}

async function findRegistration(
  supabase: ReturnType<typeof getServiceClient>,
  email: string,
) {
  // 1. Prefer a paid/payment_plan registration (gives us a real name)
  const { data: reg } = await supabase
    .from("registrations")
    .select("name, payment_status")
    .eq("event_id", EVENT_ID)
    .eq("email", email)
    .in("payment_status", ["paid", "payment_plan"])
    .limit(1);
  if (reg?.[0]) return reg[0];

  // 2. Any registration record (guest list, comp, pending, transfer, etc.)
  const { data: anyReg } = await supabase
    .from("registrations")
    .select("name, payment_status")
    .eq("email", email)
    .limit(1);
  if (anyReg?.[0]) return anyReg[0];

  // 3. Fallback: anyone we have an email for anywhere in the system.
  //    flodesk_sync_queue is our canonical "every email we've ever touched" registry.
  const { data: queued } = await supabase
    .from("flodesk_sync_queue")
    .select("first_name, last_name")
    .eq("email", email)
    .limit(1);
  if (queued?.[0]) {
    const name = [queued[0].first_name, queued[0].last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return { name: name || null, payment_status: "known_contact" };
  }

  // 4. Ticket transfers — new holder may not have a registration yet
  const { data: transfer } = await supabase
    .from("ticket_transfers")
    .select("new_holder_name")
    .eq("new_holder_email", email)
    .limit(1);
  if (transfer?.[0]) {
    return { name: transfer[0].new_holder_name ?? null, payment_status: "transfer" };
  }

  // 5. Approved photo invite requests (auto-approved when requested)
  const { data: invite } = await supabase
    .from("photo_invite_requests")
    .select("name")
    .eq("email", email)
    .eq("status", "approved")
    .limit(1);
  if (invite?.[0]) {
    return { name: invite[0].name ?? null, payment_status: "invite_approved" };
  }

  return null;
}

async function sendInviteApprovalEmail(email: string, name: string | null) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("[photo-gallery] RESEND_API_KEY not set, skipping invite email");
    return;
  }
  const firstName = (name ?? "").trim().split(/\s+/)[0] || null;
  const link = `https://example.invalid/photos?email=${encodeURIComponent(email)}`;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color: #2b2b2b; line-height: 1.6; max-width: 560px;">
      <p>${greeting}</p>
      <p>You're in. Tap the link below and we'll drop you straight into the Cosmico 2026 photo gallery — we'll just ask for a short reflection on the weekend first.</p>
      <p style="margin: 28px 0;">
        <a href="${link}" style="background:#c4654a;color:#fff;padding:14px 22px;border-radius:4px;text-decoration:none;font-weight:500;letter-spacing:0.02em;">View the photos</a>
      </p>
      <p style="font-size:13px;color:#666;">Or paste this link: <br/><a href="${link}" style="color:#c4654a;">${link}</a></p>
      <p style="margin-top:32px;">— Chris &amp; Anne</p>
    </div>
  `;
  const text = `${greeting}\n\nYou're in. Open the link below and we'll drop you into the Cosmico 2026 photo gallery — we'll just ask for a short reflection on the weekend first.\n\n${link}\n\n— The Cosmico Team`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "The Cosmico Team <hello@example.invalid>",
        to: [email],
        reply_to: "hello@example.invalid",
        subject: "Your Cosmico photos are ready",
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error("[photo-gallery] invite email send failed", res.status, await res.text());
    }
  } catch (err) {
    console.error("[photo-gallery] invite email error", err);
  }
}

async function getReflection(
  supabase: ReturnType<typeof getServiceClient>,
  email: string,
) {
  const { data } = await supabase
    .from("event_reflections")
    .select("reflection_text, updated_at")
    .eq("event_id", EVENT_ID)
    .eq("email", email)
    .maybeSingle();
  return data;
}

async function getPhotoLinks(supabase: ReturnType<typeof getServiceClient>) {
  const { data } = await supabase
    .from("event_photo_links")
    .select("id, photographer_name, instagram_handle, description, url, cover_images, sort_order")
    .eq("event_id", EVENT_ID)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();
    const ip = getClientIp(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const email = normalizeEmail(body.email);

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid email." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "verify") {
      if (await isRateLimited(supabase, ip)) {
        await logAccess(supabase, email, ip, "verify", false);
        return new Response(
          JSON.stringify({ error: "Too many attempts. Try again in an hour." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const reg = await findRegistration(supabase, email);
      await logAccess(supabase, email, ip, "verify", !!reg);
      if (!reg) {
        return new Response(
          JSON.stringify({
            valid: false,
            can_request_invite: true,
            error:
              "We don't have that email on file. If you were there, request an invite below and we'll add you.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const reflection = await getReflection(supabase, email);
      return new Response(
        JSON.stringify({
          valid: true,
          name: reg.name ?? null,
          reflection: reflection?.reflection_text ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "submit_reflection") {
      const reg = await findRegistration(supabase, email);
      if (!reg) {
        return new Response(
          JSON.stringify({ error: "Email not found." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const text = typeof body.reflection === "string" ? body.reflection.trim() : "";
      if (text.length < REFLECTION_MIN) {
        return new Response(
          JSON.stringify({
            error: `A few more words — at least ${REFLECTION_MIN} characters.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (text.length > REFLECTION_MAX) {
        return new Response(
          JSON.stringify({ error: "Reflection is too long." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { error } = await supabase.from("event_reflections").upsert(
        {
          event_id: EVENT_ID,
          email,
          ticket_holder_name: reg.name ?? null,
          reflection_text: text,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id,email" },
      );
      if (error) {
        console.error("[photo-gallery] reflection upsert", error);
        return new Response(
          JSON.stringify({ error: "Could not save reflection." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await logAccess(supabase, email, ip, "submit_reflection", true);
      const links = await getPhotoLinks(supabase);
      return new Response(
        JSON.stringify({ ok: true, links, reflection: text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "get_links") {
      const reg = await findRegistration(supabase, email);
      if (!reg) {
        return new Response(
          JSON.stringify({ error: "Email not found." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const reflection = await getReflection(supabase, email);
      if (!reflection) {
        return new Response(
          JSON.stringify({ error: "Reflection required first." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const links = await getPhotoLinks(supabase);
      await logAccess(supabase, email, ip, "get_links", true);
      return new Response(
        JSON.stringify({ links, reflection: reflection.reflection_text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "request_invite") {
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null;
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : null;
      const nowIso = new Date().toISOString();
      // Avoid duplicate approved requests for the same email
      const { data: existing } = await supabase
        .from("photo_invite_requests")
        .select("id, status")
        .eq("email", email)
        .in("status", ["approved", "pending"])
        .limit(1);
      if (!existing?.[0]) {
        const { error } = await supabase.from("photo_invite_requests").insert({
          event_id: EVENT_ID,
          email,
          name,
          note,
          ip_address: ip,
          status: "approved",
          reviewed_at: nowIso,
        });
        if (error) {
          console.error("[photo-gallery] invite request insert", error);
          return new Response(
            JSON.stringify({ error: "Could not submit request." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else if (existing[0].status === "pending") {
        // Promote existing pending request to approved
        await supabase
          .from("photo_invite_requests")
          .update({ status: "approved", reviewed_at: nowIso })
          .eq("id", existing[0].id);
      }
      await logAccess(supabase, email, ip, "request_invite", true);
      // Fire-and-forget approval email
      await sendInviteApprovalEmail(email, name);
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[photo-gallery] error", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
