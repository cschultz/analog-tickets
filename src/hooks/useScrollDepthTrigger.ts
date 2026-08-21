import { useEffect, useRef } from "react";

const SCROLL_KEY = "cosmico_scroll_promo_shown";

/**
 * Fires callback when user scrolls past a threshold (default 65% of page)
 * and then scrolls back up — indicating they browsed but are leaving.
 * Only fires once per session.
 */
export function useScrollDepthTrigger(
  onTrigger: () => void,
  { enabled = true, depthPercent = 65 } = {}
) {
  const reachedDepth = useRef(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (sessionStorage.getItem(SCROLL_KEY)) return;

    const handleScroll = () => {
      if (firedRef.current) return;

      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = (scrollTop / docHeight) * 100;

      if (scrollPercent >= depthPercent) {
        reachedDepth.current = true;
      }

      // If they reached depth and are now scrolling back up past 30%
      if (reachedDepth.current && scrollPercent < 30) {
        firedRef.current = true;
        sessionStorage.setItem(SCROLL_KEY, "1");
        onTrigger();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enabled, depthPercent, onTrigger]);
}
