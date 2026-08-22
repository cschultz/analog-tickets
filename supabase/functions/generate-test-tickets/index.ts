import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY_LABEL: Record<string, string> = {
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const TIMES_PT: Record<string, string> = {
  thursday: "Gates 4:00 PM PT — VIP/Krewe early arrival",
  friday: "Gates 12:00 PM PT — Music until late",
  saturday: "Gates 12:00 PM PT — Music until late",
  sunday: "Brunch 10:00 AM PT — VIP only",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single();
    if (!roleData) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, email, name } = await req.json();

    // CLEANUP: delete all test tickets/registrations
    if (action === "cleanup") {
      const { data: regs } = await supabase
        .from("registrations")
        .select("id")
        .filter("metadata->>test", "eq", "true");
      const ids = (regs || []).map((r: any) => r.id);
      if (ids.length) {
        await supabase.from("tickets").delete().in("registration_id", ids);
        await supabase.from("registrations").delete().in("id", ids);
      }
      return new Response(JSON.stringify({ ok: true, deleted: ids.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!email || !name) {
      return new Response(JSON.stringify({ error: "email and name required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Active event
    const { data: event } = await supabase.from("event_details").select("id, title, event_date, venue_name").eq("is_active", true).single();
    if (!event) throw new Error("No active event");

    // All ticket types with valid_days
    const { data: ticketTypes } = await supabase
      .from("ticket_types")
      .select("key, label, valid_days")
      .eq("is_active", true)
      .order("key");
    if (!ticketTypes?.length) throw new Error("No ticket types");

    type TestTicket = { id: string; ticket_type: string; label: string; valid_days: string[] };
    const created: TestTicket[] = [];

    // Send only 1 test ticket — pick the most full-access type (most valid_days), fallback to first
    const sortedTypes = [...ticketTypes].sort(
      (a: any, b: any) => (b.valid_days?.length || 0) - (a.valid_days?.length || 0)
    );
    const selectedTypes = sortedTypes.slice(0, 1);

    for (const tt of selectedTypes) {
      const regId = crypto.randomUUID();
      const { error: regErr } = await supabase.from("registrations").insert({
        id: regId,
        name: `TEST — ${name}`,
        email,
        ticket_type: tt.key,
        total_amount: 0,
        donation_amount: 0,
        quantity: 1,
        event_id: event.id,
        payment_status: "comp",
        order_number: `TEST-${tt.key.toUpperCase().slice(0, 8)}-${Date.now().toString().slice(-5)}`,
        metadata: { test: true, generated_by: user.id, generated_at: new Date().toISOString() },
      });
      if (regErr) { console.error("reg insert", tt.key, regErr); continue; }

      const ticketId = crypto.randomUUID();
      const { error: tErr } = await supabase.from("tickets").insert({
        id: ticketId,
        registration_id: regId,
        holder_name: `TEST ${tt.label}`,
        holder_email: email,
        owner_email: email,
        original_purchaser_email: email,
        ticket_type: tt.key,
        unit_price: 0,
        status: "active",
        event_id: event.id,
      });
      if (tErr) { console.error("ticket insert", tt.key, tErr); continue; }

      created.push({ id: ticketId, ticket_type: tt.key, label: tt.label, valid_days: tt.valid_days || [] });
    }

    // Build email
    const qrFor = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(data)}`;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

    const ticketsHtml = created.map((t) => {
      const days = (t.valid_days?.length ? t.valid_days : ["any day"]).map((d) => DAY_LABEL[d] || d).join(" + ");
      const times = (t.valid_days?.length ? t.valid_days : []).map((d) => TIMES_PT[d]).filter(Boolean).join("<br>");
      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;border:1px solid #d9d2c2;background:#fbf7ee;">
          <tr>
            <td style="padding:18px 20px;border-bottom:1px solid #e7dfcd;">
              <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a08c5e;">TEST TICKET — ${esc(t.ticket_type)}</div>
              <div style="font-family:Georgia,serif;font-size:20px;color:#2b2620;margin-top:4px;">${esc(t.label)}</div>
              <div style="font-family:Georgia,serif;font-size:13px;color:#6b6256;margin-top:6px;"><strong>Valid:</strong> ${esc(days)} <span style="color:#a08c5e;">(All times America/Los_Angeles)</span></div>
              ${times ? `<div style="font-family:Georgia,serif;font-size:12px;color:#6b6256;margin-top:4px;font-style:italic;">${times}</div>` : ""}
            </td>
            <td width="200" align="center" style="padding:14px;background:#fff;border-left:1px solid #e7dfcd;">
              <img src="${qrFor(t.id)}" alt="QR ${esc(t.label)}" width="170" height="170" style="display:block;width:170px;height:170px;background:#fff;padding:6px;border:1px solid #d9d2c2;" />
              <div style="font-family:monospace;font-size:9px;color:#a08c5e;margin-top:6px;word-break:break-all;">${t.id.slice(0, 8)}…</div>
            </td>
          </tr>
        </table>
      `;
    }).join("");

    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Test Tickets</title></head>
      <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,serif;color:#2b2620;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5efe1;padding:32px 0;">
          <tr><td align="center">
            <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #d9d2c2;">
              <tr><td style="padding:32px 36px 8px 36px;">
                <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#a08c5e;">Box Office — Test Tickets</div>
                <h1 style="font-family:Georgia,serif;font-size:26px;color:#2b2620;margin:8px 0 4px 0;font-weight:normal;">${esc(event.title)} — Scanner Rehearsal</h1>
                <p style="font-family:Georgia,serif;font-size:14px;color:#6b6256;line-height:1.6;margin:12px 0 0 0;">
                  ${created.length} test tickets — one per ticket type. All tickets are flagged <code style="background:#fbf7ee;padding:1px 5px;border:1px solid #e7dfcd;">test=true</code> and excluded from sales reporting. Day-of-week scanning enforces <strong>America/Los_Angeles</strong> timezone — a Friday-only ticket scanned on a Saturday in PT returns <code>wrong_day</code>.
                </p>
                <p style="font-family:Georgia,serif;font-size:13px;color:#6b6256;line-height:1.6;margin:14px 0 0 0;font-style:italic;">
                  Tip: open this email on a second device, scan from example.invalid/box-office on staff phones.
                </p>
              </td></tr>
              <tr><td style="padding:24px 36px 36px 36px;">
                ${ticketsHtml}
              </td></tr>
              <tr><td style="padding:18px 36px;background:#fbf7ee;border-top:1px solid #e7dfcd;">
                <div style="font-family:Georgia,serif;font-size:12px;color:#6b6256;line-height:1.6;">
                  <strong>Cleanup:</strong> When done testing, hit "Delete all test tickets" in Admin → Box Office to wipe these from the database.
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `;

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const { error: emailErr } = await resend.emails.send({
      from: "Cosmico Box Office <hello@example.invalid>",
      to: [email],
      subject: `[TEST] ${created.length} scanner test tickets — ${event.title}`,
      html,
    });
    if (emailErr) console.error("resend error", emailErr);

    return new Response(JSON.stringify({ ok: true, count: created.length, tickets: created, email_error: emailErr?.message || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
