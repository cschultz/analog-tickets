// Nightly canary: detect any 'paid' registrations with zero ticket rows.
// Notifies admins via admin_notifications and returns a JSON report.
// Cron-invoked or manually invoked. No auth required (read-only summary).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only scan paid registrations for currently-active events.
  // Exclude custom_offer (lodging/add-on bundles legitimately have no ticket rows).
  const sinceIso = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activeEvents } = await admin
    .from("event_details")
    .select("id")
    .eq("is_active", true);
  const activeEventIds = (activeEvents || []).map((e: any) => e.id);

  const { data: regs, error } = await admin
    .from("registrations")
    .select("id, name, email, ticket_type, quantity, total_amount, order_number, created_at")
    .eq("payment_status", "paid")
    .neq("ticket_type", "custom_offer")
    .in("event_id", activeEventIds.length ? activeEventIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("created_at", sinceIso);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orphans: any[] = [];
  for (const r of regs || []) {
    const { count } = await admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("registration_id", r.id);
    if ((count ?? 0) === 0) orphans.push(r);
  }

  // Also scan custom_offer registrations whose offer items include actual entry
  // tickets (item_type='ticket'). Add-on / lodging-only offers are skipped.
  const { data: customRegs } = await admin
    .from("registrations")
    .select("id, name, email, ticket_type, quantity, total_amount, order_number, created_at, stripe_session_id")
    .eq("payment_status", "paid")
    .eq("ticket_type", "custom_offer")
    .in("event_id", activeEventIds.length ? activeEventIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("created_at", sinceIso);

  for (const r of customRegs || []) {
    const { count: ticketCount } = await admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("registration_id", r.id);
    if ((ticketCount ?? 0) > 0) continue;

    // Find the matching custom offer via stripe_session_id metadata or recipient_email
    const { data: offers } = await admin
      .from("custom_offers")
      .select("id")
      .eq("recipient_email", r.email)
      .eq("status", "accepted");
    if (!offers || offers.length === 0) continue;

    const offerIds = offers.map((o: any) => o.id);
    const { data: ticketItems } = await admin
      .from("custom_offer_items")
      .select("ticket_type, quantity, unit_price, offer_id")
      .in("offer_id", offerIds)
      .eq("item_type", "ticket");

    const expectedTickets = (ticketItems || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);
    if (expectedTickets > 0) {
      orphans.push({ ...r, expected_tickets: expectedTickets, source: "custom_offer" });
    }
  }

  if (orphans.length > 0) {
    await admin.from("admin_notifications").insert({
      type: "ticket_canary_orphan",
      title: `${orphans.length} paid registration${orphans.length > 1 ? "s" : ""} missing tickets`,
      message: orphans
        .slice(0, 5)
        .map((o) => `${o.order_number || o.id} — ${o.email}`)
        .join("; "),
      metadata: {
        count: orphans.length,
        registrations: orphans.map((o) => ({
          id: o.id,
          order_number: o.order_number,
          email: o.email,
          name: o.name,
          ticket_type: o.ticket_type,
          quantity: o.quantity,
          created_at: o.created_at,
        })),
      },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      scanned: regs?.length || 0,
      orphan_count: orphans.length,
      orphans: orphans.map((o) => ({ id: o.id, order_number: o.order_number, email: o.email })),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
