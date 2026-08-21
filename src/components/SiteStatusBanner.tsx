import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

type Status = "healthy" | "degraded" | "unhealthy";

interface HealthReport {
  status: Status;
}

const POLL_INTERVAL_MS = 60_000; // 1 minute
const DISMISS_KEY = "site-status-dismissed-at";
const DISMISS_TTL_MS = 30 * 60 * 1000; // re-show 30 min after dismiss

/**
 * Public-facing live system status banner.
 * Hidden when healthy. Shows a non-intrusive bar at top when degraded/unhealthy.
 */
export function SiteStatusBanner() {
  const [status, setStatus] = useState<Status>("healthy");
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_TTL_MS;
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { data, error } = await supabase.functions.invoke<HealthReport>("system-health");
        if (cancelled) return;
        if (error || !data?.status) {
          // Network/edge failure — treat as unknown, do NOT alarm visitors.
          // Keep last known status (most likely healthy).
          return;
        }
        setStatus(data.status);
      } catch {
        // Silent — visitors shouldn't see edge-network blips as "site issues".
      }
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const visible = !dismissed && (status === "degraded" || status === "unhealthy");

  const isUnhealthy = status === "unhealthy";
  const bg = isUnhealthy ? "bg-red-600" : "bg-amber-500";
  const message = isUnhealthy
    ? "We're experiencing technical issues. Our team has been alerted and is working on it."
    : "Some services are running slower than usual. You may experience brief delays.";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={`${bg} text-white relative z-[100] shadow-md`}
          role="status"
          aria-live="polite"
        >
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span className="flex-1 leading-snug">
              <strong className="font-semibold mr-1">
                {isUnhealthy ? "Service disruption:" : "Heads up:"}
              </strong>
              {message}{" "}
              <a
                href="/contact"
                className="underline underline-offset-2 hover:opacity-90"
              >
                Contact us
              </a>{" "}
              if you need help.
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss status banner"
              className="flex-shrink-0 p-1 rounded hover:bg-white/15 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SiteStatusBanner;
