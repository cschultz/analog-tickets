import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { Clock, RefreshCw, CheckCircle, XCircle, Loader2, Calendar } from "lucide-react";
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
} from "@/components/admin";

interface ScheduledJob {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  duration_ms: number | null;
  records_processed: number | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

export default function ScheduledJobsPage() {
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading } = useAuthQuery({
    queryKey: ["scheduled-job-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_job_history")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as ScheduledJob[];
    },
    staleTime: 30 * 1000,
  });

  // Calculate job stats
  const stats = {
    total: jobs.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    running: jobs.filter((j) => j.status === "running").length,
    avgDuration: jobs.filter((j) => j.duration_ms).reduce((sum, j) => sum + (j.duration_ms || 0), 0) / 
      Math.max(1, jobs.filter((j) => j.duration_ms).length),
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <AdminBadge intent="success" showDot><CheckCircle className="w-3 h-3 mr-1" />Completed</AdminBadge>;
      case "failed":
        return <AdminBadge intent="danger" showDot><XCircle className="w-3 h-3 mr-1" />Failed</AdminBadge>;
      case "running":
        return <AdminBadge intent="info" showDot><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</AdminBadge>;
      default:
        return <AdminBadge intent="neutral">{status}</AdminBadge>;
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Scheduled Jobs"
        subtitle="Monitor background job execution history"
        icon={Calendar}
        actions={
          <AdminButton
            variant="adminOutline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["scheduled-job-history"] })}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </AdminButton>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Total Jobs</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Completed</p>
            <p className="text-2xl font-bold text-[hsl(var(--admin-success))]">{stats.completed}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Failed</p>
            <p className="text-2xl font-bold text-[hsl(var(--admin-error))]">{stats.failed}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Running</p>
            <p className="text-2xl font-bold text-[hsl(var(--admin-info))]">{stats.running}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardContent className="pt-4 pb-4">
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">Avg Duration</p>
            <p className="text-2xl font-bold">{Math.round(stats.avgDuration)}ms</p>
          </AdminCardContent>
        </AdminCard>
      </div>

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle>Job History</AdminCardTitle>
          <AdminCardDescription>Last 100 scheduled job executions</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
            </div>
          ) : jobs.length === 0 ? (
            <AdminEmptyState
              icon={<Clock className="w-12 h-12" />}
              title="No job history"
              description="Scheduled jobs will appear here when executed"
            />
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow className="bg-[hsl(var(--admin-hover))]">
                  <AdminTableHead>Started</AdminTableHead>
                  <AdminTableHead>Job Name</AdminTableHead>
                  <AdminTableHead>Status</AdminTableHead>
                  <AdminTableHead>Duration</AdminTableHead>
                  <AdminTableHead>Records</AdminTableHead>
                  <AdminTableHead>Error</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {jobs.map((job) => (
                  <AdminTableRow key={job.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell className="text-sm">
                      <div>
                        <span className="text-[hsl(var(--admin-text))]">
                          {format(new Date(job.started_at), "MMM d, HH:mm")}
                        </span>
                        <span className="block text-xs text-[hsl(var(--admin-text-muted))]">
                          {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
                        </span>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="font-mono text-sm">
                      {job.job_name}
                    </AdminTableCell>
                    <AdminTableCell>{getStatusBadge(job.status)}</AdminTableCell>
                    <AdminTableCell className="text-sm">
                      {job.duration_ms ? `${job.duration_ms}ms` : "—"}
                    </AdminTableCell>
                    <AdminTableCell className="text-sm">
                      {job.records_processed ?? "—"}
                    </AdminTableCell>
                    <AdminTableCell className="max-w-xs truncate text-sm text-[hsl(var(--admin-error))]">
                      {job.error_message || "—"}
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
}
