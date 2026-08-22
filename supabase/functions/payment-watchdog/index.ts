import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-08-27.basil",
  });

  const issues: Array<{ type: string; description: string; severity: string; details?: Record<string, unknown> }> = [];
  const autoFixes: Array<{ fix_type: string; description: string; affected_entity?: string; affected_id?: string; old_value?: Record<string, unknown>; new_value?: Record<string, unknown>; status: string }> = [];

  console.log("[payment-watchdog] Starting payment plan health check");

  try {
    // ─── 1. Detect overdue installments not yet flagged ───
    const today = new Date().toISOString().split("T")[0];
    const { data: overduePaymentsRaw } = await supabase
      .from("scheduled_payments")
      .select("id, enrollment_id, scheduled_date, amount, payment_number, attempt_count, status, payment_plan_enrollments!inner(buyer_email, buyer_name, status, stripe_payment_method_id, registration_id)")
      .lte("scheduled_date", today)
      .in("status", ["pending", "failed"])
      .order("scheduled_date")
      .limit(100);

    // Filter out abandoned checkouts (no payment method saved AND no registration created)
    // These are not real at-risk payments — they never completed checkout
    const overduePayments = (overduePaymentsRaw || []).filter((p: any) => {
      const enr = p.payment_plan_enrollments;
      if (!enr) return false;
      // Skip enrollments that are not active (cancelled, completed, defaulted handled elsewhere)
      if (enr.status !== "active") return false;
      // Skip abandoned: no payment method AND no registration
      if (!enr.stripe_payment_method_id && !enr.registration_id) return false;
      return true;
    });

    if (overduePayments.length > 0) {
      const pendingOverdue = overduePayments.filter(p => p.status === "pending");
      const failedOverdue = overduePayments.filter(p => p.status === "failed");

      if (pendingOverdue.length > 0) {
        issues.push({
          type: "overdue_pending",
          description: `${pendingOverdue.length} payment(s) are past due but still pending (not yet attempted)`,
          severity: "critical",
          details: { payment_ids: pendingOverdue.map(p => p.id) },
        });
      }

      if (failedOverdue.length > 0) {
        issues.push({
          type: "overdue_failed",
          description: `${failedOverdue.length} payment(s) are past due and in failed state`,
          severity: "warning",
          details: { payment_ids: failedOverdue.map(p => p.id) },
        });
      }
    }

    // ─── 2. Detect defaulted enrollments without ticket cancellation ───
    const { data: defaultedEnrollments } = await supabase
      .from("payment_plan_enrollments")
      .select("id, buyer_email, buyer_name, registration_id, status")
      .eq("status", "defaulted");

    if (defaultedEnrollments && defaultedEnrollments.length > 0) {
      for (const enrollment of defaultedEnrollments) {
        if (!enrollment.registration_id) continue;

        // Check if the registration is still active
        const { data: reg } = await supabase
          .from("registrations")
          .select("id, payment_status, ticket_type")
          .eq("id", enrollment.registration_id)
          .single();

        if (reg && !["cancelled", "expired", "refunded"].includes(reg.payment_status)) {
          // Auto-cancel the ticket per ToS
          const { error } = await supabase
            .from("registrations")
            .update({ payment_status: "cancelled" })
            .eq("id", enrollment.registration_id);

          if (!error) {
            autoFixes.push({
              fix_type: "defaulted_ticket_cancellation",
              description: `Cancelled ticket for ${enrollment.buyer_name} (${enrollment.buyer_email}) due to payment plan default`,
              affected_entity: "registrations",
              affected_id: enrollment.registration_id,
              old_value: { payment_status: reg.payment_status },
              new_value: { payment_status: "cancelled" },
              status: "applied",
            });
          }
        }
      }
    }

    // ─── 3. Stripe revenue reconciliation ───
    // Compare recent Stripe successful payments against DB records
    const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    
    const stripePayments = await stripe.paymentIntents.list({
      created: { gte: oneDayAgo },
      limit: 100,
    });

    const succeededPayments = stripePayments.data.filter(p => p.status === "succeeded" && p.metadata?.payment_plan !== "true");
    
    for (const pi of succeededPayments) {
      // Check if this payment has a corresponding registration
      const sessionId = pi.metadata?.checkout_session_id || pi.metadata?.session_id;
      if (!sessionId) continue;

      const { data: reg } = await supabase
        .from("registrations")
        .select("id, payment_status, total_amount")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

      if (!reg) {
        issues.push({
          type: "orphaned_stripe_payment",
          description: `Stripe PaymentIntent ${pi.id} ($${(pi.amount / 100).toFixed(2)}) has no matching registration`,
          severity: "critical",
          details: { payment_intent_id: pi.id, amount: pi.amount, session_id: sessionId },
        });
      } else if (reg.payment_status !== "paid" && reg.payment_status !== "completed" && reg.payment_status !== "payment_plan") {
        issues.push({
          type: "payment_status_mismatch",
          description: `Registration ${reg.id} has status "${reg.payment_status}" but Stripe shows payment succeeded`,
          severity: "critical",
          details: { registration_id: reg.id, db_status: reg.payment_status, stripe_status: "succeeded", payment_intent_id: pi.id },
        });

        // Auto-fix: mark as paid
        const { error } = await supabase
          .from("registrations")
          .update({ payment_status: "paid" })
          .eq("id", reg.id);

        if (!error) {
          autoFixes.push({
            fix_type: "payment_status_reconciliation",
            description: `Corrected registration ${reg.id} status from "${reg.payment_status}" to "paid" based on Stripe confirmation`,
            affected_entity: "registrations",
            affected_id: reg.id,
            old_value: { payment_status: reg.payment_status },
            new_value: { payment_status: "paid" },
            status: "applied",
          });
        }
      }
    }

    // ─── 4. Check for payment plan enrollments stuck in "active" with all payments done ───
    const { data: activeEnrollments } = await supabase
      .from("payment_plan_enrollments")
      .select("id, buyer_email")
      .eq("status", "active");

    if (activeEnrollments) {
      for (const enrollment of activeEnrollments) {
        const { data: unpaid } = await supabase
          .from("scheduled_payments")
          .select("id")
          .eq("enrollment_id", enrollment.id)
          .in("status", ["pending", "processing", "failed"])
          .limit(1);

        if (!unpaid || unpaid.length === 0) {
          // All payments done but enrollment still active — complete it
          const { error } = await supabase
            .from("payment_plan_enrollments")
            .update({ status: "completed" })
            .eq("id", enrollment.id);

          if (!error) {
            autoFixes.push({
              fix_type: "enrollment_completion",
              description: `Completed enrollment ${enrollment.id} (all payments paid but status was still active)`,
              affected_entity: "payment_plan_enrollments",
              affected_id: enrollment.id,
              old_value: { status: "active" },
              new_value: { status: "completed" },
              status: "applied",
            });
          }
        }
      }
    }

    // ─── Log fixes ───
    if (autoFixes.length > 0) {
      await supabase.from("platform_auto_fixes").insert(autoFixes);
    }

    // ─── Alert if issues found ───
    const criticalIssues = issues.filter(i => i.severity === "critical");
    if (criticalIssues.length > 0 || autoFixes.length > 0) {
      await supabase.from("admin_notifications").insert({
        type: "payment_watchdog",
        title: `💰 Payment Watchdog: ${criticalIssues.length} issue(s), ${autoFixes.length} fix(es)`,
        message: [
          ...criticalIssues.map(i => `⚠️ ${i.description}`),
          ...autoFixes.map(f => `✅ ${f.description}`),
        ].join(" | "),
        metadata: { issues, fixes: autoFixes },
      });

      // Email alert for critical issues
      if (criticalIssues.length > 0) {
        try {
          const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
          await resend.emails.send({
            from: "Cosmico Platform <alerts@example.invalid>",
            to: ["hello@example.invalid"],
            subject: `💰 Payment Watchdog: ${criticalIssues.length} critical issue(s)`,
            html: `
              <h2>Payment Plan Watchdog Report</h2>
              <p>${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</p>
              ${criticalIssues.length > 0 ? `<h3>⚠️ Critical Issues (${criticalIssues.length})</h3><ul>${criticalIssues.map(i => `<li>${i.description}</li>`).join("")}</ul>` : ""}
              ${autoFixes.length > 0 ? `<h3>✅ Auto-Fixes (${autoFixes.length})</h3><ul>${autoFixes.map(f => `<li>${f.description}</li>`).join("")}</ul>` : ""}
            `,
          });
        } catch (e) {
          console.error("[payment-watchdog] Email alert failed:", e);
        }
      }
    }

    const response = {
      status: criticalIssues.length > 0 ? "issues_found" : "healthy",
      timestamp: new Date().toISOString(),
      issues_count: issues.length,
      fixes_applied: autoFixes.length,
      issues,
      fixes: autoFixes,
    };

    console.log(`[payment-watchdog] Complete: ${issues.length} issues, ${autoFixes.length} fixes`);

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[payment-watchdog] Fatal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
