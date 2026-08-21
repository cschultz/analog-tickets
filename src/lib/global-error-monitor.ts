/**
 * Global runtime error monitor.
 *
 * Catches errors that bypass React's <ErrorBoundary>:
 *  - Uncaught exceptions in async code, event handlers, setTimeout, etc.
 *  - Unhandled promise rejections (incl. fetch failures, dynamic import failures)
 *  - <script>/<link> resource load failures (window 'error' capture phase)
 *
 * Forwards them to the log-client-error edge function so we can see real-world
 * crash signals. Also auto-recovers from stale-chunk errors with a one-time
 * hard refresh.
 */

const SEND_DEDUPE = new Set<string>();
const RELOADED_KEY = "__global_chunk_reloaded__";

function isChunkLoadError(msg: string): boolean {
  return /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    msg,
  );
}

import { getRouteContextForReport } from "@/lib/route-context";

function reportToServer(payload: Record<string, unknown>) {
  const ctx = getRouteContextForReport();
  payload = {
    ...payload,
    route: ctx.route,
    routePattern: ctx.routePattern,
    routeParams: ctx.routeParams,
    previousUrl: ctx.previousUrl,
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
  };
  try {
    const key = `${payload.message}|${payload.route}`;
    if (SEND_DEDUPE.has(key)) return;
    SEND_DEDUPE.add(key);
    // Cap dedupe set to avoid unbounded growth
    if (SEND_DEDUPE.size > 50) SEND_DEDUPE.clear();

    const functionsBase = (import.meta as any).env?.VITE_SUPABASE_URL;
    if (!functionsBase) return;
    const url = `${String(functionsBase).replace(/\/+$/, "")}/functions/v1/log-client-error`;
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(url, blob)) {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // never throw from logging
  }
}

async function clearAppCaches(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    // best effort
  }
}

async function recoverFromStaleChunk() {
  if (sessionStorage.getItem(RELOADED_KEY)) return;
  sessionStorage.setItem(RELOADED_KEY, "1");
  await clearAppCaches();
  const url = new URL(window.location.href);
  url.searchParams.set("__recover", Date.now().toString(36));
  window.location.replace(url.toString());
}

export function installGlobalErrorMonitor() {
  if ((window as any).__cosmico_error_monitor_installed__) return;
  (window as any).__cosmico_error_monitor_installed__ = true;

  // Uncaught JS errors AND resource load errors (capture phase)
  window.addEventListener(
    "error",
    (event: ErrorEvent | Event) => {
      try {
        const target = (event as Event).target as
          | (HTMLElement & { src?: string; href?: string; tagName?: string })
          | null;
        // Resource load failure (<script>, <link>, <img>)
        if (
          target &&
          target !== (window as any) &&
          (target.tagName === "SCRIPT" ||
            target.tagName === "LINK" ||
            target.tagName === "IMG")
        ) {
          const src = target.src || target.href || "";
          const isJs = /\.(m?js)(\?|$)/i.test(src);
          const tag = target.tagName.toLowerCase();
          // Noise filters — these failures do NOT break the app and were
          // generating false "crash spike" alerts (one flaky user = 30+ rows):
          //   - <img> 404s self-heal on reload
          //   - <link rel=modulepreload/preload> are advisory hints; the real
          //     chunk fetch retries on demand and surfaces as unhandledrejection
          //   - third-party <script> tags (fbevents, amazon-adsystem, gtag,
          //     hotjar, etc.) are out of our control and frequently blocked
          const rel = (target as HTMLLinkElement).rel || "";
          const isPreloadHint =
            tag === "link" && /(^|\s)(modulepreload|preload|prefetch|dns-prefetch|preconnect)(\s|$)/i.test(rel);
          const isThirdPartyScript =
            tag === "script" &&
            !!src &&
            (() => {
              try {
                const host = new URL(src, window.location.href).hostname;
                const site = window.location.hostname;
                const registrable = site.split(".").slice(-2).join(".");
                return host !== site && !host.endsWith(`.${registrable}`);
              } catch {
                return false;
              }
            })();
          const shouldReport = tag !== "img" && !isPreloadHint && !isThirdPartyScript;
          if (shouldReport) {
            reportToServer({
              url: window.location.href,
              route: window.location.pathname + window.location.search,
              message: `Resource load failed: <${tag}> ${src}`,
              stack: null,
              userAgent: navigator.userAgent,
              buildVersion: (window as any).__APP_VERSION__ || null,
              context: { kind: "resource_load_failure", src, tag, rel },
            });
          }
          // A failed first-party JS chunk = stale deploy. Recover once.
          // Skip recovery for preload hints (they don't indicate a real failure).
          if (isJs && !isPreloadHint && !isThirdPartyScript) void recoverFromStaleChunk();
          return;
        }

        const e = event as ErrorEvent;
        const rawMsg = e.message || String(e.error?.message || "");
        // Cross-origin "Script error." with no file/line/col is the classic
        // browser-extension / opaque-CDN failure. Unactionable noise — drop it.
        const isOpaqueScriptError =
          (!rawMsg || /^script error\.?$/i.test(rawMsg) || rawMsg === "unknown error") &&
          !e.filename && !e.lineno && !e.error?.stack;
        if (isOpaqueScriptError) return;
        const msg = rawMsg || (e.filename ? `Error at ${e.filename}:${e.lineno || 0}` : "unknown error");
        reportToServer({
          url: window.location.href,
          route: window.location.pathname + window.location.search,
          message: msg,
          stack: e.error?.stack || null,
          userAgent: navigator.userAgent,
          buildVersion: (window as any).__APP_VERSION__ || null,
          context: {
            kind: "window_error",
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
          },
        });
        if (isChunkLoadError(msg)) void recoverFromStaleChunk();
      } catch {
        // ignore
      }
    },
    true, // capture so we catch resource errors too
  );

  // Unhandled promise rejections (most dynamic-import failures land here)
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason: any = event.reason;
      const msg =
        (reason && (reason.message || String(reason))) || "unhandled rejection";
      reportToServer({
        url: window.location.href,
        route: window.location.pathname + window.location.search,
        message: msg,
        stack: reason?.stack || null,
        userAgent: navigator.userAgent,
        buildVersion: (window as any).__APP_VERSION__ || null,
        context: { kind: "unhandled_rejection" },
      });
      if (isChunkLoadError(msg)) void recoverFromStaleChunk();
    } catch {
      // ignore
    }
  });
}
