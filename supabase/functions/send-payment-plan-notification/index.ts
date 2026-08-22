import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  corsHeaders,
  escapeHtml,
  getFirstName,
  formatAmount,
  colors,
} from "../_shared/email-template.ts";

type NotificationType = 
  | "payment_success"
  | "payment_reminder"
  | "payment_failed_retry"
  | "payment_final_failure"
  | "plan_completed"
  | "plan_cancelled";

interface NotificationRequest {
  type: NotificationType;
  enrollmentId: string;
  paymentNumber?: number;
  amount?: number;
  nextRetryDate?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: NotificationRequest = await req.json();
    const { type, enrollmentId, paymentNumber, amount, nextRetryDate } = body;

    if (!type || !enrollmentId) {
      return new Response(
        JSON.stringify({ error: "type and enrollmentId are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch enrollment with all scheduled payments
    const { data: enrollment, error: enrollError } = await supabaseClient
      .from("payment_plan_enrollments")
      .select("*")
      .eq("id", enrollmentId)
      .single();

    if (enrollError || !enrollment) {
      console.error("[payment-plan-notification] Enrollment not found:", enrollError);
      return new Response(
        JSON.stringify({ error: "Enrollment not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const { data: payments } = await supabaseClient
      .from("scheduled_payments")
      .select("*")
      .eq("enrollment_id", enrollmentId)
      .order("payment_number");

    const allPayments = payments || [];
    const paidPayments = allPayments.filter(p => p.status === "paid");
    const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
    const remainingBalance = enrollment.total_amount - totalPaid;
    const nextPayment = allPayments.find(p => ["pending", "failed"].includes(p.status));

    const firstName = getFirstName(enrollment.buyer_name);
    const siteUrl = Deno.env.get("SITE_URL") || "https://example.invalid";
    const statusPageUrl = `${siteUrl}/payment-plan-status?enrollment=${enrollmentId}`;

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    let subject = "";
    let emailHtml = "";

    switch (type) {
      case "payment_success": {
        const paymentAmt = amount || 0;
        subject = `Payment ${paymentNumber} received — ${formatAmount(remainingBalance)} remaining`;
        emailHtml = buildEmail({
          firstName,
          heading: "Payment Received ✓",
          body: `
            <p>Your payment of <strong>${formatAmount(paymentAmt)}</strong> has been processed successfully.</p>
            
            <div class="details">
              <p><strong>Payment ${paymentNumber} of ${enrollment.payment_count}</strong></p>
              <p>Amount charged: ${formatAmount(paymentAmt)}</p>
              <p>Total paid so far: ${formatAmount(totalPaid)}</p>
              <p>Remaining balance: <strong>${formatAmount(remainingBalance)}</strong></p>
              ${nextPayment ? `<p>Next payment: ${formatAmount(nextPayment.amount)} on ${formatDate(nextPayment.scheduled_date)}</p>` : ""}
            </div>

            ${remainingBalance > 0 ? `
              <a href="${statusPageUrl}" class="cta-button">
                View Payment Plan
              </a>
            ` : ""}
          `,
        });
        break;
      }

      case "payment_reminder": {
        const reminderAmt = nextPayment?.amount || amount || 0;
        const reminderDate = nextPayment?.scheduled_date || "";
        subject = `Upcoming payment of ${formatAmount(reminderAmt)} on ${formatDate(reminderDate)}`;
        emailHtml = buildEmail({
          firstName,
          heading: "Upcoming Payment Reminder",
          body: `
            <p>Just a heads up — your next payment will be automatically charged in 3 days.</p>
            
            <div class="details">
              <p><strong>Amount:</strong> ${formatAmount(reminderAmt)}</p>
              <p><strong>Date:</strong> ${formatDate(reminderDate)}</p>
              <p><strong>Remaining after this payment:</strong> ${formatAmount(remainingBalance - reminderAmt)}</p>
            </div>

            <p>The card on file will be charged automatically. If you need to update your payment method, you can do so from your payment plan page.</p>

            <a href="${statusPageUrl}" class="cta-button">
              View Payment Plan
            </a>
          `,
        });
        break;
      }

      case "payment_failed_retry": {
        const failedAmt = amount || 0;
        const retryDate = nextRetryDate ? formatDate(nextRetryDate.split("T")[0]) : "soon";
        subject = `Action needed: Payment of ${formatAmount(failedAmt)} was unsuccessful`;
        emailHtml = buildEmail({
          firstName,
          heading: "Payment Unsuccessful",
          body: `
            <p>We weren't able to process your scheduled payment of <strong>${formatAmount(failedAmt)}</strong>.</p>
            
            <p>Don't worry — we'll automatically retry on <strong>${retryDate}</strong>. To avoid any issues, please make sure your payment method is up to date.</p>

            <a href="${statusPageUrl}" class="cta-button">
              Update Payment Method
            </a>

            <p style="font-size: 13px; color: ${colors.textMuted};">If you have questions, reply to this email or use the chat on our website.</p>
          `,
        });
        break;
      }

      case "payment_final_failure": {
        subject = "Important: Your payment plan requires attention";
        emailHtml = buildEmail({
          firstName,
          heading: "Payment Plan Needs Attention",
          body: `
            <p>We've been unable to process your scheduled payment after several attempts.</p>
            
            <div class="details">
              <p><strong>Outstanding balance:</strong> ${formatAmount(remainingBalance)}</p>
              <p>Your payment plan has been flagged for review. Our team will reach out to you shortly to help resolve this.</p>
            </div>

            <p>In the meantime, you can update your payment method:</p>

            <a href="${statusPageUrl}" class="cta-button">
              Update Payment Method
            </a>

            <p style="font-size: 13px; color: ${colors.textMuted};">If you have questions, reply to this email or reach out to us at hello@example.invalid.</p>
          `,
        });
        break;
      }

      case "plan_completed": {
        subject = "You're all paid up! 🎉";
        emailHtml = buildEmail({
          firstName,
          heading: "You're All Paid Up!",
          body: `
            <p>Great news — your final payment has been processed and your balance is <strong>$0</strong>. You're all set for Cosmico!</p>
            
            <div class="details">
              <p><strong>Total paid:</strong> ${formatAmount(enrollment.total_amount)}</p>
              <p><strong>Payments completed:</strong> ${enrollment.payment_count} of ${enrollment.payment_count}</p>
            </div>

            <p>We can't wait to see you there. Stay tuned for event details closer to the date!</p>
          `,
        });
        break;
      }

      case "plan_cancelled": {
        subject = "Payment plan cancelled";
        emailHtml = buildEmail({
          firstName,
          heading: "Payment Plan Cancelled",
          body: `
            <p>Your payment plan has been cancelled as requested.</p>
            
            <div class="details">
              <p><strong>Total paid before cancellation:</strong> ${formatAmount(totalPaid)}</p>
              <p><strong>Remaining balance cancelled:</strong> ${formatAmount(remainingBalance)}</p>
            </div>

            <p style="font-size: 13px; color: ${colors.textMuted};">Note: Previous payments are not eligible for refund. If you have questions, reply to this email.</p>
          `,
        });
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown notification type: ${type}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "The Cosmico Team — Cosmico <hello@example.invalid>",
      replyTo: "hello@example.invalid",
      to: [enrollment.buyer_email],
      subject,
      html: emailHtml,
    });

    if (emailError) {
      console.error("[payment-plan-notification] Email send error:", emailError);
      throw emailError;
    }

    console.log(`[payment-plan-notification] Sent ${type} to ${enrollment.buyer_email}:`, emailData?.id);

    return new Response(
      JSON.stringify({ success: true, emailId: emailData?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[payment-plan-notification] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  } catch {
    return dateStr;
  }
}

function buildEmail({ firstName, heading, body }: { firstName: string; heading: string; body: string }): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: ${colors.text};
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: ${colors.background};
          }
          .container {
            background: ${colors.surface};
            border: 2px solid ${colors.border};
            padding: 40px;
          }
          h1 {
            color: ${colors.primary};
            font-size: 24px;
            margin-bottom: 20px;
          }
          p {
            font-size: 15px;
            line-height: 1.6;
            margin: 0 0 16px;
          }
          .details {
            margin: 24px 0;
            padding: 20px;
            background: ${colors.surfaceAlt};
            border-left: 3px solid ${colors.primaryGold};
          }
          .details p {
            margin: 4px 0;
            font-size: 14px;
          }
          .cta-button {
            display: inline-block;
            background: ${colors.primaryGold};
            color: ${colors.background};
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 4px;
            margin: 16px 0;
            font-weight: 600;
            font-size: 15px;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid ${colors.border};
            color: ${colors.textMuted};
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>${escapeHtml(heading)}</h1>
          <p>Hi ${escapeHtml(firstName)},</p>
          ${body}
          <div class="footer">
            <p>✌️&❤️,<br>The Cosmico Team</p>
            <p style="font-size: 12px;">© ${new Date().getFullYear()} Cosmico. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
