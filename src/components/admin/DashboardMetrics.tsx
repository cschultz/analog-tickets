import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "./AdminCard";
import { TrendingUp, TrendingDown, Minus, Users, DollarSign, Ticket, Calendar } from "lucide-react";
import { subDays, startOfDay, format } from "date-fns";
import { fetchEventAddonStats } from "@/lib/admin/fetchEventAddonStats";
import { getTicketShortLabel } from "@/config/ticketTypes";

interface MetricProps {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  prefix?: string;
  suffix?: string;
}

function MetricCard({ label, value, change, icon: Icon, prefix = "", suffix = "" }: MetricProps) {
  const changeDirection = change === undefined ? null : change > 0 ? "up" : change < 0 ? "down" : "neutral";
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]">
      <div className="p-2 rounded-md bg-[hsl(var(--admin-hover))]">
        <Icon className="w-4 h-4 text-[hsl(var(--admin-text-muted))]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">{label}</p>
        <p className="text-lg font-semibold text-[hsl(var(--admin-text))]">
          {prefix}{typeof value === "number" ? value.toLocaleString() : value}{suffix}
        </p>
      </div>
      {changeDirection && (
        <div className={`flex items-center gap-1 text-xs ${
          changeDirection === "up" ? "text-[hsl(var(--admin-success))]" : 
          changeDirection === "down" ? "text-[hsl(var(--admin-error))]" : 
          "text-[hsl(var(--admin-text-muted))]"
        }`}>
          {changeDirection === "up" && <TrendingUp className="w-3 h-3" />}
          {changeDirection === "down" && <TrendingDown className="w-3 h-3" />}
          {changeDirection === "neutral" && <Minus className="w-3 h-3" />}
          <span>{Math.abs(change || 0)}%</span>
        </div>
      )}
    </div>
  );
}

