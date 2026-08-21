import { createRoot } from "react-dom/client";
import "./index.css";
import { initWebVitals } from "@/lib/web-vitals";
import { installGlobalErrorMonitor } from "@/lib/global-error-monitor";
import { getProductionHosts } from "@/platform/config/env";
import { shouldRenderSetupScreen } from "@/platform/config/bootstrap";

// Install global error/rejection listeners ASAP so we capture early failures
// (failed chunk loads on first paint, etc.) and can auto-recover.
installGlobalErrorMonitor();

// Allowlist: cache-busting / SW cleanup / version polling only run on these
// canonical production hostnames. Anything else (preview, sandbox, localhost,
// staging, unknown subdomain, or anything that throws) is treated as
// non-production and skipped. Fails closed by design.
// Configure with your own production hostnames before deploying.
const PRODUCTION_HOSTS = new Set(
  getProductionHosts().length ? getProductionHosts() : ["example.test", "www.example.test"],
);

function detectIsProductionHost(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (window.location.protocol !== "https:") return false;
    const hostname = (window.location.hostname || "").toLowerCase();
    if (!hostname) return false;
    if (hostname.endsWith(".lovableproject.com")) return false;
    if (hostname.endsWith(".lovable.dev")) return false;
    if (hostname.endsWith(".lovable.app") && hostname.includes("--")) return false;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return false;
    if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) return false;
    return PRODUCTION_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

const isProductionHost = detectIsProductionHost();
const isPreviewHost = !isProductionHost;
const VERSION_CHECK_INTERVAL_MS = 60_000;

declare global {
  interface Window {
    __APP_VERSION__?: string;
  }
}

async function clearClientCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  } catch (error) {
    console.warn("Failed to clear app caches", error);
  }
}

async function installServiceWorkerCleanup() {
  try {
    if (!("serviceWorker" in navigator)) return;

    const registrations = await navigator.serviceWorker.getRegistrations();
    if (!registrations.length) return;

    await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  } catch (error) {
    console.warn("Failed to install service worker cleanup", error);
  }
}

async function fetchLatestAppVersion() {
  const response = await fetch(`/?__version_probe=${Date.now()}`, {
    cache: "no-store",
    headers: {
      pragma: "no-cache",
      "cache-control": "no-cache",
    },
  });

  const html = await response.text();
  const match = html.match(/window\.__APP_VERSION__\s*=\s*['\"]([^'\"]+)['\"]/i);
  return match?.[1] ?? null;
}

async function refreshIfVersionChanged() {
  try {
    const currentVersion = window.__APP_VERSION__;
    if (!currentVersion) return;

    const latestVersion = await fetchLatestAppVersion();
    if (!latestVersion || latestVersion === currentVersion) return;

    await clearClientCaches();

    const url = new URL(window.location.href);
    url.searchParams.set("__v", latestVersion);
    window.location.replace(url.toString());
  } catch (error) {
    console.warn("Failed to refresh stale app version", error);
  }
}

function installVersionPolling() {
  if (isPreviewHost) return;

  const checkForUpdates = () => {
    void refreshIfVersionChanged();
  };

  window.addEventListener("focus", checkForUpdates);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkForUpdates();
    }
  });

  window.setInterval(checkForUpdates, VERSION_CHECK_INTERVAL_MS);
}

if (isPreviewHost) {
  const previewCacheKey = `__preview_cache_cleared_${window.__APP_VERSION__ ?? "unknown"}__`;
  if (!sessionStorage.getItem(previewCacheKey)) {
    sessionStorage.setItem(previewCacheKey, "1");
    void clearClientCaches();
  }
} else {
  void installServiceWorkerCleanup();
  installVersionPolling();
}

initWebVitals({
  enableLogging: import.meta.env.DEV,
  sendToAnalytics: false,
});

const root = createRoot(document.getElementById("root")!);

// An unconfigured clone must not import the app graph at all: modules like the
// backend client construct themselves at import time and would crash before
// anything renders. Load the app lazily, only once configuration is present.
async function bootstrap() {
  if (shouldRenderSetupScreen()) {
    const { SetupRequired } = await import("@/platform/config/SetupRequired");
    root.render(<SetupRequired />);
    return;
  }

  const { default: App } = await import("./App.tsx");
  root.render(<App />);
}

void bootstrap();
