import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface SkeletonLoaderProps {
  className?: string;
  animate?: boolean;
  style?: React.CSSProperties;
}

export function SkeletonLoader({ className, animate = true, style }: SkeletonLoaderProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-[hsl(var(--admin-border))]",
        animate && "animate-pulse",
        className
      )}
      style={style}
    />
  );
}

export function SkeletonText({
  lines = 1,
  className,
  lastLineWidth = "75%",
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLoader
          key={i}
          className="h-4"
          style={{
            width: i === lines - 1 ? lastLineWidth : "100%",
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <SkeletonLoader className="h-10 w-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonLoader className="h-4 w-3/4" />
          <SkeletonLoader className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <SkeletonLoader className="h-3 w-full" />
        <SkeletonLoader className="h-3 w-5/6" />
      </div>
    </motion.div>
  );
}

export function SkeletonTableLoader({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex gap-4 p-3 border-b border-[hsl(var(--admin-border))]">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonLoader key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <motion.div
          key={rowIdx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: rowIdx * 0.05 }}
          className="flex gap-4 p-3"
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <SkeletonLoader
              key={colIdx}
              className="h-4 flex-1"
              style={{ width: `${60 + Math.random() * 40}%` }}
            />
          ))}
        </motion.div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.1 }}
          className="p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
        >
          <SkeletonLoader className="h-8 w-16 mb-2" />
          <SkeletonLoader className="h-3 w-20" />
        </motion.div>
      ))}
    </div>
  );
}

export function SkeletonKanban({ columns = 4 }: { columns?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: columns }).map((_, colIdx) => (
        <div key={colIdx} className="space-y-3">
          {/* Column header */}
          <div className="flex items-center gap-2 px-1">
            <SkeletonLoader className="h-2 w-2 rounded-full" />
            <SkeletonLoader className="h-4 w-20" />
            <SkeletonLoader className="h-5 w-6 rounded-full ml-auto" />
          </div>
          {/* Cards */}
          {Array.from({ length: 2 + Math.floor(Math.random() * 3) }).map(
            (_, cardIdx) => (
              <SkeletonCard key={cardIdx} />
            )
          )}
        </div>
      ))}
    </div>
  );
}