export function DashboardMetrics() {
  const { selectedEventId } = useAdminEvent();

  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);
  const weekAgo = subDays(today, 7);

  const fetchCombinedStats = async (sinceIso: string, untilIso?: string) => {
    let regQ = supabase
      .from("registrations")
      .select("id, total_amount, comp_upgrade_amount")
      .eq("event_id", selectedEventId!)
      .in("payment_status", ["paid", "payment_plan"])
      .gte("created_at", sinceIso);
    if (untilIso) regQ = regQ.lt("created_at", untilIso);
    const { data: regs, error: regErr } = await regQ;
    if (regErr) throw regErr;

    let lodgeQ = supabase
      .from("lodging_bookings")
      .select("id, total_amount")
      .eq("event_id", selectedEventId!)
      .eq("payment_status", "paid")
      .gte("created_at", sinceIso);
    if (untilIso) lodgeQ = lodgeQ.lt("created_at", untilIso);
    const { data: lodging, error: lodgeErr } = await lodgeQ;
    if (lodgeErr) throw lodgeErr;

    const { data: invRows } = await supabase
      .from("addon_inventory")
      .select("id")
      .eq("event_id", selectedEventId!);
    const invIds = (invRows || []).map((r: any) => r.id);
    let addons: any[] = [];
    if (invIds.length) {
      let addonQ = supabase
        .from("addon_purchases")
        .select("id, total_amount, quantity")
        .in("inventory_id", invIds)
        .eq("payment_status", "paid")
        .gte("created_at", sinceIso);
      if (untilIso) addonQ = addonQ.lt("created_at", untilIso);
      const { data: addonRows, error: addonErr } = await addonQ;
      if (addonErr) throw addonErr;
      addons = addonRows || [];
    }

    const ticketRevenue = (regs || []).reduce((s, r: any) => s + ((r.total_amount || 0) - (r.comp_upgrade_amount || 0)), 0);
    const lodgingRevenue = (lodging || []).reduce((s, r: any) => s + (r.total_amount || 0), 0);
    const addonRevenue = addons.reduce((s, r: any) => s + (r.total_amount || 0), 0);

    return {
      count: (regs?.length || 0) + (lodging?.length || 0) + addons.length,
      revenue: ticketRevenue + lodgingRevenue + addonRevenue,
      ticketCount: regs?.length || 0,
      ticketRevenue,
      lodgingCount: lodging?.length || 0,
      lodgingRevenue,
      addonCount: addons.length,
      addonRevenue,
    };
  };

  const { data: todayStats } = useAuthQuery({
    queryKey: ["dashboard-metrics-today-combined", selectedEventId],
    queryFn: () => fetchCombinedStats(today.toISOString()),
    enabled: !!selectedEventId,
    staleTime: 60 * 1000,
  });

  const { data: yesterdayStats } = useAuthQuery({
    queryKey: ["dashboard-metrics-yesterday-combined", selectedEventId],
    queryFn: () => fetchCombinedStats(yesterday.toISOString(), today.toISOString()),
    enabled: !!selectedEventId,
    staleTime: 60 * 1000,
  });

  const { data: weekStats } = useAuthQuery({
    queryKey: ["dashboard-metrics-week", selectedEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, total_amount, comp_upgrade_amount")
        .eq("event_id", selectedEventId!)
        .in("payment_status", ["paid", "payment_plan"])
        .gte("created_at", weekAgo.toISOString());

      if (error) throw error;
      return {
        count: data?.length || 0,
        revenue: data?.reduce((sum, r: any) => sum + ((r.total_amount || 0) - (r.comp_upgrade_amount || 0)), 0) || 0,
      };
    },
    enabled: !!selectedEventId,
    staleTime: 60 * 1000,
  });

  const { data: ticketBreakdown } = useAuthQuery({
    queryKey: ["dashboard-metrics-tickets-by-type", selectedEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("ticket_type")
        .eq("event_id", selectedEventId!)
        .eq("status", "active");

      if (error) throw error;
      const byType: Record<string, number> = {};
      (data || []).forEach((t: any) => {
        const k = t.ticket_type || "unknown";
        byType[k] = (byType[k] || 0) + 1;
      });
      const total = (data || []).length;
      const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
      return { total, byType: sorted };
    },
    enabled: !!selectedEventId,
    staleTime: 60 * 1000,
  });
  const ticketCount = ticketBreakdown?.total || 0;

  // Add-on revenue (all-time, paid) for the selected event
  const { data: addonStats } = useAuthQuery({
    queryKey: ["dashboard-metrics-addons", selectedEventId],
    queryFn: async () => fetchEventAddonStats(selectedEventId!),
    enabled: !!selectedEventId,
    staleTime: 60 * 1000,
  });

  const metrics = useMemo(() => {
    const salesChange = yesterdayStats?.count 
      ? Math.round(((todayStats?.count || 0) - yesterdayStats.count) / Math.max(1, yesterdayStats.count) * 100)
      : 0;
    const revenueChange = yesterdayStats?.revenue 
      ? Math.round(((todayStats?.revenue || 0) - yesterdayStats.revenue) / Math.max(1, yesterdayStats.revenue) * 100)
      : 0;

    return { salesChange, revenueChange };
  }, [todayStats, yesterdayStats]);

  return (
    <AdminCard>
      <AdminCardHeader className="pb-2">
        <AdminCardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Quick Metrics — {format(today, "MMM d")}
        </AdminCardTitle>
      </AdminCardHeader>
      <AdminCardContent className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Today's Transactions"
          value={todayStats?.count || 0}
          change={metrics.salesChange}
          icon={Users}
        />
        <MetricCard
          label="Today's Revenue (all)"
          value={(todayStats?.revenue || 0) / 100}
          change={metrics.revenueChange}
          icon={DollarSign}
          prefix="$"
        />
        <MetricCard
          label="Today's Lodging"
          value={(todayStats?.lodgingRevenue || 0) / 100}
          icon={DollarSign}
          prefix="$"
          suffix={todayStats?.lodgingCount ? ` (${todayStats.lodgingCount})` : ""}
        />
        <MetricCard
          label="Today's Add-ons"
          value={(todayStats?.addonRevenue || 0) / 100}
          icon={DollarSign}
          prefix="$"
          suffix={todayStats?.addonCount ? ` (${todayStats.addonCount})` : ""}
        />
        <MetricCard
          label="This Week"
          value={weekStats?.count || 0}
          icon={TrendingUp}
          suffix=" orders"
        />
        <MetricCard
          label="Active Tickets"
          value={ticketCount || 0}
          icon={Ticket}
        />
        <MetricCard
          label="Add-on Revenue (all-time)"
          value={(addonStats?.revenue || 0) / 100}
          icon={DollarSign}
          prefix="$"
          suffix={addonStats?.count ? ` (${addonStats.count})` : ""}
        />
      </AdminCardContent>
      {ticketBreakdown && ticketBreakdown.byType.length > 0 && (
        <AdminCardContent className="border-t border-[hsl(var(--admin-border))] pt-3">
          <p className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] mb-2">
            Tickets sold by type ({ticketBreakdown.total} people)
          </p>
          <div className="flex flex-wrap gap-2">
            {ticketBreakdown.byType.map(([type, count]) => (
              <div
                key={type}
                className="px-2.5 py-1 rounded-md bg-[hsl(var(--admin-hover))] border border-[hsl(var(--admin-border))] text-xs"
              >
                <span className="text-[hsl(var(--admin-text-muted))]">{getTicketShortLabel(type)}</span>
                <span className="ml-1.5 font-semibold text-[hsl(var(--admin-text))]">{count}</span>
              </div>
            ))}
          </div>
        </AdminCardContent>
      )}
    </AdminCard>
  );
}
