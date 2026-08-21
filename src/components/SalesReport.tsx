import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle, AdminStatCard } from "@/components/admin/AdminCard";
import {
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
  AdminTableEmpty,
  AdminBadge,
  AdminEmptyState,
} from "@/components/admin";
import { BarChart, Users, RefreshCw, Ticket, Heart, Home, CalendarClock, Package, Filter, Gift } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";

interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  quantity?: number;
  total_amount: number;
  donation_amount?: number;
  comp_upgrade_amount?: number;
  payment_status: string;
  created_at: string;
  event_id?: string;
}

interface Refund {
  id: string;
  registration_id: string;
  ticket_id: string | null;
  amount: number;
  reason: string | null;
  created_at: string;
}

interface LodgingBooking {
  id: string;
  email: string;
  zone_key: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  created_at: string;
  registration_id: string | null;
}

interface AddonPurchase {
  id: string;
  inventory_id: string;
  purchaser_email: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  payment_status: string;
  purchase_type: string;
  created_at: string;
  registration_id: string;
  display_name?: string;
  addon_type?: string;
}

interface SalesReportProps {
  registrations: Registration[];
  refunds?: Refund[];
  lodgingBookings?: LodgingBooking[];
  addonPurchases?: AddonPurchase[];
}

import { getTicketLabel, getTicketShortLabel, getTicketOrder } from "@/config/ticketTypes";

