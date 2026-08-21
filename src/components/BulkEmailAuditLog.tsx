import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import {
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminBadge,
  AdminButton,
  AdminInput,
} from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin/AdminDialog";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
// Skeleton removed - using admin-styled loading
import { History, Search, Eye, Mail, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface EmailLogEntry {
  id: string;
  registration_id: string;
  email_type: string;
  status: string;
  error_message: string | null;
  email_content: string | null;
  sent_at: string;
  sent_by: string | null;
  created_at: string;
  registration?: {
    name: string;
    email: string;
    event_id: string;
  } | null;
}

interface BulkEmailStats {
  total: number;
  today: number;
  thisWeek: number;
  byType: Record<string, number>;
}

export function BulkEmailAuditLog() {
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<EmailLogEntry | null>(null);
  const [stats, setStats] = useState<BulkEmailStats | null>(null);
  const [senderMap, setSenderMap] = useState<Record<string, { email: string; full_name: string | null }>>({});

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      // Fetch email logs with registration info
      let query = supabase
        .from("email_logs")
        .select(`
          *,
          registration:registrations(name, email, event_id)
        `)
        .order("sent_at", { ascending: false })
        .limit(500);

      // Filter by bulk email types
      if (filterType === "all") {
        query = query.in("email_type", [
          "bulk_announcement",
          "bulk_announcement_preview",
          "abandoned_registration",
          "payment_reminder",
          "event_reminder",
          "tickets_delivery"
        ]);
      } else {
        query = query.eq("email_type", filterType);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching logs:", error);
        return;
      }

      // Get unique sender IDs and fetch their profiles
      const senderIds = [...new Set((data || []).map(log => log.sent_by).filter(Boolean))];
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", senderIds);
        
        const map: Record<string, { email: string; full_name: string | null }> = {};
        profiles?.forEach(p => {
          map[p.id] = { email: p.email, full_name: p.full_name };
        });
        setSenderMap(map);
      }

      setLogs(data || []);

      // Calculate stats
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);

      const byType: Record<string, number> = {};
      let today = 0;
      let thisWeek = 0;

      (data || []).forEach((log) => {
        byType[log.email_type] = (byType[log.email_type] || 0) + 1;
        const sentDate = new Date(log.sent_at);
        if (sentDate >= todayStart) today++;
        if (sentDate >= weekStart) thisWeek++;
      });

      setStats({
        total: data?.length || 0,
        today,
        thisWeek,
        byType,
      });
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterType]);

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.registration?.email?.toLowerCase().includes(query) ||
      log.registration?.name?.toLowerCase().includes(query) ||
      log.email_type.toLowerCase().includes(query)
    );
  });

  const getEmailTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      bulk_announcement: "Announcement",
      bulk_announcement_preview: "Preview",
      abandoned_registration: "Abandoned Reg",
      payment_reminder: "Payment Reminder",
      event_reminder: "Event Reminder",
      tickets_delivery: "Ticket Delivery",
      ticket_confirmation: "Confirmation",
      event_info_auto: "Event Info",
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    if (status === "sent") {
      return (
        <AdminBadge intent="success" showDot>
          Sent
        </AdminBadge>
      );
    }
    if (status === "failed") {
      return (
        <AdminBadge intent="danger" showDot>
          Failed
        </AdminBadge>
      );
    }
    return (
      <AdminBadge intent="warning" showDot>
        {status}
      </AdminBadge>
    );
  };

  return (
    <>
      <AdminCard>
        <AdminCardHeader icon={History} action={
          <AdminButton variant="adminOutline" size="sm" onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </AdminButton>
        }>
          <AdminCardTitle>Email Audit Log</AdminCardTitle>
          <AdminCardDescription>
            Track all bulk and automated emails sent from the system
          </AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-hover))] border border-[hsl(var(--admin-border))]">
                <p className="text-2xl font-bold text-[hsl(var(--admin-text))]">{stats.total}</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">Total Logged</p>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-hover))] border border-[hsl(var(--admin-border))]">
                <p className="text-2xl font-bold text-[hsl(var(--admin-text))]">{stats.today}</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">Today</p>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-hover))] border border-[hsl(var(--admin-border))]">
                <p className="text-2xl font-bold text-[hsl(var(--admin-text))]">{stats.thisWeek}</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">This Week</p>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--admin-hover))] border border-[hsl(var(--admin-border))]">
                <p className="text-2xl font-bold text-[hsl(var(--admin-text))]">
                  {stats.byType["bulk_announcement"] || 0}
                </p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">Announcements</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              <AdminInput
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <AdminSelect value={filterType} onValueChange={setFilterType} placeholder="Filter by type">
              <AdminSelectItem value="all">All Email Types</AdminSelectItem>
              <AdminSelectItem value="bulk_announcement">Announcements</AdminSelectItem>
              <AdminSelectItem value="abandoned_registration">Abandoned Reg</AdminSelectItem>
              <AdminSelectItem value="payment_reminder">Payment Reminders</AdminSelectItem>
              <AdminSelectItem value="event_reminder">Event Reminders</AdminSelectItem>
              <AdminSelectItem value="tickets_delivery">Ticket Delivery</AdminSelectItem>
            </AdminSelect>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 w-full rounded bg-[hsl(var(--admin-hover))] animate-pulse" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No email logs found</p>
            </div>
          ) : (
            <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Sent</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Type</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Recipient</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Status</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Sent By</AdminTableHead>
                    <AdminTableHead className="w-[80px]"></AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {filteredLogs.slice(0, 100).map((log) => (
                    <AdminTableRow key={log.id} className="hover:bg-[hsl(var(--admin-hover))]">
                      <AdminTableCell className="whitespace-nowrap">
                        <div>
                          <p className="text-sm font-medium text-[hsl(var(--admin-text))]">
                            {format(new Date(log.sent_at), "MMM d, yyyy")}
                          </p>
                          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                            {format(new Date(log.sent_at), "h:mm a")}
                          </p>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell>
                        <AdminBadge intent="neutral" size="sm">
                          {getEmailTypeLabel(log.email_type)}
                        </AdminBadge>
                      </AdminTableCell>
                      <AdminTableCell>
                        <div className="max-w-[200px]">
                          <p className="text-sm font-medium truncate text-[hsl(var(--admin-text))]">
                            {log.registration?.name || "Unknown"}
                          </p>
                          <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                            {log.registration?.email || "-"}
                          </p>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell>{getStatusBadge(log.status)}</AdminTableCell>
                      <AdminTableCell>
                        <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                          {log.sent_by && senderMap[log.sent_by]
                            ? senderMap[log.sent_by].full_name || senderMap[log.sent_by].email
                            : "System"}
                        </span>
                      </AdminTableCell>
                      <AdminTableCell>
                        <AdminButton
                          variant="adminGhost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </AdminButton>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            </div>
          )}

          {filteredLogs.length > 100 && (
            <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center">
              Showing 100 of {filteredLogs.length} results
            </p>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* Email Content Preview Dialog */}
      <AdminDialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <AdminDialogContent className="max-w-3xl max-h-[80vh]">
          <AdminDialogHeader>
            <AdminDialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Details
            </AdminDialogTitle>
          </AdminDialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">Recipient</p>
                  <p className="font-medium text-[hsl(var(--admin-text))]">{selectedLog.registration?.name}</p>
                  <p className="text-[hsl(var(--admin-text-muted))]">{selectedLog.registration?.email}</p>
                </div>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">Sent</p>
                  <p className="font-medium text-[hsl(var(--admin-text))]">
                    {format(new Date(selectedLog.sent_at), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                  <p className="text-[hsl(var(--admin-text-muted))]">
                    {formatDistanceToNow(new Date(selectedLog.sent_at), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">Type</p>
                  <AdminBadge intent="neutral">{getEmailTypeLabel(selectedLog.email_type)}</AdminBadge>
                </div>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">Status</p>
                  {getStatusBadge(selectedLog.status)}
                  {selectedLog.error_message && (
                    <p className="text-xs text-[hsl(var(--admin-error))] mt-1">{selectedLog.error_message}</p>
                  )}
                </div>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">Sent By</p>
                  <p className="font-medium text-[hsl(var(--admin-text))]">
                    {selectedLog.sent_by && senderMap[selectedLog.sent_by]
                      ? senderMap[selectedLog.sent_by].full_name || senderMap[selectedLog.sent_by].email
                      : "System (Automated)"}
                  </p>
                </div>
              </div>

              {selectedLog.email_content && (
                <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
                  <div className="bg-[hsl(var(--admin-hover))] px-3 py-2 border-b border-[hsl(var(--admin-border))]">
                    <p className="text-sm font-medium text-[hsl(var(--admin-text))]">Email Content Preview</p>
                  </div>
                  <AdminScrollArea className="h-[300px]">
                    <iframe
                      srcDoc={selectedLog.email_content}
                      className="w-full h-[600px] bg-[hsl(var(--admin-surface))]"
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  </AdminScrollArea>
                </div>
              )}
            </div>
          )}
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}