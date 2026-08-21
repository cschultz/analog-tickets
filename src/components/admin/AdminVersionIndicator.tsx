import { useEffect, useState } from "react";

/**
 * Small admin-only debug pill, fixed bottom-right of every admin page.
 * Shows the in-memory __APP_VERSION__ (what this tab booted with) vs
 * the localStorage `site_version` (what the cache-bust IIFE last persisted).
 *
 * Color coding via admin semantic tokens:
 *   - admin-success → values match (cache-bust is in sync)
 *   - admin-warning → mismatch (a reload is pending or just happened)
 *   - admin-error   → no in-memory version (script never ran — preview / non-prod)
 *
 * Click to expand a full panel with hostname, last reload guard key, and
 * a manual "force re-check" button that mirrors what the 60s poll does.
 *
 * No raw HTML controls — uses admin-themed div/span elements per style guide.
 */

declare global {
  interface Window {
    __APP_VERSION__?: string;
  }
}

const STORAGE_KEY = "site_version";

function readSnapshot() {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  const inMemory = typeof window !== "undefined" ? window.__APP_VERSION__ ?? null : null;
  let reloadGuard: string | null = null;
  try {
    if (inMemory) reloadGuard = sessionStorage.getItem(`${STORAGE_KEY}_reload_${inMemory}`);
  } catch {
    reloadGuard = null;
  }
  return {
    inMemory,
    stored,
    reloadGuard,
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
    protocol: typeof window !== "undefined" ? window.location.protocol : "",
  };
}

export function AdminVersionIndicator() {
  const [snapshot, setSnapshot] = useState(readSnapshot);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const refresh = () => setSnapshot(readSnapshot());
    const interval = window.setInterval(refresh, 5_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const { inMemory, stored, reloadGuard, hostname, protocol } = snapshot;

  let statusToken: "admin-success" | "admin-warning" | "admin-error";
  let statusLabel: string;
  if (!inMemory) {
    statusToken = "admin-error";
    statusLabel = "no version";
  } else if (stored && stored !== inMemory) {
    statusToken = "admin-warning";
    statusLabel = "mismatch";
  } else {
    statusToken = "admin-success";
    statusLabel = "in sync";
  }

  const shortInMem = inMemory ? inMemory.replace(/^analog-commons-/, "") : "—";
  const shortStored = stored ? stored.replace(/^analog-commons-/, "") : "—";

  return (
    <div
      className="admin-theme fixed bottom-3 right-3 z-[9999] select-none font-mono text-[10px] leading-tight"
      role="status"
      aria-label="App version debug indicator"
    >
      <div
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        tabIndex={0}
        role="button"
        className="cursor-pointer rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 shadow-md transition hover:bg-[hsl(var(--muted))]"
        title="Click to expand cache-bust debug info"
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: `hsl(var(--${statusToken}))` }}
          />
          <span className="text-[hsl(var(--foreground))]">v {shortInMem}</span>
          <span className="text-[hsl(var(--muted-foreground))]">/ {shortStored}</span>
        </span>
      </div>

      {expanded && (
        <div className="mt-1 w-72 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wider text-[hsl(var(--foreground))]">
              cache-bust
            </span>
            <span
              className="rounded-sm px-1.5 py-0.5 text-[hsl(var(--background))]"
              style={{ background: `hsl(var(--${statusToken}))` }}
            >
              {statusLabel}
            </span>
          </div>
          <Row label="in-memory" value={inMemory ?? "—"} />
          <Row label="localStorage" value={stored ?? "—"} />
          <Row label="reload guard" value={reloadGuard ? "set" : "—"} />
          <Row label="host" value={`${protocol}//${hostname}`} />
          <div
            onClick={(e) => {
              e.stopPropagation();
              setSnapshot(readSnapshot());
            }}
            tabIndex={0}
            role="button"
            className="mt-2 cursor-pointer rounded-sm border border-[hsl(var(--border))] px-2 py-1 text-center text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--muted))]"
          >
            refresh snapshot
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="truncate text-right text-[hsl(var(--foreground))]" title={value}>
        {value}
      </span>
    </div>
  );
}
