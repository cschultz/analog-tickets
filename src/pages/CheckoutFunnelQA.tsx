import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDot, RefreshCw, RotateCcw, Smartphone, Monitor, AlertTriangle, ArrowRight, TrendingDown, Bug } from "lucide-react";
import { clearAnalyticsHistory, clearAnalyticsSession, getAnalyticsHistory, getAnalyticsSession, type FunnelDeviceType, type FunnelEvent, type SessionData } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";

type StepStatus = "pass" | "fail" | "pending";

interface StepResult {
  step: string;
  label: string;
  status: StepStatus;
  detail: string;
}

const REQUIRED_SEQUENCE = [
  "tickets",
  "checkout_start",
  "ticket_selected",
  "checkout_review_view",
  "checkout_submit",
  "checkout_complete",
  "payment_redirect",
] as const;

const OPTIONAL_BRANCHES = ["checkout_addons_view", "checkout_lodging_view"] as const;
const TERMINAL_STEPS = ["payment_success", "payment_failed", "payment_session_failed"] as const;

const STEP_LABELS: Record<string, string> = {
  tickets: "Tickets page viewed",
  checkout_start: "Checkout details started",
  ticket_selected: "Ticket selection confirmed",
  checkout_addons_view: "Add-ons step viewed",
  checkout_lodging_view: "Lodging step viewed",
  checkout_review_view: "Review step viewed",
  checkout_submit: "Payment CTA clicked",
  checkout_complete: "Stripe session created",
  payment_redirect: "Redirected to Stripe",
  payment_session_failed: "Stripe session creation failed",
  payment_success: "Payment confirmed",
  payment_failed: "Payment failed after Stripe",
};

const INSIGHT_STEPS = [
  "tickets",
  "checkout_start",
  "ticket_selected",
  "checkout_review_view",
  "checkout_submit",
  "checkout_complete",
  "payment_redirect",
  "payment_success",
] as const;

interface FunnelInsightRow {
  session_id: string;
  step: string;
  created_at: string;
}

interface CheckoutErrorRow {
  error_type: string;
  error_code: string | null;
  error_message: string;
  created_at: string;
}

interface FunnelAlertStatusRow {
  id: string;
  step_name: string;
  preceding_step_name: string;
  min_completion_rate: number;
  min_sessions: number;
  current_completion_rate: number | null;
  current_sessions: number;
  breach_started_at: string | null;
  last_checked_at: string | null;
  alert_active: boolean;
  last_alerted_at: string | null;
  last_status_message: string | null;
  metadata: { label?: string } | null;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getFirstStepIndex(events: FunnelEvent[], step: string) {
  return events.findIndex((event) => event.step === step);
}

function getObservedOrder(events: FunnelEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.step)) return false;
    seen.add(event.step);
    return true;
  });
}

function validateSession(session: SessionData | null) {
  if (!session) {
    return {
      session,
      passed: false,
      summary: "No completed run recorded yet.",
      steps: REQUIRED_SEQUENCE.map((step) => ({
        step,
        label: STEP_LABELS[step],
        status: "pending" as const,
        detail: "Run the funnel once on this viewport.",
      })),
      terminal: { status: "pending" as const, detail: "Waiting for payment success, Stripe session failure, or confirmed payment failure." },
      observedSteps: [] as FunnelEvent[],
    };
  }

  const steps: StepResult[] = [];
  let previousIndex = -1;
  let failed = false;

  for (const step of REQUIRED_SEQUENCE) {
    const stepIndex = getFirstStepIndex(session.events, step);
    if (stepIndex === -1) {
      failed = true;
      steps.push({
        step,
        label: STEP_LABELS[step],
        status: "fail",
        detail: "Missing from this run.",
      });
      continue;
    }

    const isOutOfOrder = stepIndex < previousIndex;
    if (isOutOfOrder) {
      failed = true;
    } else {
      previousIndex = stepIndex;
    }

    steps.push({
      step,
      label: STEP_LABELS[step],
      status: isOutOfOrder ? "fail" : "pass",
      detail: isOutOfOrder
        ? `Fired before ${STEP_LABELS[REQUIRED_SEQUENCE[Math.max(0, steps.length - 1)]]}.`
        : `Observed at ${formatTime(session.events[stepIndex].timestamp)}.`,
    });
  }

  const optionalObserved = OPTIONAL_BRANCHES
    .map((step) => getFirstStepIndex(session.events, step))
    .filter((index) => index >= 0);
  const reviewIndex = getFirstStepIndex(session.events, "checkout_review_view");
  const optionalOutOfOrder = optionalObserved.some((index) => reviewIndex >= 0 && index > reviewIndex);

  if (optionalOutOfOrder) {
    failed = true;
    steps.push({
      step: "branch-order",
      label: "Optional branch ordering",
      status: "fail",
      detail: "Add-ons or lodging fired after review, which breaks the expected funnel order.",
    });
  } else {
    steps.push({
      step: "branch-order",
      label: "Optional branch ordering",
      status: "pass",
      detail: optionalObserved.length > 0 ? "Optional add-ons/lodging steps occurred before review." : "No optional branch in this run.",
    });
  }

  const terminalEvent = session.events.find((event) => TERMINAL_STEPS.includes(event.step as (typeof TERMINAL_STEPS)[number]));
  const terminal = terminalEvent
    ? {
        status: "pass" as const,
        detail: `${STEP_LABELS[terminalEvent.step]} at ${formatTime(terminalEvent.timestamp)}.`,
      }
    : {
        status: "fail" as const,
        detail: "Missing payment_success, payment_session_failed, or payment_failed, so the run is not end-to-end.",
      };

  if (!terminalEvent) {
    failed = true;
  }

  return {
    session,
    passed: !failed,
    summary: !failed ? "All required funnel events fired in sequence." : "This run is missing steps or has ordering issues.",
    steps,
    terminal,
    observedSteps: getObservedOrder(session.events),
  };
}

