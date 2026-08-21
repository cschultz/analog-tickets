import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, 
  UserPlus, 
  CreditCard, 
  Mail, 
  FileCheck, 
  Gift,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { formatDistanceToNow } from "date-fns";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";

interface ActivityItem {
  id: string;
  type: "registration" | "payment" | "email" | "contract" | "offer" | "check_in";
  title: string;
  description?: string;
  timestamp: Date;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, any>;
}

interface ActivityFeedProps {
  eventId?: string;
  limit?: number;
  showHeader?: boolean;
  className?: string;
  onItemClick?: (item: ActivityItem) => void;
}

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  registration: UserPlus,
  payment: CreditCard,
  email: Mail,
  contract: FileCheck,
  offer: Gift,
  check_in: CheckCircle,
};

const activityColors: Record<string, string> = {
  registration: "hsl(var(--admin-accent))",
  payment: "hsl(var(--admin-success))",
  email: "hsl(200, 80%, 50%)",
  contract: "hsl(262, 83%, 58%)",
  offer: "hsl(340, 75%, 55%)",
  check_in: "hsl(173, 58%, 39%)",
};

export function ActivityFeed({
  eventId,
  limit = 20,
  showHeader = true,
  className,
  onItemClick,
}: ActivityFeedProps) {
  const queryClient = useQueryClient();
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());

  // Fetch recent activity logs
  const { data: activityLogs, isLoading, refetch } = useAuthQuery({
    queryKey: ["activity-feed", eventId, limit],
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (eventId) {
        query = query.eq("event_id", eventId);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching activity logs:", error);
        throw error;
      }
      return data;
    },
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  // Transform logs to activity items
  const activities: ActivityItem[] = useMemo(() => {
    if (!activityLogs) return [];

    return activityLogs.map((log) => {
      let type: ActivityItem["type"] = "registration";
      
      // Determine type based on entity_type or action
      if (log.entity_type === "registration") type = "registration";
      else if (log.action.includes("payment") || log.action.includes("paid")) type = "payment";
      else if (log.entity_type === "email" || log.action.includes("email")) type = "email";
      else if (log.entity_type === "contract") type = "contract";
      else if (log.entity_type === "offer") type = "offer";
      else if (log.action.includes("check")) type = "check_in";

      return {
        id: log.id,
        type,
        title: formatActivityTitle(log.action, log.entity_name),
        description: log.details ? String(log.details) : undefined,
        timestamp: new Date(log.created_at),
        entityId: log.entity_id,
        entityType: log.entity_type,
        metadata: log.details as Record<string, any> | undefined,
      };
    });
  }, [activityLogs]);

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel("activity-feed-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
        },
        (payload) => {
          // Mark new item for animation
          setNewItemIds((prev) => new Set(prev).add(payload.new.id));
          
          // Refetch to get new data
          queryClient.invalidateQueries({ queryKey: ["activity-feed"] });

          // Clear animation flag after animation completes
          setTimeout(() => {
            setNewItemIds((prev) => {
              const next = new Set(prev);
              next.delete(payload.new.id);
              return next;
            });
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className={cn("flex flex-col", className)}>
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--admin-border))]">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
              Activity Feed
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-md hover:bg-[hsl(var(--admin-hover))] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[hsl(var(--admin-text-muted))]" />
          </button>
        </div>
      )}

      <AdminScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-[hsl(var(--admin-hover))]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[hsl(var(--admin-hover))] rounded w-3/4" />
                  <div className="h-3 bg-[hsl(var(--admin-hover))] rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-8 w-8 text-[hsl(var(--admin-text-subtle))] mb-2" />
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">
              No recent activity
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--admin-border))]">
            <AnimatePresence mode="popLayout">
              {activities.map((activity) => {
                const Icon = activityIcons[activity.type] || Activity;
                const color = activityColors[activity.type];
                const isNew = newItemIds.has(activity.id);

                return (
                  <motion.div
                    key={activity.id}
                    initial={isNew ? { opacity: 0, x: -20, backgroundColor: "hsl(var(--admin-accent) / 0.1)" } : false}
                    animate={{ opacity: 1, x: 0, backgroundColor: "transparent" }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-[hsl(var(--admin-hover))] transition-colors",
                      onItemClick && "cursor-pointer"
                    )}
                    onClick={() => onItemClick?.(activity)}
                  >
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[hsl(var(--admin-text))] line-clamp-1">
                        {activity.title}
                      </p>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-0.5">
                        {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                      </p>
                    </div>

                    {onItemClick && (
                      <ArrowRight className="h-4 w-4 text-[hsl(var(--admin-text-subtle))] shrink-0" />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </AdminScrollArea>
    </div>
  );
}

// Helper to format activity titles
function formatActivityTitle(action: string, entityName?: string | null): string {
  const name = entityName || "Unknown";
  
  const actionMap: Record<string, string> = {
    created: `New registration: ${name}`,
    updated: `Updated: ${name}`,
    deleted: `Deleted: ${name}`,
    paid: `Payment received: ${name}`,
    sent: `Email sent to ${name}`,
    signed: `Contract signed: ${name}`,
    checked_in: `Checked in: ${name}`,
    status_changed: `Status changed: ${name}`,
  };

  for (const [key, template] of Object.entries(actionMap)) {
    if (action.toLowerCase().includes(key)) {
      return template;
    }
  }

  return `${action}: ${name}`;
}
