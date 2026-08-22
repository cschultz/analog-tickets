import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import {
  AdminCard, AdminCardContent, AdminStatCard,
} from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminTable, AdminTableBody, AdminTableCell, AdminTableHead,
  AdminTableHeader, AdminTableRow, AdminButton, AdminBadge,
} from "@/components/admin/AdminUI";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin";
import { AdminDialog, AdminDialogContent, AdminDialogHeader, AdminDialogTitle, AdminDialogFooter } from "@/components/admin/AdminDialog";
import { AdminTextarea } from "@/components/admin/AdminFormPrimitives";
import { toast } from "sonner";
import { CalendarDays, DollarSign, Users, CheckCircle, Clock, Loader2, RefreshCw, AlertTriangle, XCircle } from "lucide-react";
import { format } from "date-fns";

const STATUS_INTENTS: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  pending: "warning",
  active: "success",
  completed: "success",
  failed: "danger",
  defaulted: "danger",
  cancelled: "neutral",
  paid: "success",
  processing: "warning",
};

interface Enrollment {
  id: string;
  buyer_name: string;
  buyer_email: string;
  total_amount: number;
  payment_count: number;
  status: string;
  created_at: string;
  registration_id: string | null;
}

interface ScheduledPayment {
  id: string;
  enrollment_id: string;
  payment_number: number;
  amount: number;
  scheduled_date: string;
  status: string;
  paid_at: string | null;
  attempt_count: number;
  last_error: string | null;
  payment_plan_enrollments: {
    buyer_name: string;
    buyer_email: string;
  } | null;
}

interface PlanConfig {
  id: string;
  is_enabled: boolean;
  min_cart_amount: number;
  cutoff_date: string;
  pre_cutoff_payment_count: number;
  pre_cutoff_splits: number[];
  pre_cutoff_dates: string[];
  post_cutoff_payment_count: number;
  post_cutoff_splits: number[];
  post_cutoff_dates: string[];
  max_retry_attempts: number;
  retry_window_days: number;
}

