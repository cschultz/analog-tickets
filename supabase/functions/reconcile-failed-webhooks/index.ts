// One-off admin reconciliation for failed webhook_logs entries.
// Fetches the Stripe session, identifies the action type, and either:
//  - confirms an existing addon_purchase reconciliation already happened,
//  - re-processes admin_ticket_change / admin_addon_addition,
//  - reports orphaned sessions for manual review.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

  const { data: failed } = await supabase
    .from("webhook_logs")
    .select("id, event_id, session_id, error_message, created_at")
    .eq("status", "error")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });

  const results: any[] = [];

  for (const log of failed || []) {
    if (!log.session_id) {
      results.push({ id: log.id, action: "skip", reason: "no session_id" });
      continue;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(log.session_id);
    } catch (err: any) {
      results.push({ session_id: log.session_id, action: "stripe_error", error: err.message });
      continue;
    }

    if (session.payment_status !== "paid") {
      results.push({ session_id: log.session_id, action: "unpaid_skip", payment_status: session.payment_status });
      // Mark as resolved (was never a payment success)
      await supabase.from("webhook_logs").update({ status: "ignored", error_message: `unpaid: ${session.payment_status}` }).eq("id", log.id);
      continue;
    }

    const metadata = session.metadata || {};

    // Case A: addon purchases — confirm they're already paid (verify-pending-addons cron handles this)
    if (metadata.purchase_type === "addon") {
      const { data: aps } = await supabase
        .from("addon_purchases")
        .select("id, payment_status")
        .eq("stripe_session_id", session.id);
      const allPaid = aps && aps.length > 0 && aps.every((a) => a.payment_status === "paid");
      if (allPaid) {
        await supabase.from("webhook_logs").update({ status: "processed", error_message: "reconciled: addons already paid" }).eq("id", log.id);
        results.push({ session_id: log.session_id, action: "addon_already_paid", count: aps.length });
      } else {
        results.push({ session_id: log.session_id, action: "addon_needs_attention", aps });
      }
      continue;
    }

    // Case B: admin ticket change
    if (metadata.action === "admin_ticket_change") {
      const regId = metadata.registration_id;
      const toType = metadata.to_ticket_type;
      const fromType = metadata.from_ticket_type;
      if (!regId || !toType) {
        results.push({ session_id: log.session_id, action: "admin_ticket_change_missing_meta" });
        continue;
      }
      const { data: reg } = await supabase.from("registrations").select("*").eq("id", regId).single();
      if (!reg) {
        results.push({ session_id: log.session_id, action: "admin_ticket_change_no_reg", regId });
        continue;
      }
      if (reg.ticket_type === toType) {
        await supabase.from("webhook_logs").update({ status: "processed", error_message: "reconciled: already updated" }).eq("id", log.id);
        results.push({ session_id: log.session_id, action: "admin_ticket_change_already_done" });
        continue;
      }
      const { data: nt } = await supabase.from("ticket_types").select("price").eq("key", toType).maybeSingle();
      const qty = reg.quantity || 1;
      const newTotal = nt?.price ? nt.price * qty : reg.total_amount + (session.amount_total || 0);
      await supabase.from("registrations").update({
        ticket_type: toType,
        total_amount: newTotal,
        checkout_synced_at: new Date().toISOString(),
      }).eq("id", regId);
      await supabase.from("tickets").update({ ticket_type: toType }).eq("registration_id", regId).eq("ticket_type", fromType);
      await supabase.from("webhook_logs").update({ status: "processed", error_message: "reconciled" }).eq("id", log.id);
      results.push({ session_id: log.session_id, action: "admin_ticket_change_reconciled", regId });
      continue;
    }

    // Case C: admin addon addition
    if (metadata.action === "admin_addon_addition") {
      const regId = metadata.registration_id;
      const addonId = metadata.addon_inventory_id;
      const qty = parseInt(metadata.quantity || "1", 10);
      if (!regId || !addonId) {
        results.push({ session_id: log.session_id, action: "admin_addon_missing_meta" });
        continue;
      }
      const { data: existing } = await supabase
        .from("addon_purchases")
        .select("id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();
      if (existing) {
        await supabase.from("webhook_logs").update({ status: "processed", error_message: "reconciled: already inserted" }).eq("id", log.id);
        results.push({ session_id: log.session_id, action: "admin_addon_already_done" });
        continue;
      }
      const { data: reg } = await supabase.from("registrations").select("email").eq("id", regId).single();
      const { data: addon } = await supabase.from("addon_inventory").select("price, sold_quantity").eq("id", addonId).single();
      if (!reg || !addon) {
        results.push({ session_id: log.session_id, action: "admin_addon_missing_target" });
        continue;
      }
      await supabase.from("addon_purchases").insert({
        registration_id: regId,
        inventory_id: addonId,
        purchase_type: "addon",
        quantity: qty,
        unit_price: addon.price,
        total_amount: addon.price * qty,
        purchaser_email: reg.email,
        stripe_session_id: session.id,
        payment_status: "paid",
      });
      await supabase.from("addon_inventory").update({ sold_quantity: (addon.sold_quantity || 0) + qty }).eq("id", addonId);
      await supabase.from("webhook_logs").update({ status: "processed", error_message: "reconciled" }).eq("id", log.id);
      results.push({ session_id: log.session_id, action: "admin_addon_reconciled", regId });
      continue;
    }

    // Case D: raffle entry
    if (metadata.raffle_entry_id) {
      await supabase.from("raffle_entries").update({ payment_status: "paid", stripe_session_id: session.id }).eq("id", metadata.raffle_entry_id);
      await supabase.from("webhook_logs").update({ status: "processed", error_message: "reconciled: raffle paid" }).eq("id", log.id);
      results.push({ session_id: log.session_id, action: "raffle_reconciled", id: metadata.raffle_entry_id });
      continue;
    }

    // Case E: ticket upgrade
    if (metadata.type === "ticket_upgrade") {
      const offerId = metadata.upgrade_offer_id;
      const regId = metadata.registration_id;
      const toType = metadata.upgrade_to;
      const fromType = metadata.upgrade_from;
      if (offerId) {
        await supabase.from("upgrade_offers").update({ status: "completed", paid_at: new Date().toISOString() }).eq("id", offerId);
      }
      if (regId && toType) {
        const { data: nt } = await supabase.from("ticket_types").select("price").eq("key", toType).maybeSingle();
        const { data: reg } = await supabase.from("registrations").select("quantity, total_amount, ticket_type").eq("id", regId).maybeSingle();
        if (reg && reg.ticket_type !== toType) {
          const qty = reg.quantity || 1;
          const newTotal = nt?.price ? nt.price * qty : (reg.total_amount || 0) + (session.amount_total || 0);
          await supabase.from("registrations").update({ ticket_type: toType, total_amount: newTotal, checkout_synced_at: new Date().toISOString() }).eq("id", regId);
          let ticketIds: string[] = [];
          try { ticketIds = metadata.ticket_ids ? JSON.parse(metadata.ticket_ids) : []; } catch {}
          if (ticketIds.length > 0) {
            await supabase.from("tickets").update({ ticket_type: toType }).in("id", ticketIds);
          } else if (fromType) {
            await supabase.from("tickets").update({ ticket_type: toType }).eq("registration_id", regId).eq("ticket_type", fromType);
          }
        }
      }
      await supabase.from("webhook_logs").update({ status: "processed", error_message: "reconciled: upgrade" }).eq("id", log.id);
      results.push({ session_id: log.session_id, action: "upgrade_reconciled", offerId, regId });
      continue;
    }

    // Unknown — surface for human review
    results.push({
      session_id: log.session_id,
      action: "unknown_metadata",
      metadata,
      amount_total: session.amount_total,
      customer_email: session.customer_details?.email || session.customer_email,
      mode: session.mode,
    });
  }

  return new Response(JSON.stringify({ count: results.length, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
