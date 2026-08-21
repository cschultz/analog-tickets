import { useEffect, useRef, useCallback, useState } from "react";

const VISIT_COUNT_KEY = "cosmico_tickets_visits";
const PROMO_SHOWN_KEY = "cosmico_hi_promo_shown";
const TIME_THRESHOLD_MS = 30_000; // 30 seconds on page

/**
 * Detects high-intent users who should see the exclusive promo popup.
 * Triggers when:
 *   1. User has visited /tickets 2+ times (return visitor) OR spent 60+ seconds
 *   2. AND shows exit intent (mouse leaves top of viewport)
 * 
 * Only fires once per session. Never fires if already shown.
 */
export function useHighIntentDetection(onHighIntent: () => void, opts: { enabled?: boolean } = {}) {
  const { enabled = true } = opts;
  const firedRef = useRef(false);
  const mountTime = useRef(Date.now());
  const [isHighIntent, setIsHighIntent] = useState(false);

  // Track visit count
  useEffect(() => {
    if (!enabled) return;
    const count = parseInt(sessionStorage.getItem(VISIT_COUNT_KEY) || "0", 10) + 1;
    sessionStorage.setItem(VISIT_COUNT_KEY, String(count));

    if (count >= 1) {
      setIsHighIntent(true);
    }
  }, [enabled]);

  // Time-on-page threshold
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setIsHighIntent(true), TIME_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [enabled]);

  // Exit intent listener — only fires when high intent AND not already shown
  const handleMouseLeave = useCallback(
    (e: MouseEvent) => {
      if (firedRef.current) return;
      if (!isHighIntent) return;
      if (e.clientY > 0) return;
      if (sessionStorage.getItem(PROMO_SHOWN_KEY)) return;

      firedRef.current = true;
      sessionStorage.setItem(PROMO_SHOWN_KEY, "1");
      onHighIntent();
    },
    [onHighIntent, isHighIntent]
  );

  useEffect(() => {
    if (!enabled || !isHighIntent) return;
    if (sessionStorage.getItem(PROMO_SHOWN_KEY)) return;

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [enabled, isHighIntent, handleMouseLeave]);

  return { isHighIntent };
}
