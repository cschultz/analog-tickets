import { useEffect } from "react";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminBadge,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminButton,
} from "@/components/admin";
import { AlertCircle, CheckCircle, Clock, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import { getFunctionUrl } from "@/platform/config/env";

interface WebhookLog {
  id: string;
  event_id: string;
  event_type: string;
  session_id: string | null;
  registration_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export const WebhookMonitor = () => {
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading } = useAuthQuery({
    queryKey: ["webhook-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as WebhookLog[];
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const { data: pendingCount = 0 } = useAuthQuery({
    queryKey: ["webhook-pending-count"],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - 1);

      const { count, error } = await supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("payment_status", "pending")
        .lt("created_at", cutoff.toISOString());

      if (error) throw error;
      return count || 0;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Set up realtime subscription for webhook logs
  useEffect(() => {
    const channel = supabase
      .channel("webhook_logs_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "webhook_logs",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["webhook-logs"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["webhook-logs"] });
    queryClient.invalidateQueries({ queryKey: ["webhook-pending-count"] });
    toast.success("Webhook status refreshed");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "processed":
        return <AdminBadge intent="success" showDot><CheckCircle className="w-3 h-3 mr-1" />Success</AdminBadge>;
      case "error":
        return <AdminBadge intent="danger" showDot><AlertCircle className="w-3 h-3 mr-1" />Error</AdminBadge>;
      case "duplicate":
        return <AdminBadge intent="neutral"><Clock className="w-3 h-3 mr-1" />Duplicate</AdminBadge>;
      case "received":
        return <AdminBadge intent="neutral"><Clock className="w-3 h-3 mr-1" />Received</AdminBadge>;
      default:
        return <AdminBadge intent="neutral">{status}</AdminBadge>;
    }
  };

  const lastSuccessfulWebhook = logs.find(log => log.status === "processed");
  const recentErrors = logs.filter(log => log.status === "error").length;

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle>Webhook Monitor</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader>
        <div className="flex items-center justify-between">
          <div>
            <AdminCardTitle>Stripe Webhook Monitor</AdminCardTitle>
            <AdminCardDescription>
              Track webhook deliveries and payment confirmations
            </AdminCardDescription>
          </div>
          <AdminButton
            onClick={handleRefresh}
            variant="adminOutline"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </AdminButton>
        </div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-6">
        {/* Status Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <div className="text-sm text-[hsl(var(--admin-text-muted))] mb-1">Last Successful Webhook</div>
            <div className="text-lg font-semibold">
              {lastSuccessfulWebhook ? (
                <span className="text-[hsl(var(--admin-success))]">
                  {formatDistanceToNow(new Date(lastSuccessfulWebhook.created_at), { addSuffix: true })}
                </span>
              ) : (
                <span className="text-[hsl(var(--admin-warning))]">No webhooks received</span>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="text-sm text-[hsl(var(--admin-text-muted))] mb-1">Stuck Pending Orders</div>
            <div className="text-lg font-semibold">
              {pendingCount > 0 ? (
                <span className="text-[hsl(var(--admin-warning))]">{pendingCount} order{pendingCount !== 1 ? 's' : ''}</span>
              ) : (
                <span className="text-[hsl(var(--admin-success))]">None</span>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="text-sm text-[hsl(var(--admin-text-muted))] mb-1">Recent Errors (last 20)</div>
            <div className="text-lg font-semibold">
              {recentErrors > 0 ? (
                <span className="text-[hsl(var(--admin-error))]">{recentErrors} error{recentErrors !== 1 ? 's' : ''}</span>
              ) : (
                <span className="text-[hsl(var(--admin-success))]">None</span>
              )}
            </div>
          </div>
        </div>

        {/* Setup Instructions */}
        {logs.length === 0 && (
          <div className="bg-[hsl(var(--admin-warning-muted))] border border-[hsl(var(--admin-warning))/30] rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[hsl(var(--admin-warning))] mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-[hsl(var(--admin-text))] mb-1">Webhook Not Configured</div>
                <div className="text-sm text-[hsl(var(--admin-text-secondary))] mb-3">
                  To receive payment confirmations, configure your webhook in Stripe:
                </div>
                <ol className="text-sm text-[hsl(var(--admin-text-secondary))] space-y-1 list-decimal list-inside mb-3">
                  <li>Go to Stripe Dashboard → Developers → Webhooks</li>
                  <li>Click "Add endpoint"</li>
                  <li>Enter URL: <code className="bg-[hsl(var(--admin-surface))] px-1 rounded border border-[hsl(var(--admin-border))]">{getFunctionUrl("stripe-webhook")}</code></li>
                  <li>Select event: <code className="bg-[hsl(var(--admin-surface))] px-1 rounded border border-[hsl(var(--admin-border))]">checkout.session.completed</code></li>
                  <li>Update STRIPE_WEBHOOK_SECRET if needed</li>
                </ol>
                <AdminButton
                  variant="adminOutline"
                  size="sm"
                  onClick={() => window.open("https://dashboard.stripe.com/webhooks", "_blank")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Stripe Dashboard
                </AdminButton>
              </div>
            </div>
          </div>
        )}

        {/* Recent Webhook Events */}
        {logs.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Recent Webhook Events</h3>
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Time</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Event Type</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Status</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Session ID</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Error</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {logs.map((log) => (
                  <AdminTableRow key={log.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </AdminTableCell>
                    <AdminTableCell className="text-sm font-mono text-[hsl(var(--admin-text))]">{log.event_type}</AdminTableCell>
                    <AdminTableCell>{getStatusBadge(log.status)}</AdminTableCell>
                    <AdminTableCell className="text-sm font-mono">
                      {log.session_id ? (
                        <span className="text-xs text-[hsl(var(--admin-text-muted))]">{log.session_id.substring(0, 20)}...</span>
                      ) : (
                        <span className="text-[hsl(var(--admin-text-muted))]">—</span>
                      )}
                    </AdminTableCell>
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-error))]">
                      {log.error_message || <span className="text-[hsl(var(--admin-text-muted))]">—</span>}
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
};