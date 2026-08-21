import { usePipelineActivityLog } from "@/hooks/usePipelineActivityLog";
import { formatDistanceToNow } from "date-fns";
import { Activity, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function DrawerActivityFeed() {
  const { activities, isLoading } = usePipelineActivityLog();

  if (isLoading) {
    return (
      <div className="py-4 text-center text-xs text-[hsl(var(--admin-muted-foreground))]">
        Loading activity...
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="py-6 text-center border border-dashed border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-surface))]">
        <Activity className="w-5 h-5 mx-auto mb-2 text-[hsl(var(--admin-muted-foreground))]" />
        <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
          No activity recorded yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
        <h4 className="text-xs font-medium text-[hsl(var(--admin-foreground))]">
          Recent Activity
        </h4>
      </div>

      <div className="space-y-2">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="flex items-start gap-3 p-2 rounded-md bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]"
          >
            <div className="shrink-0 mt-0.5">
              <div className={cn(
                "w-2 h-2 rounded-full",
                activity.action === "status_change" 
                  ? "bg-[hsl(var(--admin-info))]" 
                  : "bg-[hsl(var(--admin-muted-foreground))]"
              )} />
            </div>

            <div className="flex-1 min-w-0">
              {activity.action === "status_change" ? (
                <p className="text-xs text-[hsl(var(--admin-foreground))]">
                  Status changed
                  <span className="inline-flex items-center gap-1 mx-1">
                    <span className="text-[hsl(var(--admin-muted-foreground))] capitalize">
                      {activity.old_value?.replace(/_/g, " ") || "—"}
                    </span>
                    <ArrowRight className="w-3 h-3 text-[hsl(var(--admin-muted-foreground))]" />
                    <span className="font-medium capitalize">
                      {activity.new_value?.replace(/_/g, " ")}
                    </span>
                  </span>
                </p>
              ) : (
                <p className="text-xs text-[hsl(var(--admin-foreground))] capitalize">
                  {activity.action.replace(/_/g, " ")}
                </p>
              )}

              <div className="flex items-center gap-1 mt-1 text-[10px] text-[hsl(var(--admin-muted-foreground))]">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
