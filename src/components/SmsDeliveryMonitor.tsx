import { useState } from "react";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, AlertCircle, Clock, MessageSquare, Loader2, Webhook } from "lucide-react";
import { toast } from "sonner";

interface SmsLog {
  id: string;
  simpletexting_message_id: string | null;
  contact_phone: string;
  message_text: string | null;
  source: string;
  send_status: string;
  send_error: string | null;
  delivered_at: string | null;
  undelivered_at: string | null;
  carrier: string | null;
  failure_reason: string | null;
  related_promo_code: string | null;
  related_email: string | null;
  created_at: string;
}

const statusIntent: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  delivered: "success",
  sent: "info",
  queued: "neutral",
  undelivered: "danger",
  failed: "danger",
};

export const SmsDeliveryMonitor = () => {
  const [registering, setRegistering] = useState(false);

  const { data: logs = [], isLoading, refetch } = useAuthQuery({
    queryKey: ["sms-delivery-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_delivery_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as SmsLog[];
    },
    staleTime: 15 * 1000,
  });

  const counts = logs.reduce(
    (acc, l) => {
      acc.total++;
      if (l.send_status === "delivered") acc.delivered++;
      else if (l.send_status === "undelivered" || l.send_status === "failed") acc.failed++;
      else if (l.send_status === "sent") acc.sent++;
      else acc.queued++;
      return acc;
    },
    { total: 0, delivered: 0, failed: 0, sent: 0, queued: 0 }
  );

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke("sms-webhook-register", {
        body: { action: "register" },
      });
      if (error) throw error;
      const failures = (data?.results || []).filter((r: any) => r.status >= 400);
      if (failures.length > 0) {
        toast.error(`Registered with errors: ${failures.map((f: any) => `${f.trigger}: ${f.data?.message || f.status}`).join(", ")}`);
      } else {
        toast.success(`Webhook registered for: ${(data?.results || []).map((r: any) => r.trigger).join(", ")}`);
      }
      console.log("[sms-monitor] Webhook registration complete", { results: (data?.results || []).length, failures: failures.length });
    } catch (e: any) {
      toast.error(e.message || "Failed to register webhook");
    } finally {
      setRegistering(false);
    }
  };

  const handleListWebhooks = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("sms-webhook-register", {
        body: { action: "list" },
      });
      if (error) throw error;
      const list = data?.webhooks || [];
      toast.success(`${list.length} webhook(s) registered with SimpleTexting. See console for details.`);
      console.log("Registered webhooks:", list);
    } catch (e: any) {
      toast.error(e.message || "Failed to list webhooks");
    }
  };

  return (
    <div className="space-y-4">
      <AdminCard>
        <AdminCardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <AdminCardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                SMS Delivery Monitor
              </AdminCardTitle>
              <AdminCardDescription>
                Per-message SimpleTexting delivery status (last 50). Delivery confirmations arrive via webhook.
              </AdminCardDescription>
            </div>
            <div className="flex gap-2">
              <AdminButton variant="outline" size="sm" onClick={handleListWebhooks}>
                <Webhook className="h-4 w-4 mr-1" /> List
              </AdminButton>
              <AdminButton size="sm" onClick={handleRegister} disabled={registering}>
                {registering ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Webhook className="h-4 w-4 mr-1" />}
                Register Webhook
              </AdminButton>
              <AdminButton variant="outline" size="sm" onClick={() => refetch()}>
                Refresh
              </AdminButton>
            </div>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <Stat label="Total" value={counts.total} />
            <Stat label="Delivered" value={counts.delivered} variant="success" />
            <Stat label="Sent (awaiting)" value={counts.sent} />
            <Stat label="Failed" value={counts.failed} variant="destructive" />
            <Stat label="Queued" value={counts.queued} variant="secondary" />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No SMS sent yet. Outgoing messages will appear here once you send them.
            </div>
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Status</AdminTableHead>
                  <AdminTableHead>Phone</AdminTableHead>
                  <AdminTableHead>Source</AdminTableHead>
                  <AdminTableHead>Message</AdminTableHead>
                  <AdminTableHead>Carrier / Reason</AdminTableHead>
                  <AdminTableHead>Sent</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {logs.map((log) => (
                  <AdminTableRow key={log.id}>
                    <AdminTableCell>
                      <AdminBadge intent={statusIntent[log.send_status] || "neutral"}>
                        {iconFor(log.send_status)} {log.send_status}
                      </AdminBadge>
                    </AdminTableCell>
                    <AdminTableCell className="font-mono text-xs">{log.contact_phone}</AdminTableCell>
                    <AdminTableCell className="text-xs">{log.source}</AdminTableCell>
                    <AdminTableCell className="text-xs max-w-[260px] truncate" title={log.message_text || ""}>
                      {log.message_text || <span className="text-muted-foreground">—</span>}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {log.carrier && <div>{log.carrier}</div>}
                      {log.failure_reason && <div className="text-destructive">{log.failure_reason}</div>}
                      {log.send_error && !log.failure_reason && <div className="text-destructive">{log.send_error}</div>}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCardContent>
      </AdminCard>
    </div>
  );
};

function iconFor(status: string) {
  if (status === "delivered") return <CheckCircle className="h-3 w-3 inline mr-1" />;
  if (status === "undelivered" || status === "failed") return <AlertCircle className="h-3 w-3 inline mr-1" />;
  if (status === "queued" || status === "sent") return <Clock className="h-3 w-3 inline mr-1" />;
  return null;
}

function Stat({ label, value, variant }: { label: string; value: number; variant?: "success" | "destructive" | "secondary" }) {
  const color =
    variant === "success" ? "text-admin-success"
    : variant === "destructive" ? "text-admin-error"
    : variant === "secondary" ? "text-muted-foreground"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