export const SalesReport = ({ registrations, refunds = [], lodgingBookings = [], addonPurchases = [] }: SalesReportProps) => {
  // ---- Filter & sort state ----
  // category: all | tickets | lodging | addons | refunds
  const [category, setCategory] = useState<string>("all");
  // typeFilter: "all" or specific ticket_type / addon key / lodging zone_key
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // sortBy: date_desc | date_asc | amount_desc | amount_asc | qty_desc | name_asc
  const [sortBy, setSortBy] = useState<string>("date_desc");

  // Reset specific-type when category changes
  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setTypeFilter("all");
  };

  // Fetch payment plan stats
  const { data: paymentPlanData } = useAuthQuery({
    queryKey: ["payment-plan-stats"],
    queryFn: async () => {
      const [enrollRes, paymentsRes] = await Promise.all([
        supabase.from("payment_plan_enrollments").select("id, total_amount, status"),
        supabase.from("scheduled_payments").select("enrollment_id, amount, status"),
      ]);
      const enrollments = enrollRes.data || [];
      const payments = paymentsRes.data || [];
      const active = enrollments.filter(e => e.status === "active");
      const completed = enrollments.filter(e => e.status === "completed");
      const defaulted = enrollments.filter(e => e.status === "defaulted");
      const allValid = [...active, ...completed];
      const totalCommitted = allValid.reduce((sum, e) => sum + (e.total_amount || 0), 0);
      const paidPayments = payments.filter(p => p.status === "paid");
      const totalCollected = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const pendingPayments = payments.filter(p => p.status === "pending" && active.some(e => e.id === p.enrollment_id));
      const totalAnticipated = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      return { activeCount: active.length, totalCommitted, totalCollected, totalAnticipated, defaultedCount: defaulted.length };
    },
    staleTime: 60 * 1000,
  });
  // Debug logging - enable with localStorage.setItem('DEBUG', 'true')
  if (localStorage.getItem('DEBUG') === 'true') {
    console.log("[SalesReport] Component mounted with:", {
      registrationsType: typeof registrations,
      registrationsIsArray: Array.isArray(registrations),
      registrationsLength: registrations?.length ?? 'undefined',
      refundsType: typeof refunds,
      refundsIsArray: Array.isArray(refunds),
      refundsLength: refunds?.length ?? 'undefined',
      lodgingBookingsLength: lodgingBookings?.length ?? 'undefined',
    });
  }

  // Defensive: ensure arrays with extra safety
  const safeRegistrations = useMemo(() => {
    if (!registrations) return [];
    if (!Array.isArray(registrations)) return [];
    return registrations.filter(r => r && typeof r === 'object');
  }, [registrations]);

  const safeRefunds = useMemo(() => {
    if (!refunds) return [];
    if (!Array.isArray(refunds)) return [];
    return refunds.filter(r => r && typeof r === 'object');
  }, [refunds]);

  const safeLodgingBookings = useMemo(() => {
    if (!lodgingBookings) return [];
    if (!Array.isArray(lodgingBookings)) return [];
    return lodgingBookings.filter(b => b && typeof b === 'object');
  }, [lodgingBookings]);

  const safeAddons = useMemo(() => {
    if (!addonPurchases) return [];
    if (!Array.isArray(addonPurchases)) return [];
    return addonPurchases.filter(a => a && typeof a === 'object');
  }, [addonPurchases]);

  // Addon revenue by type
  const { paidAddons, addonRevenue, addonsCount, addonsByType } = useMemo(() => {
    try {
      const paid = safeAddons.filter(a => a?.payment_status === 'paid' || a?.payment_status === 'completed');
      const revenue = paid.reduce((sum, a) => sum + (a?.total_amount || 0), 0);
      const count = paid.reduce((sum, a) => sum + (a?.quantity || 0), 0);

      const typeMap = new Map<string, { count: number; revenue: number; label: string }>();
      paid.forEach(a => {
        const key = a.addon_type || a.display_name || "unknown";
        const label = a.display_name || a.addon_type || "Unknown";
        const existing = typeMap.get(key) || { count: 0, revenue: 0, label };
        typeMap.set(key, {
          label,
          count: existing.count + (a.quantity || 0),
          revenue: existing.revenue + (a.total_amount || 0),
        });
      });
      const byType = Array.from(typeMap.entries()).map(([key, data]) => ({
        key,
        ...data,
      })).sort((a, b) => b.revenue - a.revenue);

      return { paidAddons: paid, addonRevenue: revenue, addonsCount: count, addonsByType: byType };
    } catch (err) {
      console.error("[SalesReport] Error calculating addon revenue:", err);
      return { paidAddons: [], addonRevenue: 0, addonsCount: 0, addonsByType: [] };
    }
  }, [safeAddons]);

  
  // Calculate refund totals per registration
  const refundsByRegistration = useMemo(() => {
    try {
      return safeRefunds.reduce((acc, refund) => {
        if (!refund?.registration_id) return acc;
        if (!acc[refund.registration_id]) {
          acc[refund.registration_id] = 0;
        }
        acc[refund.registration_id] += refund.amount || 0;
        return acc;
      }, {} as Record<string, number>);
    } catch (err) {
      console.error("[SalesReport] Error calculating refundsByRegistration:", err);
      return {};
    }
  }, [safeRefunds]);

  // Check if a registration is fully refunded
  const isFullyRefunded = (reg: Registration) => {
    if (!reg?.id) return false;
    const refundedAmount = refundsByRegistration[reg.id] || 0;
    return refundedAmount >= (reg.total_amount || 0);
  };

  // Filter registrations by status with try/catch
  const { paidRegistrations, pendingRegistrations, paymentPlanRegistrations, refundedRegistrations } = useMemo(() => {
    try {
      return {
        paidRegistrations: safeRegistrations.filter(r => (r?.payment_status === 'paid' || r?.payment_status === 'payment_plan') && !isFullyRefunded(r)),
        pendingRegistrations: safeRegistrations.filter(r => r?.payment_status === 'pending'),
        paymentPlanRegistrations: safeRegistrations.filter(r => r?.payment_status === 'payment_plan'),
        refundedRegistrations: safeRegistrations.filter(r => r?.payment_status === 'refunded' || isFullyRefunded(r)),
      };
    } catch (err) {
      console.error("[SalesReport] Error filtering registrations:", err);
      return { paidRegistrations: [], pendingRegistrations: [], paymentPlanRegistrations: [], refundedRegistrations: [] };
    }
  }, [safeRegistrations, refundsByRegistration]);
  
  // Calculate total refunds
  const totalRefunds = useMemo(() => {
    try {
      return safeRefunds.reduce((sum, r) => sum + (r?.amount || 0), 0);
    } catch (err) {
      console.error("[SalesReport] Error calculating totalRefunds:", err);
      return 0;
    }
  }, [safeRefunds]);

  // Calculate lodging revenue by zone tier
  const { paidLodgingBookings, lodgingRevenue, lodgingBookingsCount, lodgingByZone } = useMemo(() => {
    try {
      const paid = safeLodgingBookings.filter(b => b?.payment_status === 'paid');
      const revenue = paid.reduce((sum, b) => sum + (b?.total_amount || 0), 0);
      
      // Group by zone
      const zoneMap = new Map<string, { count: number; revenue: number }>();
      paid.forEach(b => {
        const zone = b.zone_key || "unknown";
        const existing = zoneMap.get(zone) || { count: 0, revenue: 0 };
        zoneMap.set(zone, { count: existing.count + 1, revenue: existing.revenue + (b.total_amount || 0) });
      });
      
      const ZONE_LABELS: Record<string, string> = {
        front_row_cabins: "Front Row Cabins",
        front_row_tents: "Front Row Tents",
        grove_tents_1q: "Grove Tents — 1 Queen",
        grove_tents_2q: "Grove Tents — 2 Queen",
        grove_tents: "Grove Tents",
      };
      
      const byZone = Array.from(zoneMap.entries()).map(([zone, data]) => ({
        zone,
        label: ZONE_LABELS[zone] || zone.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        ...data,
      })).sort((a, b) => b.revenue - a.revenue);

      return {
        paidLodgingBookings: paid,
        lodgingRevenue: revenue,
        lodgingBookingsCount: paid.length,
        lodgingByZone: byZone,
      };
    } catch (err) {
      console.error("[SalesReport] Error calculating lodging revenue:", err);
      return { paidLodgingBookings: [], lodgingRevenue: 0, lodgingBookingsCount: 0, lodgingByZone: [] };
    }
  }, [safeLodgingBookings]);

  // Fetch issued ticket rows (one per QR / attendee) from `tickets` table.
  // This is the source of truth for "people coming" and reflects upgrades & comps.
  const paidRegIds = useMemo(
    () => paidRegistrations.map(r => r.id).filter(Boolean),
    [paidRegistrations],
  );

  const { data: ticketCountsByType = {} } = useAuthQuery({
    queryKey: ["sales-report-ticket-counts", paidRegIds.sort().join(",")],
    queryFn: async () => {
      if (paidRegIds.length === 0) return {} as Record<string, number>;
      const counts: Record<string, number> = {};
      // Chunk to stay within URL limits
      const chunkSize = 200;
      for (let i = 0; i < paidRegIds.length; i += chunkSize) {
        const chunk = paidRegIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("tickets")
          .select("ticket_type")
          .eq("status", "active")
          .in("registration_id", chunk);
        if (error) throw error;
        (data || []).forEach((t: any) => {
          const k = t.ticket_type || "unknown";
          counts[k] = (counts[k] || 0) + 1;
        });
      }
      return counts;
    },
    enabled: paidRegIds.length > 0,
    staleTime: 30 * 1000,
  });

  // Get unique ticket types from registrations + issued tickets, sorted by config order
  const ticketTypes = useMemo(() => {
    try {
      const types = [...new Set([
        ...safeRegistrations.map(r => r?.ticket_type).filter(Boolean),
        ...Object.keys(ticketCountsByType),
      ])];
      return types.sort((a, b) => {
        const orderA = getTicketOrder(a) ?? 999;
        const orderB = getTicketOrder(b) ?? 999;
        return orderA - orderB;
      });
    } catch (err) {
      console.error("[SalesReport] Error getting ticketTypes:", err);
      return [];
    }
  }, [safeRegistrations, ticketCountsByType]);

  // Group registrations by ticket type
  const ticketTypeStats = useMemo(() => {
    try {
      return ticketTypes.map(type => {
        const allOfType = safeRegistrations.filter(r => r?.ticket_type === type);
        const paidOfType = paidRegistrations.filter(r => r?.ticket_type === type);
        const pendingOfType = pendingRegistrations.filter(r => r?.ticket_type === type);
        
        // paidCount = issued ticket rows of this type (one per attendee/QR).
        // Falls back to registration quantity sum if tickets table hasn't been populated yet.
        const issuedCount = ticketCountsByType[type] ?? 0;
        const fallbackQtyCount = paidOfType.reduce((sum, r) => sum + (r?.quantity || 1), 0);
        const paidCount = issuedCount > 0 ? issuedCount : fallbackQtyCount;
        const pendingCount = pendingOfType.reduce((sum, r) => sum + (r?.quantity || 1), 0);
        const grossOnRecord = paidOfType.reduce((sum, r) => sum + (r?.total_amount || 0), 0);
        const donations = paidOfType.reduce((sum, r) => sum + (r?.donation_amount || 0), 0);
        const compUpgrades = paidOfType.reduce((sum, r) => sum + (r?.comp_upgrade_amount || 0), 0);
        // Actual Stripe-collected revenue excludes comp upgrades (face value never charged)
        const totalRevenue = grossOnRecord - compUpgrades;
        const ticketRevenue = totalRevenue - donations;
        
        return {
          type,
          label: getTicketLabel(type),
          shortLabel: getTicketShortLabel(type),
          paidCount,
          pendingCount,
          revenue: totalRevenue,
          ticketRevenue,
          donations,
          compUpgrades,
          allRegistrations: allOfType,
        };
      });
    } catch (err) {
      console.error("[SalesReport] Error calculating ticketTypeStats:", err);
      return [];
    }
  }, [ticketTypes, safeRegistrations, paidRegistrations, pendingRegistrations, ticketCountsByType]);

  // Calculate totals with defensive coding (including lodging)
  const { totalTicketsSold, grossRevenue, totalTicketRevenue, totalDonations, netRevenue, combinedNetRevenue, totalCompUpgrades } = useMemo(() => {
    try {
      const ticketsSold = ticketTypeStats.reduce((sum, t) => sum + (t?.paidCount || 0), 0);
      // Comp upgrades: dollars on record but never collected (admin upgraded ticket without charging)
      const compUpgrades = paidRegistrations.reduce(
        (sum, r) => sum + (r?.comp_upgrade_amount || 0),
        0,
      );
      // ticketTypeStats.revenue is already net of comp upgrades. Gross = net + comp.
      const netTickets = ticketTypeStats.reduce((sum, t) => sum + (t?.revenue || 0), 0);
      const gross = netTickets + compUpgrades;
      const ticketRev = ticketTypeStats.reduce((sum, t) => sum + (t?.ticketRevenue || 0), 0);
      const donations = ticketTypeStats.reduce((sum, t) => sum + (t?.donations || 0), 0);

      // Net revenue (after partial refunds - full refunds already excluded from gross)
      const partialRefunds = safeRefunds.filter(r => {
        if (!r?.registration_id) return false;
        const reg = safeRegistrations.find(reg => reg?.id === r.registration_id);
        return reg && (refundsByRegistration[r.registration_id] || 0) < (reg.total_amount || 0);
      }).reduce((sum, r) => sum + (r?.amount || 0), 0);

      const net = netTickets - partialRefunds;

      // Combined net revenue = tickets (Stripe-collected) + lodging + add-ons (after refunds & comp upgrades)
      const combinedNet = net + lodgingRevenue + addonRevenue;

      return {
        totalTicketsSold: ticketsSold,
        grossRevenue: gross,
        totalTicketRevenue: ticketRev,
        totalDonations: donations,
        netRevenue: net,
        combinedNetRevenue: combinedNet,
        totalCompUpgrades: compUpgrades,
      };
    } catch (err) {
      console.error("[SalesReport] Error calculating totals:", err);
      return {
        totalTicketsSold: 0,
        grossRevenue: 0,
        totalTicketRevenue: 0,
        totalDonations: 0,
        netRevenue: 0,
        combinedNetRevenue: 0,
        totalCompUpgrades: 0,
      };
    }
  }, [ticketTypeStats, safeRefunds, safeRegistrations, refundsByRegistration, lodgingRevenue, addonRevenue, paidRegistrations]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit', timeZone: "America/Los_Angeles" });
  };

  // ---- Build type options for selected category ----
  const addonTypeOptions = useMemo(() => {
    const map = new Map<string, string>();
    safeAddons.forEach(a => {
      const key = a.addon_type || a.display_name || "unknown";
      const label = a.display_name || a.addon_type || "Unknown";
      if (!map.has(key)) map.set(key, label);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [safeAddons]);

  const lodgingZoneOptions = useMemo(() => {
    const set = new Set<string>();
    safeLodgingBookings.forEach(b => b?.zone_key && set.add(b.zone_key));
    return Array.from(set).map(z => ({
      value: z,
      label: z.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
  }, [safeLodgingBookings]);

  const typeOptions = useMemo(() => {
    if (category === "tickets") return ticketTypes.map(t => ({ value: t, label: getTicketLabel(t) }));
    if (category === "addons") return addonTypeOptions;
    if (category === "lodging") return lodgingZoneOptions;
    return [] as { value: string; label: string }[];
  }, [category, ticketTypes, addonTypeOptions, lodgingZoneOptions]);

  const showTickets = category === "all" || category === "tickets";
  const showLodging = category === "all" || category === "lodging";
  const showAddons = category === "all" || category === "addons";
  const showRefunds = category === "all" || category === "refunds";

  const sortAddons = (list: AddonPurchase[]) => {
    const arr = [...list];
    switch (sortBy) {
      case "date_asc": return arr.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      case "amount_desc": return arr.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
      case "amount_asc": return arr.sort((a, b) => (a.total_amount || 0) - (b.total_amount || 0));
      case "qty_desc": return arr.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
      case "name_asc": return arr.sort((a, b) => (a.purchaser_email || "").localeCompare(b.purchaser_email || ""));
      default: return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
  };
  const sortLodging = (list: LodgingBooking[]) => {
    const arr = [...list];
    switch (sortBy) {
      case "date_asc": return arr.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      case "amount_desc": return arr.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
      case "amount_asc": return arr.sort((a, b) => (a.total_amount || 0) - (b.total_amount || 0));
      case "qty_desc": return arr.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
      case "name_asc": return arr.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
      default: return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
  };
  const sortRegistrations = (list: Registration[]) => {
    const arr = [...list];
    switch (sortBy) {
      case "date_asc": return arr.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      case "amount_desc": return arr.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
      case "amount_asc": return arr.sort((a, b) => (a.total_amount || 0) - (b.total_amount || 0));
      case "qty_desc": return arr.sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
      case "name_asc": return arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      default: return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
  };

  const filteredAddons = useMemo(() => {
    let list = paidAddons;
    if (category === "addons" && typeFilter !== "all") {
      list = list.filter(a => (a.addon_type || a.display_name) === typeFilter);
    }
    return sortAddons(list);
  }, [paidAddons, category, typeFilter, sortBy]);

  const filteredLodgingPaid = useMemo(() => {
    let list = paidLodgingBookings;
    if (category === "lodging" && typeFilter !== "all") {
      list = list.filter(b => b.zone_key === typeFilter);
    }
    return sortLodging(list);
  }, [paidLodgingBookings, category, typeFilter, sortBy]);

  const filteredLodgingAll = useMemo(() => {
    let list = safeLodgingBookings;
    if (category === "lodging" && typeFilter !== "all") {
      list = list.filter(b => b.zone_key === typeFilter);
    }
    return sortLodging(list);
  }, [safeLodgingBookings, category, typeFilter, sortBy]);

  const visibleTicketStats = useMemo(() => {
    if (!showTickets) return [];
    if (category === "tickets" && typeFilter !== "all") {
      return ticketTypeStats.filter(s => s.type === typeFilter);
    }
    return ticketTypeStats;
  }, [showTickets, category, typeFilter, ticketTypeStats]);

  return (
    <div className="space-y-6">
      {/* Filter & Sort Toolbar */}
      <AdminCard>
        <AdminCardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">
              <Filter className="h-3.5 w-3.5" />
              <span>Filter</span>
            </div>
            <div className="min-w-[160px]">
              <AdminSelect value={category} onValueChange={handleCategoryChange} mobileTitle="Category">
                <AdminSelectItem value="all">All sales</AdminSelectItem>
                <AdminSelectItem value="tickets">Tickets only</AdminSelectItem>
                <AdminSelectItem value="lodging">Lodging only</AdminSelectItem>
                <AdminSelectItem value="addons">Add-ons only</AdminSelectItem>
                <AdminSelectItem value="refunds">Refunds only</AdminSelectItem>
              </AdminSelect>
            </div>
            {typeOptions.length > 0 && (
              <div className="min-w-[200px]">
                <AdminSelect value={typeFilter} onValueChange={setTypeFilter} mobileTitle="Type">
                  <AdminSelectItem value="all">All {category}</AdminSelectItem>
                  {typeOptions.map(opt => (
                    <AdminSelectItem key={opt.value} value={opt.value}>{opt.label}</AdminSelectItem>
                  ))}
                </AdminSelect>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Sort</span>
              <div className="min-w-[180px]">
                <AdminSelect value={sortBy} onValueChange={setSortBy} mobileTitle="Sort by">
                  <AdminSelectItem value="date_desc">Newest first</AdminSelectItem>
                  <AdminSelectItem value="date_asc">Oldest first</AdminSelectItem>
                  <AdminSelectItem value="amount_desc">Amount: high → low</AdminSelectItem>
                  <AdminSelectItem value="amount_asc">Amount: low → high</AdminSelectItem>
                  <AdminSelectItem value="qty_desc">Quantity: high → low</AdminSelectItem>
                  <AdminSelectItem value="name_asc">Name / Email A→Z</AdminSelectItem>
                </AdminSelect>
              </div>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-7">
        <AdminStatCard
          label="Total Revenue (Collected)"
          value={formatCurrency(combinedNetRevenue)}
          icon={BarChart}
        />
        
        <AdminStatCard
          label="Ticket Sales (Stripe)"
          value={formatCurrency(totalTicketRevenue)}
          icon={Ticket}
        />

        <AdminStatCard
          label="Lodging"
          value={formatCurrency(lodgingRevenue)}
          icon={Home}
        />

        <AdminStatCard
          label="Add-ons"
          value={formatCurrency(addonRevenue)}
          icon={Package}
        />

        <AdminStatCard
          label="Donations"
          value={formatCurrency(totalDonations)}
          icon={Heart}
        />
        
        <AdminStatCard
          label="Tickets Sold"
          value={totalTicketsSold}
          icon={Users}
        />

        {totalCompUpgrades > 0 && (
          <AdminStatCard
            label="Comp Upgrades (uncollected)"
            value={formatCurrency(totalCompUpgrades)}
            icon={Gift}
          />
        )}

        {totalRefunds > 0 && (
          <AdminCard className="border-[hsl(var(--admin-error))]/50">
            <AdminCardHeader icon={RefreshCw}>
              <AdminCardTitle>Refunds</AdminCardTitle>
            </AdminCardHeader>
            <AdminCardContent>
              <div className="text-2xl font-bold text-[hsl(var(--admin-error))]">-{formatCurrency(totalRefunds)}</div>
              <p className="text-xs text-[hsl(var(--admin-text-muted))]">{safeRefunds.length} processed</p>
            </AdminCardContent>
          </AdminCard>
        )}
      </div>

      {/* Payment Plan Summary */}
      {paymentPlanData && (paymentPlanData.activeCount > 0 || paymentPlanData.totalCollected > 0) && (
        <AdminCard>
          <AdminCardHeader icon={CalendarClock}>
            <AdminCardTitle className="flex items-center gap-2">
              <span>Payment Plans</span>
              <AdminBadge intent="info">{paymentPlanData.activeCount} active</AdminBadge>
              {paymentPlanData.defaultedCount > 0 && (
                <AdminBadge intent="danger">{paymentPlanData.defaultedCount} defaulted</AdminBadge>
              )}
            </AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <div className="p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
                <p className="text-xs text-[hsl(var(--admin-text-muted))] font-medium">Collected</p>
                <p className="text-lg font-semibold text-[hsl(var(--admin-success))] mt-1">{formatCurrency(paymentPlanData.totalCollected)}</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">Payments received</p>
              </div>
              <div className="p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
                <p className="text-xs text-[hsl(var(--admin-text-muted))] font-medium">Anticipated</p>
                <p className="text-lg font-semibold text-[hsl(var(--admin-warning))] mt-1">{formatCurrency(paymentPlanData.totalAnticipated)}</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">Upcoming payments</p>
              </div>
              <div className="p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
                <p className="text-xs text-[hsl(var(--admin-text-muted))] font-medium">Total Committed</p>
                <p className="text-lg font-semibold text-[hsl(var(--admin-foreground))] mt-1">{formatCurrency(paymentPlanData.totalCommitted)}</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">All plan value</p>
              </div>
              <div className="p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
                <p className="text-xs text-[hsl(var(--admin-text-muted))] font-medium">Collection Rate</p>
                <p className="text-lg font-semibold text-[hsl(var(--admin-foreground))] mt-1">
                  {paymentPlanData.totalCommitted > 0 ? Math.round((paymentPlanData.totalCollected / paymentPlanData.totalCommitted) * 100) : 0}%
                </p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">Of total committed</p>
              </div>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Ticket Type Breakdown Cards */}
      {showTickets && visibleTicketStats.length > 0 && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {visibleTicketStats.map(stat => (
            <AdminStatCard
              key={stat.type}
              label={stat.shortLabel}
              value={stat.paidCount}
              icon={Ticket}
            />
          ))}
        </div>
      )}

      {/* Lodging Tier Breakdown */}
      {showLodging && lodgingByZone.length > 0 && (
        <AdminCard>
          <AdminCardHeader>
            <AdminCardTitle className="flex items-center gap-2">
              <span>Lodging by Tier</span>
              <AdminBadge intent="neutral">{lodgingBookingsCount} bookings</AdminBadge>
            </AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              {lodgingByZone.map(tier => (
                <div key={tier.zone} className="p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
                  <p className="text-xs text-[hsl(var(--admin-text-muted))] font-medium">{tier.label}</p>
                  <p className="text-lg font-semibold text-[hsl(var(--admin-foreground))] mt-1">{formatCurrency(tier.revenue)}</p>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">{tier.count} booking{tier.count !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Add-ons Breakdown */}
      {showAddons && addonsByType.length > 0 && (
        <AdminCard>
          <AdminCardHeader icon={Package}>
            <AdminCardTitle className="flex items-center gap-2">
              <span>Add-ons by Type</span>
              <AdminBadge intent="neutral">{addonsCount} sold</AdminBadge>
              <AdminBadge intent="success">{formatCurrency(addonRevenue)}</AdminBadge>
              {paidRegistrations.length > 0 && (() => {
                const regsWithAddon = new Set(
                  paidAddons.map(a => a.registration_id).filter(Boolean)
                ).size;
                const attachRate = Math.round((regsWithAddon / paidRegistrations.length) * 100);
                return (
                  <AdminBadge intent="info">
                    {attachRate}% attach rate ({regsWithAddon}/{paidRegistrations.length})
                  </AdminBadge>
                );
              })()}
            </AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              {addonsByType.map(item => (
                <div key={item.key} className="p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
                  <p className="text-xs text-[hsl(var(--admin-text-muted))] font-medium">{item.label}</p>
                  <p className="text-lg font-semibold text-[hsl(var(--admin-foreground))] mt-1">{formatCurrency(item.revenue)}</p>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">{item.count} sold</p>
                </div>
              ))}
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Recent Add-on Purchases */}
      {showAddons && filteredAddons.length > 0 && (
        <AdminCard>
          <AdminCardHeader>
            <AdminCardTitle className="flex items-center gap-2">
              <span>Recent Add-on Purchases</span>
              <AdminBadge intent="neutral">{filteredAddons.length} purchases</AdminBadge>
            </AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] pl-4">Email</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Add-on</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-center">Qty</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-right">Amount</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Type</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] pr-4 hidden md:table-cell">Date</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {filteredAddons.slice(0, 50).map((p) => (
                  <AdminTableRow key={p.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell className="font-medium pl-4">
                      <Link
                        to={`/admin/customers/${encodeURIComponent(p.purchaser_email)}`}
                        className="text-[hsl(var(--admin-accent))] hover:underline"
                      >
                        {p.purchaser_email}
                      </Link>
                    </AdminTableCell>
                    <AdminTableCell className="text-[hsl(var(--admin-text))]">{p.display_name || p.addon_type}</AdminTableCell>
                    <AdminTableCell className="text-center">
                      <AdminBadge intent="neutral" size="sm">{p.quantity}</AdminBadge>
                    </AdminTableCell>
                    <AdminTableCell className="text-right font-medium text-[hsl(var(--admin-text))]">
                      {formatCurrency(p.total_amount || 0)}
                    </AdminTableCell>
                    <AdminTableCell>
                      <AdminBadge intent={p.purchase_type === 'initial' ? 'info' : 'neutral'} size="sm">
                        {p.purchase_type}
                      </AdminBadge>
                    </AdminTableCell>
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))] pr-4 hidden md:table-cell">
                      {formatDate(p.created_at)}
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          </AdminCardContent>
        </AdminCard>
      )}


      {showTickets && visibleTicketStats.map(stat => (
        <AdminCard key={stat.type}>
          <AdminCardHeader>
            <AdminCardTitle className="flex items-center gap-2">
              <span>{stat.label}</span>
              <AdminBadge intent="neutral">
                {stat.paidCount} sold
                {stat.pendingCount > 0 && `, ${stat.pendingCount} pending`}
              </AdminBadge>
            </AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            {stat.allRegistrations.length === 0 ? (
              <p className="text-[hsl(var(--admin-text-muted))] text-center py-4">No tickets yet</p>
            ) : (
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] pl-4">Name</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden sm:table-cell">Email</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-center">Qty</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-right">Tickets</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-right">Donation</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-right">Total</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Status</AdminTableHead>
                    <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] pr-4 hidden md:table-cell">Date</AdminTableHead>
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {sortRegistrations(stat.allRegistrations).map((reg) => {
                    const donation = reg.donation_amount || 0;
                    const ticketAmount = reg.total_amount - donation;
                    return (
                      <AdminTableRow key={reg.id} className="hover:bg-[hsl(var(--admin-hover))]">
                        <AdminTableCell className="font-medium pl-4">
                          <Link 
                            to={`/admin/customers/${encodeURIComponent(reg.email)}`}
                            className="text-[hsl(var(--admin-accent))] hover:underline"
                          >
                            {reg.name}
                          </Link>
                        </AdminTableCell>
                        <AdminTableCell className="hidden sm:table-cell text-[hsl(var(--admin-text-muted))]">{reg.email}</AdminTableCell>
                        <AdminTableCell className="text-center">
                          <AdminBadge intent="neutral" size="sm">{reg.quantity || 1}</AdminBadge>
                        </AdminTableCell>
                        <AdminTableCell className="text-right text-[hsl(var(--admin-text))]">{formatCurrency(ticketAmount)}</AdminTableCell>
                        <AdminTableCell className="text-right text-[hsl(var(--admin-success))]">
                          {donation > 0 ? formatCurrency(donation) : "—"}
                        </AdminTableCell>
                        <AdminTableCell className="text-right font-medium text-[hsl(var(--admin-text))]">
                          {formatCurrency(reg.total_amount)}
                          {(reg.comp_upgrade_amount || 0) > 0 && (
                            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--admin-warning))] font-normal">
                              −{formatCurrency(reg.comp_upgrade_amount || 0)} comp
                            </div>
                          )}
                        </AdminTableCell>
                        <AdminTableCell>
                          <AdminBadge 
                            intent={
                              reg.payment_status === 'paid' ? 'success' : 
                              reg.payment_status === 'payment_plan' ? 'info' :
                              reg.payment_status === 'refunded' ? 'danger' : 'warning'
                            }
                            showDot
                          >
                            {reg.payment_status === 'paid' ? 'Paid' : 
                             reg.payment_status === 'payment_plan' ? 'Payment Plan' :
                             reg.payment_status === 'pending' ? 'Pending' : 
                             reg.payment_status === 'refunded' ? 'Refunded' :
                             reg.payment_status === 'partially_refunded' ? 'Partial' : reg.payment_status}
                          </AdminBadge>
                        </AdminTableCell>
                        <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))] pr-4 hidden md:table-cell">
                          {formatDate(reg.created_at)}
                        </AdminTableCell>
                      </AdminTableRow>
                    );
                  })}
                </AdminTableBody>
              </AdminTable>
            )}
          </AdminCardContent>
        </AdminCard>
      ))}

      {/* Recent Lodging Bookings */}
      {showLodging && filteredLodgingAll.length > 0 && (
        <AdminCard>
          <AdminCardHeader>
            <AdminCardTitle className="flex items-center gap-2">
              <span>Recent Lodging Bookings</span>
              <AdminBadge intent="neutral">{filteredLodgingPaid.length} paid</AdminBadge>
            </AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] pl-4">Email</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Zone</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-center">Qty</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-right">Amount</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Status</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] pr-4 hidden md:table-cell">Date</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {filteredLodgingAll.slice(0, 50).map((booking) => (
                  <AdminTableRow key={booking.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell className="font-medium pl-4">
                      <Link 
                        to={`/admin/customers/${encodeURIComponent(booking.email)}`}
                        className="text-[hsl(var(--admin-accent))] hover:underline"
                      >
                        {booking.email}
                      </Link>
                    </AdminTableCell>
                    <AdminTableCell className="text-[hsl(var(--admin-text))]">
                      {booking.zone_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </AdminTableCell>
                    <AdminTableCell className="text-center">
                      <AdminBadge intent="neutral" size="sm">{booking.quantity}</AdminBadge>
                    </AdminTableCell>
                    <AdminTableCell className="text-right font-medium text-[hsl(var(--admin-text))]">
                      {formatCurrency(booking.total_amount || 0)}
                    </AdminTableCell>
                    <AdminTableCell>
                      <AdminBadge 
                        intent={booking.payment_status === 'paid' ? 'success' : 'warning'}
                        showDot
                      >
                        {booking.payment_status === 'paid' ? 'Paid' : 'Pending'}
                      </AdminBadge>
                    </AdminTableCell>
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))] pr-4 hidden md:table-cell">
                      {formatDate(booking.created_at)}
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Refunds Summary */}
      {showRefunds && safeRefunds.length > 0 && (
        <AdminCard>
          <AdminCardHeader>
            <AdminCardTitle>Recent Refunds ({safeRefunds.length})</AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] pl-4">Amount</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Reason</AdminTableHead>
                  <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] pr-4">Date</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {safeRefunds.slice(0, 10).map((refund) => (
                  <AdminTableRow key={refund.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell className="font-medium text-[hsl(var(--admin-error))] pl-4">
                      -{formatCurrency(refund.amount || 0)}
                    </AdminTableCell>
                    <AdminTableCell className="text-[hsl(var(--admin-text))]">{refund.reason || "—"}</AdminTableCell>
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))] pr-4">
                      {formatDate(refund.created_at)}
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Empty State */}
      {safeRegistrations.length === 0 && (
        <AdminCard>
          <AdminCardContent>
            <AdminEmptyState
              icon={<Ticket className="h-7 w-7 text-[hsl(var(--admin-text-muted))]" />}
              title="No sales yet"
              description="Sales will appear here once tickets are purchased."
            />
          </AdminCardContent>
        </AdminCard>
      )}
    </div>
  );
};
