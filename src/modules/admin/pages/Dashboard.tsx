import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardHeader, 
  AdminCardTitle,
} from "@/components/admin/AdminCard";
import { AnimatedStatCard } from "@/components/admin/AnimatedStatCard";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { AdminBadge } from "@/components/admin/AdminUI";
import { DollarSign, Ticket, Users, TrendingUp, Heart, LayoutDashboard, Gift, Clock, CheckCircle, XCircle, Home, ShoppingCart } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CapacityTracker } from "@/components/CapacityTracker";
import { CheckInStatistics } from "@/components/CheckInStatistics";
import { RegistrationTimeline } from "@/components/RegistrationTimeline";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { Link, useNavigate } from "react-router-dom";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { MetaAudienceSync } from "@/components/admin/MetaAudienceSync";
import { StripePaymentHealthWidget } from "@/components/admin/StripePaymentHealthWidget";
import { fetchEventAddonStats } from "@/lib/admin/fetchEventAddonStats";

interface Registration {
  id: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  donation_amount?: number;
  payment_status: string;
  created_at: string;
  checked_in: boolean | null;
  plus_one_name: string | null;
  event_id: string;
}

// Custom tooltip component for a cleaner look
const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[hsl(var(--admin-surface))]/95 backdrop-blur-sm border border-[hsl(var(--admin-border))] rounded-lg shadow-lg px-3 py-2">
        {label && <p className="text-xs text-[hsl(var(--admin-text-muted))] mb-1">{label}</p>}
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.name}: {formatter ? formatter(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-medium"
      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { selectedEventId, selectedEvent, isLoading: eventLoading } = useAdminEvent();

  // Only enable queries when user is authenticated
  const isAuthenticated = !!user && !authLoading;

  // Use the selected event from useAdminEvent (consistent with other admin pages)
  const activeEvent = selectedEvent;
  const eventId = selectedEventId;

  // Use optimized event_sales_summary view with robust error handling
  const { data: salesSummary, isLoading: salesLoading, isError: salesError, refetch: refetchSales } = useAuthQuery({
    queryKey: ["dashboard-sales-summary", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sales_summary")
        .select("*")
        .eq("event_id", eventId!)
        .maybeSingle();
      if (error) {
        console.error("Error fetching sales summary:", error);
        throw error;
      }
      return data;
    },
    enabled: isAuthenticated && !!eventId,
    staleTime: 30 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  // Use optimized capacity_tracker view with robust error handling
  const { data: capacityData } = useAuthQuery({
    queryKey: ["dashboard-capacity", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capacity_tracker")
        .select("*")
        .eq("event_id", eventId!)
        .maybeSingle();
      if (error) {
        console.error("Error fetching capacity:", error);
        throw error;
      }
      return data;
    },
    enabled: isAuthenticated && !!eventId,
    staleTime: 30 * 1000,
    retry: 3,
  });

  // Fetch actual ticket count from tickets table
  const { data: ticketCount } = useAuthQuery({
    queryKey: ["dashboard-tickets-count", eventId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId!);
      if (error) {
        console.error("Error fetching ticket count:", error);
        throw error;
      }
      return count || 0;
    },
    enabled: isAuthenticated && !!eventId,
    staleTime: 30 * 1000,
    retry: 3,
  });

  // Fetch today's sales count (registrations + add-on purchases)
  const { data: todaySales } = useAuthQuery({
    queryKey: ["dashboard-today-sales", eventId],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [regsRes, addonsRes, lodgingRes] = await Promise.all([
        supabase
          .from("registrations")
          .select("id, total_amount, quantity")
          .eq("event_id", eventId!)
          .eq("payment_status", "paid")
          .gte("created_at", todayStart.toISOString()),
        supabase
          .from("addon_purchases")
          .select("id, total_amount, quantity")
          .eq("payment_status", "paid")
          .gte("created_at", todayStart.toISOString()),
        supabase
          .from("lodging_bookings")
          .select("id, total_amount, quantity")
          .eq("payment_status", "paid")
          .gte("created_at", todayStart.toISOString()),
      ]);

      if (regsRes.error) throw regsRes.error;
      if (addonsRes.error) throw addonsRes.error;
      if (lodgingRes.error) throw lodgingRes.error;

      const regs = regsRes.data || [];
      const addons = addonsRes.data || [];
      const lodging = lodgingRes.data || [];

      return {
        count: regs.reduce((sum, r) => sum + (r.quantity || 1), 0),
        revenue:
          regs.reduce((sum, r) => sum + (r.total_amount || 0), 0) +
          addons.reduce((sum, a) => sum + (a.total_amount || 0), 0) +
          lodging.reduce((sum, l) => sum + (l.total_amount || 0), 0),
        orders: regs.length + addons.length + lodging.length,
        addonCount: addons.reduce((sum, a) => sum + (a.quantity || 1), 0),
        addonRevenue: addons.reduce((sum, a) => sum + (a.total_amount || 0), 0),
        lodgingCount: lodging.reduce((sum, l) => sum + (l.quantity || 1), 0),
        lodgingRevenue: lodging.reduce((sum, l) => sum + (l.total_amount || 0), 0),
      };
    },
    enabled: isAuthenticated && !!eventId,
    staleTime: 30 * 1000,
    retry: 3,
  });

  // Fetch registrations for active event (still needed for charts)
  const { data: registrationsData, isLoading } = useAuthQuery({
    queryKey: ["dashboard-registrations", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .eq("event_id", eventId!)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching registrations:", error);
        throw error;
      }
      return data as Registration[];
    },
    enabled: isAuthenticated && !!eventId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 3,
  });

  // Fetch custom offers for active event
  const { data: offersData } = useAuthQuery({
    queryKey: ["dashboard-offers", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_offers")
        .select("id, status, total_amount, expires_at")
        .eq("event_id", eventId!);
      if (error) {
        console.error("Error fetching offers:", error);
        throw error;
      }
      return data;
    },
    enabled: isAuthenticated && !!eventId,
    staleTime: 60 * 1000, // 1 minute
    retry: 3,
  });

  // Fetch lodging bookings for dashboard stats
  const { data: lodgingData } = useAuthQuery({
    queryKey: ["dashboard-lodging", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_bookings")
        .select("id, total_amount, payment_status")
        .eq("event_id", eventId!)
        .eq("payment_status", "paid");
      if (error) {
        console.error("Error fetching lodging bookings:", error);
        throw error;
      }
      return data;
    },
    enabled: isAuthenticated && !!eventId,
    staleTime: 30 * 1000,
    retry: 3,
  });

  // Fetch add-on purchases revenue for this event
  const { data: addonStats } = useAuthQuery({
    queryKey: ["dashboard-addon-revenue", eventId],
    queryFn: async () => fetchEventAddonStats(eventId!),
    enabled: isAuthenticated && !!eventId,
    staleTime: 30 * 1000,
    retry: 3,
  });

  const lodgingStats = useMemo(() => {
    if (!lodgingData) return { revenue: 0, bookings: 0 };
    return {
      revenue: lodgingData.reduce((sum, b) => sum + (b.total_amount || 0), 0),
      bookings: lodgingData.length,
    };
  }, [lodgingData]);

  const offerStats = useMemo(() => {
    if (!offersData) return { pending: 0, accepted: 0, expired: 0, total: 0, pendingValue: 0, acceptedValue: 0 };
    
    const now = new Date();
    const pending = offersData.filter(o => o.status === "pending" && new Date(o.expires_at) > now);
    const accepted = offersData.filter(o => o.status === "accepted");
    const expired = offersData.filter(o => o.status === "expired" || (o.status === "pending" && new Date(o.expires_at) <= now));
    
    return {
      pending: pending.length,
      accepted: accepted.length,
      expired: expired.length,
      total: offersData.length,
      pendingValue: pending.reduce((sum, o) => sum + o.total_amount, 0),
      acceptedValue: accepted.reduce((sum, o) => sum + o.total_amount, 0),
    };
  }, [offersData]);

  // Use registrationsData directly in useMemo - no need for separate state

  // Real-time updates for registrations - removed as it's not needed with staleTime
  // React Query handles caching efficiently

  const stats = useMemo(() => {
    // Use actual ticket count from tickets table
    const totalTickets = ticketCount || 0;
    
    // Debug logging - enable with localStorage.setItem('DEBUG', 'true')
    if (localStorage.getItem('DEBUG') === 'true') {
      console.log("[Dashboard Stats Debug]", {
        eventId,
        salesSummary,
        ticketCount,
        registrationsDataLength: registrationsData?.length,
      });
    }
    
    // Prefer optimized view data when available
    if (salesSummary) {
      const totalRevenue = Number(salesSummary.total_revenue) || 0;
      const totalDonations = Number(salesSummary.total_donations) || 0;
      const ticketRevenue = totalRevenue - totalDonations;
      const totalAttendees = totalTickets;
      const checkedInCount = Number(salesSummary.checked_in_count) || 0;
      const checkInRate = totalAttendees > 0 ? ((checkedInCount / totalAttendees) * 100).toFixed(1) : "0";

      // debug log removed - enable DEBUG in localStorage to restore

      return {
        totalRevenue,
        ticketRevenue,
        totalDonations,
        totalTickets,
        totalAttendees,
        checkInRate
      };
    }

    // Fallback to computing from registrations
    const regs = registrationsData || [];
    const paidRegistrations = regs.filter(r => r.payment_status === "paid");
    
    // debug log removed - enable DEBUG in localStorage to restore
    
    const totalRevenue = paidRegistrations.reduce((sum, reg) => sum + reg.total_amount, 0);
    const totalDonations = paidRegistrations.reduce((sum, reg) => sum + (reg.donation_amount || 0), 0);
    const ticketRevenue = totalRevenue - totalDonations;
    const totalAttendees = totalTickets;
    const checkedInCount = paidRegistrations.filter(r => r.checked_in).length;
    const checkInRate = totalAttendees > 0 ? ((checkedInCount / totalAttendees) * 100).toFixed(1) : "0";

    return {
      totalRevenue,
      ticketRevenue,
      totalDonations,
      totalTickets,
      totalAttendees,
      checkInRate
    };
  }, [salesSummary, registrationsData, ticketCount]);

  const ticketTypeData = useMemo(() => {
    const regs = registrationsData || [];
    const paidRegs = regs.filter(r => r.payment_status === "paid");
    const grouped = paidRegs.reduce((acc, reg) => {
      const type = reg.ticket_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      acc[type] = (acc[type] || 0) + (reg.quantity || 1);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [registrationsData]);

  const revenueByType = useMemo(() => {
    const regs = registrationsData || [];
    const paidRegs = regs.filter(r => r.payment_status === "paid");
    const grouped = paidRegs.reduce((acc, reg) => {
      const type = reg.ticket_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      acc[type] = (acc[type] || 0) + reg.total_amount;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, revenue]) => ({
      name,
      revenue: revenue / 100
    }));
  }, [registrationsData]);

  // Modern gradient colors
  const CHART_COLORS = [
    'hsl(221, 83%, 53%)', // blue
    'hsl(262, 83%, 58%)', // purple
    'hsl(173, 58%, 39%)', // teal
    'hsl(43, 96%, 56%)',  // amber
  ];

  if (authLoading || eventLoading || !eventId || isLoading || salesLoading || !activeEvent) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Notion-style Page Header */}
      <AdminPageHeader
        title="Dashboard"
        subtitle={`${activeEvent.title} • ${new Date(activeEvent.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: "America/Los_Angeles" })}`}
        icon={LayoutDashboard}
      />

      {/* Today's Sales Banner */}
      {todaySales && todaySales.orders > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[hsl(var(--admin-success)/0.3)] bg-[hsl(var(--admin-success)/0.08)]">
          <ShoppingCart className="h-5 w-5 text-[hsl(var(--admin-success))] shrink-0" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-sm font-semibold text-[hsl(var(--admin-text))]">
              Today: <span className="text-[hsl(var(--admin-success))]">{todaySales.count} ticket{todaySales.count !== 1 ? 's' : ''}</span> sold
              {todaySales.addonCount > 0 && (
                <> + <span className="text-[hsl(var(--admin-success))]">{todaySales.addonCount} add-on{todaySales.addonCount !== 1 ? 's' : ''}</span></>
              )}
              {todaySales.lodgingCount > 0 && (
                <> + <span className="text-[hsl(var(--admin-success))]">{todaySales.lodgingCount} lodging</span></>
              )}
            </span>
            <span className="text-sm text-[hsl(var(--admin-text-muted))]">
              ${(todaySales.revenue / 100).toLocaleString()} from {todaySales.orders} order{todaySales.orders !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Stat Cards - Now with animations */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
        <AnimatedStatCard
          label="Total Revenue"
          value={(stats.ticketRevenue + stats.totalDonations + lodgingStats.revenue + (addonStats?.revenue || 0)) / 100}
          prefix="$"
          icon={DollarSign}
          formatValue={(v) => v.toLocaleString()}
          onClick={() => navigate("/admin/sales")}
        />
        <AnimatedStatCard
          label="Ticket Sales"
          value={stats.ticketRevenue / 100}
          prefix="$"
          icon={Ticket}
          formatValue={(v) => v.toLocaleString()}
          onClick={() => navigate("/admin/sales")}
        />
        <AnimatedStatCard
          label="Lodging"
          value={lodgingStats.revenue / 100}
          prefix="$"
          icon={Home}
          formatValue={(v) => v.toLocaleString()}
          onClick={() => navigate("/admin/lodging")}
        />
        <AnimatedStatCard
          label="Add-ons"
          value={(addonStats?.revenue || 0) / 100}
          prefix="$"
          icon={ShoppingCart}
          formatValue={(v) => v.toLocaleString()}
          onClick={() => navigate("/admin/sales")}
        />
        <AnimatedStatCard
          label="Donations"
          value={stats.totalDonations / 100}
          prefix="$"
          icon={Heart}
          formatValue={(v) => v.toLocaleString()}
        />
        <AnimatedStatCard
          label="Tickets Sold"
          value={stats.totalAttendees}
          icon={Users}
          onClick={() => navigate("/admin/registrations")}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <AdminCard>
          <AdminCardHeader>
            <AdminCardTitle>Ticket Distribution</AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            {ticketTypeData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-[hsl(var(--admin-text-muted))] text-sm">
                No ticket sales yet
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={ticketTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={CustomPieLabel}
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {ticketTypeData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                          className="drop-shadow-sm"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<CustomTooltip formatter={(v: number) => `${v} tickets`} />}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-4 -mt-4">
                  {ticketTypeData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="text-xs text-[hsl(var(--admin-text-muted))]">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader>
            <AdminCardTitle>Revenue by Type</AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            {revenueByType.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-[hsl(var(--admin-text-muted))] text-sm">
                No revenue yet
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={revenueByType} 
                    layout="vertical"
                    margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
                    barCategoryGap="20%"
                  >
                    <XAxis 
                      type="number" 
                      tickFormatter={(v) => `$${v.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--admin-text-muted))' }}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--admin-text))' }}
                      width={100}
                    />
                    <Tooltip
                      content={<CustomTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />}
                      cursor={{ fill: 'hsl(var(--admin-hover))' }}
                    />
                    <Bar 
                      dataKey="revenue" 
                      fill="hsl(var(--admin-primary))"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </AdminCardContent>
        </AdminCard>
      </div>

      <StripePaymentHealthWidget />

      {/* Bottom Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <CapacityTracker eventId={eventId} />
        <CheckInStatistics registrations={registrationsData || []} />
        <RegistrationTimeline registrations={registrationsData || []} view="daily" />
        
        {/* Custom Offers Stats */}
        <AdminCard>
          <AdminCardHeader
            icon={Gift}
            action={
              <Link to="/admin/offers" className="text-xs text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))] hover:underline">
                View all
              </Link>
            }
          >
            <AdminCardTitle>Custom Offers</AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
                <span className="text-sm">Pending</span>
              </div>
              <div className="text-right">
                <AdminBadge intent="warning">
                  {offerStats.pending}
                </AdminBadge>
                {offerStats.pendingValue > 0 && (
                  <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-0.5">
                    ${(offerStats.pendingValue / 100).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[hsl(var(--admin-success))]" />
                <span className="text-sm">Accepted</span>
              </div>
              <div className="text-right">
                <AdminBadge intent="success">
                  {offerStats.accepted}
                </AdminBadge>
                {offerStats.acceptedValue > 0 && (
                  <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-0.5">
                    ${(offerStats.acceptedValue / 100).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-[hsl(var(--admin-text-subtle))]" />
                <span className="text-sm">Expired</span>
              </div>
              <AdminBadge intent="neutral">
                {offerStats.expired}
              </AdminBadge>
            </div>
            
            {offerStats.total === 0 && (
              <p className="text-xs text-[hsl(var(--admin-text-muted))] text-center py-2">
                No custom offers created yet
              </p>
            )}
          </AdminCardContent>
        </AdminCard>
        
        {/* Meta Audience Sync */}
        <MetaAudienceSync />
        
        {/* Activity Feed */}
        <AdminCard className="lg:row-span-1">
          <ActivityFeed 
            eventId={eventId} 
            limit={10}
            onItemClick={(item) => {
              if (item.entityId && item.entityType) {
                navigate(`/admin/${item.entityType}s/${item.entityId}`);
              }
            }}
          />
        </AdminCard>
      </div>
    </div>
  );
}
