import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface AnimatedStatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label?: string;
  };
  previousValue?: number;
  formatValue?: (value: number) => string;
  animationDuration?: number;
  className?: string;
  onClick?: () => void;
}

export function AnimatedStatCard({
  label,
  value,
  prefix = "",
  suffix = "",
  icon: Icon,
  trend,
  previousValue,
  formatValue,
  className,
  onClick,
}: AnimatedStatCardProps) {
  // Calculate trend if previousValue is provided
  const calculatedTrend = React.useMemo(() => {
    if (trend) return trend;
    if (previousValue !== undefined && previousValue !== 0) {
      const change = ((value - previousValue) / previousValue) * 100;
      return { value: change };
    }
    return null;
  }, [trend, previousValue, value]);

  const displayValue = formatValue 
    ? formatValue(value)
    : Math.round(value).toLocaleString();

  const isPositive = calculatedTrend && calculatedTrend.value >= 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4 relative overflow-hidden transition-colors",
        onClick && "cursor-pointer hover:border-[hsl(var(--admin-border-strong))]",
        className
      )}
      onClick={onClick}
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
        <span className="text-2xl font-semibold text-[hsl(var(--admin-text))] tabular-nums">
          {prefix}{displayValue}{suffix}
        </span>
        
        {calculatedTrend && (
          <div
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              isPositive
                ? "text-[hsl(var(--admin-success))]"
                : "text-[hsl(var(--admin-error))]"
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {calculatedTrend.value.toFixed(1)}%
            </span>
            {calculatedTrend.label && (
              <span className="text-[hsl(var(--admin-text-muted))] ml-1">
                {calculatedTrend.label}
              </span>
            )}
          </div>
        )}
      </div>

      {onClick && (
        <div className="mt-2 text-[10px] text-[hsl(var(--admin-text-subtle))]">
          Click for details →
        </div>
      )}
    </div>
  );
}
