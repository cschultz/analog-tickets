import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutoFix {
  fix_type: string;
  description: string;
  affected_entity?: string;
  affected_id?: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  status: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const fixes: AutoFix[] = [];
  const errors: string[] = [];

  console.log("[self-heal] Starting platform self-healing cycle");

  // ─── 1. Fix inventory drift: sold_quantity vs actual paid registrations ───
  try {
    const { data: inventory } = await supabase
      .from("ticket_inventory")
      .select("ticket_type, sold_quantity, total_quantity")
      .eq("is_active", true);

    if (inventory) {
      for (const item of inventory) {
        const { count } = await supabase
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("ticket_type", item.ticket_type)
          .in("payment_status", ["paid", "completed"]);

        const actualSold = count || 0;
        if (actualSold !== item.sold_quantity) {
          const { error } = await supabase
            .from("ticket_inventory")
            .update({ sold_quantity: actualSold })
            .eq("ticket_type", item.ticket_type);

          if (!error) {
            fixes.push({
              fix_type: "inventory_drift",
              description: `Corrected ${item.ticket_type} sold count from ${item.sold_quantity} to ${actualSold}`,
              affected_entity: "ticket_inventory",
              affected_id: item.ticket_type,
              old_value: { sold_quantity: item.sold_quantity },
              new_value: { sold_quantity: actualSold },
              status: "applied",
            });
          }
        }
      }
    }
  } catch (e) {
    errors.push(`inventory_drift: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── 2. Expire stale pending registrations (>24 hours, never paid) ───
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await supabase
      .from("registrations")
      .select("id, email, ticket_type")
      .eq("payment_status", "pending")
      .lt("created_at", cutoff)
      .limit(50);

    if (stale && stale.length > 0) {
      const ids = stale.map(r => r.id);
      const { error } = await supabase
        .from("registrations")
        .update({ payment_status: "expired" })
        .in("id", ids);

      if (!error) {
        fixes.push({
          fix_type: "stale_registration_cleanup",
          description: `Expired ${stale.length} pending registrations older than 24h`,
          affected_entity: "registrations",
          old_value: { count: stale.length, status: "pending" },
          new_value: { status: "expired" },
          status: "applied",
        });
      }
    }
  } catch (e) {
    errors.push(`stale_registrations: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── 3. Fix orphaned payment plan installments (plan cancelled but installments still scheduled) ───
  try {
    const { data: orphanedInstallments } = await supabase
      .from("payment_plan_installments")
      .select("id, payment_plan_id")
      .eq("status", "scheduled")
      .not("payment_plan_id", "is", null);

    if (orphanedInstallments && orphanedInstallments.length > 0) {
      // Get all referenced plan IDs
      const planIds = [...new Set(orphanedInstallments.map(i => i.payment_plan_id))];
      const { data: plans } = await supabase
        .from("payment_plans")
        .select("id, status")
        .in("id", planIds);

      const cancelledPlanIds = (plans || [])
        .filter(p => p.status === "cancelled" || p.status === "failed")
        .map(p => p.id);

      if (cancelledPlanIds.length > 0) {
        const orphanIds = orphanedInstallments
          .filter(i => cancelledPlanIds.includes(i.payment_plan_id))
          .map(i => i.id);

        if (orphanIds.length > 0) {
          const { error } = await supabase
            .from("payment_plan_installments")
            .update({ status: "cancelled" })
            .in("id", orphanIds);

          if (!error) {
            fixes.push({
              fix_type: "orphaned_installments",
              description: `Cancelled ${orphanIds.length} orphaned installments from cancelled/failed plans`,
              affected_entity: "payment_plan_installments",
              old_value: { count: orphanIds.length, status: "scheduled" },
              new_value: { status: "cancelled" },
              status: "applied",
            });
          }
        }
      }
    }
  } catch (e) {
    errors.push(`orphaned_installments: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── 4. Fix lodging zone inventory drift ───
  try {
    const { data: zones } = await supabase
      .from("accommodation_zones")
      .select("zone_key, inventory_available, inventory_total");

    if (zones) {
      for (const zone of zones) {
        const { count } = await supabase
          .from("accommodation_units")
          .select("id", { count: "exact", head: true })
          .eq("zone_key", zone.zone_key)
          .eq("inventory_status", "available")
          .eq("is_family_style", false);

        const actualAvailable = count || 0;
        if (actualAvailable !== zone.inventory_available) {
          const { error } = await supabase
            .from("accommodation_zones")
            .update({ inventory_available: actualAvailable })
            .eq("zone_key", zone.zone_key);

          if (!error) {
            fixes.push({
              fix_type: "lodging_inventory_drift",
              description: `Corrected ${zone.zone_key} available from ${zone.inventory_available} to ${actualAvailable}`,
              affected_entity: "accommodation_zones",
              affected_id: zone.zone_key,
              old_value: { inventory_available: zone.inventory_available },
              new_value: { inventory_available: actualAvailable },
              status: "applied",
            });
          }
        }
      }
    }
  } catch (e) {
    errors.push(`lodging_drift: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── 5. Auto-retry failed webhook entries ───
  try {
    const { data: pendingRetries } = await supabase
      .from("webhook_retry_queue")
      .select("id, event_type, event_id, attempt_count, max_attempts")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .limit(10);

    if (pendingRetries && pendingRetries.length > 0) {
      fixes.push({
        fix_type: "webhook_retry_triggered",
        description: `${pendingRetries.length} webhook retries are pending and will be processed`,
        affected_entity: "webhook_retry_queue",
        old_value: { pending_count: pendingRetries.length },
        new_value: { action: "triggered_processing" },
        status: "info",
      });
    }
  } catch (e) {
    errors.push(`webhook_retry: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── 6. Clean up expired rate limits ───
  try {
    const { data } = await supabase.rpc("cleanup_old_rate_limits");
    if (data && data > 0) {
      fixes.push({
        fix_type: "rate_limit_cleanup",
        description: `Cleaned up ${data} expired rate limit records`,
        affected_entity: "ip_rate_limits",
        new_value: { deleted_count: data },
        status: "applied",
      });
    }
  } catch (e) {
    errors.push(`rate_limit_cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── 7. Expire stale crew bids ───
  try {
    const { data } = await supabase.rpc("expire_stale_crew_bids");
    if (data && data > 0) {
      fixes.push({
        fix_type: "crew_bid_expiry",
        description: `Expired ${data} crew bids past checkout deadline`,
        affected_entity: "crew_bids",
        new_value: { expired_count: data },
        status: "applied",
      });
    }
  } catch (e) {
    errors.push(`crew_bid_expiry: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── Log all fixes to the database ───
  if (fixes.length > 0) {
    const { error: logError } = await supabase
      .from("platform_auto_fixes")
      .insert(fixes);

    if (logError) {
      console.error("[self-heal] Failed to log fixes:", logError);
    }
  }

  // ─── Alert admin if significant fixes were applied ───
  const appliedFixes = fixes.filter(f => f.status === "applied");
  if (appliedFixes.length > 0 || errors.length > 0) {
    // Create admin notification
    const message = appliedFixes.length > 0
      ? `Auto-applied ${appliedFixes.length} fix(es): ${appliedFixes.map(f => f.fix_type).join(", ")}`
      : `Self-heal encountered ${errors.length} error(s)`;

    await supabase.from("admin_notifications").insert({
      type: "self_heal",
      title: errors.length > 0 ? "Self-Heal: Issues Detected" : "Self-Heal: Fixes Applied",
      message,
      metadata: { fixes: appliedFixes, errors },
    });

    // Send email alert for critical fixes
    if (appliedFixes.some(f => ["inventory_drift", "lodging_inventory_drift"].includes(f.fix_type))) {
      try {
        const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
        await resend.emails.send({
          from: "Cosmico Platform <alerts@example.invalid>",
          to: ["hello@example.invalid"],
          subject: `🔧 Self-Heal: ${appliedFixes.length} auto-fix(es) applied`,
          html: `
            <h2>Platform Self-Healing Report</h2>
            <p>${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</p>
            <h3>Fixes Applied (${appliedFixes.length})</h3>
            <ul>
              ${appliedFixes.map(f => `<li><strong>${f.fix_type}</strong>: ${f.description}</li>`).join("")}
            </ul>
            ${errors.length > 0 ? `<h3>Errors (${errors.length})</h3><ul>${errors.map(e => `<li>${e}</li>`).join("")}</ul>` : ""}
          `,
        });
      } catch (emailErr) {
        console.error("[self-heal] Failed to send alert email:", emailErr);
      }
    }
  }

  // Log job execution
  try {
    await supabase.rpc("start_scheduled_job", {
      p_job_name: "platform-self-heal",
      p_metadata: {
        fixes_applied: appliedFixes.length,
        fixes_info: fixes.filter(f => f.status === "info").length,
        errors: errors.length,
      },
    });
  } catch (e) {
    console.error("[self-heal] Failed to log job:", e);
  }

  const response = {
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    timestamp: new Date().toISOString(),
    fixes_applied: appliedFixes.length,
    fixes_info: fixes.filter(f => f.status === "info").length,
    errors_count: errors.length,
    fixes,
    errors,
  };

  console.log(`[self-heal] Complete: ${appliedFixes.length} fixes applied, ${errors.length} errors`);

  return new Response(JSON.stringify(response, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
