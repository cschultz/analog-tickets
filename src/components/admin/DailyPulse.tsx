import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminStatCard,
} from "@/components/admin/AdminCard";
import { AdminBadge } from "@/components/admin";
import {
  Activity,
  Ticket,
  Package,
  Gift,
  AlertCircle,
  UserPlus,
  ShoppingCart,
} from "lucide-react";

// Today's window in America/Los_Angeles, returned as ISO timestamps
const getTodayPTRange = () => {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ptDate = fmt.format(now); // YYYY-MM-DD
  // PT is UTC-7 (PDT) in May; use the offset string so range is exact at the wall clock
  const start = new Date(`${ptDate}T00:00:00-07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString(), label: ptDate };
};

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents || 0) / 100,
  );

// Normalize a UTM source / referrer pair into a friendly channel label.
const SOURCE_ALIASES: Record<string, string> = {
  ig: "Instagram",
  instagram: "Instagram",
  fb: "Facebook",
  facebook: "Facebook",
  "facebook.com": "Facebook",
  th: "Threads",
  threads: "Threads",
  google: "Google",
  google_ads: "Google Ads",
  googleads: "Google Ads",
  email: "Email",
  flodesk: "Email (Flodesk)",
  klaviyo: "Email (Klaviyo)",
  resend: "Email",
  sms: "SMS",
  simplytexting: "SMS",
  abandonment: "Abandonment recovery",
  abandoned_cart: "Abandonment recovery",
  recovery: "Abandonment recovery",
  promo: "Promo / popup",
  popup: "Promo / popup",
  crew: "Bring Your Crew",
  win: "Giveaway",
  giveaway: "Giveaway",
  reserve: "Reserve LP",
  go: "Go LP",
  gather: "Gather LP",
  escape: "Escape LP",
  real: "Real LP",
};

const referrerHost = (ref?: string | null) => {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    return u.hostname.replace(/^www\./, "").replace(/^m\./, "").replace(/^l\./, "");
  } catch {
    return null;
  }
};

const REFERRER_MAP: Array<[RegExp, string]> = [
  [/instagram\.com|ig\.me/i, "Instagram"],
  [/facebook\.com|fb\.com|fb\.me/i, "Facebook"],
  [/threads\.net/i, "Threads"],
  [/t\.co|twitter\.com|x\.com/i, "Twitter / X"],
  [/tiktok\.com/i, "TikTok"],
  [/youtube\.com|youtu\.be/i, "YouTube"],
  [/google\./i, "Google (organic)"],
  [/bing\.|duckduckgo\.|yahoo\./i, "Search (other)"],
  [/cosmi\.co/i, "Internal (example.org)"],
];

const classifySource = (
  utm_source?: string | null,
  utm_medium?: string | null,
  referrer?: string | null,
): { channel: string; medium: string } => {
  const src = (utm_source || "").trim().toLowerCase();
  const med = (utm_medium || "").trim().toLowerCase();
  if (src) {
    const alias = SOURCE_ALIASES[src] || src.charAt(0).toUpperCase() + src.slice(1);
    return { channel: alias, medium: med || "—" };
  }
  const host = referrerHost(referrer);
  if (host) {
    for (const [re, label] of REFERRER_MAP) {
      if (re.test(host)) return { channel: label, medium: med || "referral" };
    }
    return { channel: host, medium: med || "referral" };
  }
  return { channel: "Direct / unknown", medium: med || "direct" };
};


interface DailyPulseProps {
  eventId?: string | null;
}

const StatWithSub = ({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
}) => (
  <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-4">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">
        {label}
      </span>
      <Icon className="h-4 w-4 text-[hsl(var(--admin-text-subtle))]" />
    </div>
    <div className="mt-2 text-2xl font-semibold text-[hsl(var(--admin-text))]">{value}</div>
    {sub && (
      <p className="mt-1 text-xs text-[hsl(var(--admin-text-muted))]">{sub}</p>
    )}
  </div>
);

export const DailyPulse = ({ eventId }: DailyPulseProps) => {
  const { startISO, endISO, label } = useMemo(() => getTodayPTRange(), []);

  const { data, isLoading } = useAuthQuery({
    queryKey: ["daily-pulse", startISO, eventId ?? "all"],
    queryFn: async () => {
      // Registrations today (paid + payment_plan)
      let regsQuery = supabase
        .from("registrations")
        .select(
          "id, quantity, total_amount, payment_status, created_at, ticket_type, utm_source, utm_medium, utm_campaign",
        )
        .gte("created_at", startISO)
        .lt("created_at", endISO);
      if (eventId) regsQuery = regsQuery.eq("event_id", eventId);
      const regsRes = await regsQuery;

      const [
        raffleRes,
        addonsRes,
        funnelRes,
        abandonRes,
        errorsRes,
        newsletterRes,
      ] = await Promise.all([
        supabase
          .from("raffle_entries")
          .select("id, entries_count, donation_amount, payment_status, tier, created_at")
          .gte("created_at", startISO)
          .lt("created_at", endISO),
        supabase
          .from("addon_purchases")
          .select(
            "id, quantity, total_amount, payment_status, created_at, inventory_id, addon_inventory(display_name, addon_type)",
          )
          .gte("created_at", startISO)
          .lt("created_at", endISO),
        supabase
          .from("funnel_events")
          .select("step, session_id, created_at, utm_source, utm_medium, utm_campaign, referrer")
          .gte("created_at", startISO)
          .lt("created_at", endISO),

        supabase
          .from("checkout_abandonment")
          .select("id, email, created_at")
          .gte("created_at", startISO)
          .lt("created_at", endISO),
        supabase
          .from("checkout_errors")
          .select("id, error_type, created_at")
          .gte("created_at", startISO)
          .lt("created_at", endISO),
        supabase
          .from("newsletter_leads")
          .select("id, email, created_at")
          .gte("created_at", startISO)
          .lt("created_at", endISO),
      ]);

      return {
        regs: regsRes.data ?? [],
        raffles: raffleRes.data ?? [],
        addons: (addonsRes.data ?? []) as any[],
        funnel: funnelRes.data ?? [],
        abandons: abandonRes.data ?? [],
        errors: errorsRes.data ?? [],
        newsletter: newsletterRes.data ?? [],
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const summary = useMemo(() => {
    if (!data) return null;
    const paidRegs = data.regs.filter(
      (r: any) => r.payment_status === "paid" || r.payment_status === "payment_plan",
    );
    const ticketsToday = paidRegs.reduce((s: number, r: any) => s + (r.quantity || 0), 0);
    const ticketRevenueToday = paidRegs.reduce(
      (s: number, r: any) => s + (r.total_amount || 0),
      0,
    );

    const paidRaffles = data.raffles.filter(
      (r: any) => r.payment_status === "paid" || r.payment_status === "free",
    );
    const raffleEntries = paidRaffles.reduce(
      (s: number, r: any) => s + (r.entries_count || 0),
      0,
    );
    const raffleDonations = paidRaffles.reduce(
      (s: number, r: any) => s + (r.donation_amount || 0),
      0,
    );

    const paidAddons = data.addons.filter(
      (a: any) => a.payment_status === "paid" || a.payment_status === "comp",
    );
    const addonUnits = paidAddons.reduce((s: number, a: any) => s + (a.quantity || 0), 0);
    const addonRevenue = paidAddons.reduce(
      (s: number, a: any) => s + (a.total_amount || 0),
      0,
    );
    const addonsByType = new Map<string, { units: number; revenue: number; label: string }>();
    paidAddons.forEach((a: any) => {
      const key = a.addon_inventory?.addon_type || a.inventory_id || "unknown";
      const prev = addonsByType.get(key) || {
        units: 0,
        revenue: 0,
        label: a.addon_inventory?.display_name || key,
      };
      addonsByType.set(key, {
        label: a.addon_inventory?.display_name || prev.label,
        units: prev.units + (a.quantity || 0),
        revenue: prev.revenue + (a.total_amount || 0),
      });
    });

    // Funnel
    const stepCounts = new Map<string, { events: number; sessions: Set<string> }>();
    data.funnel.forEach((e: any) => {
      const prev = stepCounts.get(e.step) || { events: 0, sessions: new Set<string>() };
      prev.events += 1;
      if (e.session_id) prev.sessions.add(e.session_id);
      stepCounts.set(e.step, prev);
    });
    const stepOrder = [
      "tickets",
      "ticket_selected",
      "checkout_start",
      "checkout_addons_view",
      "checkout_review_view",
      "checkout_submit",
      "payment_redirect",
      "checkout_complete",
    ];
    const funnel = stepOrder
      .filter((s) => stepCounts.has(s))
      .map((step) => {
        const v = stepCounts.get(step)!;
        return { step, events: v.events, sessions: v.sessions.size };
      });
    // Add any extra steps not in our canonical order
    Array.from(stepCounts.keys())
      .filter((s) => !stepOrder.includes(s))
      .forEach((step) => {
        const v = stepCounts.get(step)!;
        funnel.push({ step, events: v.events, sessions: v.sessions.size });
      });

    const tickets = funnel.find((f) => f.step === "tickets")?.sessions || 0;
    const completes = funnel.find((f) => f.step === "checkout_complete")?.events || 0;
    const conversionRate = tickets > 0 ? (completes / tickets) * 100 : 0;

    // ===== Source breakdown =====
    // Traffic: unique sessions that hit the tickets page, grouped by channel.
    type SourceRow = {
      channel: string;
      sessions: Set<string>;
      orders: number;
      tickets: number;
      revenue: number;
      campaigns: Set<string>;
    };
    const sourceMap = new Map<string, SourceRow>();
    const ensure = (channel: string): SourceRow => {
      const prev = sourceMap.get(channel);
      if (prev) return prev;
      const row: SourceRow = {
        channel,
        sessions: new Set<string>(),
        orders: 0,
        tickets: 0,
        revenue: 0,
        campaigns: new Set<string>(),
      };
      sourceMap.set(channel, row);
      return row;
    };

    data.funnel.forEach((e: any) => {
      if (e.step !== "tickets") return;
      const { channel } = classifySource(e.utm_source, e.utm_medium, e.referrer);
      const row = ensure(channel);
      if (e.session_id) row.sessions.add(e.session_id);
      if (e.utm_campaign) row.campaigns.add(e.utm_campaign);
    });

    paidRegs.forEach((r: any) => {
      const { channel } = classifySource(r.utm_source, r.utm_medium, null);
      const row = ensure(channel);
      row.orders += 1;
      row.tickets += r.quantity || 0;
      row.revenue += r.total_amount || 0;
      if (r.utm_campaign) row.campaigns.add(r.utm_campaign);
    });

    const sources = Array.from(sourceMap.values())
      .map((s) => ({
        channel: s.channel,
        sessions: s.sessions.size,
        orders: s.orders,
        tickets: s.tickets,
        revenue: s.revenue,
        campaignCount: s.campaigns.size,
        cvr: s.sessions.size > 0 ? (s.orders / s.sessions.size) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);

    const totalSessions = sources.reduce((s, r) => s + r.sessions, 0);
    const totalSourceRevenue = sources.reduce((s, r) => s + r.revenue, 0);

    return {
      paidOrders: paidRegs.length,
      ticketsToday,
      ticketRevenueToday,
      raffleSubmissions: paidRaffles.length,
      raffleEntries,
      raffleDonations,
      addonOrders: paidAddons.length,
      addonUnits,
      addonRevenue,
      addonsByType: Array.from(addonsByType.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.units - a.units),
      funnel,
      conversionRate,
      abandons: data.abandons.length,
      errors: data.errors.length,
      newsletter: data.newsletter.length,
      sources,
      totalSessions,
      totalSourceRevenue,
    };

  }, [data]);

  if (isLoading || !summary) {
    return (
      <AdminCard>
        <AdminCardHeader icon={Activity}>
          <AdminCardTitle>Today's Pulse · {label}</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <p className="text-sm text-[hsl(var(--admin-text-muted))]">Loading today's activity…</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  const stepLabel: Record<string, string> = {
    tickets: "Visited tickets",
    ticket_selected: "Selected a ticket",
    checkout_start: "Started checkout",
    checkout_addons_view: "Viewed add-ons",
    checkout_review_view: "Reviewed order",
    checkout_submit: "Submitted",
    payment_redirect: "Sent to Stripe",
    checkout_complete: "Completed",
  };

  return (
    <AdminCard>
      <AdminCardHeader icon={Activity}>
        <AdminCardTitle className="flex items-center gap-2">
          <span>Today's Pulse</span>
          <AdminBadge intent="neutral">{label} PT</AdminBadge>
          {summary.errors > 0 && (
            <AdminBadge intent="danger">{summary.errors} checkout errors</AdminBadge>
          )}
        </AdminCardTitle>
      </AdminCardHeader>
      <AdminCardContent className="space-y-6">
        {/* Top row: today's totals */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatWithSub
            label="Tickets Sold"
            value={summary.ticketsToday}
            icon={Ticket}
            sub={`${summary.paidOrders} order${summary.paidOrders === 1 ? "" : "s"}`}
          />
          <AdminStatCard
            label="Ticket Revenue"
            value={formatCurrency(summary.ticketRevenueToday)}
            icon={ShoppingCart}
          />
          <StatWithSub
            label="Add-on Units"
            value={summary.addonUnits}
            icon={Package}
            sub={formatCurrency(summary.addonRevenue)}
          />
          <StatWithSub
            label="Raffle Entries"
            value={summary.raffleEntries}
            icon={Gift}
            sub={`${summary.raffleSubmissions} submissions · ${formatCurrency(summary.raffleDonations)}`}
          />
          <AdminStatCard
            label="Abandoned Carts"
            value={summary.abandons}
            icon={AlertCircle}
          />
          <AdminStatCard
            label="Newsletter Leads"
            value={summary.newsletter}
            icon={UserPlus}
          />
        </div>

        {/* Add-ons by type */}
        {summary.addonsByType.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] mb-2">
              Add-ons today by type
            </h4>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {summary.addonsByType.map((a) => (
                <div
                  key={a.key}
                  className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
                >
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--admin-foreground))]">
                      {a.label}
                    </p>
                    <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                      {formatCurrency(a.revenue)}
                    </p>
                  </div>
                  <span className="text-lg font-semibold text-[hsl(var(--admin-foreground))]">
                    {a.units}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Funnel */}
        {summary.funnel.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">
                Conversion funnel today
              </h4>
              <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                Visit → Purchase: <strong>{summary.conversionRate.toFixed(2)}%</strong>
              </span>
            </div>
            <div className="space-y-2">
              {(() => {
                const top = summary.funnel[0]?.sessions || 1;
                return summary.funnel.map((f) => {
                  const pct = Math.max(2, Math.round((f.sessions / top) * 100));
                  return (
                    <div key={f.step} className="flex items-center gap-3">
                      <span className="w-44 text-sm text-[hsl(var(--admin-foreground))]">
                        {stepLabel[f.step] || f.step}
                      </span>
                      <div className="flex-1 h-3 rounded bg-[hsl(var(--admin-surface))] overflow-hidden">
                        <div
                          className="h-full bg-[hsl(var(--admin-primary))]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-[hsl(var(--admin-text-muted))] w-32 text-right">
                        {f.sessions} sessions · {f.events} events
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Source / referral breakdown */}
        {summary.sources.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">
                Traffic & purchases by source
              </h4>
              <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                {summary.totalSessions} sessions · {formatCurrency(summary.totalSourceRevenue)} attributed
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--admin-border))]">
              <table className="w-full text-sm">
                <thead className="bg-[hsl(var(--admin-surface))]">
                  <tr className="text-left text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium text-right">Sessions</th>
                    <th className="px-3 py-2 font-medium text-right">Orders</th>
                    <th className="px-3 py-2 font-medium text-right">Tickets</th>
                    <th className="px-3 py-2 font-medium text-right">Revenue</th>
                    <th className="px-3 py-2 font-medium text-right">CVR</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.sources.map((s) => {
                    const sharePct =
                      summary.totalSourceRevenue > 0
                        ? (s.revenue / summary.totalSourceRevenue) * 100
                        : 0;
                    return (
                      <tr
                        key={s.channel}
                        className="border-t border-[hsl(var(--admin-border))]"
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-[hsl(var(--admin-foreground))]">
                            {s.channel}
                          </div>
                          {s.campaignCount > 0 && (
                            <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                              {s.campaignCount} campaign{s.campaignCount === 1 ? "" : "s"}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.sessions}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.orders}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.tickets}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <div>{formatCurrency(s.revenue)}</div>
                          {sharePct > 0 && (
                            <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                              {sharePct.toFixed(0)}% share
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.sessions > 0 ? `${s.cvr.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-[hsl(var(--admin-text-muted))]">
              Sessions = unique visits to the tickets page today. Orders attributed by UTM stamped on the registration. "Direct / unknown" includes typed URLs, app links, and visits without a referrer.
            </p>
          </div>
        )}

      </AdminCardContent>
    </AdminCard>
  );
};

export default DailyPulse;
