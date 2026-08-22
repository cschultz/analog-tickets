import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminButton,
  AdminBadge,
  AdminInput,
  AdminTabs,
  AdminTabsContent,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
  AdminTableEmpty,
  AdminStatCard,
} from "@/components/admin";
import { Filter as FunnelIcon, RefreshCw, TrendingDown, Smartphone, Monitor, Tablet, Globe } from "lucide-react";
import { subDays, subHours, formatDistanceToNow } from "date-fns";

type TimeRange = "24h" | "7d" | "30d";

const STEP_LABELS: Record<string, string> = {
  landing: "Landing",
  tickets: "Tickets View",
  ticket_selected: "Ticket Selected",
  checkout_addons_view: "Add-ons Step",
  checkout_lodging_view: "Lodging Step",
  checkout_review_view: "Cart Review",
  checkout_start: "Checkout Start",
  checkout_submit: "Submit Payment",
  checkout_complete: "Stripe Session",
  payment_redirect: "Redirected to Stripe",
  payment_success: "Payment Success",
  payment_failed: "Payment Failed",
};

const FUNNEL_ORDER = [
  "landing",
  "tickets",
  "ticket_selected",
  "checkout_addons_view",
  "checkout_lodging_view",
  "checkout_review_view",
  "checkout_start",
  "checkout_submit",
  "checkout_complete",
  "payment_redirect",
  "payment_success",
];

