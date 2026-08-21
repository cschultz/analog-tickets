import { useMemo } from "react";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";
import { TrendingUp } from "lucide-react";

interface Registration {
  created_at: string;
  payment_status: string;
  total_amount: number;
}

interface RegistrationTimelineProps {
  registrations: Registration[];
  view: "daily" | "weekly";
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] rounded-lg shadow-lg px-3 py-2">
        <p className="text-xs text-[hsl(var(--admin-text-muted))] mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.name}: {entry.name === 'Revenue' ? `$${entry.value.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}` : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const RegistrationTimeline = ({ registrations, view }: RegistrationTimelineProps) => {
  const timelineData = useMemo(() => {
    const now = new Date();
    const daysToShow = view === "daily" ? 14 : 30;
    const startDate = startOfDay(subDays(now, daysToShow));
    const endDate = endOfDay(now);
    
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
    
    const dataMap = new Map();
    
    dateRange.forEach(date => {
      const key = format(date, "yyyy-MM-dd");
      dataMap.set(key, {
        date: format(date, "MMM d"),
        registrations: 0,
        revenue: 0,
      });
    });
    
    registrations.forEach(reg => {
      if (reg.payment_status === "paid") {
        const regDate = format(new Date(reg.created_at), "yyyy-MM-dd");
        if (dataMap.has(regDate)) {
          const existing = dataMap.get(regDate);
          existing.registrations += 1;
          existing.revenue += reg.total_amount / 100;
        }
      }
    });
    
    return Array.from(dataMap.values());
  }, [registrations, view]);

  return (
    <AdminCard>
      <AdminCardHeader icon={TrendingUp}>
        <AdminCardTitle>Registration Timeline</AdminCardTitle>
      </AdminCardHeader>
      <AdminCardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRegs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--admin-primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--admin-primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--admin-text-muted))' }}
                interval="preserveStartEnd"
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--admin-text-muted))' }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="registrations" 
                stroke="hsl(var(--admin-primary))" 
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRegs)"
                name="Registrations"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </AdminCardContent>
    </AdminCard>
  );
};
