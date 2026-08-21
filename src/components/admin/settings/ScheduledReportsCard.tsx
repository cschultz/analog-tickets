import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminInput } from "@/components/admin";
import { AdminSwitch, AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { BarChart3, Clock } from "lucide-react";

interface ScheduledReportsCardProps {
  dailySalesReportEnabled: boolean;
  dailySalesReportTime: string;
  onDailySalesReportEnabledChange: (value: boolean) => void;
  onDailySalesReportTimeChange: (value: string) => void;
}

export function ScheduledReportsCard({
  dailySalesReportEnabled,
  dailySalesReportTime,
  onDailySalesReportEnabledChange,
  onDailySalesReportTimeChange,
}: ScheduledReportsCardProps) {
  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminCardTitle className="text-base font-semibold">Scheduled Reports</AdminCardTitle>
        </div>
        <AdminCardDescription className="text-xs">
          Automated reports sent to admin users
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
          <div className="space-y-0.5">
            <AdminLabel>Daily Sales Report</AdminLabel>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Send daily sales summary to all admin users
            </p>
          </div>
          <AdminSwitch
            checked={dailySalesReportEnabled}
            onCheckedChange={onDailySalesReportEnabledChange}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))]">
          <div className="space-y-0.5">
            <AdminLabel>Report Time (UTC)</AdminLabel>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Time of day to send the daily report
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            <AdminInput
              type="time"
              value={dailySalesReportTime}
              onChange={(e) => onDailySalesReportTimeChange(e.target.value)}
              className="h-8 w-28 text-sm"
              disabled={!dailySalesReportEnabled}
            />
          </div>
        </div>
        <div className="p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
          <div className="space-y-0.5">
            <AdminLabel>Weekly Community Digest</AdminLabel>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Automatically sent every Monday at 6 AM PT — includes volunteer applications, support messages, and contact forms
            </p>
          </div>
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}
