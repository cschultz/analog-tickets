import { useEffect, useRef, useCallback } from "react";

const IDLE_KEY = "cosmico_idle_promo_shown";

/**
 * Detects idle/hesitation: user has been on page for X ms without 
 * scrolling or interacting. Fires callback once per session.
 */
export function useIdleHesitation(
  onIdle: () => void,
  { enabled = true, idleMs = 90_000 } = {}
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const resetTimer = useCallback(() => {
    if (firedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (firedRef.current) return;
      if (sessionStorage.getItem(IDLE_KEY)) return;
      firedRef.current = true;
      sessionStorage.setItem(IDLE_KEY, "1");
      onIdle();
    }, idleMs);
  }, [onIdle, idleMs]);

  useEffect(() => {
    if (!enabled) return;
    if (sessionStorage.getItem(IDLE_KEY)) return;

    // Start the timer
    resetTimer();

    // Reset on user activity
    const events = ["mousemove", "scroll", "keydown", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [enabled, resetTimer]);
}
