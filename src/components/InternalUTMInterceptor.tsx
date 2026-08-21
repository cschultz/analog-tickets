import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getStoredUTMParams } from "@/hooks/useUTMTracking";

/**
 * Global click interceptor that auto-appends UTM params to internal links
 * pointing at high-conversion conversion endpoints (/tickets, /reserve, /checkout, etc.)
 *
 * This stops internal traffic from bucketing as "direct" in analytics by tagging
 * every click with the source page (utm_campaign) and a fixed source/medium.
 *
 * Behavior:
 * - Only rewrites clicks on <a> elements (covers React Router <Link> too)
 * - Only targets internal navigation to TARGET_PATHS
 * - Skips links that already have any utm_* param (respect explicit tagging)
 * - Skips external links, mailto:, tel:, hash-only, target="_blank" with modifier keys
 * - Preserves existing query params and hash fragments
 */

// Pages we want to attribute traffic to (the conversion endpoints)
const TARGET_PATHS = [
  "/tickets",
  "/checkout",
  "/reserve",
  "/win",
  "/go",
  "/bringyourcrew",
  "/fielddayca",
  "/dinner",
];

// Map source page → utm_campaign value (slugified pathname)
function pathToCampaign(pathname: string): string {
  if (pathname === "/" || pathname === "") return "home";
  return pathname
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "_")
    .toLowerCase();
}

function shouldRewriteHref(href: string): boolean {
  // Internal-only: starts with "/" but not "//"
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  if (href.startsWith("/#")) return false;

  // Match against target paths (prefix match, e.g. /tickets?... or /checkout/review)
  const pathOnly = href.split("?")[0].split("#")[0];
  return TARGET_PATHS.some(
    (target) => pathOnly === target || pathOnly.startsWith(target + "/")
  );
}

function appendUTMs(href: string, sourcePath: string): string {
  try {
    const url = new URL(href, window.location.origin);

    // Respect any existing utm_* params (don't overwrite explicit tagging)
    const hasExistingUTM = Array.from(url.searchParams.keys()).some((k) =>
      k.toLowerCase().startsWith("utm_")
    );

    const stored = getStoredUTMParams();
    const storedIsPaid =
      stored.utm_medium && stored.utm_medium.toLowerCase() !== "internal";

    if (!hasExistingUTM) {
      if (storedIsPaid) {
        // Forward the original paid attribution instead of stamping "internal"
        if (stored.utm_source) url.searchParams.set("utm_source", stored.utm_source);
        if (stored.utm_medium) url.searchParams.set("utm_medium", stored.utm_medium);
        if (stored.utm_campaign) url.searchParams.set("utm_campaign", stored.utm_campaign);
        if (stored.utm_content) url.searchParams.set("utm_content", stored.utm_content);
        if (stored.utm_term) url.searchParams.set("utm_term", stored.utm_term);
      } else {
        url.searchParams.set("utm_source", "analog-commons");
        url.searchParams.set("utm_medium", "internal");
        url.searchParams.set("utm_campaign", pathToCampaign(sourcePath));
      }
    }

    // Always carry click IDs if we have them and the URL doesn't (CAPI / Google Ads)
    (["fbclid", "gclid", "gbraid", "wbraid"] as const).forEach((k) => {
      if (!url.searchParams.get(k) && stored[k]) {
        url.searchParams.set(k, stored[k]!);
      }
    });

    return url.pathname + url.search + url.hash;
  } catch {
    return href;
  }
}

export function InternalUTMInterceptor() {
  const location = useLocation();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Ignore modified clicks (cmd/ctrl-click to open new tab, middle-click, etc.)
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Walk up the DOM to find the nearest <a> element
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      // Skip download links and explicit no-tag opt-out
      if (anchor.hasAttribute("download")) return;
      if (anchor.dataset.noUtm === "true") return;

      // Use the raw attribute (not anchor.href which resolves to absolute)
      const rawHref = anchor.getAttribute("href");
      if (!rawHref) return;

      if (!shouldRewriteHref(rawHref)) return;

      const newHref = appendUTMs(rawHref, location.pathname);
      if (newHref === rawHref) return;

      // Mutate the anchor in place — React Router's onClick will then
      // navigate to the new href (it reads the attribute synchronously).
      anchor.setAttribute("href", newHref);
    };

    // Capture phase so we run before React Router's own click handler
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [location.pathname]);

  return null;
}
