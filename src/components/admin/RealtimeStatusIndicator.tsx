/**
 * RealtimeStatusIndicator - Shows realtime connection status
 * 
 * Use this to show users when data is syncing live
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface RealtimeStatusIndicatorProps {
  channelName?: string;
  className?: string;
  showLabel?: boolean;
  variant?: "dot" | "badge" | "full";
}

export function RealtimeStatusIndicator({
  channelName,
  className,
  showLabel = false,
  variant = "dot",
}: RealtimeStatusIndicatorProps) {
  const [status, setStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    // Check Supabase realtime connection status
    const checkConnection = () => {
      const channels = supabase.getChannels();
      if (channels.length > 0) {
        setStatus("connected");
      } else {
        setStatus("disconnected");
      }
    };

    // Initial check
    checkConnection();

    // Periodic check
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, [channelName]);

  const statusConfig = {
    connected: {
      color: "bg-[hsl(var(--admin-success))]",
      label: "Live",
      icon: Wifi,
    },
    connecting: {
      color: "bg-[hsl(var(--admin-warning))] animate-pulse",
      label: "Connecting",
      icon: RefreshCw,
    },
    disconnected: {
      color: "bg-[hsl(var(--admin-text-muted))]",
      label: "Offline",
      icon: WifiOff,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  if (variant === "dot") {
    return (
      <div
        className={cn("w-2 h-2 rounded-full", config.color, className)}
        title={config.label}
      />
    );
  }

  if (variant === "badge") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
          status === "connected" && "bg-[hsl(var(--admin-success)/0.15)] text-[hsl(var(--admin-success))]",
          status === "connecting" && "bg-[hsl(var(--admin-warning)/0.15)] text-[hsl(var(--admin-warning))]",
          status === "disconnected" && "bg-[hsl(var(--admin-muted))] text-[hsl(var(--admin-text-muted))]",
          className
        )}
      >
        <div className={cn("w-1.5 h-1.5 rounded-full", config.color)} />
        {config.label}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      <div className={cn("w-2 h-2 rounded-full", config.color)} />
      <Icon className="h-3 w-3 text-[hsl(var(--admin-text-muted))]" />
      {showLabel && (
        <span className="text-[hsl(var(--admin-text-muted))]">{config.label}</span>
      )}
    </div>
  );
}

/**
 * LiveUpdatePulse - Animated indicator when new data arrives
 */
export function LiveUpdatePulse({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="absolute -top-1 -right-1 flex items-center justify-center"
        >
          <span className="absolute inline-flex h-3 w-3 rounded-full bg-[hsl(var(--admin-accent))] opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--admin-accent))]" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