const DEBUG_STEP_FILTERS = [
  { id: "tickets", label: "Tickets", step: "tickets" },
  { id: "addons", label: "Add-ons", step: "checkout_addons_view" },
  { id: "review", label: "Review", step: "checkout_review_view" },
  { id: "redirect", label: "Stripe Redirect", step: "payment_redirect" },
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectMetadataKeys(value: unknown, prefix = ""): string[] {
  const record = asRecord(value);
  if (!record) return [];

  return Object.entries(record).flatMap(([key, nestedValue]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    return [nextKey, ...collectMetadataKeys(nestedValue, nextKey)];
  });
}

interface FunnelEventRow {
  session_id: string;
  step: string;
  step_index: number;
  source_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  landing_page: string | null;
  device_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function rangeToCutoff(range: TimeRange): Date {
  if (range === "24h") return subHours(new Date(), 24);
  if (range === "7d") return subDays(new Date(), 7);
  return subDays(new Date(), 30);
}

function deviceIcon(d: string | null) {
  if (d === "mobile") return <Smartphone className="h-3.5 w-3.5" />;
  if (d === "tablet") return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export default function FunnelDashboard() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [selectedDebugSteps, setSelectedDebugSteps] = useState<Array<(typeof DEBUG_STEP_FILTERS)[number]["id"]>>([]);
  const [metadataKeySearch, setMetadataKeySearch] = useState("");

  const toggleDebugStep = (stepId: (typeof DEBUG_STEP_FILTERS)[number]["id"]) => {
    setSelectedDebugSteps((current) =>
      current.includes(stepId)
        ? current.filter((id) => id !== stepId)
        : [...current, stepId]
    );
  };

  const { data: events = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["funnel-events", range],
    queryFn: async () => {
      const cutoff = rangeToCutoff(range);
      const { data, error } = await supabase
        .from("funnel_events")
        .select("session_id,step,step_index,source_path,utm_source,utm_medium,utm_campaign,referrer,landing_page,device_type,metadata,created_at")
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as FunnelEventRow[];
    },
  });

  const filteredEvents = useMemo(() => {
    const activeSteps: string[] = DEBUG_STEP_FILTERS
      .filter((option) => selectedDebugSteps.includes(option.id))
      .map((option) => option.step);
    const normalizedMetadataQuery = metadataKeySearch.trim().toLowerCase();

    return events.filter((event) => {
      const matchesStep = activeSteps.length === 0 || activeSteps.includes(event.step);
      if (!matchesStep) return false;

      if (!normalizedMetadataQuery) return true;

      const metadataKeys = collectMetadataKeys(event.metadata).map((key) => key.toLowerCase());
      return metadataKeys.some((key) => key.includes(normalizedMetadataQuery));
    });
  }, [events, metadataKeySearch, selectedDebugSteps]);

  // Aggregate by session: track furthest step + first metadata
  const sessions = useMemo(() => {
    const map = new Map<string, {
      sessionId: string;
      reached: Set<string>;
      landing: string | null;
      device: string | null;
      referrer: string | null;
      utm_source: string | null;
      utm_campaign: string | null;
      lastEventAt: string;
    }>();
    for (const e of filteredEvents) {
      const s = map.get(e.session_id) ?? {
        sessionId: e.session_id,
        reached: new Set<string>(),
        landing: e.landing_page,
        device: e.device_type,
        referrer: e.referrer,
        utm_source: e.utm_source,
        utm_campaign: e.utm_campaign,
        lastEventAt: e.created_at,
      };
      s.reached.add(e.step);
      s.landing = s.landing ?? e.landing_page;
      s.device = s.device ?? e.device_type;
      s.referrer = s.referrer ?? e.referrer;
      s.utm_source = s.utm_source ?? e.utm_source;
      s.utm_campaign = s.utm_campaign ?? e.utm_campaign;
      s.lastEventAt = e.created_at;
      map.set(e.session_id, s);
    }
    return Array.from(map.values());
  }, [filteredEvents]);

  // Funnel step counts (any session that reached that step)
  const stepCounts = useMemo(() => {
    const visibleSteps: string[] = DEBUG_STEP_FILTERS
      .filter((option) => selectedDebugSteps.length === 0 || selectedDebugSteps.includes(option.id))
      .map((option) => option.step);

    return FUNNEL_ORDER
      .filter((step) => visibleSteps.length === 0 || visibleSteps.includes(step))
      .map((step) => ({
      step,
      label: STEP_LABELS[step] ?? step,
      count: sessions.filter((s) => s.reached.has(step)).length,
    }));
  }, [selectedDebugSteps, sessions]);

  const top = stepCounts[0]?.count || 0;

  // Group by landing page
  const byLanding = useMemo(() => {
    const m = new Map<string, { total: number; converted: number }>();
    for (const s of sessions) {
      const key = s.landing || "(unknown)";
      const cur = m.get(key) ?? { total: 0, converted: 0 };
      cur.total += 1;
      if (s.reached.has("payment_success")) cur.converted += 1;
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .map(([landing, v]) => ({ landing, ...v, rate: v.total ? (v.converted / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [sessions]);

  // Group by referrer (host only)
  const byReferrer = useMemo(() => {
    const m = new Map<string, { total: number; converted: number }>();
    for (const s of sessions) {
      let host = "(direct)";
      if (s.referrer) {
        try {
          host = new URL(s.referrer).hostname.replace(/^www\./, "");
        } catch {
          host = s.referrer.slice(0, 60);
        }
      } else if (s.utm_source) {
        host = `utm:${s.utm_source}`;
      }
      const cur = m.get(host) ?? { total: 0, converted: 0 };
      cur.total += 1;
      if (s.reached.has("payment_success")) cur.converted += 1;
      m.set(host, cur);
    }
    return Array.from(m.entries())
      .map(([source, v]) => ({ source, ...v, rate: v.total ? (v.converted / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [sessions]);

  // Device breakdown
  const byDevice = useMemo(() => {
    const m = new Map<string, { total: number; converted: number }>();
    for (const s of sessions) {
      const key = s.device || "unknown";
      const cur = m.get(key) ?? { total: 0, converted: 0 };
      cur.total += 1;
      if (s.reached.has("payment_success")) cur.converted += 1;
      m.set(key, cur);
    }
    return Array.from(m.entries()).map(([device, v]) => ({ device, ...v, rate: v.total ? (v.converted / v.total) * 100 : 0 }));
  }, [sessions]);

  const overallConv = sessions.length
    ? (sessions.filter((s) => s.reached.has("payment_success")).length / sessions.length) * 100
    : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <AdminPageHeader
        title="Conversion Funnel"
        subtitle="Step-by-step drop-off analysis from landing to purchase"
        icon={FunnelIcon}
        actions={
          <>
            <AdminTabs value={range} onValueChange={(v) => setRange(v as TimeRange)}>
              <AdminTabsList>
                <AdminTabsTrigger value="24h">24h</AdminTabsTrigger>
                <AdminTabsTrigger value="7d">7d</AdminTabsTrigger>
                <AdminTabsTrigger value="30d">30d</AdminTabsTrigger>
              </AdminTabsList>
            </AdminTabs>
            <AdminButton variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </AdminButton>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AdminStatCard title="Sessions" value={sessions.length.toLocaleString()} />
        <AdminStatCard title="Conversions" value={sessions.filter((s) => s.reached.has("payment_success")).length.toLocaleString()} />
        <AdminStatCard title="Conversion Rate" value={`${overallConv.toFixed(2)}%`} />
        <AdminStatCard title="Total Events" value={filteredEvents.length.toLocaleString()} />
      </div>

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4" /> Funnel Debugger Filters
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">
              Steps
            </div>
            <div className="flex flex-wrap gap-2">
              {DEBUG_STEP_FILTERS.map((option) => {
                const isActive = selectedDebugSteps.includes(option.id);
                return (
                  <AdminButton
                    key={option.id}
                    variant={isActive ? "admin" : "outline"}
                    size="sm"
                    onClick={() => toggleDebugStep(option.id)}
                  >
                    {option.label}
                  </AdminButton>
                );
              })}
              {selectedDebugSteps.length > 0 ? (
                <AdminButton variant="ghost" size="sm" onClick={() => setSelectedDebugSteps([])}>
                  Clear
                </AdminButton>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--admin-text-subtle))]">
              Event metadata key search
            </div>
            <AdminInput
              value={metadataKeySearch}
              onChange={(event) => setMetadataKeySearch(event.target.value)}
              placeholder="Search metadata keys like flow, stripe_session_id, payment_intent_last_error"
            />
            <div className="text-xs text-[hsl(var(--admin-text-muted))]">
              Matches nested keys too, such as payment_intent_last_error.code.
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> Funnel Drop-off
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          {isLoading ? (
            <div className="text-sm text-[hsl(var(--admin-text-secondary))]">Loading…</div>
          ) : (
            <div className="space-y-3">
              {stepCounts.map((s, i) => {
                const widthPct = top ? (s.count / top) * 100 : 0;
                const prev = i > 0 ? stepCounts[i - 1].count : s.count;
                const dropPct = prev ? ((prev - s.count) / prev) * 100 : 0;
                const conversionPct = top ? (s.count / top) * 100 : 0;
                return (
                  <div key={s.step} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[hsl(var(--admin-text))]">
                        {i + 1}. {s.label}
                      </span>
                      <div className="flex items-center gap-3 text-xs text-[hsl(var(--admin-text-secondary))]">
                        <span>{s.count.toLocaleString()} sessions</span>
                        <span>{conversionPct.toFixed(1)}% of top</span>
                        {i > 0 && dropPct > 0 && (
                          <AdminBadge>−{dropPct.toFixed(1)}%</AdminBadge>
                        )}
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-[hsl(var(--admin-bg-subtle))] overflow-hidden">
                      <div
                        className="h-full bg-[hsl(var(--admin-accent))] transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AdminCardContent>
      </AdminCard>

      <AdminTabs defaultValue="referrer">
        <AdminTabsList>
          <AdminTabsTrigger value="referrer">By Referrer</AdminTabsTrigger>
          <AdminTabsTrigger value="landing">By Landing Page</AdminTabsTrigger>
          <AdminTabsTrigger value="device">By Device</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="referrer">
          <AdminCard>
            <AdminCardContent className="p-0">
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    <AdminTableHead>Source</AdminTableHead>
                    <AdminTableHead className="text-right">Sessions</AdminTableHead>
                    <AdminTableHead className="text-right">Converted</AdminTableHead>
                    <AdminTableHead className="text-right">Rate</AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {byReferrer.length === 0 ? (
                    <AdminTableEmpty title="No data" />
                  ) : (
                    byReferrer.map((r) => (
                      <AdminTableRow key={r.source}>
                        <AdminTableCell>
                          <span className="inline-flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 opacity-60" />
                            {r.source}
                          </span>
                        </AdminTableCell>
                        <AdminTableCell className="text-right">{r.total}</AdminTableCell>
                        <AdminTableCell className="text-right">{r.converted}</AdminTableCell>
                        <AdminTableCell className="text-right">{r.rate.toFixed(1)}%</AdminTableCell>
                      </AdminTableRow>
                    ))
                  )}
                </AdminTableBody>
              </AdminTable>
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        <AdminTabsContent value="landing">
          <AdminCard>
            <AdminCardContent className="p-0">
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    <AdminTableHead>Landing Page</AdminTableHead>
                    <AdminTableHead className="text-right">Sessions</AdminTableHead>
                    <AdminTableHead className="text-right">Converted</AdminTableHead>
                    <AdminTableHead className="text-right">Rate</AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {byLanding.length === 0 ? (
                    <AdminTableEmpty title="No data" />
                  ) : (
                    byLanding.map((r) => (
                      <AdminTableRow key={r.landing}>
                        <AdminTableCell className="font-mono text-xs">{r.landing}</AdminTableCell>
                        <AdminTableCell className="text-right">{r.total}</AdminTableCell>
                        <AdminTableCell className="text-right">{r.converted}</AdminTableCell>
                        <AdminTableCell className="text-right">{r.rate.toFixed(1)}%</AdminTableCell>
                      </AdminTableRow>
                    ))
                  )}
                </AdminTableBody>
              </AdminTable>
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        <AdminTabsContent value="device">
          <AdminCard>
            <AdminCardContent className="p-0">
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    <AdminTableHead>Device</AdminTableHead>
                    <AdminTableHead className="text-right">Sessions</AdminTableHead>
                    <AdminTableHead className="text-right">Converted</AdminTableHead>
                    <AdminTableHead className="text-right">Rate</AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {byDevice.length === 0 ? (
                    <AdminTableEmpty title="No data" />
                  ) : (
                    byDevice.map((r) => (
                      <AdminTableRow key={r.device}>
                        <AdminTableCell>
                          <span className="inline-flex items-center gap-2 capitalize">
                            {deviceIcon(r.device)}
                            {r.device}
                          </span>
                        </AdminTableCell>
                        <AdminTableCell className="text-right">{r.total}</AdminTableCell>
                        <AdminTableCell className="text-right">{r.converted}</AdminTableCell>
                        <AdminTableCell className="text-right">{r.rate.toFixed(1)}%</AdminTableCell>
                      </AdminTableRow>
                    ))
                  )}
                </AdminTableBody>
              </AdminTable>
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>
      </AdminTabs>

      <div className="text-xs text-[hsl(var(--admin-text-secondary))]">
        Showing {filteredEvents.length.toLocaleString()} events from {sessions.length.toLocaleString()} sessions in the last {range}.
        {filteredEvents[0] && (
          <> Oldest: {formatDistanceToNow(new Date(filteredEvents[0].created_at), { addSuffix: true })}.</>
        )}
      </div>
    </div>
  );
}
