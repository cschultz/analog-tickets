import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;   // Google Ads click ID
  gbraid?: string;  // Google Ads click ID — iOS app
  wbraid?: string;  // Google Ads click ID — web-to-app
  fbclid?: string;  // Facebook/Meta Ads click ID
}

const UTM_STORAGE_KEY = "utm_params";

/**
 * Captures UTM parameters from URL and stores them in sessionStorage
 * so they persist across page navigation within the session.
 */
export const useUTMCapture = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const incoming: UTMParams = {};
    let hasIncoming = false;

    const utmKeys: (keyof UTMParams)[] = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "gbraid",
      "wbraid",
      "fbclid",
    ];

    utmKeys.forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        incoming[key] = value;
        hasIncoming = true;
      }
    });

    if (!hasIncoming) return;

    // Load existing stored attribution
    const existing = getStoredUTMParams();

    // Rule 1: never let an "internal" medium clobber a paid/organic source.
    // Once we've recorded a real ad-source attribution, keep it for the session.
    const incomingIsInternal = (incoming.utm_medium || "").toLowerCase() === "internal";
    const existingIsPaid =
      existing.utm_medium &&
      existing.utm_medium.toLowerCase() !== "internal";

    if (incomingIsInternal && existingIsPaid) {
      console.log("[UTM Tracking] Preserved paid attribution; ignored internal overwrite");
      return;
    }

    // Rule 2: when overwriting, still preserve click IDs from the prior capture
    // if the new URL didn't carry them (Meta/Google pixels rely on these).
    const merged: UTMParams = { ...incoming };
    (["fbclid", "gclid", "gbraid", "wbraid"] as const).forEach((k) => {
      if (!merged[k] && existing[k]) merged[k] = existing[k];
    });

    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
    console.log("[UTM Tracking] Captured UTM params:", merged);
  }, [searchParams]);
};

/**
 * Retrieves stored UTM parameters from sessionStorage
 */
export const getStoredUTMParams = (): UTMParams => {
  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("[UTM Tracking] Failed to parse stored UTM params:", e);
  }
  return {};
};

/**
 * Hook to get stored UTM parameters
 */
export const useUTMParams = (): UTMParams => {
  return getStoredUTMParams();
};
