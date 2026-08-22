import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  try {
    console.log("[process-scheduled-payments] Starting processing run");

    // Fetch payment plan config for retry settings
    const { data: config } = await supabaseClient
      .from("payment_plan_config")
      .select("max_retry_attempts, retry_window_days")
      .limit(1)
      .single();

    const maxRetries = config?.max_retry_attempts || 5;
    const retryWindowDays = config?.retry_window_days || 14;

    const today = new Date().toISOString().split("T")[0];

    // 1. Find due payments (scheduled for today or earlier, still pending)
    const { data: duePayments, error: fetchError } = await supabaseClient
      .from("scheduled_payments")
      .select("*, payment_plan_enrollments(stripe_customer_id, stripe_payment_method_id, buyer_email, buyer_name, status)")
      .lte("scheduled_date", today)
      .eq("status", "pending")
      .order("scheduled_date")
      .limit(50);

    if (fetchError) {
      console.error("[process-scheduled-payments] Error fetching due payments:", fetchError);
      throw new Error("Failed to fetch due payments");
    }

    // 2. Find failed payments ready for retry
    const { data: retryPayments, error: retryFetchError } = await supabaseClient
      .from("scheduled_payments")
      .select("*, payment_plan_enrollments(stripe_customer_id, stripe_payment_method_id, buyer_email, buyer_name, status)")
      .eq("status", "failed")
      .lte("next_retry_at", new Date().toISOString())
      .lt("attempt_count", maxRetries)
      .order("next_retry_at")
      .limit(20);

    if (retryFetchError) {
      console.error("[process-scheduled-payments] Error fetching retry payments:", retryFetchError);
    }

    const allPayments = [...(duePayments || []), ...(retryPayments || [])];
    
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const payment of allPayments) {
      const enrollment = payment.payment_plan_enrollments;
      
      // Skip if enrollment is cancelled or not active
      if (!enrollment || enrollment.status === "cancelled") {
        console.log(`[process-scheduled-payments] Skipping payment ${payment.id} - enrollment cancelled`);
        continue;
      }

      // Skip if no payment method saved
      if (!enrollment.stripe_payment_method_id) {
        console.warn(`[process-scheduled-payments] No payment method for enrollment, skipping payment ${payment.id}`);
        continue;
      }

      processed++;

      // Mark as processing
      await supabaseClient
        .from("scheduled_payments")
        .update({ status: "processing", last_attempt_at: new Date().toISOString() })
        .eq("id", payment.id);

      try {
        // Create off-session PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: payment.amount,
          currency: "usd",
          customer: enrollment.stripe_customer_id,
          payment_method: enrollment.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `Cosmico - Payment ${payment.payment_number} of ${payment.enrollment_id}`,
          metadata: {
            enrollment_id: payment.enrollment_id,
            payment_number: payment.payment_number.toString(),
            scheduled_payment_id: payment.id,
            payment_plan: "true",
          },
        });

        if (paymentIntent.status === "succeeded") {
          // Mark as paid
          await supabaseClient
            .from("scheduled_payments")
            .update({
              status: "paid",
              stripe_payment_intent_id: paymentIntent.id,
              paid_at: new Date().toISOString(),
              attempt_count: payment.attempt_count + 1,
            })
            .eq("id", payment.id);

          succeeded++;
          console.log(`[process-scheduled-payments] Payment ${payment.id} succeeded (PI: ${paymentIntent.id})`);

          // Check if all payments for this enrollment are complete
          const { data: remainingPayments } = await supabaseClient
            .from("scheduled_payments")
            .select("id")
            .eq("enrollment_id", payment.enrollment_id)
            .in("status", ["pending", "processing", "failed"]);

          const isComplete = !remainingPayments || remainingPayments.length === 0;

          if (isComplete) {
            await supabaseClient
              .from("payment_plan_enrollments")
              .update({ status: "completed" })
              .eq("id", payment.enrollment_id);
            console.log(`[process-scheduled-payments] Enrollment ${payment.enrollment_id} completed`);
          }

          // Send receipt email
          sendPlanNotification({
            type: "payment_success",
            enrollmentId: payment.enrollment_id,
            paymentNumber: payment.payment_number,
            amount: payment.amount,
          });

          // If complete, also send "all paid up" email
          if (isComplete) {
            sendPlanNotification({
              type: "plan_completed",
              enrollmentId: payment.enrollment_id,
            });
          }
        } else {
          throw new Error(`PaymentIntent status: ${paymentIntent.status}`);
        }
      } catch (chargeError: unknown) {
        const errorMessage = chargeError instanceof Error ? chargeError.message : String(chargeError);
        const attemptCount = payment.attempt_count + 1;

        console.error(`[process-scheduled-payments] Payment ${payment.id} failed (attempt ${attemptCount}):`, errorMessage);

        if (attemptCount >= maxRetries) {
          // Max retries exceeded — mark enrollment as failed
          await supabaseClient
            .from("scheduled_payments")
            .update({
              status: "failed",
              attempt_count: attemptCount,
              last_error: errorMessage,
            })
            .eq("id", payment.id);

          // Mark enrollment as defaulted — admin must review
          await supabaseClient
            .from("payment_plan_enrollments")
            .update({ status: "defaulted" })
            .eq("id", payment.enrollment_id);

          // Admin notification — flag for review
          await supabaseClient
            .from("admin_notifications")
            .insert({
              type: "payment_plan_defaulted",
              title: "⚠️ Payment Plan Defaulted — Admin Review Required",
              message: `${enrollment.buyer_name} (${enrollment.buyer_email}) payment plan defaulted after ${maxRetries} attempts. Manual review required.`,
              metadata: {
                enrollment_id: payment.enrollment_id,
                payment_id: payment.id,
                amount: payment.amount,
                error: errorMessage,
              },
            });

          // Notify user
          sendPlanNotification({
            type: "payment_final_failure",
            enrollmentId: payment.enrollment_id,
            paymentNumber: payment.payment_number,
            amount: payment.amount,
          });
        } else {
          // Calculate next retry (exponential backoff: 1d, 2d, 3d, 4d, 5d)
          const retryDelayDays = Math.min(attemptCount, 5);
          const nextRetry = new Date();
          nextRetry.setDate(nextRetry.getDate() + retryDelayDays);

          await supabaseClient
            .from("scheduled_payments")
            .update({
              status: "failed",
              attempt_count: attemptCount,
              last_error: errorMessage,
              next_retry_at: nextRetry.toISOString(),
            })
            .eq("id", payment.id);

          // Notify user to update payment method
          sendPlanNotification({
            type: "payment_failed_retry",
            enrollmentId: payment.enrollment_id,
            paymentNumber: payment.payment_number,
            amount: payment.amount,
            nextRetryDate: nextRetry.toISOString(),
          });
        }

        failed++;
      }
    }

    console.log(`[process-scheduled-payments] Complete: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);

    return new Response(
      JSON.stringify({ processed, succeeded, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[process-scheduled-payments] Fatal error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// Non-blocking notification helper — sends to the dedicated payment plan notification function
function sendPlanNotification(data: {
  type: string;
  enrollmentId: string;
  paymentNumber?: number;
  amount?: number;
  nextRetryDate?: string;
}) {
  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-plan-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(data),
  }).catch((err) => console.error("[process-scheduled-payments] Notification error:", err));
}
