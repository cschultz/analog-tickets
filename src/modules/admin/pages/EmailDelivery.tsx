import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Mail, RefreshCw, Loader2, TrendingUp, AlertTriangle, CheckCircle, XCircle, MousePointer } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle, AdminCardDescription } from "@/components/admin/AdminCard";
import {
  AdminButton,
  AdminBadge,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
  AdminEmptyState,
  AdminTabs,
  AdminTabsContent,
  AdminTabsList,
  AdminTabsTrigger,
} from "@/components/admin";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface EmailBounce {
  id: string;
  email: string;
  bounce_type: string;
  created_at: string;
  reason: string | null;
}

interface EmailSequenceLog {
  id: string;
  registration_id: string;
  sequence_id: string;
  step_id: string;
  status: string;
  sent_at: string | null;
  open_count: number | null;
  click_count: number | null;
  tracking_id: string | null;
}

interface BulkEmailCampaign {
  id: string;
  name: string | null;
  subject: string;
  sent_at: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  audience: string | null;
}

export default function EmailDeliveryPage() {
  const queryClient = useQueryClient();

  const { data: bounces = [], isLoading: bouncesLoading } = useAuthQuery({
    queryKey: ["email-bounces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_bounces")
        .select("id, email, bounce_type, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as EmailBounce[];
    },
    staleTime: 60 * 1000,
  });

  const { data: sequenceLogs = [], isLoading: logsLoading } = useAuthQuery({
    queryKey: ["email-sequence-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_sequence_logs")
        .select("id, registration_id, sequence_id, step_id, status, sent_at, open_count, click_count, tracking_id")
        .order("sent_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as EmailSequenceLog[];
    },
    staleTime: 60 * 1000,
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useAuthQuery({
    queryKey: ["bulk-email-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulk_email_campaigns")
        .select("id, name, subject, sent_at, recipient_count, sent_count, failed_count, audience")
        .order("sent_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as BulkEmailCampaign[];
    },
    staleTime: 60 * 1000,
  });

  const stats = useMemo(() => {
    const sentLogs = sequenceLogs.filter((l) => l.status === "sent");
    const totalOpens = sentLogs.reduce((sum, l) => sum + (l.open_count || 0), 0);
    const totalClicks = sentLogs.reduce((sum, l) => sum + (l.click_count || 0), 0);
    const openRate = sentLogs.length > 0 ? (sentLogs.filter((l) => (l.open_count || 0) > 0).length / sentLogs.length) * 100 : 0;
    const clickRate = sentLogs.length > 0 ? (sentLogs.filter((l) => (l.click_count || 0) > 0).length / sentLogs.length) * 100 : 0;
    
    return {
      totalSent: sentLogs.length,
      totalOpens,
      totalClicks,
      openRate: openRate.toFixed(1),
      clickRate: clickRate.toFixed(1),
      hardBounces: bounces.filter((b) => b.bounce_type === "hard").length,
      softBounces: bounces.filter((b) => b.bounce_type === "soft").length,
    };
  }, [sequenceLogs, bounces]);

  const chartData = useMemo(() => {
    const bySequence: Record<string, { sent: number; opens: number; clicks: number }> = {};
    for (const log of sequenceLogs) {
      const seqName = log.sequence_id?.substring(0, 8) || "unknown";
      if (!bySequence[seqName]) {
        bySequence[seqName] = { sent: 0, opens: 0, clicks: 0 };
      }
      if (log.status === "sent") bySequence[seqName].sent++;
      bySequence[seqName].opens += log.open_count || 0;
      bySequence[seqName].clicks += log.click_count || 0;
    }
    return Object.entries(bySequence).map(([name, data]) => ({ name, ...data }));
  }, [sequenceLogs]);

  const isLoading = bouncesLoading || logsLoading || campaignsLoading;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Email Delivery"
        subtitle="Track email delivery, opens, clicks, and bounces"
        icon={Mail}
        actions={
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["email-bounces"] });
              queryClient.invalidateQueries({ queryKey: ["email-sequence-logs"] });
              queryClient.invalidateQueries({ queryKey: ["bulk-email-campaigns"] });
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </AdminButton>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Total Sent</p>
            <p className="text-2xl font-bold">{stats.totalSent}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Opens</p>
            <p className="text-2xl font-bold">{stats.totalOpens}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Clicks</p>
            <p className="text-2xl font-bold">{stats.totalClicks}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Open Rate</p>
            <p className="text-2xl font-bold text-[hsl(var(--admin-success))]">{stats.openRate}%</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Click Rate</p>
            <p className="text-2xl font-bold text-[hsl(var(--admin-info))]">{stats.clickRate}%</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Bounces</p>
            <p className="text-2xl font-bold text-[hsl(var(--admin-error))]">{stats.hardBounces + stats.softBounces}</p>
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <AdminCard>
          <AdminCardHeader>
            <AdminCardTitle>Engagement by Sequence</AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="sent" fill="hsl(var(--admin-info))" name="Sent" />
                  <Bar dataKey="opens" fill="hsl(var(--admin-success))" name="Opens" />
                  <Bar dataKey="clicks" fill="hsl(var(--admin-warning))" name="Clicks" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Tabs */}
      <AdminTabs defaultValue="campaigns">
        <AdminTabsList>
          <AdminTabsTrigger value="campaigns" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Campaigns
          </AdminTabsTrigger>
          <AdminTabsTrigger value="sequences" className="gap-2">
            <Mail className="w-4 h-4" />
            Sequence Logs
          </AdminTabsTrigger>
          <AdminTabsTrigger value="bounces" className="gap-2">
            <AlertTriangle className="w-4 h-4" />
            Bounces ({bounces.length})
          </AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="campaigns">
          <AdminCard>
            <AdminCardHeader>
              <AdminCardTitle>Bulk Campaigns</AdminCardTitle>
              <AdminCardDescription>Announcement and marketing emails</AdminCardDescription>
            </AdminCardHeader>
            <AdminCardContent>
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : campaigns.length === 0 ? (
                <AdminEmptyState icon={<Mail className="w-12 h-12" />} title="No campaigns" description="Bulk campaigns will appear here" />
              ) : (
                <AdminTable>
                  <AdminTableHeader>
                    <AdminTableRow className="bg-[hsl(var(--admin-hover))]">
                      <AdminTableHead>Sent</AdminTableHead>
                      <AdminTableHead>Subject</AdminTableHead>
                      <AdminTableHead>Audience</AdminTableHead>
                      <AdminTableHead>Sent</AdminTableHead>
                      <AdminTableHead>Failed</AdminTableHead>
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {campaigns.map((c) => (
                      <AdminTableRow key={c.id}>
                        <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                          {formatDistanceToNow(new Date(c.sent_at), { addSuffix: true })}
                        </AdminTableCell>
                        <AdminTableCell className="font-medium">{c.subject}</AdminTableCell>
                        <AdminTableCell>
                          <AdminBadge intent="neutral" size="sm">{c.audience || "All"}</AdminBadge>
                        </AdminTableCell>
                        <AdminTableCell className="text-[hsl(var(--admin-success))]">{c.sent_count}</AdminTableCell>
                        <AdminTableCell className="text-[hsl(var(--admin-error))]">{c.failed_count}</AdminTableCell>
                      </AdminTableRow>
                    ))}
                  </AdminTableBody>
                </AdminTable>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        <AdminTabsContent value="sequences">
          <AdminCard>
            <AdminCardHeader>
              <AdminCardTitle>Sequence Logs</AdminCardTitle>
            </AdminCardHeader>
            <AdminCardContent>
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : sequenceLogs.length === 0 ? (
                <AdminEmptyState icon={<Mail className="w-12 h-12" />} title="No sequence logs" description="Automated email logs will appear here" />
              ) : (
                <AdminTable>
                  <AdminTableHeader>
                    <AdminTableRow className="bg-[hsl(var(--admin-hover))]">
                      <AdminTableHead>Sent</AdminTableHead>
                      <AdminTableHead>Sequence</AdminTableHead>
                      <AdminTableHead>Step</AdminTableHead>
                      <AdminTableHead>Status</AdminTableHead>
                      <AdminTableHead><MousePointer className="w-3 h-3 inline mr-1" />Opens</AdminTableHead>
                      <AdminTableHead>Clicks</AdminTableHead>
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {sequenceLogs.slice(0, 50).map((log) => (
                      <AdminTableRow key={log.id}>
                        <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                          {log.sent_at ? formatDistanceToNow(new Date(log.sent_at), { addSuffix: true }) : "—"}
                        </AdminTableCell>
                        <AdminTableCell className="font-mono text-sm">{log.sequence_id?.substring(0, 8)}</AdminTableCell>
                        <AdminTableCell className="font-mono text-sm">{log.step_id?.substring(0, 8)}</AdminTableCell>
                        <AdminTableCell>
                          {log.status === "sent" ? (
                            <AdminBadge intent="success" size="sm"><CheckCircle className="w-3 h-3 mr-1" />Sent</AdminBadge>
                          ) : log.status === "failed" ? (
                            <AdminBadge intent="danger" size="sm"><XCircle className="w-3 h-3 mr-1" />Failed</AdminBadge>
                          ) : (
                            <AdminBadge intent="neutral" size="sm">{log.status}</AdminBadge>
                          )}
                        </AdminTableCell>
                        <AdminTableCell>{log.open_count || 0}</AdminTableCell>
                        <AdminTableCell>{log.click_count || 0}</AdminTableCell>
                      </AdminTableRow>
                    ))}
                  </AdminTableBody>
                </AdminTable>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        <AdminTabsContent value="bounces">
          <AdminCard>
            <AdminCardHeader>
              <AdminCardTitle>Email Bounces</AdminCardTitle>
              <AdminCardDescription>Addresses that failed to receive emails</AdminCardDescription>
            </AdminCardHeader>
            <AdminCardContent>
              {bouncesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : bounces.length === 0 ? (
                <AdminEmptyState icon={<CheckCircle className="w-12 h-12" />} title="No bounces" description="All emails delivered successfully" />
              ) : (
                <AdminTable>
                  <AdminTableHeader>
                    <AdminTableRow className="bg-[hsl(var(--admin-hover))]">
                      <AdminTableHead>Time</AdminTableHead>
                      <AdminTableHead>Email</AdminTableHead>
                      <AdminTableHead>Type</AdminTableHead>
                      <AdminTableHead>Reason</AdminTableHead>
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {bounces.map((bounce) => (
                      <AdminTableRow key={bounce.id}>
                        <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                          {formatDistanceToNow(new Date(bounce.created_at), { addSuffix: true })}
                        </AdminTableCell>
                        <AdminTableCell className="font-mono text-sm">{bounce.email}</AdminTableCell>
                        <AdminTableCell>
                          <AdminBadge intent={bounce.bounce_type === "hard" ? "danger" : "warning"} size="sm">
                            {bounce.bounce_type}
                          </AdminBadge>
                        </AdminTableCell>
                        <AdminTableCell className="max-w-xs truncate text-sm">
                          {bounce.reason || "—"}
                        </AdminTableCell>
                      </AdminTableRow>
                    ))}
                  </AdminTableBody>
                </AdminTable>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
