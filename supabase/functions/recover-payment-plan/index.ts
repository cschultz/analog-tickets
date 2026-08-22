// Atomic payment-plan recovery: ensures a paid registration has tickets,
// marks the enrollment completed, and (re)sends the ticket confirmation email.
// Admin-only. Idempotent: safe to re-run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return json({ ok: false, error: "missing_auth" }, 401);
  }

  // Verify caller is admin
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const callerId = userRes?.user?.id;
  if (!callerId) return json({ ok: false, error: "not_authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: hasRole } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
  if (!hasRole) return json({ ok: false, error: "not_authorized" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const registrationId: string | undefined = body.registration_id;
  const sendEmail: boolean = body.send_email !== false;
  const dryRun: boolean = !!body.dry_run;

  if (!registrationId) return json({ ok: false, error: "registration_id required" }, 400);

  const { data: reg, error: regErr } = await admin
    .from("registrations")
    .select("id, name, email, ticket_type, quantity, total_amount, payment_status, event_id, order_number, metadata")
    .eq("id", registrationId)
    .maybeSingle();

  if (regErr || !reg) return json({ ok: false, error: "registration_not_found" }, 404);
  if (reg.payment_status !== "paid") {
    return json({ ok: false, error: "registration_not_paid", payment_status: reg.payment_status }, 400);
  }

  const { data: existingTickets } = await admin
    .from("tickets")
    .select("id")
    .eq("registration_id", reg.id);

  const created: string[] = [];
  if (!existingTickets || existingTickets.length === 0) {
    const qty = Math.max(1, Number(reg.quantity || 1));
    const unitPrice = Math.round(Number(reg.total_amount || 0) / qty);
    const ticketsToCreate = Array.from({ length: qty }, (_, i) => ({
      registration_id: reg.id,
      event_id: reg.event_id,
      holder_name: i === 0 ? (reg.name || "Guest") : `${reg.name || "Guest"} +${i}`,
      holder_email: i === 0 ? reg.email : null,
      ticket_type: reg.ticket_type,
      unit_price: unitPrice,
      status: "active",
      original_purchaser_email: reg.email,
    }));

    if (!dryRun) {
      const { data: ins, error: insErr } = await admin
        .from("tickets")
        .insert(ticketsToCreate)
        .select("id");
      if (insErr) return json({ ok: false, error: "ticket_insert_failed", detail: insErr.message }, 500);
      ins?.forEach((t: any) => created.push(t.id));
    }
  }

  // Mark enrollment completed if linked via metadata
  const enrollmentId = reg.metadata?.original_enrollment_id || reg.metadata?.enrollment_id;
  let enrollmentUpdated = false;
  if (enrollmentId && !dryRun) {
    const { error } = await admin
      .from("payment_plan_enrollments")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", enrollmentId);
    enrollmentUpdated = !error;
  }

  let emailSent = false;
  if (sendEmail && !dryRun) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-ticket-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ registration_id: reg.id }),
    });
    emailSent = r.ok;
  }

  return json({
    ok: true,
    registration_id: reg.id,
    order_number: reg.order_number,
    existing_tickets: existingTickets?.length || 0,
    tickets_created: created.length,
    enrollment_updated: enrollmentUpdated,
    email_sent: emailSent,
    dry_run: dryRun,
  });

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
