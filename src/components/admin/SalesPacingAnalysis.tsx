import { useState, useMemo, useCallback } from "react";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardDescription, 
  AdminCardHeader, 
  AdminCardTitle,
  AdminButton,
  AdminTabs,
  AdminTabsContent,
  AdminTabsList,
  AdminTabsTrigger
} from "@/components/admin";
import { TrendingUp, TrendingDown, Minus, Calendar, DollarSign, Ticket, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";
import { format, parseISO, differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import { getPrimaryEventId } from "@/platform/config/eventIds";

interface SalesRecord {
  id: string;
  bookingDate: Date;
  saleDate: Date;
  product: string;
  variant: string;
  guestCount: number;
  total: number;
  price: number;
  eventStartDate: Date;
  daysBeforeEvent: number;
}

interface YearData {
  year: string;
  eventDate: Date;
  records: SalesRecord[];
  label: string;
}

interface PacingDataPoint {
  daysBeforeEvent: number;
  displayLabel: string;
  [key: string]: number | string;
}

// Vibrant, distinct colors for each year (NO ORANGE per admin design system)
const YEAR_COLORS: Record<string, { stroke: string; fill: string; gradient: string[] }> = {
  "2024": { 
    stroke: "hsl(215, 100%, 50%)", // Blue (replaces orange)
    fill: "hsla(215, 100%, 50%, 0.15)",
    gradient: ["hsl(215, 100%, 50%)", "hsl(215, 100%, 65%)"]
  },
  "2025": { 
    stroke: "hsl(280, 80%, 55%)", // Violet
    fill: "hsla(280, 80%, 55%, 0.15)",
    gradient: ["hsl(280, 80%, 55%)", "hsl(280, 80%, 70%)"]
  },
  "2026": { 
    stroke: "hsl(142, 72%, 42%)", // Emerald
    fill: "hsla(142, 72%, 42%, 0.2)",
    gradient: ["hsl(142, 72%, 42%)", "hsl(142, 72%, 55%)"]
  },
};

const parseCSV = (content: string): string[][] => {
  const lines = content.split('\n');
  const result: string[][] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    result.push(row);
  }
  
  return result;
};

const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  try {
    const cleaned = dateStr.replace(' UTC', '').replace(/"/g, '');
    return parseISO(cleaned.replace(' ', 'T'));
  } catch {
    return null;
  }
};

const parseDateOnly = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  try {
    const cleaned = dateStr.replace(/"/g, '').split(' ')[0];
    return parseISO(cleaned);
  } catch {
    return null;
  }
};

export default function SalesPacingAnalysis() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'tickets' | 'revenue'>('tickets');
  const [chartType, setChartType] = useState<'cumulative' | 'daily'>('cumulative');

  const processCSV = useCallback((content: string, label: string, overrideEventDate?: Date): YearData | null => {
    const rows = parseCSV(content);
    if (rows.length < 2) return null;

    const headers = rows[0];
    const saleDateIdx = headers.findIndex(h => h.toLowerCase().includes('sale date'));
    const bookingDateIdx = headers.findIndex(h => h.toLowerCase().includes('booking date'));
    const productIdx = headers.findIndex(h => h.toLowerCase() === 'product');
    const variantIdx = headers.findIndex(h => h.toLowerCase() === 'variant');
    const guestCountIdx = headers.findIndex(h => h.toLowerCase().includes('guest count'));
    const totalIdx = headers.findIndex(h => h.toLowerCase() === 'total');
    const priceIdx = headers.findIndex(h => h.toLowerCase() === 'price');
    const startDateIdx = headers.findIndex(h => h.toLowerCase().includes('start date'));

    const records: SalesRecord[] = [];
    let eventDate: Date | null = overrideEventDate || null;
    let year = overrideEventDate ? overrideEventDate.getFullYear().toString() : '';

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < Math.max(saleDateIdx, startDateIdx) + 1) continue;

      const saleDate = parseDate(row[saleDateIdx]);
      const bookingDate = parseDate(row[bookingDateIdx]);
      const eventStartDate = overrideEventDate || parseDateOnly(row[startDateIdx]);
      
      if (!saleDate || !eventStartDate) continue;

      if (!eventDate) {
        eventDate = eventStartDate;
        year = eventStartDate.getFullYear().toString();
      }

      const daysBeforeEvent = differenceInDays(eventDate, saleDate);

      records.push({
        id: row[0] || `${i}`,
        bookingDate: bookingDate || saleDate,
        saleDate,
        product: row[productIdx]?.replace(/"/g, '') || '',
        variant: row[variantIdx]?.replace(/"/g, '') || '',
        guestCount: parseInt(row[guestCountIdx]?.replace(/"/g, '') || '1') || 1,
        total: parseFloat(row[totalIdx]?.replace(/"/g, '') || '0') || 0,
        price: parseFloat(row[priceIdx]?.replace(/"/g, '') || '0') || 0,
        eventStartDate: eventDate,
        daysBeforeEvent,
      });
    }

    if (!eventDate || records.length === 0) return null;

    return {
      year,
      eventDate,
      records,
      label,
    };
  }, []);

  // Use useAuthQuery for all data loading
  const { data: yearDataSets = [], isLoading, refetch } = useAuthQuery({
    queryKey: ["sales-pacing-data"],
    queryFn: async () => {
      const dataSets: YearData[] = [];

      // Load 2024 CSV
      const response2024 = await fetch('/data/sales-2024.csv');
      if (response2024.ok) {
        const content2024 = await response2024.text();
        const data2024 = processCSV(content2024, 'Cosmico 2024', new Date('2024-05-17'));
        if (data2024) dataSets.push(data2024);
      }

      // Load 2025 CSV  
      const response2025 = await fetch('/data/sales-2025.csv');
      if (response2025.ok) {
        const content2025 = await response2025.text();
        const data2025 = processCSV(content2025, 'Cosmico 2025', new Date('2025-05-16'));
        if (data2025) dataSets.push(data2025);
      }

      // Fetch 2026 live data from registrations AND lodging bookings
      const eventId2026 = getPrimaryEventId();
      const eventDate2026 = new Date('2026-05-15');
      
      const [registrationsResult, lodgingResult] = await Promise.all([
        supabase
          .from('registrations')
          .select('id, created_at, ticket_type, quantity, total_amount, payment_status, event_id')
          .eq('event_id', eventId2026)
          .eq('payment_status', 'paid')
          .order('created_at', { ascending: true }),
        supabase
          .from('lodging_bookings')
          .select('id, created_at, total_amount, payment_status')
          .eq('event_id', eventId2026)
          .eq('payment_status', 'paid')
          .order('created_at', { ascending: true })
      ]);

      const registrations = registrationsResult.data || [];
      const lodgingBookings = lodgingResult.data || [];

      if (registrations.length > 0 || lodgingBookings.length > 0) {
        const records2026: SalesRecord[] = [];
        
        // Add registration records
        for (const reg of registrations) {
          const saleDate = new Date(reg.created_at);
          records2026.push({
            id: reg.id,
            bookingDate: saleDate,
            saleDate,
            product: 'Cosmico 2026',
            variant: reg.ticket_type || '',
            guestCount: reg.quantity || 1,
            total: (reg.total_amount || 0) / 100,
            price: (reg.total_amount || 0) / 100 / (reg.quantity || 1),
            eventStartDate: eventDate2026,
            daysBeforeEvent: differenceInDays(eventDate2026, saleDate),
          });
        }
        
        // Add lodging records (count as revenue, guestCount = 0 for ticket charts)
        for (const booking of lodgingBookings) {
          const saleDate = new Date(booking.created_at);
          records2026.push({
            id: `lodging-${booking.id}`,
            bookingDate: saleDate,
            saleDate,
            product: 'Cosmico 2026',
            variant: 'Lodging',
            guestCount: 0, // Don't count lodging as tickets
            total: (booking.total_amount || 0) / 100,
            price: (booking.total_amount || 0) / 100,
            eventStartDate: eventDate2026,
            daysBeforeEvent: differenceInDays(eventDate2026, saleDate),
          });
        }

        dataSets.push({
          year: '2026',
          eventDate: eventDate2026,
          records: records2026,
          label: 'Cosmico 2026 (Live)',
        });
      }

      dataSets.sort((a, b) => parseInt(a.year) - parseInt(b.year));
      return dataSets;
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  const loadAllData = useCallback(() => {
    refetch();
  }, [refetch]);

  const pacingData = useMemo(() => {
    if (yearDataSets.length === 0) return [];

    // Only consider days before or on event day (>= 0)
    const allDays = yearDataSets.flatMap(yd => 
      yd.records.map(r => r.daysBeforeEvent).filter(d => d >= 0)
    );
    const maxDays = Math.max(...allDays, 0);
    // End at event day (0), not after
    const minDays = 0;

    const dataPoints: PacingDataPoint[] = [];

    for (let day = maxDays; day >= minDays; day--) {
      const point: PacingDataPoint = {
        daysBeforeEvent: day,
        displayLabel: day > 0 ? `+${day}d` : 'Event',
      };

      yearDataSets.forEach(yd => {
        // For past events, only show data up to their event day
        const relevantRecords = yd.records.filter(r => r.daysBeforeEvent >= 0);
        
        if (chartType === 'cumulative') {
          const sales = relevantRecords.filter(r => r.daysBeforeEvent >= day);
          point[`tickets_${yd.year}`] = sales.reduce((sum, r) => sum + r.guestCount, 0);
          point[`revenue_${yd.year}`] = sales.reduce((sum, r) => sum + r.total, 0);
        } else {
          const sales = relevantRecords.filter(r => r.daysBeforeEvent === day);
          point[`tickets_${yd.year}`] = sales.reduce((sum, r) => sum + r.guestCount, 0);
          point[`revenue_${yd.year}`] = sales.reduce((sum, r) => sum + r.total, 0);
        }
      });

      dataPoints.push(point);
    }

    return dataPoints;
  }, [yearDataSets, chartType]);

  const summaryStats = useMemo(() => {
    return yearDataSets.map(yd => {
      const totalTickets = yd.records.reduce((sum, r) => sum + r.guestCount, 0);
      const totalRevenue = yd.records.reduce((sum, r) => sum + r.total, 0);
      const avgTicketPrice = totalRevenue / totalTickets || 0;
      const firstSale = yd.records.length > 0 
        ? Math.max(...yd.records.map(r => r.daysBeforeEvent))
        : 0;

      return {
        year: yd.year,
        eventDate: yd.eventDate,
        label: yd.label,
        totalTickets,
        totalRevenue,
        avgTicketPrice,
        firstSaleDays: firstSale,
        recordCount: yd.records.length,
      };
    });
  }, [yearDataSets]);

  // Calculate "today" position on the chart for the most recent event year
  const todayMarkerDays = useMemo(() => {
    if (yearDataSets.length === 0) return null;
    const sortedYears = [...yearDataSets].sort((a, b) => parseInt(b.year) - parseInt(a.year));
    const currentYear = sortedYears[0];
    const today = new Date();
    const days = differenceInDays(currentYear.eventDate, today);
    // Only show if today falls within the chart range
    if (days < 0) return null;
    return days;
  }, [yearDataSets]);

  const pacingComparison = useMemo(() => {
    if (yearDataSets.length < 2) return null;

    const sortedYears = [...yearDataSets].sort((a, b) => parseInt(b.year) - parseInt(a.year));
    const currentYear = sortedYears[0];
    const previousYear = sortedYears[1];

    const today = new Date();
    const currentDaysBeforeEvent = differenceInDays(currentYear.eventDate, today);

    const currentSales = currentYear.records.filter(r => r.daysBeforeEvent >= currentDaysBeforeEvent);
    const previousSales = previousYear.records.filter(r => r.daysBeforeEvent >= currentDaysBeforeEvent);

    const currentTickets = currentSales.reduce((sum, r) => sum + r.guestCount, 0);
    const previousTickets = previousSales.reduce((sum, r) => sum + r.guestCount, 0);
    const currentRevenue = currentSales.reduce((sum, r) => sum + r.total, 0);
    const previousRevenue = previousSales.reduce((sum, r) => sum + r.total, 0);

    const ticketDiff = previousTickets > 0 ? ((currentTickets - previousTickets) / previousTickets) * 100 : 0;
    const revenueDiff = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    return {
      currentYear: currentYear.year,
      previousYear: previousYear.year,
      daysBeforeEvent: currentDaysBeforeEvent,
      currentTickets,
      previousTickets,
      currentRevenue,
      previousRevenue,
      ticketDiff,
      revenueDiff,
    };
  }, [yearDataSets]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    
    return (
      <div className="bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] rounded-lg shadow-xl p-4">
        <p className="font-semibold text-sm mb-2 text-[hsl(var(--admin-text))]">
          {label > 0 ? `${label} days before event` : 'Event day'}
        </p>
        <div className="space-y-1.5">
          {payload.map((entry: any, idx: number) => {
            const year = entry.dataKey.split('_')[1];
            const colors = YEAR_COLORS[year] || { stroke: '#888' };
            const isRevenue = entry.dataKey.startsWith('revenue');
            return (
              <div key={idx} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ background: colors.stroke }}
                />
                <span className="text-sm font-medium" style={{ color: colors.stroke }}>
                  {year}:
                </span>
                <span className="text-sm text-[hsl(var(--admin-text))] font-semibold">
                  {isRevenue ? formatCurrency(entry.value) : entry.value.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
                  {!isRevenue && ' tickets'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--admin-accent))]" />
        <span className="ml-3 text-[hsl(var(--admin-text-muted))]">Loading sales data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {yearDataSets.map(yd => (
            <div
              key={yd.year}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold border-2 shadow-sm"
              style={{ 
                borderColor: YEAR_COLORS[yd.year]?.stroke || '#888',
                background: YEAR_COLORS[yd.year]?.fill || 'transparent',
              }}
            >
              <div 
                className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" 
                style={{ background: YEAR_COLORS[yd.year]?.stroke }}
              />
              <span style={{ color: YEAR_COLORS[yd.year]?.stroke }}>
                {yd.year}
              </span>
              <span className="text-[10px] sm:text-xs text-[hsl(var(--admin-text-muted))]">
                {format(yd.eventDate, 'MMM d')}
              </span>
            </div>
          ))}
        </div>
        <AdminButton variant="adminOutline" size="sm" onClick={loadAllData} className="gap-2 self-end sm:self-auto">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </AdminButton>
      </div>

      {/* Pacing Comparison Banner */}
      {pacingComparison && (
        <AdminCard className={`relative overflow-hidden ${
          pacingComparison.ticketDiff > 0 
            ? "border-[hsl(var(--admin-success))]" 
            : pacingComparison.ticketDiff < 0 
              ? "border-[hsl(var(--admin-danger))]"
              : "border-[hsl(var(--admin-border))]"
        }`}>
          <div
            className="absolute inset-0 opacity-10"
            style={{
              background: pacingComparison.ticketDiff >= 0 
                ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'
            }}
          />
          <AdminCardContent className="pt-6 relative">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs sm:text-sm text-[hsl(var(--admin-text-muted))]">
                  At <span className="font-bold text-[hsl(var(--admin-text))]">{pacingComparison.daysBeforeEvent}</span> days before the event
                </p>
                <p className="text-xl sm:text-2xl font-bold mt-1">
                  <span style={{ color: YEAR_COLORS[pacingComparison.currentYear]?.stroke }}>
                    {pacingComparison.currentYear}
                  </span>
                  {" vs "}
                  <span style={{ color: YEAR_COLORS[pacingComparison.previousYear]?.stroke }}>
                    {pacingComparison.previousYear}
                  </span>
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 sm:gap-8">
                <div>
                  <p className="text-[10px] sm:text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] mb-1">Tickets Sold</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl sm:text-3xl font-bold" style={{ color: YEAR_COLORS[pacingComparison.currentYear]?.stroke }}>
                        {pacingComparison.currentTickets}
                      </span>
                      <span className="text-xs sm:text-sm text-[hsl(var(--admin-text-muted))]">vs {pacingComparison.previousTickets}</span>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold w-fit ${
                      pacingComparison.ticketDiff >= 0 ? 'bg-[hsl(var(--admin-success)/0.2)] text-[hsl(var(--admin-success))]' : 'bg-[hsl(var(--admin-danger)/0.2)] text-[hsl(var(--admin-danger))]'
                    }`}>
                      {pacingComparison.ticketDiff > 0 ? <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" /> : 
                       pacingComparison.ticketDiff < 0 ? <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" /> :
                       <Minus className="h-3 w-3 sm:h-4 sm:w-4" />}
                      {pacingComparison.ticketDiff >= 0 ? '+' : ''}{pacingComparison.ticketDiff.toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                <div>
                  <p className="text-[10px] sm:text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] mb-1">Revenue</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl sm:text-3xl font-bold" style={{ color: YEAR_COLORS[pacingComparison.currentYear]?.stroke }}>
                        {formatCurrency(pacingComparison.currentRevenue)}
                      </span>
                      <span className="text-xs sm:text-sm text-[hsl(var(--admin-text-muted))]">vs {formatCurrency(pacingComparison.previousRevenue)}</span>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold w-fit ${
                      pacingComparison.revenueDiff >= 0 ? 'bg-[hsl(var(--admin-success)/0.2)] text-[hsl(var(--admin-success))]' : 'bg-[hsl(var(--admin-danger)/0.2)] text-[hsl(var(--admin-danger))]'
                    }`}>
                      {pacingComparison.revenueDiff > 0 ? <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" /> : 
                       pacingComparison.revenueDiff < 0 ? <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" /> :
                       <Minus className="h-3 w-3 sm:h-4 sm:w-4" />}
                      {pacingComparison.revenueDiff >= 0 ? '+' : ''}{pacingComparison.revenueDiff.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Summary Stats */}
      {summaryStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summaryStats.map(stats => {
            const colors = YEAR_COLORS[stats.year] || { stroke: '#888', fill: 'transparent' };
            return (
              <AdminCard 
                key={stats.year} 
                className="relative overflow-hidden border-2"
                style={{ borderColor: colors.stroke }}
              >
                <div 
                  className="absolute inset-0 opacity-5"
                  style={{ background: `linear-gradient(135deg, ${colors.stroke} 0%, transparent 100%)` }}
                />
                <AdminCardHeader className="pb-2 relative">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ background: colors.stroke }}
                    />
                    <AdminCardTitle className="text-xl" style={{ color: colors.stroke }}>
                      {stats.year}
                    </AdminCardTitle>
                  </div>
                  <AdminCardDescription>
                    Event: {format(stats.eventDate, 'MMMM d, yyyy')}
                  </AdminCardDescription>
                </AdminCardHeader>
                <AdminCardContent className="space-y-3 relative">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[hsl(var(--admin-text-muted))] flex items-center gap-1.5 text-sm">
                      <Ticket className="h-4 w-4 shrink-0" /> Tickets
                    </span>
                    <span className="text-xl sm:text-2xl font-bold text-[hsl(var(--admin-text))]">{stats.totalTickets.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[hsl(var(--admin-text-muted))] flex items-center gap-1.5 text-sm">
                      <DollarSign className="h-4 w-4 shrink-0" /> Revenue
                    </span>
                    <span className="text-xl sm:text-2xl font-bold text-[hsl(var(--admin-text))]">{formatCurrency(stats.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-[hsl(var(--admin-border))]">
                    <span className="text-sm text-[hsl(var(--admin-text-muted))]">Avg Price</span>
                    <span className="font-semibold text-[hsl(var(--admin-text))]">{formatCurrency(stats.avgTicketPrice)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[hsl(var(--admin-text-muted))]">First Sale</span>
                    <span className="font-semibold text-[hsl(var(--admin-text))]">{stats.firstSaleDays}d before</span>
                  </div>
                </AdminCardContent>
              </AdminCard>
            );
          })}
        </div>
      )}

      {/* Charts */}
      {pacingData.length > 0 && (
        <AdminCard className="overflow-hidden">
          <AdminCardHeader className="bg-gradient-to-r from-[hsl(var(--admin-hover))] to-transparent">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <AdminCardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Sales Pacing Chart
                </AdminCardTitle>
                <AdminCardDescription>
                  {chartType === 'cumulative' ? 'Cumulative' : 'Daily'} {view === 'tickets' ? 'ticket sales' : 'revenue'} aligned by days before event
                </AdminCardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminTabs value={chartType} onValueChange={(v) => setChartType(v as 'cumulative' | 'daily')}>
                  <AdminTabsList className="grid grid-cols-2">
                    <AdminTabsTrigger value="cumulative" className="text-xs sm:text-sm px-2 sm:px-3">Cumulative</AdminTabsTrigger>
                    <AdminTabsTrigger value="daily" className="text-xs sm:text-sm px-2 sm:px-3">Daily</AdminTabsTrigger>
                  </AdminTabsList>
                </AdminTabs>
                <AdminTabs value={view} onValueChange={(v) => setView(v as 'tickets' | 'revenue')}>
                  <AdminTabsList className="grid grid-cols-2">
                    <AdminTabsTrigger value="tickets" className="text-xs sm:text-sm px-2 sm:px-3">Tickets</AdminTabsTrigger>
                    <AdminTabsTrigger value="revenue" className="text-xs sm:text-sm px-2 sm:px-3">Revenue</AdminTabsTrigger>
                  </AdminTabsList>
                </AdminTabs>
              </div>
            </div>
          </AdminCardHeader>
          <AdminCardContent className="pt-6">
            <div className="h-[450px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pacingData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    {yearDataSets.map(yd => {
                      const colors = YEAR_COLORS[yd.year] || { stroke: '#888', gradient: ['#888', '#aaa'] };
                      return (
                        <linearGradient key={yd.year} id={`gradient-${yd.year}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={colors.gradient[0]} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={colors.gradient[1]} stopOpacity={0.05} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--admin-divider))" vertical={false} />
                  <XAxis 
                    dataKey="daysBeforeEvent" 
                    reversed
                    tickFormatter={(v) => v > 0 ? `-${v}d` : v === 0 ? 'Day' : `+${Math.abs(v)}d`}
                    className="text-xs"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--admin-text-muted))' }}
                  />
                  <YAxis 
                    tickFormatter={(v) => view === 'revenue' ? `$${(v/1000).toFixed(0)}k` : v.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
                    className="text-xs"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--admin-text-muted))' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {todayMarkerDays !== null && (
                    <ReferenceLine
                      x={todayMarkerDays}
                      stroke="hsl(var(--admin-warning))"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      label={{
                        value: "Today",
                        position: "top",
                        fill: "hsl(var(--admin-warning))",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={(value) => {
                      const year = value.split('_')[1];
                      return <span style={{ color: YEAR_COLORS[year]?.stroke }}>{year}</span>;
                    }}
                  />
                  {yearDataSets.map(yd => {
                    const colors = YEAR_COLORS[yd.year] || { stroke: '#888' };
                    return (
                      <Area
                        key={yd.year}
                        type="monotone"
                        dataKey={`${view}_${yd.year}`}
                        name={`${view}_${yd.year}`}
                        stroke={colors.stroke}
                        fill={`url(#gradient-${yd.year})`}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 2, fill: 'white' }}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Empty State */}
      {yearDataSets.length === 0 && !isLoading && (
        <AdminCard className="border-dashed">
          <AdminCardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-[hsl(var(--admin-text-muted))] mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-[hsl(var(--admin-text))]">No Data Available</h3>
            <p className="text-[hsl(var(--admin-text-muted))] text-center max-w-md">
              Historical sales data could not be loaded. Please check that the CSV files are available.
            </p>
          </AdminCardContent>
        </AdminCard>
      )}
    </div>
  );
}
