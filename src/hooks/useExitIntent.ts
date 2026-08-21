import { useEffect, useRef, useCallback } from "react";

/**
 * Detects exit intent (mouse leaving viewport top on desktop, or back button on mobile).
 * Fires callback once per session per page unless reset.
 */
export const useExitIntent = (
  onExitIntent: () => void,
  { enabled = true, sessionKey = "exit_intent_shown" } = {}
) => {
  const firedRef = useRef(false);

  const handleMouseLeave = useCallback(
    (e: MouseEvent) => {
      if (firedRef.current) return;
      // Only trigger when mouse leaves from the top of the viewport
      if (e.clientY <= 0) {
        const alreadyShown = sessionStorage.getItem(sessionKey);
        if (!alreadyShown) {
          firedRef.current = true;
          sessionStorage.setItem(sessionKey, "1");
          onExitIntent();
        }
      }
    },
    [onExitIntent, sessionKey]
  );

  useEffect(() => {
    if (!enabled) return;
    // Check if already shown this session
    if (sessionStorage.getItem(sessionKey)) return;

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [enabled, handleMouseLeave, sessionKey]);
};
