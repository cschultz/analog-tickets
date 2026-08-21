import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AdminButton, AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "./AdminUI";
import { StatusPill, StatusType } from "./StatusPill";
import { AdminActionMenu } from "./AdminActionMenu";

interface RecordPageProps {
  // Header
  title: string;
  subtitle?: string;
  status?: StatusType | string;
  backPath?: string;
  backLabel?: string;
  // Actions
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    destructive?: boolean;
  }>;
  /** Custom header actions - replaces primaryAction + secondaryActions when provided */
  headerActions?: ReactNode;
  // Content sections
  properties?: ReactNode;
  tabs?: Array<{
    id: string;
    label: string;
    content: ReactNode;
    count?: number;
  }>;
  // Sidebar
  sidebar?: ReactNode;
  className?: string;
}

export function RecordPage({
  title,
  subtitle,
  status,
  backPath,
  backLabel = "Back",
  primaryAction,
  secondaryActions,
  headerActions,
  properties,
  tabs,
  sidebar,
  className,
}: RecordPageProps) {
  const navigate = useNavigate();

  return (
    <div className={cn("admin-page", className)}>
      {/* Back link */}
      {backPath && (
        <button
          onClick={() => navigate(backPath)}
          className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))] mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--admin-text))]">
              {title}
            </h1>
            {status && <StatusPill status={status as StatusType} />}
          </div>
          {subtitle && (
            <p className="mt-1 text-[hsl(var(--admin-text-secondary))]">
              {subtitle}
            </p>
          )}
        </div>

        {/* Custom header actions OR default primary/secondary pattern */}
        {headerActions ? (
          headerActions
        ) : (
          <div className="flex items-center gap-2">
            {primaryAction && (
              <AdminButton variant="admin" onClick={primaryAction.onClick}>
                {primaryAction.icon}
                {primaryAction.label}
              </AdminButton>
            )}
            
            {secondaryActions && secondaryActions.length > 0 && (
              <AdminActionMenu
                items={secondaryActions.map((action, i) => ({
                  id: `action-${i}`,
                  label: action.label,
                  icon: action.icon,
                  destructive: action.destructive,
                  onClick: action.onClick
                }))}
              />
            )}
          </div>
        )}
      </div>

      {/* Main content with optional sidebar */}
      <div className={cn("flex gap-8", sidebar && "flex-col lg:flex-row")}>
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Properties section */}
          {properties && (
            <div className="mb-8">
              {properties}
            </div>
          )}

          {/* Tabs section */}
          {tabs && tabs.length > 0 && (
            <AdminTabs defaultValue={tabs[0].id} className="w-full">
              <AdminTabsList className="w-full justify-start h-auto p-0 bg-transparent border-b border-[hsl(var(--admin-border))] rounded-none">
                {tabs.map((tab) => (
                  <AdminTabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="relative px-4 py-3 font-medium text-sm text-[hsl(var(--admin-text-secondary))] data-[state=active]:text-[hsl(var(--admin-text))] data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-[hsl(var(--admin-text))] bg-transparent"
                  >
                    {tab.label}
                    {typeof tab.count === "number" && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-[hsl(var(--admin-hover))]">
                        {tab.count}
                      </span>
                    )}
                  </AdminTabsTrigger>
                ))}
              </AdminTabsList>
              {tabs.map((tab) => (
                <AdminTabsContent key={tab.id} value={tab.id} className="pt-6">
                  {tab.content}
                </AdminTabsContent>
              ))}
            </AdminTabs>
          )}
        </div>

        {/* Sidebar */}
        {sidebar && (
          <div className="lg:w-80 shrink-0">
            {sidebar}
          </div>
        )}
      </div>
    </div>
  );
}

// Property grid component for record details
interface PropertyGridProps {
  children: ReactNode;
  columns?: 2 | 3;
  className?: string;
}

export function PropertyGrid({ children, columns = 2, className }: PropertyGridProps) {
  return (
    <div
      className={cn(
        "grid gap-6",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}

interface PropertyItemProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function PropertyItem({ label, children, className }: PropertyItemProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="text-xs font-medium text-[hsl(var(--admin-text-muted))] block">
        {label}
      </span>
      <div className="text-[hsl(var(--admin-text))]">
        {children}
      </div>
    </div>
  );
}

// Activity timeline for audit log
interface ActivityItem {
  id: string;
  type: "created" | "updated" | "email" | "note" | "status_change" | "custom";
  title: string;
  description?: string;
  timestamp: Date;
  user?: { name: string; avatar?: string };
  icon?: ReactNode;
}

interface ActivityTimelineProps {
  items: ActivityItem[];
  className?: string;
}

export function ActivityTimeline({ items, className }: ActivityTimelineProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {items.map((item, i) => (
        <div key={item.id} className="flex gap-3">
          {/* Icon/indicator */}
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-secondary))]">
              {item.icon || (
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--admin-text-tertiary))]" />
              )}
            </div>
            {i < items.length - 1 && (
              <div className="w-px flex-1 bg-[hsl(var(--admin-divider))] mt-2" />
            )}
          </div>
          {/* Content */}
          <div className="flex-1 pb-4">
            <p className="text-sm font-medium text-[hsl(var(--admin-text))]">
              {item.title}
            </p>
            {item.description && (
              <p className="mt-0.5 text-sm text-[hsl(var(--admin-text-secondary))]">
                {item.description}
              </p>
            )}
            <p className="mt-1 text-xs text-[hsl(var(--admin-text-tertiary))]">
              {formatRelativeTime(item.timestamp)}
              {item.user && ` • ${item.user.name}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// Related records section
interface RelatedRecord {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  href?: string;
}

interface RelatedRecordsProps {
  title: string;
  records: RelatedRecord[];
  onViewAll?: () => void;
  onAdd?: () => void;
  className?: string;
}

export function RelatedRecords({ 
  title, 
  records, 
  onViewAll, 
  onAdd,
  className 
}: RelatedRecordsProps) {
  const navigate = useNavigate();

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[hsl(var(--admin-text))]">
          {title}
          <span className="ml-2 text-[hsl(var(--admin-text-tertiary))]">
            {records.length}
          </span>
        </h4>
        {onAdd && (
          <AdminButton variant="ghost" size="sm" onClick={onAdd} className="h-7">
            Add
          </AdminButton>
        )}
      </div>
      
      <div className="space-y-1">
        {records.slice(0, 5).map((record) => (
          <div
            key={record.id}
            onClick={() => record.href && navigate(record.href)}
            className={cn(
              "flex items-center justify-between px-3 py-2 rounded-lg",
              record.href && "cursor-pointer hover:bg-[hsl(var(--admin-hover))]"
            )}
          >
            <div>
              <p className="text-sm font-medium text-[hsl(var(--admin-text))]">
                {record.title}
              </p>
              {record.subtitle && (
                <p className="text-xs text-[hsl(var(--admin-text-secondary))]">
                  {record.subtitle}
                </p>
              )}
            </div>
            {record.status && (
              <StatusPill status={record.status as StatusType} size="sm" />
            )}
          </div>
        ))}
      </div>

      {records.length > 5 && onViewAll && (
        <AdminButton 
          variant="ghost" 
          size="sm" 
          onClick={onViewAll}
          className="w-full justify-center"
        >
          View all {records.length}
        </AdminButton>
      )}
    </div>
  );
}

// Helper function
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: "short", 
    day: "numeric", timeZone: "America/Los_Angeles" });
}