function getLatestViewportRun(history: SessionData[], viewport: FunnelDeviceType) {
  return history
    .filter((session) => session.viewportType === viewport)
    .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

function buildInsights(events: FunnelInsightRow[], errors: CheckoutErrorRow[]) {
  const bySession = new Map<string, Set<string>>();
  for (const event of events) {
    const reached = bySession.get(event.session_id) ?? new Set<string>();
    reached.add(event.step);
    bySession.set(event.session_id, reached);
  }

  const stepCounts = INSIGHT_STEPS.map((step) => ({
    step,
    label: STEP_LABELS[step] ?? step,
    count: Array.from(bySession.values()).filter((reached) => reached.has(step)).length,
  }));

  const dropoffs = stepCounts.slice(0, -1).map((current, index) => {
    const next = stepCounts[index + 1];
    const lost = Math.max(current.count - next.count, 0);
    const dropRate = current.count > 0 ? (lost / current.count) * 100 : 0;
    return {
      from: current.step,
      to: next.step,
      fromLabel: current.label,
      toLabel: next.label,
      fromCount: current.count,
      toCount: next.count,
      lost,
      dropRate,
    };
  });

  const biggestDrop = [...dropoffs].sort((a, b) => b.lost - a.lost || b.dropRate - a.dropRate)[0] ?? null;

  const commonErrors = Object.values(
    errors.reduce<Record<string, { key: string; label: string; count: number; lastSeen: string }>>((acc, error) => {
      const key = `${error.error_type}:${error.error_code ?? error.error_message}`;
      const label = error.error_code
        ? `${error.error_type} · ${error.error_code}`
        : `${error.error_type} · ${error.error_message}`;

      if (!acc[key]) {
        acc[key] = { key, label, count: 0, lastSeen: error.created_at };
      }

      acc[key].count += 1;
      if (error.created_at > acc[key].lastSeen) {
        acc[key].lastSeen = error.created_at;
      }

      return acc;
    }, {})
  )
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, 5);

  return {
    sessions: bySession.size,
    stepCounts,
    dropoffs,
    biggestDrop,
    commonErrors,
  };
}

function formatAlertLabel(alert: FunnelAlertStatusRow) {
  return alert.metadata?.label ?? `${STEP_LABELS[alert.preceding_step_name] ?? alert.preceding_step_name} → ${STEP_LABELS[alert.step_name] ?? alert.step_name}`;
}

function StatusPill({ status }: { status: StepStatus }) {
  const toneClasses =
    status === "pass"
      ? "bg-admin-success-muted text-admin-success"
      : status === "fail"
        ? "bg-admin-error-muted text-admin-error"
        : "bg-muted text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses}`}
    >
      {status === "pass" ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === "fail" ? <AlertTriangle className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
      {status}
    </span>
  );
}

function DeviceCard({
  title,
  icon,
  validation,
}: {
  title: string;
  icon: ReactNode;
  validation: ReturnType<typeof validateSession>;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-foreground">
            {icon}
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{validation.summary}</p>
          {validation.session && (
            <p className="mt-2 text-xs text-muted-foreground">
              Session {validation.session.sessionId.slice(-8)} · started {formatTime(validation.session.startedAt)}
            </p>
          )}
        </div>
        <StatusPill status={validation.passed ? "pass" : validation.session ? "fail" : "pending"} />
      </div>

      <div className="mt-5 space-y-3">
        {validation.steps.map((result) => (
          <div key={result.step} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{result.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{result.detail}</p>
            </div>
            <StatusPill status={result.status} />
          </div>
        ))}

        <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Terminal payment event</p>
            <p className="mt-1 text-xs text-muted-foreground">{validation.terminal.detail}</p>
          </div>
          <StatusPill status={validation.terminal.status} />
        </div>
      </div>

      <div className="mt-5 rounded-md bg-muted p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Observed first-fire order</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {validation.observedSteps.length > 0 ? validation.observedSteps.map((event, index) => (
            <div key={`${event.step}-${index}`} className="flex items-center gap-2 text-xs text-foreground">
              <span className="rounded-full bg-card px-2.5 py-1 shadow-soft">{STEP_LABELS[event.step] ?? event.step}</span>
              {index < validation.observedSteps.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          )) : <span className="text-xs text-muted-foreground">No events recorded yet.</span>}
        </div>
      </div>
    </section>
  );
}

