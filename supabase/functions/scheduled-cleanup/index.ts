import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CleanupResult {
  task: string;
  deleted: number;
  error?: string;
}

const log = (task: string, message: string, data?: Record<string, unknown>) => {
  console.log(JSON.stringify({
    fn: "scheduled-cleanup",
    task,
    message,
    data,
    timestamp: new Date().toISOString(),
  }));
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const results: CleanupResult[] = [];
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  log("main", "Starting scheduled cleanup");

  // 1. Clean up old pending registrations (> 48 hours)
  try {
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    const { data: oldRegs } = await supabase
      .from("registrations")
      .select("id")
      .eq("payment_status", "pending")
      .lt("created_at", cutoff48h);
    
    if (oldRegs && oldRegs.length > 0) {
      const { error } = await supabase
        .from("registrations")
        .delete()
        .eq("payment_status", "pending")
        .lt("created_at", cutoff48h);
      
      if (error) throw error;
      
      log("pending_registrations", `Deleted ${oldRegs.length} stale pending registrations`);
      results.push({ task: "pending_registrations", deleted: oldRegs.length });
    } else {
      results.push({ task: "pending_registrations", deleted: 0 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("pending_registrations", "Error", { error: msg });
    results.push({ task: "pending_registrations", deleted: 0, error: msg });
  }

  // 2. Expire old custom offers
  try {
    const { data: expiredOffers } = await supabase
      .from("custom_offers")
      .select("id, event_id")
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());
    
    let expiredCount = 0;
    
    for (const offer of expiredOffers || []) {
      // Get items to release inventory
      const { data: items } = await supabase
        .from("custom_offer_items")
        .select("*")
        .eq("offer_id", offer.id);
      
      for (const item of items || []) {
        if (item.item_type === "ticket" && item.ticket_type) {
          const { data: inv } = await supabase
            .from("ticket_inventory")
            .select("sold_quantity")
            .eq("ticket_type", item.ticket_type)
            .eq("event_id", offer.event_id)
            .single();
          
          if (inv) {
            await supabase
              .from("ticket_inventory")
              .update({ sold_quantity: Math.max(0, inv.sold_quantity - item.quantity) })
              .eq("ticket_type", item.ticket_type)
              .eq("event_id", offer.event_id);
          }
        }
        
        if (item.item_type === "lodging" && item.lodging_inventory_id) {
          const { data: lodging } = await supabase
            .from("lodging_inventory")
            .select("sold_quantity")
            .eq("id", item.lodging_inventory_id)
            .single();
          
          if (lodging) {
            await supabase
              .from("lodging_inventory")
              .update({ sold_quantity: Math.max(0, lodging.sold_quantity - item.quantity) })
              .eq("id", item.lodging_inventory_id);
          }
        }
        
        if (item.item_type === "addon" && item.addon_inventory_id) {
          const { data: addon } = await supabase
            .from("addon_inventory")
            .select("sold_quantity")
            .eq("id", item.addon_inventory_id)
            .single();
          
          if (addon) {
            await supabase
              .from("addon_inventory")
              .update({ sold_quantity: Math.max(0, addon.sold_quantity - item.quantity) })
              .eq("id", item.addon_inventory_id);
          }
        }
      }
      
      await supabase
        .from("custom_offers")
        .update({ status: "expired" })
        .eq("id", offer.id);
      
      expiredCount++;
    }
    
    log("expired_offers", `Expired ${expiredCount} offers`);
    results.push({ task: "expired_offers", deleted: expiredCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("expired_offers", "Error", { error: msg });
    results.push({ task: "expired_offers", deleted: 0, error: msg });
  }

  // 3. Clean up old webhook logs (> 30 days)
  try {
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: oldLogs } = await supabase
      .from("webhook_logs")
      .select("id")
      .lt("created_at", cutoff30d);
    
    if (oldLogs && oldLogs.length > 0) {
      const { error } = await supabase
        .from("webhook_logs")
        .delete()
        .lt("created_at", cutoff30d);
      
      if (error) throw error;
      
      log("webhook_logs", `Deleted ${oldLogs.length} old webhook logs`);
      results.push({ task: "webhook_logs", deleted: oldLogs.length });
    } else {
      results.push({ task: "webhook_logs", deleted: 0 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("webhook_logs", "Error", { error: msg });
    results.push({ task: "webhook_logs", deleted: 0, error: msg });
  }

  // 4. Clean up old activity logs (> 90 days)
  try {
    const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: oldActivity } = await supabase
      .from("activity_logs")
      .select("id")
      .lt("created_at", cutoff90d);
    
    if (oldActivity && oldActivity.length > 0) {
      const { error } = await supabase
        .from("activity_logs")
        .delete()
        .lt("created_at", cutoff90d);
      
      if (error) throw error;
      
      log("activity_logs", `Deleted ${oldActivity.length} old activity logs`);
      results.push({ task: "activity_logs", deleted: oldActivity.length });
    } else {
      results.push({ task: "activity_logs", deleted: 0 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("activity_logs", "Error", { error: msg });
    results.push({ task: "activity_logs", deleted: 0, error: msg });
  }

  // 5. Clean up expired pending ticket transfers (> 7 days)
  try {
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: oldTransfers } = await supabase
      .from("pending_ticket_transfers")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", cutoff7d);
    
    if (oldTransfers && oldTransfers.length > 0) {
      const { error } = await supabase
        .from("pending_ticket_transfers")
        .update({ status: "expired" })
        .eq("status", "pending")
        .lt("created_at", cutoff7d);
      
      if (error) throw error;
      
      log("pending_transfers", `Expired ${oldTransfers.length} old pending transfers`);
      results.push({ task: "pending_transfers", deleted: oldTransfers.length });
    } else {
      results.push({ task: "pending_transfers", deleted: 0 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("pending_transfers", "Error", { error: msg });
    results.push({ task: "pending_transfers", deleted: 0, error: msg });
  }

  // 6. Clean up old email rate limits (> 7 days)
  try {
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: oldLimits } = await supabase
      .from("email_rate_limits")
      .select("id")
      .lt("last_sent_at", cutoff7d);
    
    if (oldLimits && oldLimits.length > 0) {
      const { error } = await supabase
        .from("email_rate_limits")
        .delete()
        .lt("last_sent_at", cutoff7d);
      
      if (error) throw error;
      
      log("email_rate_limits", `Deleted ${oldLimits.length} old rate limit records`);
      results.push({ task: "email_rate_limits", deleted: oldLimits.length });
    } else {
      results.push({ task: "email_rate_limits", deleted: 0 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("email_rate_limits", "Error", { error: msg });
    results.push({ task: "email_rate_limits", deleted: 0, error: msg });
  }

  // 7. Clean up old admin notifications (> 30 days, read only)
  try {
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: oldNotifications } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("is_read", true)
      .lt("created_at", cutoff30d);
    
    if (oldNotifications && oldNotifications.length > 0) {
      const { error } = await supabase
        .from("admin_notifications")
        .delete()
        .eq("is_read", true)
        .lt("created_at", cutoff30d);
      
      if (error) throw error;
      
      log("admin_notifications", `Deleted ${oldNotifications.length} old read notifications`);
      results.push({ task: "admin_notifications", deleted: oldNotifications.length });
    } else {
      results.push({ task: "admin_notifications", deleted: 0 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log("admin_notifications", "Error", { error: msg });
    results.push({ task: "admin_notifications", deleted: 0, error: msg });
  }

  // Summary
  const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
  const errors = results.filter(r => r.error);
  
  log("main", "Cleanup completed", { 
    total_deleted: totalDeleted, 
    tasks: results.length,
    errors: errors.length,
  });

  return new Response(
    JSON.stringify({
      success: errors.length === 0,
      timestamp: new Date().toISOString(),
      total_deleted: totalDeleted,
      results,
    }),
    { 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    }
  );
});
