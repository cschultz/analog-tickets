import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Bug, ChevronDown, ChevronUp, Eye, EyeOff, Radio, Trash2 } from "lucide-react";
import {
  clearAnalyticsHistory,
  clearAnalyticsSession,
  getAnalyticsSession,
  getFunnelDebuggerEnabled,
  setFunnelDebuggerEnabled,
  subscribeToFunnelEvents,
  type FunnelEvent,
} from "@/lib/analytics";

const DEBUG_ROUTES = ["/tickets", "/checkout", "/checkout/lodging", "/ticket-success", "/qa/checkout-funnel"];

function isRelevantRoute(pathname: string) {
  return DEBUG_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function formatMetadata(metadata?: Record<string, string | number | boolean>) {
  if (!metadata || Object.keys(metadata).length === 0) return "—";
  return JSON.stringify(metadata);
}

export function FunnelEventDebugger() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [enabled, setEnabled] = useState(() => getFunnelDebuggerEnabled() || searchParams.get("debugFunnel") === "1");
  const [open, setOpen] = useState(() => getFunnelDebuggerEnabled() || searchParams.get("debugFunnel") === "1");
  const [events, setEvents] = useState<FunnelEvent[]>(() => getAnalyticsSession()?.events ?? []);
  const session = getAnalyticsSession();
  const canRender = enabled || searchParams.get("debugFunnel") === "1";

  useEffect(() => {
    const queryEnabled = searchParams.get("debugFunnel") === "1";
    if (queryEnabled) {
      setEnabled(true);
      setOpen(true);
      setFunnelDebuggerEnabled(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeToFunnelEvents(({ session }) => {
      setEvents([...session.events]);
    });
  }, [enabled]);

  useEffect(() => {
    setEvents(getAnalyticsSession()?.events ?? []);
  }, [location.pathname]);

  const visibleEvents = useMemo(() => [...events].reverse().slice(0, 12), [events]);

  if (!isRelevantRoute(location.pathname) || !canRender) return null;

  const handleToggleMode = () => {
    const next = !enabled;
    setEnabled(next);
    setOpen(next || open);
    setFunnelDebuggerEnabled(next);
    if (next) {
      setEvents(getAnalyticsSession()?.events ?? []);
    }
  };

  const handleClear = () => {
    clearAnalyticsSession();
    clearAnalyticsHistory();
    setEvents([]);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[70] inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-soft backdrop-blur"
      >
        <Bug className="h-4 w-4" />
        Funnel debugger
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[70] w-[min(92vw,24rem)] rounded-lg border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-foreground">
            <Bug className="h-4 w-4" />
            <p className="text-sm font-semibold">Funnel debugger</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Live events for ticketing and checkout flow</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground"
          aria-label="Collapse debugger"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleMode}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground"
          >
            {enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {enabled ? "Disable live mode" : "Enable live mode"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Status</p>
            <div className="mt-1 flex items-center gap-2 text-foreground">
              <Radio className={`h-3.5 w-3.5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
              <span>{enabled ? "Listening live" : "Paused"}</span>
            </div>
          </div>
          <div className="rounded-md bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Session</p>
            <p className="mt-1 truncate font-mono text-foreground">{session?.sessionId ?? "—"}</p>
          </div>
        </div>

        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <p>Path: <span className="text-foreground">{location.pathname}</span></p>
          <p className="mt-1">Events in session: <span className="text-foreground">{events.length}</span></p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Latest emitted events</p>
            <button
              type="button"
              onClick={() => setEvents(getAnalyticsSession()?.events ?? [])}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              Refresh
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {visibleEvents.length > 0 ? visibleEvents.map((event, index) => (
              <div key={`${event.step}-${event.timestamp}-${index}`} className="rounded-md border border-border bg-background px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{event.step}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatTimestamp(event.timestamp)}</p>
                  </div>
                </div>
                <p className="mt-2 break-words font-mono text-[11px] leading-5 text-muted-foreground">
                  {formatMetadata(event.metadata)}
                </p>
              </div>
            )) : (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {enabled ? "No funnel events captured yet on this session." : "Enable live mode to inspect events as they fire."}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default FunnelEventDebugger;