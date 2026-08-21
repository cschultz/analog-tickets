import { Clock, X, ChevronRight, Users, Music, Building2, Store, Handshake, Ticket } from "lucide-react";
import { useRecentItems, RecentItem } from "@/hooks/useRecentItems";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  customer: Users,
  artist: Music,
  vendor: Building2,
  artisan: Store,
  partner: Handshake,
  registration: Ticket,
};

const TYPE_COLORS: Record<string, string> = {
  customer: "text-[hsl(var(--admin-info))]",
  artist: "text-[hsl(var(--admin-primary))]",
  vendor: "text-blue-500",
  artisan: "text-purple-500",
  partner: "text-amber-500",
  registration: "text-[hsl(var(--admin-success))]",
};

interface RecentItemsListProps {
  maxItems?: number;
  onItemClick?: (item: RecentItem) => void;
  className?: string;
  compact?: boolean;
}

export function RecentItemsList({
  maxItems = 5,
  onItemClick,
  className,
  compact = false,
}: RecentItemsListProps) {
  const { items, removeItem, clearAll, hasItems } = useRecentItems();

  if (!hasItems) {
    return (
      <div className={cn("text-sm text-[hsl(var(--admin-text-muted))] py-4 text-center", className)}>
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No recent items</p>
      </div>
    );
  }

  const displayItems = items.slice(0, maxItems);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">
          Recent
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={clearAll}
        >
          Clear all
        </Button>
      </div>

      {displayItems.map((item) => {
        const Icon = TYPE_ICONS[item.type] || Users;
        const colorClass = TYPE_COLORS[item.type] || "text-gray-500";

        return (
          <div
            key={`${item.type}-${item.id}`}
            className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[hsl(var(--admin-hover))] transition-colors"
          >
            <Link
              to={item.url}
              onClick={() => onItemClick?.(item)}
              className="flex-1 flex items-center gap-2 min-w-0"
            >
              <Icon className={cn("h-4 w-4 shrink-0", colorClass)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                {!compact && item.subtitle && (
                  <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                    {item.subtitle}
                  </p>
                )}
              </div>
              {!compact && (
                <span className="text-xs text-[hsl(var(--admin-text-muted))] shrink-0">
                  {formatDistanceToNow(item.viewedAt, { addSuffix: true })}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))] opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeItem(item.id, item.type);
              }}
              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[hsl(var(--admin-danger)/0.1)] rounded transition-all"
            >
              <X className="h-3 w-3 text-[hsl(var(--admin-danger))]" />
            </button>
          </div>
        );
      })}

      {items.length > maxItems && (
        <p className="text-xs text-[hsl(var(--admin-text-muted))] text-center py-1">
          +{items.length - maxItems} more
        </p>
      )}
    </div>
  );
}