export default function AdminPaymentPlans() {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Enrollment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const { data: config, isLoading: configLoading } = useAuthQuery<PlanConfig>({
    queryKey: ["payment-plan-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_plan_config")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as PlanConfig;
    },
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useAuthQuery<Enrollment[]>({
    queryKey: ["payment-plan-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_plan_enrollments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as Enrollment[];
    },
  });

  const { data: scheduledPayments, isLoading: paymentsLoading } = useAuthQuery<ScheduledPayment[]>({
    queryKey: ["scheduled-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_payments")
        .select("*, payment_plan_enrollments(buyer_name, buyer_email)")
        .order("scheduled_date", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as ScheduledPayment[];
    },
  });

  const enrollmentsList = enrollments || [];
  const paymentsList = scheduledPayments || [];

  const activeEnrollments = enrollmentsList.filter(e => e.status === "active");
  const completedEnrollments = enrollmentsList.filter(e => e.status === "completed");
  const defaultedEnrollments = enrollmentsList.filter(e => e.status === "defaulted");
  const pendingPayments = paymentsList.filter(p => ["pending", "failed"].includes(p.status));
  const totalCollected = paymentsList
    .filter(p => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const toggleEnabled = async () => {
    if (!config) return;
    const { error } = await supabase
      .from("payment_plan_config")
      .update({ is_enabled: !config.is_enabled })
      .eq("id", config.id);
    if (error) {
      toast.error("Failed to update config");
    } else {
      toast.success(`Payment plans ${!config.is_enabled ? "enabled" : "disabled"}`);
      queryClient.invalidateQueries({ queryKey: ["payment-plan-config"] });
    }
  };

  const runProcessor = async () => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-scheduled-payments");
      if (error) throw error;
      toast.success(`Processed: ${data?.succeeded || 0} succeeded, ${data?.failed || 0} failed`);
      queryClient.invalidateQueries({ queryKey: ["scheduled-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-plan-enrollments"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to run processor");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelPlan = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase.functions.invoke("cancel-payment-plan", {
        body: { enrollmentId: cancelTarget.id, reason: cancelReason },
      });
      if (error) throw error;
      toast.success("Payment plan cancelled");
      setCancelDialogOpen(false);
      setCancelTarget(null);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["payment-plan-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-payments"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel plan");
    } finally {
      setIsCancelling(false);
    }
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--admin-muted-foreground))]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Payment Plans"
        subtitle="Manage installment payment plans for ticket purchases"
        icon={CalendarDays}
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <AdminStatCard
          label="Active Plans"
          value={activeEnrollments.length}
          icon={Users}
        />
        <AdminStatCard
          label="Completed"
          value={completedEnrollments.length}
          icon={CheckCircle}
        />
        <AdminStatCard
          label="Defaulted"
          value={defaultedEnrollments.length}
          icon={AlertTriangle}
        />
        <AdminStatCard
          label="Pending Payments"
          value={pendingPayments.length}
          icon={Clock}
        />
        <AdminStatCard
          label="Total Collected"
          value={`$${(totalCollected / 100).toLocaleString()}`}
          icon={DollarSign}
        />
      </div>

      <AdminTabs defaultValue="enrollments">
        <AdminTabsList>
          <AdminTabsTrigger value="enrollments">Enrollments</AdminTabsTrigger>
          <AdminTabsTrigger value="payments">Scheduled Payments</AdminTabsTrigger>
          <AdminTabsTrigger value="config">Configuration</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="enrollments">
          <AdminCard>
            <AdminCardContent>
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    <AdminTableHead>Name</AdminTableHead>
                    <AdminTableHead>Email</AdminTableHead>
                    <AdminTableHead>Total</AdminTableHead>
                    <AdminTableHead>Payments</AdminTableHead>
                    <AdminTableHead>Status</AdminTableHead>
                    <AdminTableHead>Created</AdminTableHead>
                    <AdminTableHead>Actions</AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {enrollmentsLoading ? (
                    <AdminTableRow>
                      <AdminTableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      </AdminTableCell>
                    </AdminTableRow>
                  ) : enrollmentsList.length === 0 ? (
                    <AdminTableRow>
                      <AdminTableCell colSpan={7} className="text-center py-8 text-[hsl(var(--admin-muted-foreground))]">
                        No enrollments yet
                      </AdminTableCell>
                    </AdminTableRow>
                  ) : enrollmentsList.map((enrollment) => (
                    <AdminTableRow key={enrollment.id}>
                      <AdminTableCell className="font-medium">{enrollment.buyer_name}</AdminTableCell>
                      <AdminTableCell>{enrollment.buyer_email}</AdminTableCell>
                      <AdminTableCell>${(enrollment.total_amount / 100).toFixed(0)}</AdminTableCell>
                      <AdminTableCell>{enrollment.payment_count} payments</AdminTableCell>
                      <AdminTableCell>
                        <AdminBadge intent={STATUS_INTENTS[enrollment.status] || "neutral"}>
                          {enrollment.status}
                        </AdminBadge>
                      </AdminTableCell>
                      <AdminTableCell>{format(new Date(enrollment.created_at), "MMM d, yyyy")}</AdminTableCell>
                      <AdminTableCell>
                        {["active", "defaulted"].includes(enrollment.status) && (
                          <AdminButton
                            variant="adminGhost"
                            size="sm"
                            onClick={() => { setCancelTarget(enrollment); setCancelDialogOpen(true); }}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Cancel
                          </AdminButton>
                        )}
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        <AdminTabsContent value="payments">
          <AdminCard>
            <AdminCardContent>
              <div className="flex justify-end mb-4">
                <AdminButton
                  variant="adminOutline"
                  size="sm"
                  onClick={runProcessor}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                  Run Processor Now
                </AdminButton>
              </div>
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    <AdminTableHead>Buyer</AdminTableHead>
                    <AdminTableHead>#</AdminTableHead>
                    <AdminTableHead>Amount</AdminTableHead>
                    <AdminTableHead>Scheduled</AdminTableHead>
                    <AdminTableHead>Status</AdminTableHead>
                    <AdminTableHead>Attempts</AdminTableHead>
                    <AdminTableHead>Error</AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {paymentsLoading ? (
                    <AdminTableRow>
                      <AdminTableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      </AdminTableCell>
                    </AdminTableRow>
                  ) : paymentsList.length === 0 ? (
                    <AdminTableRow>
                      <AdminTableCell colSpan={7} className="text-center py-8 text-[hsl(var(--admin-muted-foreground))]">
                        No scheduled payments
                      </AdminTableCell>
                    </AdminTableRow>
                  ) : paymentsList.map((payment) => (
                    <AdminTableRow key={payment.id}>
                      <AdminTableCell className="font-medium">
                        {payment.payment_plan_enrollments?.buyer_name || "—"}
                      </AdminTableCell>
                      <AdminTableCell>{payment.payment_number}</AdminTableCell>
                      <AdminTableCell>${(payment.amount / 100).toFixed(0)}</AdminTableCell>
                      <AdminTableCell>{format(new Date(payment.scheduled_date + "T00:00:00"), "MMM d, yyyy")}</AdminTableCell>
                      <AdminTableCell>
                        <AdminBadge intent={STATUS_INTENTS[payment.status] || "neutral"}>
                          {payment.status}
                        </AdminBadge>
                      </AdminTableCell>
                      <AdminTableCell>{payment.attempt_count}</AdminTableCell>
                      <AdminTableCell className="max-w-[200px] truncate text-xs">
                        {payment.last_error || "—"}
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        <AdminTabsContent value="config">
          {config && (
            <AdminCard>
              <AdminCardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[hsl(var(--admin-foreground))]">
                      Payment Plans
                    </h3>
                    <p className="text-sm text-[hsl(var(--admin-muted-foreground))]">
                      {config.is_enabled ? "Currently accepting payment plans" : "Payment plans are disabled"}
                    </p>
                  </div>
                  <AdminButton
                    variant={config.is_enabled ? "adminOutline" : "admin"}
                    onClick={toggleEnabled}
                  >
                    {config.is_enabled ? "Disable" : "Enable"}
                  </AdminButton>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-medium text-[hsl(var(--admin-foreground))]">General Settings</h4>
                    <div className="space-y-2">
                      <AdminLabel>Minimum Cart Amount</AdminLabel>
                      <p className="text-sm text-[hsl(var(--admin-foreground))]">
                        ${(config.min_cart_amount / 100).toFixed(0)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <AdminLabel>Cutoff Date</AdminLabel>
                      <p className="text-sm text-[hsl(var(--admin-foreground))]">
                        {format(new Date(config.cutoff_date), "MMMM d, yyyy")}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <AdminLabel>Max Retry Attempts</AdminLabel>
                      <p className="text-sm text-[hsl(var(--admin-foreground))]">{config.max_retry_attempts}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium text-[hsl(var(--admin-foreground))]">Before Cutoff (3 payments)</h4>
                    <div className="space-y-1">
                      {config.pre_cutoff_splits.map((split: number, i: number) => (
                        <p key={i} className="text-sm text-[hsl(var(--admin-foreground))]">
                          Payment {i + 1}: {Math.round(split * 100)}% — {config.pre_cutoff_dates[i] === "immediate" ? "Today" : format(new Date(config.pre_cutoff_dates[i] + "T00:00:00"), "MMM d")}
                        </p>
                      ))}
                    </div>

                    <h4 className="font-medium text-[hsl(var(--admin-foreground))] mt-4">After Cutoff (2 payments)</h4>
                    <div className="space-y-1">
                      {config.post_cutoff_splits.map((split: number, i: number) => (
                        <p key={i} className="text-sm text-[hsl(var(--admin-foreground))]">
                          Payment {i + 1}: {Math.round(split * 100)}% — {config.post_cutoff_dates[i] === "immediate" ? "Today" : format(new Date(config.post_cutoff_dates[i] + "T00:00:00"), "MMM d")}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </AdminCardContent>
            </AdminCard>
          )}
        </AdminTabsContent>
      </AdminTabs>

      {/* Cancel Dialog */}
      <AdminDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Cancel Payment Plan</AdminDialogTitle>
          </AdminDialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-[hsl(var(--admin-muted-foreground))]">
              Cancel the payment plan for <strong>{cancelTarget?.buyer_name}</strong>? Remaining scheduled payments will be cancelled. Previous payments are <strong>not refunded</strong>.
            </p>
            <div className="space-y-2">
              <AdminLabel>Reason (optional)</AdminLabel>
              <AdminTextarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Customer requested cancellation"
              />
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setCancelDialogOpen(false)}>
              Keep Plan
            </AdminButton>
            <AdminButton variant="adminDestructive" onClick={handleCancelPlan} disabled={isCancelling}>
              {isCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
              Cancel Plan
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}