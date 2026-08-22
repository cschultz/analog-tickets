import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  createLogger,
  successResponse,
  errorResponse,
  withErrorHandling,
  requireEnvVars,
} from "../_shared/error-utils.ts";
import { corsHeaders } from "../_shared/email-template.ts";

interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latency_ms: number;
  message?: string;
}

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: HealthCheck[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

// deno-lint-ignore no-explicit-any
async function checkDatabase(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { error } = await supabase
      .from("event_details")
      .select("id")
      .limit(1);
    
    if (error) throw error;
    
    return {
      name: "database",
      status: "healthy",
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      name: "database",
      status: "unhealthy",
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

// deno-lint-ignore no-explicit-any
async function checkPendingRegistrations(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Exclude E2E/canary test emails so this metric reflects real customer abandonment only.
    const { count, error } = await supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "pending")
      .lt("created_at", oneHourAgo)
      .not("email", "ilike", "%@example.com")
      .not("email", "ilike", "e2e-%")
      .not("email", "ilike", "canary%@%")
      .not("email", "ilike", "donation-test%")
      .not("email", "ilike", "%test@example%");
    
    if (error) throw error;
    
    // Warn if more than 10 stale pending registrations
    if ((count || 0) > 10) {
      return {
        name: "pending_registrations",
        status: "degraded",
        latency_ms: Date.now() - start,
        message: `${count} stale pending registrations older than 1 hour`,
      };
    }
    
    return {
      name: "pending_registrations",
      status: "healthy",
      latency_ms: Date.now() - start,
      message: `${count || 0} stale pending`,
    };
  } catch (error) {
    return {
      name: "pending_registrations",
      status: "unhealthy",
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
    };
  }
}

// deno-lint-ignore no-explicit-any
async function checkWebhookHealth(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from("webhook_logs")
      .select("status")
      .gte("created_at", oneHourAgo);
    
    if (error) throw error;
    
    const logs = data as Array<{ status: string }> || [];
    const total = logs.length;
    const errors = logs.filter(w => w.status === "error").length;
    const errorRate = total > 0 ? errors / total : 0;
    
    if (errorRate > 0.1) {
      return {
        name: "webhooks",
        status: "degraded",
        latency_ms: Date.now() - start,
        message: `${Math.round(errorRate * 100)}% error rate (${errors}/${total})`,
      };
    }
    
    return {
      name: "webhooks",
      status: "healthy",
      latency_ms: Date.now() - start,
      message: `${total} webhooks processed, ${errors} errors`,
    };
  } catch (error) {
    return {
      name: "webhooks",
      status: "unhealthy",
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
    };
  }
}

// deno-lint-ignore no-explicit-any
async function checkEmailHealth(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from("email_logs")
      .select("status")
      .gte("sent_at", oneHourAgo);
    
    if (error) throw error;
    
    const emails = data as Array<{ status: string }> || [];
    const total = emails.length;
    const failed = emails.filter(e => e.status === "failed").length;
    const failRate = total > 0 ? failed / total : 0;
    if (failRate > 0.05) {
      return {
        name: "emails",
        status: "degraded",
        latency_ms: Date.now() - start,
        message: `${Math.round(failRate * 100)}% failure rate (${failed}/${total})`,
      };
    }
    
    return {
      name: "emails",
      status: "healthy",
      latency_ms: Date.now() - start,
      message: `${total} emails sent, ${failed} failed`,
    };
  } catch (error) {
    return {
      name: "emails",
      status: "unhealthy",
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
    };
  }
}

// deno-lint-ignore no-explicit-any
async function checkInventoryLevels(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from("ticket_inventory")
      .select("ticket_type, total_quantity, sold_quantity")
      .eq("is_active", true);
    
    if (error) throw error;
    
    interface InventoryRow { ticket_type: string; total_quantity: number; sold_quantity: number }
    const inventory = data as InventoryRow[] || [];
    
    const lowStock = inventory.filter(t => {
      const available = t.total_quantity - t.sold_quantity;
      return available <= 10 && available > 0;
    });
    
    const soldOut = inventory.filter(t => t.total_quantity <= t.sold_quantity);
    
    if (soldOut.length > 0) {
      return {
        name: "inventory",
        status: "degraded",
        latency_ms: Date.now() - start,
        message: `${soldOut.length} ticket types sold out, ${lowStock.length} low stock`,
      };
    }
    
    return {
      name: "inventory",
      status: "healthy",
      latency_ms: Date.now() - start,
      message: `${lowStock.length} types low stock`,
    };
  } catch (error) {
    return {
      name: "inventory",
      status: "unhealthy",
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
    };
  }
}

