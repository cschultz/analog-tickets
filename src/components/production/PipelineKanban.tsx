import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { AdminBadge } from "@/components/admin/AdminUI";
import { AdminButton } from "@/components/admin/AdminUI";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { AdminAvatar, OwnerDisplay } from "@/components/admin";
import { 
  Building2, 
  Palette, 
  Store, 
  Mail, 
  Phone, 
  AlertTriangle,
  FileWarning,
  ExternalLink,
  Clock,
  Plus
} from "lucide-react";
import { PIPELINE_STATUSES, PipelineStatus } from "./PipelineStatusBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAdminEvent } from "@/hooks/useAdminEvent";

export interface PipelineItem {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  type: "vendor" | "artisan" | "partner";
  pipeline_status: string | null;
  tier?: string;
  category?: string;
  value?: number;
  updated_at?: string;
  // Health indicators
  hasExpiringDocs?: boolean;
  hasExpiredDocs?: boolean;
  hasPendingContract?: boolean;
  contractStatus?: string;
  // Ownership
  ownerId?: string | null;
  collaboratorIds?: string[];
}

interface PipelineKanbanProps {
  items: PipelineItem[];
  onItemClick: (item: PipelineItem) => void;
  onEmailClick: (item: PipelineItem) => void;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case "vendor":
      return <Building2 className="w-3 h-3" />;
    case "artisan":
      return <Palette className="w-3 h-3" />;
    case "partner":
      return <Store className="w-3 h-3" />;
    default:
      return null;
  }
};

const getStatusDotColor = (status: string) => {
  switch (status) {
    case "lead":
      return "bg-[hsl(var(--admin-text-muted))]";
    case "in_discussion":
      return "bg-[hsl(var(--admin-info))]";
    case "pending_contract":
      return "bg-[hsl(var(--admin-warning))]";
    case "signed":
      return "bg-[hsl(var(--admin-success))]";
    default:
      return "bg-[hsl(var(--admin-border))]";
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case "vendor":
      return "text-[hsl(var(--admin-info))]";
    case "artisan":
      return "text-[hsl(262,83%,58%)]";
    case "partner":
      return "text-[hsl(var(--admin-warning))]";
    default:
      return "text-[hsl(var(--admin-text-muted))]";
  }
};

const getDaysAgo = (dateString?: string) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
};

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

interface KanbanCardProps {
  item: PipelineItem;
  onItemClick: (item: PipelineItem) => void;
  onEmailClick: (item: PipelineItem) => void;
  isDragging?: boolean;
}

function KanbanCard({ item, onItemClick, onEmailClick, isDragging }: KanbanCardProps) {
  const daysAgo = getDaysAgo(item.updated_at);
  const hasWarning = item.hasExpiredDocs || item.hasExpiringDocs;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/json", JSON.stringify(item));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onItemClick(item)}
      className={cn(
        "group bg-[hsl(var(--admin-surface))] rounded-lg border border-[hsl(var(--admin-border))] cursor-pointer transition-all",
        "hover:shadow-md hover:border-[hsl(var(--admin-border-strong))]",
        isDragging && "opacity-50 rotate-1 scale-105 shadow-lg"
      )}
    >
      {/* Main Content */}
      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <AdminAvatar 
            name={item.company || item.name} 
            size="sm" 
            className={cn("border border-[hsl(var(--admin-border))]", getTypeColor(item.type))}
          />

          {/* Name & Company */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-[hsl(var(--admin-foreground))] truncate leading-tight">
              {item.company || item.name}
            </p>
            {item.company && (
              <p className="text-xs text-[hsl(var(--admin-muted-foreground))] truncate mt-0.5">
                {item.name}
              </p>
            )}
          </div>

          {/* Value */}
          {item.value && item.value > 0 && (
            <span className="text-xs font-medium text-[hsl(var(--admin-foreground))] shrink-0">
              ${item.value.toLocaleString()}
            </span>
          )}

          {/* Owner Avatar */}
          <OwnerDisplay 
            ownerId={item.ownerId || null} 
            collaboratorIds={item.collaboratorIds || []} 
            className="shrink-0"
          />
        </div>

        {/* Type & Category Row */}
        <div className="flex items-center gap-2 mt-2.5">
          <span className={cn("flex items-center gap-1 text-[11px] font-medium", getTypeColor(item.type))}>
            {getTypeIcon(item.type)}
            <span className="capitalize">{item.type}</span>
          </span>
          {item.category && (
            <>
              <span className="text-[hsl(var(--admin-muted-foreground))]">·</span>
              <span className="text-[11px] text-[hsl(var(--admin-muted-foreground))]">{item.category}</span>
            </>
          )}
          {item.tier && (
            <>
              <span className="text-[hsl(var(--admin-muted-foreground))]">·</span>
              <AdminBadge intent="neutral" className="text-[10px] px-1.5 py-0 h-4">
                {item.tier}
              </AdminBadge>
            </>
          )}
        </div>

        {/* Health Warnings */}
        {hasWarning && (
          <div className="flex items-center gap-1.5 mt-2">
            {item.hasExpiredDocs && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--admin-error))] bg-[hsl(var(--admin-error)/0.1)] px-1.5 py-0.5 rounded font-medium">
                <AlertTriangle className="w-3 h-3" />
                Expired docs
              </span>
            )}
            {item.hasExpiringDocs && !item.hasExpiredDocs && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--admin-warning))] bg-[hsl(var(--admin-warning)/0.1)] px-1.5 py-0.5 rounded font-medium">
                <FileWarning className="w-3 h-3" />
                Expiring soon
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer - Quick Actions (Always visible on hover) */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))/50]">
        {/* Activity */}
        <div className="flex items-center gap-1 text-[hsl(var(--admin-muted-foreground))]">
          <Clock className="w-3 h-3" />
          <span className="text-[10px]">{daysAgo || "—"}</span>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.email && (
            <AdminButton
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onEmailClick(item);
              }}
            >
              <Mail className="w-3.5 h-3.5" />
            </AdminButton>
          )}
          {item.phone && (
            <AdminButton
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <a href={`tel:${item.phone}`}>
                <Phone className="w-3.5 h-3.5" />
              </a>
            </AdminButton>
          )}
          <AdminButton
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onItemClick(item);
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  status: typeof PIPELINE_STATUSES[number];
  items: PipelineItem[];
  onItemClick: (item: PipelineItem) => void;
  onEmailClick: (item: PipelineItem) => void;
  onDrop: (item: PipelineItem, newStatus: PipelineStatus) => void;
}

