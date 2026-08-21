import { useState } from "react";
import { AlertTriangle, ArrowRightLeft, Ban, ChevronDown, Clock3, ShieldX } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableEmpty,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
} from "@/components/admin";
import {
  buildStripePaymentHealthSummary,
  type StripeHealthCheckoutErrorRow,
  type StripeHealthFunnelEventRow,
  type StripePaymentHealthSessionDetail,
} from "@/lib/admin/stripePaymentHealth";
import type { Database } from "@/integrations/supabase/types";

type AlertSettingRow = Database["public"]["Tables"]["stripe_payment_health_alert_settings"]["Row"];
type AlertRunRow = Database["public"]["Tables"]["stripe_payment_health_alert_runs"]["Row"];

function MetricTile({
  label,
  icon: Icon,
  sevenDayValue,
  thirtyDayValue,
}: {
  label: string;
  icon: typeof ArrowRightLeft;
  sevenDayValue: number;
  thirtyDayValue: number;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-3">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
        <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">7d</div>
          <div className="mt-1 text-2xl font-semibold text-[hsl(var(--admin-text))] tabular-nums">{sevenDayValue.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">30d</div>
          <div className="mt-1 text-2xl font-semibold text-[hsl(var(--admin-text))] tabular-nums">{thirtyDayValue.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function MiniFunnel({
  label,
  redirectStarts,
  canceledReturns,
  verificationFailures,
  canceledReturnRate,
  verificationFailureRate,
  totalDropOffRate,
}: {
  label: string;
  redirectStarts: number;
  canceledReturns: number;
  verificationFailures: number;
  canceledReturnRate: number;
  verificationFailureRate: number;
  totalDropOffRate: number;
}) {
  const stages = [
    { name: "Redirects", count: redirectStarts, rate: null },
    { name: "Canceled", count: canceledReturns, rate: canceledReturnRate },
    { name: "Verify fail", count: verificationFailures, rate: verificationFailureRate },
  ];

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[hsl(var(--admin-text))]">Mini funnel · {label}</h3>
        <AdminBadge intent={totalDropOffRate > 0.2 ? "warning" : "neutral"} size="sm">
          Drop-off {formatPercent(totalDropOffRate)}
        </AdminBadge>
      </div>

      <div className="space-y-3">
        {stages.map((stage, index) => {
          const width = redirectStarts > 0 ? Math.max((stage.count / redirectStarts) * 100, stage.count > 0 ? 8 : 0) : 0;

          return (
            <div key={`${label}-${stage.name}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-[hsl(var(--admin-text-muted))]">
                  <span>{stage.name}</span>
                  {index < stages.length - 1 ? <span>→</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[hsl(var(--admin-text))] tabular-nums">{stage.count.toLocaleString()}</span>
                  {typeof stage.rate === "number" ? (
                    <span className="text-[hsl(var(--admin-text-subtle))]">{formatPercent(stage.rate)}</span>
                  ) : null}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-sm bg-[hsl(var(--admin-background))]">
                <div
                  className="h-full rounded-sm bg-[hsl(var(--admin-warning))] transition-[width]"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StripePaymentHealthWidget() {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const { data, isLoading } = useAuthQuery({
    queryKey: ["admin-stripe-payment-health"],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: funnelEvents, error: funnelError }, { data: checkoutErrors, error: checkoutError }, { data: alertSettings, error: alertSettingsError }, { data: alertRuns, error: alertRunsError }] = await Promise.all([
        supabase
          .from("funnel_events")
          .select("created_at,session_id,step,metadata")
          .eq("step", "payment_redirect")
          .gte("created_at", cutoff)
          .limit(10000),
        supabase
          .from("checkout_errors")
          .select("created_at,error_type,error_code,error_message,request_payload,session_id,user_email")
          .gte("created_at", cutoff)
          .limit(10000),
        supabase
          .from("stripe_payment_health_alert_settings")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("stripe_payment_health_alert_runs")
          .select("*")
          .gte("checked_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
          .order("checked_at", { ascending: false })
          .limit(20),
      ]);

      if (funnelError) throw funnelError;
      if (checkoutError) throw checkoutError;
      if (alertSettingsError) throw alertSettingsError;
      if (alertRunsError) throw alertRunsError;

      return {
        summary: buildStripePaymentHealthSummary(
          (funnelEvents ?? []) as unknown as StripeHealthFunnelEventRow[],
          (checkoutErrors ?? []) as unknown as StripeHealthCheckoutErrorRow[],
        ),
        alertSettings: (alertSettings ?? []) as AlertSettingRow[],
        alertRuns: (alertRuns ?? []) as AlertRunRow[],
      };
    },
    staleTime: 60 * 1000,
  });

  const summary = data?.summary.windows;
  const alertSettings = data?.alertSettings ?? [];
  const alertRuns = data?.alertRuns ?? [];

  const toggleExpandedRow = (key: string) => {
    setExpandedRows((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <AdminCard>
      <AdminCardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <AdminCardTitle>Stripe Redirect Health</AdminCardTitle>
            <p className="mt-1 text-xs text-[hsl(var(--admin-text-muted))]">
              Redirect starts, canceled returns, post-redirect verification failures, and top payment-intent last errors.
            </p>
          </div>
          <AdminBadge intent="neutral" size="sm">
            {data?.summary.lastUpdatedAt ? `Updated ${formatDistanceToNow(new Date(data.summary.lastUpdatedAt), { addSuffix: true })}` : "Last 30 days"}
          </AdminBadge>
        </div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <MetricTile
            label="Redirect Starts"
            icon={ArrowRightLeft}
            sevenDayValue={summary?.[7].redirectStarts ?? 0}
            thirtyDayValue={summary?.[30].redirectStarts ?? 0}
          />
          <MetricTile
            label="Canceled Returns"
            icon={Ban}
            sevenDayValue={summary?.[7].canceledReturns ?? 0}
            thirtyDayValue={summary?.[30].canceledReturns ?? 0}
          />
          <MetricTile
            label="Verification Failures"
            icon={ShieldX}
            sevenDayValue={summary?.[7].verificationFailures ?? 0}
            thirtyDayValue={summary?.[30].verificationFailures ?? 0}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {isLoading ? (
            <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4 text-sm text-[hsl(var(--admin-text-muted))]">
              Loading active alerts…
            </div>
          ) : alertSettings.length === 0 ? (
            <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4 text-sm text-[hsl(var(--admin-text-muted))]">
              No active Stripe health alert settings are configured.
            </div>
          ) : (
            alertSettings.map((setting) => {
              const latestRun = alertRuns.find((run) => run.setting_id === setting.id) ?? null;
              const thresholdHit = Boolean(latestRun?.redirect_threshold_breached || latestRun?.verification_threshold_breached);

              return (
                <div key={setting.id} className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[hsl(var(--admin-text))]">24h threshold alert · {setting.name}</h3>
                      <p className="mt-1 text-xs text-[hsl(var(--admin-text-muted))]">
                        SMS target {setting.sms_phone ?? "not set"} · cooldown {setting.alert_cooldown_minutes} min
                      </p>
                    </div>
                    <AdminBadge intent={thresholdHit ? "warning" : "neutral"} size="sm">
                      {thresholdHit ? "Threshold exceeded" : "Within threshold"}
                    </AdminBadge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-background))] p-3">
                      <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">Redirect starts</div>
                      <div className="mt-1 flex items-end justify-between gap-3">
                        <div className="text-2xl font-semibold text-[hsl(var(--admin-text))] tabular-nums">{summary?.[1].redirectStarts ?? 0}</div>
                        <div className="text-sm text-[hsl(var(--admin-text-muted))]">threshold {setting.redirect_starts_threshold}</div>
                      </div>
                    </div>
                    <div className="rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-background))] p-3">
                      <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">Verification failures</div>
                      <div className="mt-1 flex items-end justify-between gap-3">
                        <div className="text-2xl font-semibold text-[hsl(var(--admin-text))] tabular-nums">{summary?.[1].verificationFailures ?? 0}</div>
                        <div className="text-sm text-[hsl(var(--admin-text-muted))]">threshold {setting.verification_failures_threshold}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <AdminBadge intent={latestRun?.sms_sent ? "success" : "neutral"} size="sm">
                      {latestRun?.sms_sent ? "SMS sent" : "No SMS sent"}
                    </AdminBadge>
                    {latestRun?.checked_at ? (
                      <AdminBadge intent="neutral" size="sm">
                        Checked {formatDistanceToNow(new Date(latestRun.checked_at), { addSuffix: true })}
                      </AdminBadge>
                    ) : null}
                    {latestRun?.redirect_threshold_breached ? <AdminBadge intent="warning" size="sm">Redirect threshold hit</AdminBadge> : null}
                    {latestRun?.verification_threshold_breached ? <AdminBadge intent="warning" size="sm">Verification threshold hit</AdminBadge> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <MiniFunnel
            label="7d"
            redirectStarts={summary?.[7].redirectStarts ?? 0}
            canceledReturns={summary?.[7].canceledReturns ?? 0}
            verificationFailures={summary?.[7].verificationFailures ?? 0}
            canceledReturnRate={summary?.[7].canceledReturnRate ?? 0}
            verificationFailureRate={summary?.[7].verificationFailureRate ?? 0}
            totalDropOffRate={summary?.[7].totalDropOffRate ?? 0}
          />
          <MiniFunnel
            label="30d"
            redirectStarts={summary?.[30].redirectStarts ?? 0}
            canceledReturns={summary?.[30].canceledReturns ?? 0}
            verificationFailures={summary?.[30].verificationFailures ?? 0}
            canceledReturnRate={summary?.[30].canceledReturnRate ?? 0}
            verificationFailureRate={summary?.[30].verificationFailureRate ?? 0}
            totalDropOffRate={summary?.[30].totalDropOffRate ?? 0}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {([7, 30] as const).map((window) => {
            const topReasons = summary?.[window].topLastErrorReasons ?? [];

            return (
              <div
                key={window}
                className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                  <h3 className="text-sm font-semibold text-[hsl(var(--admin-text))]">Top last_error reasons · {window}d</h3>
                </div>

                {isLoading ? (
                  <div className="text-sm text-[hsl(var(--admin-text-muted))]">Loading payment health…</div>
                ) : topReasons.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text-muted))]">
                    <AlertTriangle className="h-4 w-4" />
                    No payment-intent last_error reasons logged in this window.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {topReasons.map((reason) => (
                      <div
                        key={`${window}-${reason.reason}`}
                        className="flex items-start justify-between gap-3 rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-background))] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[hsl(var(--admin-text))] break-words">{reason.reason}</div>
                        </div>
                        <AdminBadge intent="warning" size="sm">{reason.count}</AdminBadge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {([7, 30] as const).map((window) => {
            const stepDetails = summary?.[window].stepDetails ?? [];

            return (
              <div
                key={`step-details-${window}`}
                className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                  <h3 className="text-sm font-semibold text-[hsl(var(--admin-text))]">Sessions by step · {window}d</h3>
                </div>

                <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-background))]">
                  <AdminTable>
                    <AdminTableHeader>
                      <AdminTableRow>
                        <AdminTableHead>Step</AdminTableHead>
                        <AdminTableHead className="text-right">Sessions</AdminTableHead>
                      </AdminTableRow>
                    </AdminTableHeader>
                    <AdminTableBody>
                      {isLoading ? (
                        <AdminTableEmpty title="Loading sessions…" />
                      ) : stepDetails.length === 0 ? (
                        <AdminTableEmpty title="No step data" description="No redirect health sessions were logged in this window." />
                      ) : (
                        stepDetails.flatMap((step) => {
                          const rowKey = `${window}-${step.key}`;
                          const isExpanded = expandedRows[rowKey] ?? false;

                          return [
                            <AdminTableRow key={rowKey}>
                              <AdminTableCell>
                                <div className="flex items-center gap-3">
                                  <AdminButton
                                    variant="outline"
                                    size="sm"
                                    onClick={() => toggleExpandedRow(rowKey)}
                                    className="h-8 min-w-8 px-2"
                                  >
                                    <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  </AdminButton>
                                  <div>
                                    <div className="text-sm font-medium text-[hsl(var(--admin-text))]">{step.label}</div>
                                    <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                                      Exact sessions that reached this step and the logged drop-off point.
                                    </div>
                                  </div>
                                </div>
                              </AdminTableCell>
                              <AdminTableCell className="text-right">
                                <AdminBadge intent="neutral" size="sm">{step.count}</AdminBadge>
                              </AdminTableCell>
                            </AdminTableRow>,
                            ...(isExpanded
                              ? [
                                  <AdminTableRow key={`${rowKey}-expanded`}>
                                    <AdminTableCell colSpan={2} className="bg-[hsl(var(--admin-surface))]">
                                      <ExpandedStepSessions sessions={step.sessions} />
                                    </AdminTableCell>
                                  </AdminTableRow>,
                                ]
                              : []),
                          ];
                        })
                      )}
                    </AdminTableBody>
                  </AdminTable>
                </div>
              </div>
            );
          })}
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}

function ExpandedStepSessions({ sessions }: { sessions: StripePaymentHealthSessionDetail[] }) {
  if (sessions.length === 0) {
    return (
      <div className="py-3 text-sm text-[hsl(var(--admin-text-muted))]">
        No sessions logged for this step in the selected window.
      </div>
    );
  }

  return (
    <div className="space-y-3 py-1">
      {sessions.map((session) => (
        <SessionDetailRow key={`${session.sessionId}-${session.reachedAt}`} session={session} />
      ))}
    </div>
  );
}

function SessionDetailRow({ session }: { session: StripePaymentHealthSessionDetail }) {
  return (
    <div className="rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-background))] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-xs uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">Session</div>
          <div className="font-mono text-xs text-[hsl(var(--admin-text))] break-all">{session.sessionId}</div>
          {session.stripeSessionId && session.stripeSessionId !== session.sessionId ? (
            <div className="font-mono text-[11px] text-[hsl(var(--admin-text-muted))] break-all">
              Stripe: {session.stripeSessionId}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge intent={session.droppedOffAt ? "warning" : "info"} size="sm">
            {session.droppedOffStep}
          </AdminBadge>
          <AdminBadge intent="neutral" size="sm">
            {formatDistanceToNow(new Date(session.reachedAt), { addSuffix: true })}
          </AdminBadge>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">Email</div>
          <div className="mt-1 text-sm text-[hsl(var(--admin-text))] break-all">{session.userEmail ?? "Unknown"}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">Dropped off</div>
          <div className="mt-1 text-sm text-[hsl(var(--admin-text))]">
            {session.droppedOffAt ? formatDistanceToNow(new Date(session.droppedOffAt), { addSuffix: true }) : "Not logged"}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">Detail</div>
        <div className="mt-1 text-sm text-[hsl(var(--admin-text-muted))] break-words">{session.detail}</div>
      </div>
    </div>
  );
}