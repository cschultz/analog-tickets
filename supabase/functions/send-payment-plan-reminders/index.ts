import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is called daily via cron to send 3-day-ahead payment reminders
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find payments due in exactly 3 days
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 3);
    const targetDate = reminderDate.toISOString().split("T")[0];

    const { data: upcomingPayments, error } = await supabaseClient
      .from("scheduled_payments")
      .select("*, payment_plan_enrollments(buyer_email, buyer_name, status)")
      .eq("scheduled_date", targetDate)
      .eq("status", "pending");

    if (error) {
      console.error("[payment-plan-reminders] Error fetching upcoming:", error);
      throw error;
    }

    let sent = 0;
    for (const payment of (upcomingPayments || [])) {
      const enrollment = payment.payment_plan_enrollments;
      if (!enrollment || enrollment.status !== "active") continue;

      // Send reminder via notification function (fire-and-forget)
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-plan-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          type: "payment_reminder",
          enrollmentId: payment.enrollment_id,
          paymentNumber: payment.payment_number,
          amount: payment.amount,
        }),
      }).catch(err => console.error("[payment-plan-reminders] Send error:", err));

      sent++;
    }

    console.log(`[payment-plan-reminders] Sent ${sent} reminders for ${targetDate}`);

    return new Response(
      JSON.stringify({ sent, targetDate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[payment-plan-reminders] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