function KanbanColumn({ status, items, onItemClick, onEmailClick, onDrop }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const item = JSON.parse(e.dataTransfer.getData("application/json")) as PipelineItem;
      if (item.pipeline_status !== status.value) {
        onDrop(item, status.value as PipelineStatus);
      }
    } catch (error) {
      console.error("Failed to parse dropped item", error);
    }
  };

  const totalValue = items.reduce((sum, item) => sum + (item.value || 0), 0);

  return (
    <div
      className={cn(
        "flex flex-col bg-[hsl(var(--admin-surface))] rounded-lg min-w-[300px] max-w-[320px] border border-[hsl(var(--admin-border))]",
        isDragOver && "ring-2 ring-[hsl(var(--admin-primary))] ring-offset-2 ring-offset-[hsl(var(--admin-background))]"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="px-3 py-3 border-b border-[hsl(var(--admin-border))]">
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full shrink-0", getStatusDotColor(status.value))} />
          <h3 className="font-medium text-sm text-[hsl(var(--admin-foreground))]">{status.label}</h3>
          <span className="text-xs text-[hsl(var(--admin-muted-foreground))] bg-[hsl(var(--admin-background))] px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mt-1 ml-4">
            ${totalValue.toLocaleString()} total
          </p>
        )}
      </div>

      {/* Cards */}
      <AdminScrollArea className="flex-1">
        <div className="p-2 space-y-2 min-h-[200px]">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-xs text-[hsl(var(--admin-muted-foreground))] border border-dashed border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-background))]">
              Drop items here
            </div>
          ) : (
            items.map((item) => (
              <KanbanCard
                key={`${item.type}-${item.id}`}
                item={item}
                onItemClick={onItemClick}
                onEmailClick={onEmailClick}
              />
            ))
          )}
        </div>
      </AdminScrollArea>

      {/* Column Footer */}
      <div className="px-2 py-2 border-t border-[hsl(var(--admin-border))]">
        <AdminButton
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs h-8"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add company
        </AdminButton>
      </div>
    </div>
  );
}

export function PipelineKanban({ items, onItemClick, onEmailClick }: PipelineKanbanProps) {
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ item, newStatus }: { item: PipelineItem; newStatus: string }) => {
      const table = item.type === "vendor" ? "vendors" : item.type === "artisan" ? "artisans" : "partners";
      const { error } = await supabase
        .from(table)
        .update({ pipeline_status: newStatus as Database["public"]["Enums"]["pipeline_status"] })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
      queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
      toast.success("Status updated");
    },
    onError: () => {
      toast.error("Failed to update status");
    },
  });

  const handleDrop = (item: PipelineItem, newStatus: PipelineStatus) => {
    updateStatusMutation.mutate({ item, newStatus });
  };

  const getItemsByStatus = (status: PipelineStatus) => {
    return items.filter((item) => (item.pipeline_status || "lead") === status);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
      {PIPELINE_STATUSES.map((status) => (
        <KanbanColumn
          key={status.value}
          status={status}
          items={getItemsByStatus(status.value as PipelineStatus)}
          onItemClick={onItemClick}
          onEmailClick={onEmailClick}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}
