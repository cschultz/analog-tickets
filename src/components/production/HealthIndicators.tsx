import { AdminBadge, AdminTooltip } from "@/components/admin";
import { AlertTriangle, FileWarning, Clock, CheckCircle, FileX } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthIndicatorProps {
  hasExpiredDocs?: boolean;
  hasExpiringDocs?: boolean;
  hasPendingContract?: boolean;
  hasSignedContract?: boolean;
  expiringCount?: number;
  expiredCount?: number;
  className?: string;
  size?: "sm" | "default";
}

export function HealthIndicators({
  hasExpiredDocs,
  hasExpiringDocs,
  hasPendingContract,
  hasSignedContract,
  expiringCount = 0,
  expiredCount = 0,
  className,
  size = "default",
}: HealthIndicatorProps) {
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const badgeSize = size === "sm" ? "text-[10px] px-1 py-0" : "text-xs px-1.5 py-0.5";

  if (!hasExpiredDocs && !hasExpiringDocs && !hasPendingContract && !hasSignedContract) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {hasExpiredDocs && (
        <AdminTooltip content={`${expiredCount} document(s) have expired and need renewal`}>
          <AdminBadge 
            intent="danger"
            className={cn(badgeSize, "flex items-center gap-1 cursor-help")}
          >
            <AlertTriangle className={iconSize} />
            {expiredCount > 1 ? `${expiredCount} Expired` : "Expired"}
          </AdminBadge>
        </AdminTooltip>
      )}

      {hasExpiringDocs && !hasExpiredDocs && (
        <AdminTooltip content={`${expiringCount} document(s) expiring within 30 days`}>
          <AdminBadge 
            intent="warning"
            className={cn(badgeSize, "flex items-center gap-1 cursor-help")}
          >
            <FileWarning className={iconSize} />
            {expiringCount > 1 ? `${expiringCount} Expiring` : "Expiring"}
          </AdminBadge>
        </AdminTooltip>
      )}

      {hasPendingContract && (
        <AdminTooltip content="Contract sent, awaiting signature">
          <AdminBadge 
            intent="info"
            className={cn(badgeSize, "flex items-center gap-1 cursor-help")}
          >
            <Clock className={iconSize} />
            Awaiting
          </AdminBadge>
        </AdminTooltip>
      )}

      {hasSignedContract && !hasPendingContract && (
        <AdminTooltip content="Contract signed and active">
          <AdminBadge 
            intent="success"
            className={cn(badgeSize, "flex items-center gap-1 cursor-help")}
          >
            <CheckCircle className={iconSize} />
            Signed
          </AdminBadge>
        </AdminTooltip>
      )}
    </div>
  );
}

interface HealthSummaryCardProps {
  expiredDocsCount: number;
  expiringDocsCount: number;
  pendingContractsCount: number;
  signedContractsCount: number;
  totalItems: number;
}

export function HealthSummaryCard({
  expiredDocsCount,
  expiringDocsCount,
  pendingContractsCount,
  signedContractsCount,
  totalItems,
}: HealthSummaryCardProps) {
  const hasIssues = expiredDocsCount > 0 || expiringDocsCount > 0;

  if (!hasIssues && pendingContractsCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))]">
      {expiredDocsCount > 0 && (
        <div className="flex items-center gap-2 text-[hsl(var(--admin-error))]">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">{expiredDocsCount} expired docs</span>
        </div>
      )}
      {expiringDocsCount > 0 && (
        <div className="flex items-center gap-2 text-[hsl(var(--admin-warning))]">
          <FileWarning className="w-4 h-4" />
          <span className="text-sm font-medium">{expiringDocsCount} expiring soon</span>
        </div>
      )}
      {pendingContractsCount > 0 && (
        <div className="flex items-center gap-2 text-[hsl(var(--admin-info))]">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">{pendingContractsCount} awaiting signature</span>
        </div>
      )}
      {signedContractsCount > 0 && (
        <div className="flex items-center gap-2 text-[hsl(var(--admin-success))]">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{signedContractsCount} signed</span>
        </div>
      )}
    </div>
  );
}