export default function CheckoutFunnelQA() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const { currentSession, history, desktopValidation, mobileValidation } = useMemo(() => {
    const history = getAnalyticsHistory();
    const currentSession = getAnalyticsSession();
    return {
      currentSession,
      history,
      desktopValidation: validateSession(getLatestViewportRun(history, "desktop")),
      mobileValidation: validateSession(getLatestViewportRun(history, "mobile")),
    };
  }, [tick]);

  const { data: insights, isLoading: insightsLoading, error: insightsError, refetch: refetchInsights, isFetching: insightsFetching } = useQuery({
    queryKey: ["checkout-funnel-insights"],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: eventRows, error: eventError }, { data: errorRows, error: errorError }, { data: alertRows, error: alertError }] = await Promise.all([
        supabase
          .from("funnel_events")
          .select("session_id,step,created_at")
          .in("step", [...INSIGHT_STEPS])
          .gte("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(10000),
        supabase
          .from("checkout_errors")
          .select("error_type,error_code,error_message,created_at")
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("funnel_step_alerts")
          .select("id,step_name,preceding_step_name,min_completion_rate,min_sessions,current_completion_rate,current_sessions,breach_started_at,last_checked_at,alert_active,last_alerted_at,last_status_message,metadata")
          .eq("is_active", true)
          .order("step_name", { ascending: true }),
      ]);

      if (eventError) throw eventError;
      if (errorError) throw errorError;
      if (alertError) throw alertError;

      return {
        ...buildInsights((eventRows ?? []) as FunnelInsightRow[], (errorRows ?? []) as CheckoutErrorRow[]),
        alerts: (alertRows ?? []) as FunnelAlertStatusRow[],
      };
    },
  });

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-soft lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Checkout QA</p>
            <h1 className="text-3xl font-semibold text-foreground">End-to-end funnel checklist</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Run the checkout once on desktop and once on mobile, then use this page to confirm the funnel events fired in sequence through Stripe redirect and payment outcome.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link to="/tickets" className="rounded-md bg-primary px-4 py-2 text-primary-foreground transition-opacity hover:opacity-85">Open tickets</Link>
              <button
                type="button"
                onClick={() => setTick((value) => value + 1)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-foreground transition-opacity hover:opacity-80"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAnalyticsSession();
                  clearAnalyticsHistory();
                  setTick((value) => value + 1);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-foreground transition-opacity hover:opacity-80"
              >
                <RotateCcw className="h-4 w-4" />
                Reset QA data
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm text-foreground">
            <p className="font-medium text-foreground">Current live session</p>
            {currentSession ? (
              <>
                <p className="mt-2">Viewport: {currentSession.viewportType ?? currentSession.deviceType ?? "unknown"}</p>
                <p>Events recorded: {currentSession.events.length}</p>
                <p>Latest step: {currentSession.events[currentSession.events.length - 1]?.step ?? "none"}</p>
              </>
            ) : (
              <p className="mt-2">No active session detected yet.</p>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <DeviceCard title="Desktop run" icon={<Monitor className="h-5 w-5" />} validation={desktopValidation} />
          <DeviceCard title="Mobile run" icon={<Smartphone className="h-5 w-5" />} validation={mobileValidation} />
        </div>

        <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-foreground">
                <TrendingDown className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Funnel drop-off insights</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Based on the last 7 days of recorded checkout events and logged error states.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetchInsights()}
              className="inline-flex items-center gap-2 self-start rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground transition-opacity hover:opacity-80"
            >
              <RefreshCw className={`h-4 w-4 ${insightsFetching ? "animate-spin" : ""}`} />
              Refresh insights
            </button>
          </div>

          {insightsLoading ? (
            <div className="mt-5 text-sm text-muted-foreground">Loading insights…</div>
          ) : insightsError ? (
            <div className="mt-5 rounded-md border border-admin-error bg-admin-error-muted px-4 py-3 text-sm text-admin-error">
              Unable to load backend funnel insights right now.
            </div>
          ) : insights ? (
            <div className="mt-5 space-y-6">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Automated threshold alerts</h3>
                    <p className="mt-1 text-sm text-muted-foreground">An alert is sent only after a step stays below its completion threshold for more than 24 hours.</p>
                  </div>
                  <StatusPill status={insights.alerts.some((alert) => alert.alert_active) ? "fail" : "pass"} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {insights.alerts.map((alert) => (
                    <div key={alert.id} className="rounded-md bg-muted px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{formatAlertLabel(alert)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {alert.current_completion_rate !== null
                              ? `${formatPercent(alert.current_completion_rate)} completion · threshold ${formatPercent(alert.min_completion_rate)} · ${alert.current_sessions.toLocaleString()} source sessions`
                              : `Waiting for at least ${alert.min_sessions.toLocaleString()} recent source sessions`}
                          </p>
                        </div>
                        <StatusPill status={alert.alert_active ? "fail" : alert.current_completion_rate !== null && alert.current_completion_rate < alert.min_completion_rate ? "pending" : "pass"} />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{alert.last_status_message ?? "No status recorded yet."}</p>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p>Last checked: {alert.last_checked_at ? new Date(alert.last_checked_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—"}</p>
                        <p>Breach started: {alert.breach_started_at ? new Date(alert.breach_started_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—"}</p>
                        <p>Alert sent: {alert.last_alerted_at ? new Date(alert.last_alerted_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Biggest conversion drop</p>
                  {insights.biggestDrop ? (
                    <>
                      <div className="mt-2 flex items-center gap-2 text-foreground">
                        <span className="text-lg font-semibold">{insights.biggestDrop.fromLabel}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-lg font-semibold">{insights.biggestDrop.toLabel}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {insights.biggestDrop.lost.toLocaleString()} sessions dropped here ({formatPercent(insights.biggestDrop.dropRate)}) across {insights.sessions.toLocaleString()} tracked sessions.
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Not enough data yet to calculate a meaningful drop-off.</p>
                  )}
                </div>

                <div className="space-y-3">
                  {insights.dropoffs.map((drop) => (
                    <div key={`${drop.from}-${drop.to}`} className="rounded-md border border-border px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{drop.fromLabel} → {drop.toLabel}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {drop.fromCount.toLocaleString()} reached {drop.fromLabel.toLowerCase()} · {drop.toCount.toLocaleString()} reached {drop.toLabel.toLowerCase()}
                          </p>
                        </div>
                        <StatusPill status={drop.lost > 0 ? "fail" : "pass"} />
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, drop.dropRate)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Drop-off: {drop.lost.toLocaleString()} sessions · {formatPercent(drop.dropRate)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <Bug className="h-4 w-4" />
                  <h3 className="text-base font-semibold">Most common error states</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Top logged checkout errors from the same 7-day window.
                </p>

                <div className="mt-4 space-y-3">
                  {insights.commonErrors.length > 0 ? insights.commonErrors.map((errorState) => (
                    <div key={errorState.key} className="rounded-md bg-muted px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{errorState.label}</p>
                        <span className="rounded-full bg-card px-2 py-1 text-xs text-foreground shadow-soft">
                          {errorState.count}x
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last seen {new Date(errorState.lastSeen).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
                      </p>
                    </div>
                  )) : (
                    <div className="rounded-md bg-muted px-3 py-4 text-sm text-muted-foreground">
                      No checkout errors were logged in the last 7 days.
                    </div>
                  )}
                </div>
              </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-foreground">Recent funnel sessions</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="border-b border-border px-3 py-2 font-medium">Started</th>
                  <th className="border-b border-border px-3 py-2 font-medium">Viewport</th>
                  <th className="border-b border-border px-3 py-2 font-medium">Events</th>
                  <th className="border-b border-border px-3 py-2 font-medium">Terminal</th>
                  <th className="border-b border-border px-3 py-2 font-medium">Session</th>
                </tr>
              </thead>
              <tbody>
                {history.length > 0 ? history.map((session) => {
                  const terminal = session.events.find((event) => TERMINAL_STEPS.includes(event.step as (typeof TERMINAL_STEPS)[number]));
                  return (
                    <tr key={session.sessionId}>
                      <td className="border-b border-border px-3 py-3 text-foreground">{formatTime(session.startedAt)}</td>
                      <td className="border-b border-border px-3 py-3 text-foreground">{session.viewportType ?? session.deviceType ?? "unknown"}</td>
                      <td className="border-b border-border px-3 py-3 text-foreground">{session.events.length}</td>
                      <td className="border-b border-border px-3 py-3 text-foreground">{terminal ? STEP_LABELS[terminal.step] : "—"}</td>
                      <td className="border-b border-border px-3 py-3 font-mono text-xs text-muted-foreground">{session.sessionId}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No funnel runs saved yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}