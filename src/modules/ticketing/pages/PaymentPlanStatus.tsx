import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Check, Clock, AlertCircle, CreditCard, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { redirectToExternal } from "@/lib/safeRedirect";

interface Enrollment {
  id: string;
  buyer_name: string;
  buyer_email: string;
  total_amount: number;
  payment_count: number;
  status: string;
  created_at: string;
}

interface ScheduledPayment {
  id: string;
  payment_number: number;
  amount: number;
  scheduled_date: string;
  status: string;
  paid_at: string | null;
  attempt_count: number;
  last_error: string | null;
}

export default function PaymentPlanStatus() {
  const [searchParams] = useSearchParams();
  const enrollmentId = searchParams.get("enrollment");
  const justUpdated = searchParams.get("updated") === "true";

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [payments, setPayments] = useState<ScheduledPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (justUpdated) {
      toast.success("Payment method updated successfully!");
    }
  }, [justUpdated]);

  useEffect(() => {
    if (!enrollmentId) {
      setError("No payment plan found. Check your email for the correct link.");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const { data: enrollData, error: enrollErr } = await supabase
          .from("payment_plan_enrollments")
          .select("id, buyer_name, buyer_email, total_amount, payment_count, status, created_at")
          .eq("id", enrollmentId)
          .single();

        if (enrollErr || !enrollData) {
          setError("Payment plan not found.");
          setLoading(false);
          return;
        }

        setEnrollment(enrollData as unknown as Enrollment);

        const { data: payData } = await supabase
          .from("scheduled_payments")
          .select("id, payment_number, amount, scheduled_date, status, paid_at, attempt_count, last_error")
          .eq("enrollment_id", enrollmentId)
          .order("payment_number");

        setPayments((payData || []) as unknown as ScheduledPayment[]);
      } catch {
        setError("Unable to load payment plan details.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [enrollmentId]);

  const handleUpdatePaymentMethod = async () => {
    if (!enrollmentId) return;
    setUpdatingCard(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-payment-update-session", {
        body: { enrollmentId },
      });
      if (fnError) throw fnError;
      if (data?.url) {
        redirectToExternal(data.url);
      }
    } catch {
      toast.error("Unable to update payment method. Please try again.");
    } finally {
      setUpdatingCard(false);
    }
  };

  const totalPaid = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = enrollment ? enrollment.total_amount - totalPaid : 0;
  const progressPercent = enrollment ? Math.round((totalPaid / enrollment.total_amount) * 100) : 0;

  const statusConfig: Record<string, { icon: typeof Check; label: string; className: string }> = {
    paid: { icon: Check, label: "Paid", className: "text-[hsl(var(--success))]" },
    pending: { icon: Clock, label: "Upcoming", className: "text-[hsl(var(--warning))]" },
    processing: { icon: Loader2, label: "Processing", className: "text-[hsl(var(--primary))]" },
    failed: { icon: AlertCircle, label: "Retry Scheduled", className: "text-[hsl(var(--destructive))]" },
    cancelled: { icon: X, label: "Cancelled", className: "text-muted-foreground" },
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !enrollment) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h1 className="text-xl font-semibold mb-2 text-foreground" style={typography.headline}>
            {error || "Payment plan not found"}
          </h1>
          <p className="text-sm text-muted-foreground">
            If you believe this is an error, please contact us at hello@example.org
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 bg-background">
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <motion.div className="text-center mb-8" {...fadeInUp}>
          <img src={analogLogo} alt="Cosmico" className="h-8 mx-auto mb-6 opacity-80" />
          <h1 className="text-2xl font-bold text-foreground" style={typography.headline}>
            Your Payment Plan
          </h1>
          <p className="text-sm mt-1 text-muted-foreground">
            {enrollment.buyer_name} · {enrollment.buyer_email}
          </p>
        </motion.div>

        {/* Status Banner */}
        {enrollment.status === "completed" && (
          <motion.div className="rounded-lg p-4 mb-6 text-center bg-[hsl(var(--success)/0.1)] border border-[hsl(var(--success)/0.3)]" {...fadeInUp}>
            <Check className="w-6 h-6 mx-auto mb-2 text-[hsl(var(--success))]" />
            <p className="font-semibold text-[hsl(var(--success))]">All Paid Up!</p>
            <p className="text-sm text-[hsl(var(--success)/0.8)]">Your payment plan is complete. See you at the event!</p>
          </motion.div>
        )}

        {enrollment.status === "defaulted" && (
          <motion.div className="rounded-lg p-4 mb-6 text-center bg-[hsl(var(--destructive)/0.1)] border border-[hsl(var(--destructive)/0.3)]" {...fadeInUp}>
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-[hsl(var(--destructive))]" />
            <p className="font-semibold text-[hsl(var(--destructive))]">Action Required</p>
            <p className="text-sm text-[hsl(var(--destructive)/0.8)]">
              We were unable to process your payment. Please update your payment method below or contact us.
            </p>
          </motion.div>
        )}

        {enrollment.status === "cancelled" && (
          <motion.div className="rounded-lg p-4 mb-6 text-center bg-muted border" {...fadeInUp}>
            <X className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold text-foreground">Plan Cancelled</p>
            <p className="text-sm text-muted-foreground">This payment plan has been cancelled.</p>
          </motion.div>
        )}

        {/* Progress */}
        <motion.div
          className="rounded-xl p-6 mb-6 shadow-sm bg-card border"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex justify-between items-end mb-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Paid</p>
              <p className="text-2xl font-bold text-foreground">
                ${(totalPaid / 100).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Remaining</p>
              <p className={`text-lg font-semibold ${remainingBalance > 0 ? "text-primary" : "text-[hsl(var(--success))]"}`}>
                ${(remainingBalance / 100).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500 bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-center mt-2 text-muted-foreground">
            {progressPercent}% of ${(enrollment.total_amount / 100).toFixed(2)} paid
          </p>
        </motion.div>

        {/* Payment Schedule */}
        <motion.div
          className="rounded-xl overflow-hidden shadow-sm mb-6 bg-card border"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-foreground">Payment Schedule</h2>
          </div>
          <div className="divide-y">
            {payments.map((payment) => {
              const config = statusConfig[payment.status] || statusConfig.pending;
              const Icon = config.icon;
              return (
                <div key={payment.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      payment.status === "paid" ? "bg-[hsl(var(--success)/0.1)]" :
                      payment.status === "failed" ? "bg-[hsl(var(--destructive)/0.1)]" : "bg-muted"
                    }`}>
                      <Icon className={`w-4 h-4 ${config.className} ${payment.status === "processing" ? "animate-spin" : ""}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Payment {payment.payment_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.paid_at
                          ? `Paid ${new Date(payment.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}`
                          : new Date(payment.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })
                        }
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      ${(payment.amount / 100).toFixed(2)}
                    </p>
                    <p className={`text-xs ${config.className}`}>{config.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Update Payment Method */}
        {["active", "defaulted", "failed"].includes(enrollment.status) && (
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              onClick={handleUpdatePaymentMethod}
              disabled={updatingCard}
              className="gap-2"
            >
              {updatingCard ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              Update Payment Method
            </Button>
            <p className="text-xs mt-3 text-muted-foreground">
              You'll be redirected to a secure page to update your card.
            </p>
          </motion.div>
        )}

        {/* Footer */}
        <div className="text-center mt-10">
          <p className="text-xs text-muted-foreground">
            Questions? Contact us at{" "}
            <a href="mailto:hello@example.org" className="text-primary hover:underline">
              hello@example.org
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
