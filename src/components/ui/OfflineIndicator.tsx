import { WifiOff, Wifi } from "lucide-react";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function OfflineIndicator() {
  const { isOffline, queuedCount } = useOfflineStatus();

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn(
            "fixed top-4 left-1/2 -translate-x-1/2 z-50",
            "flex items-center gap-2 px-4 py-2 rounded-full",
            "bg-[hsl(var(--admin-warning))] text-white shadow-lg"
          )}
        >
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">
            You're offline
            {queuedCount > 0 && ` • ${queuedCount} pending`}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OnlineStatusDot() {
  const { isOnline } = useOfflineStatus();

  return (
    <div
      className={cn(
        "w-2 h-2 rounded-full transition-colors",
        isOnline
          ? "bg-[hsl(var(--admin-success))]"
          : "bg-[hsl(var(--admin-warning))] animate-pulse"
      )}
      title={isOnline ? "Online" : "Offline"}
    />
  );
}
