import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface AdminCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "stat" | "outlined";
}

interface AdminCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  action?: React.ReactNode;
}

interface AdminCardStatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: string;
    positive?: boolean;
  };
}

const AdminCard = React.forwardRef<HTMLDivElement, AdminCardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border bg-[hsl(var(--admin-surface))] text-[hsl(var(--admin-text))]",
        variant === "default" && "border-[hsl(var(--admin-border))] shadow-sm",
        variant === "stat" && "border-[hsl(var(--admin-border))]",
        variant === "outlined" && "border-[hsl(var(--admin-border-strong))] bg-transparent",
        className
      )}
      {...props}
    />
  )
);
AdminCard.displayName = "AdminCard";

const AdminCardHeader = React.forwardRef<HTMLDivElement, AdminCardHeaderProps>(
  ({ className, icon: Icon, action, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between p-4 pb-2",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
        )}
        {children}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
);
AdminCardHeader.displayName = "AdminCardHeader";

const AdminCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-sm font-medium text-[hsl(var(--admin-text))]",
      className
    )}
    {...props}
  />
));
AdminCardTitle.displayName = "AdminCardTitle";

const AdminCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-[hsl(var(--admin-text-muted))]", className)}
    {...props}
  />
));
AdminCardDescription.displayName = "AdminCardDescription";

const AdminCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-2", className)} {...props} />
));
AdminCardContent.displayName = "AdminCardContent";

const AdminCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center p-4 pt-0 border-t border-[hsl(var(--admin-border))]",
      className
    )}
    {...props}
  />
));
AdminCardFooter.displayName = "AdminCardFooter";

// Specialized stat card for dashboard metrics
const AdminStatCard = React.forwardRef<HTMLDivElement, AdminCardStatProps>(
  ({ className, label, value, icon: Icon, trend, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">
          {label}
        </span>
        {Icon && (
          <Icon className="h-4 w-4 text-[hsl(var(--admin-text-subtle))]" />
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-[hsl(var(--admin-text))]">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trend.positive
                ? "text-[hsl(var(--admin-success))]"
                : "text-[hsl(var(--admin-error))]"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  )
);
AdminStatCard.displayName = "AdminStatCard";

export {
  AdminCard,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminCardContent,
  AdminCardFooter,
  AdminStatCard,
};
