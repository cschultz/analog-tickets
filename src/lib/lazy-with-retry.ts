import { lazy, type ComponentType } from "react";

/**
 * Wraps React.lazy with retry + auto-recover for stale chunk failures.
 *
 * Common failure modes this handles:
 * - "Failed to fetch dynamically imported module"
 * - "Loading chunk N failed"
 * - "Importing a module script failed"
 *
 * Strategy:
 * 1. Retry the import 2 extra times with backoff (handles transient CDN blips).
 * 2. If still failing AND it looks like a stale-chunk error (very common after a
 *    deploy), clear caches/SW and force a one-time hard reload with a cache-bust
 *    param. We use sessionStorage to make sure we never reload-loop.
 * 3. Report the error to log-client-error so we can see real-world frequency.
 */

const RELOAD_FLAG_PREFIX = "__chunk_reload__";

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
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

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName?: string,
) {
  return lazy(async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (!isChunkLoadError(err)) break;
        // small backoff between retries
        await delay(200 * (attempt + 1));
      }
    }

    // Report so we can see this in client_errors
    reportToServer({
      url: window.location.href,
      route: window.location.pathname + window.location.search,
      message:
        (lastError instanceof Error ? lastError.message : String(lastError)) ||
        "chunk load failed",
      stack: lastError instanceof Error ? lastError.stack : null,
      userAgent: navigator.userAgent,
      buildVersion: (window as any).__APP_VERSION__ || null,
      context: { kind: "lazy_chunk_failure", chunk: chunkName ?? null },
    });

    if (isChunkLoadError(lastError)) {
      const flag =
        RELOAD_FLAG_PREFIX +
        ((window as any).__APP_VERSION__ || "v") +
        "_" +
        (chunkName ?? window.location.pathname);
      if (!sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, "1");
        await clearAppCaches();
        const url = new URL(window.location.href);
        url.searchParams.set("__chunkfix", Date.now().toString(36));
        window.location.replace(url.toString());
        // Return a never-resolving promise so React doesn't render error UI
        // before the navigation completes.
        return new Promise<{ default: T }>(() => {});
      }
    }

    throw lastError;
  });
}