// deno-lint-ignore no-explicit-any
async function checkDeadLetterQueue(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { count, error } = await supabase
      .from("dead_letter_queue")
      .select("id", { count: "exact", head: true })
      .is("reviewed_at", null);
    
    if (error) throw error;
    
    if ((count || 0) > 0) {
      return {
        name: "dead_letters",
        status: "degraded",
        latency_ms: Date.now() - start,
        message: `${count} unreviewed failed operations require attention`,
      };
    }
    
    return {
      name: "dead_letters",
      status: "healthy",
      latency_ms: Date.now() - start,
      message: "No unreviewed items",
    };
  } catch (error) {
    return {
      name: "dead_letters",
      status: "unhealthy",
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
    };
  }
}

// deno-lint-ignore no-explicit-any
async function checkRetryQueue(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { count, error } = await supabase
      .from("webhook_retry_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    
    if (error) throw error;
    
    if ((count || 0) > 20) {
      return {
        name: "retry_queue",
        status: "degraded",
        latency_ms: Date.now() - start,
        message: `${count} pending retries in queue`,
      };
    }
    
    return {
      name: "retry_queue",
      status: "healthy",
      latency_ms: Date.now() - start,
      message: `${count || 0} pending retries`,
    };
  } catch (error) {
    return {
      name: "retry_queue",
      status: "unhealthy",
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : "Check failed",
    };
  }
}

// Create admin notification for health issues
// deno-lint-ignore no-explicit-any
async function createHealthAlertIfNeeded(supabase: any, report: HealthReport, log: ReturnType<typeof createLogger>) {
  if (report.status === "healthy") return;
  
  // Check if we've already sent an alert recently (within 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentAlerts } = await supabase
    .from("admin_notifications")
    .select("id")
    .eq("type", "system_health")
    .gte("created_at", oneHourAgo)
    .limit(1);
  
  if (recentAlerts && recentAlerts.length > 0) {
    log.info("Skipping alert - already sent within the hour");
    return;
  }
  
  const issues = report.checks
    .filter(c => c.status !== "healthy")
    .map(c => `${c.name}: ${c.message}`)
    .join("; ");
  
  const { error } = await supabase
    .from("admin_notifications")
    .insert({
      type: "system_health",
      title: `System Health: ${report.status.charAt(0).toUpperCase() + report.status.slice(1)}`,
      message: issues,
      metadata: {
        status: report.status,
        summary: report.summary,
        checks: report.checks.filter(c => c.status !== "healthy"),
      },
    });
  
  if (error) {
    log.error("Failed to create health alert", { error: error.message });
  } else {
    log.info("Created health alert notification");
  }
}

const handler = withErrorHandling("system-health", async (req, log) => {
  if (!requireEnvVars(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], log)) {
    return errorResponse("INTERNAL_ERROR", "Missing required configuration");
  }
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  
  log.info("Running health checks");
  
  // Run all health checks in parallel
  const checks = await Promise.all([
    checkDatabase(supabase),
    checkPendingRegistrations(supabase),
    checkWebhookHealth(supabase),
    checkEmailHealth(supabase),
    checkInventoryLevels(supabase),
    checkDeadLetterQueue(supabase),
    checkRetryQueue(supabase),
  ]);
  
  // Calculate summary
  const summary = {
    total: checks.length,
    healthy: checks.filter(c => c.status === "healthy").length,
    degraded: checks.filter(c => c.status === "degraded").length,
    unhealthy: checks.filter(c => c.status === "unhealthy").length,
  };
  
  // Determine overall status
  let overallStatus: HealthReport["status"] = "healthy";
  if (summary.unhealthy > 0) {
    overallStatus = "unhealthy";
  } else if (summary.degraded > 0) {
    overallStatus = "degraded";
  }
  
  const report: HealthReport = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    summary,
  };
  
  // Create admin notification if there are issues
  await createHealthAlertIfNeeded(supabase, report, log);
  
  log.info("Health check completed", { status: overallStatus, summary });
  
  return successResponse(report);
});

serve(handler);
