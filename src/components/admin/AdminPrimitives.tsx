import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Clock, Building2, Palette, Store, Users, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getArtistImageUrl } from "@/hooks/useArtistImage";

// ============ ADMIN AVATAR ============

interface AdminAvatarProps {
  name: string;
  imageUrl?: string | null;
  type?: "vendor" | "artisan" | "partner" | "artist" | "volunteer" | "default";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const getTypeColor = (type: AdminAvatarProps["type"]) => {
  switch (type) {
    case "vendor":
      return "text-[hsl(var(--admin-info))]";
    case "artisan":
      return "text-[hsl(var(--admin-info))]"; // Consistent with design system
    case "partner":
      return "text-[hsl(var(--admin-warning))]";
    case "artist":
      return "text-[hsl(var(--admin-danger))]";
    case "volunteer":
      return "text-[hsl(var(--admin-success))]";
    default:
      return "text-[hsl(var(--admin-foreground))]";
  }
};

const sizeClasses = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
  xl: "h-14 w-14 text-base",
};

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

export function AdminAvatar({ name, imageUrl, type = "default", size = "md", className }: AdminAvatarProps) {
  // For artists, try to get image from lineup assets
  const resolvedImageUrl = React.useMemo(() => {
    if (imageUrl) return imageUrl;
    if (type === "artist") {
      return getArtistImageUrl(name);
    }
    return null;
  }, [name, imageUrl, type]);

  return (
    <Avatar className={cn(
      sizeClasses[size],
      "shrink-0 border border-[hsl(var(--admin-border))]",
      className
    )}>
      {resolvedImageUrl && <AvatarImage src={resolvedImageUrl} alt={name} className="object-cover" />}
      <AvatarFallback className={cn(
        "font-medium bg-[hsl(var(--admin-surface))]",
        getTypeColor(type)
      )}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

// ============ ACTIVITY TIMESTAMP ============

interface ActivityTimestampProps {
  date?: string | Date | null;
  className?: string;
  showIcon?: boolean;
}

const getDaysAgo = (date: Date) => {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));
  
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
};

export function ActivityTimestamp({ date, className, showIcon = true }: ActivityTimestampProps) {
  if (!date) {
    return (
      <span className={cn("flex items-center gap-1 text-[hsl(var(--admin-muted-foreground))]", className)}>
        {showIcon && <Clock className="w-3 h-3" />}
        <span className="text-[10px]">—</span>
      </span>
    );
  }

  const dateObj = typeof date === "string" ? new Date(date) : date;
  const label = getDaysAgo(dateObj);

  return (
    <span className={cn("flex items-center gap-1 text-[hsl(var(--admin-muted-foreground))]", className)}>
      {showIcon && <Clock className="w-3 h-3" />}
      <span className="text-[10px]">{label}</span>
    </span>
  );
}

// ============ TYPE ICON ============

interface TypeIconProps {
  type: "vendor" | "artisan" | "partner" | "artist" | "volunteer";
  className?: string;
}

export function TypeIcon({ type, className }: TypeIconProps) {
  const iconClass = cn("w-3 h-3", className);
  
  switch (type) {
    case "vendor":
      return <Truck className={iconClass} />;
    case "artisan":
      return <Palette className={iconClass} />;
    case "partner":
      return <Store className={iconClass} />;
    case "artist":
      return <Users className={iconClass} />;
    case "volunteer":
      return <Users className={iconClass} />;
    default:
      return <Building2 className={iconClass} />;
  }
}

// ============ TYPE BADGE (inline label) ============

interface TypeLabelProps {
  type: "vendor" | "artisan" | "partner" | "artist" | "volunteer";
  className?: string;
}

export function TypeLabel({ type, className }: TypeLabelProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[11px] font-medium capitalize",
      getTypeColor(type),
      className
    )}>
      <TypeIcon type={type} />
      <span>{type}</span>
    </span>
  );
}

// ============ STATUS DOT ============

interface StatusDotProps {
  status: "lead" | "in_discussion" | "pending_contract" | "signed" | "active" | "inactive" | string;
  size?: "sm" | "md";
  className?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "lead":
      return "bg-[hsl(var(--admin-text-muted))]";
    case "in_discussion":
      return "bg-[hsl(var(--admin-info))]";
    case "pending_contract":
      return "bg-[hsl(var(--admin-warning))]";
    case "signed":
    case "active":
      return "bg-[hsl(var(--admin-success))]";
    case "inactive":
      return "bg-[hsl(var(--admin-border))]";
    default:
      return "bg-[hsl(var(--admin-border))]";
  }
};

export function StatusDot({ status, size = "md", className }: StatusDotProps) {
  return (
    <span className={cn(
      "rounded-full shrink-0",
      size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2",
      getStatusColor(status),
      className
    )} />
  );
}

// ============ QUICK ACTION BUTTON ============

interface QuickActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
}

export function QuickAction({ icon, className, ...props }: QuickActionProps) {
  return (
    <button
      className={cn(
        "h-6 w-6 inline-flex items-center justify-center rounded",
        "text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]",
        "hover:bg-[hsl(var(--admin-surface))] transition-colors",
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
}

// ============ STAT VALUE ============

interface StatValueProps {
  label: string;
  value: string | number;
  trend?: { value: string; positive?: boolean };
  className?: string;
}

export function StatValue({ label, value, trend, className }: StatValueProps) {
  return (
    <div className={cn("text-center", className)}>
      <p className="text-2xl font-semibold text-[hsl(var(--admin-foreground))]">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))] mt-0.5">
        {label}
      </p>
      {trend && (
        <span className={cn(
          "text-[10px] font-medium",
          trend.positive ? "text-[hsl(var(--admin-success))]" : "text-[hsl(var(--admin-danger))]"
        )}>
          {trend.value}
        </span>
      )}
    </div>
  );
}

// Export type color helper for use elsewhere
export { getTypeColor };
