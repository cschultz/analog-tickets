import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  formatValue?: (value: number) => string;
}

export function AnimatedCounter({
  value,
  duration = 500,
  className,
  prefix = "",
  suffix = "",
  formatValue = (v) => v.toLocaleString(),
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const previousValueRef = useRef(value);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (value === previousValueRef.current) return;

    const startValue = previousValueRef.current;
    const endValue = value;
    const diff = endValue - startValue;
    const startTime = performance.now();

    setIsAnimating(true);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out-cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + diff * easeOut;

      setDisplayValue(Math.round(currentValue));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setIsAnimating(false);
        previousValueRef.current = endValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span
      className={cn(
        "tabular-nums transition-all duration-200",
        isAnimating && "text-[hsl(var(--admin-primary))] scale-105",
        className
      )}
    >
      {prefix}
      {formatValue(displayValue)}
      {suffix}
    </span>
  );
}

// Simpler version for just counting
export function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <AnimatedCounter
      value={value}
      className={className}
      formatValue={(v) => v.toString()}
    />
  );
}
