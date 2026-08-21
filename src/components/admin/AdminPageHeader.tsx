import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/**
 * Standardized page header for admin pages.
 * Provides consistent styling with icon, title, subtitle, and action buttons.
 */
export function AdminPageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="p-2 rounded-lg bg-[hsl(var(--admin-accent-subtle))] shrink-0">
            <Icon className="h-5 w-5 text-[hsl(var(--admin-accent))]" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-[hsl(var(--admin-text))] truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[hsl(var(--admin-text-secondary))] mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
