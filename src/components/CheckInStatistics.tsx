import { useMemo } from "react";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { UserCheck, Users, Clock } from "lucide-react";

interface Registration {
  checked_in: boolean | null;
  quantity?: number;
  plus_one_name: string | null;
  payment_status: string;
}

interface CheckInStatisticsProps {
  registrations: Registration[];
}

export const CheckInStatistics = ({ registrations }: CheckInStatisticsProps) => {
  const stats = useMemo(() => {
    const paidRegs = registrations.filter(r => r.payment_status === 'paid');
    
    const totalAttendees = paidRegs.reduce((sum, reg) => {
      const baseCount = reg.quantity || 1;
      const guestCount = reg.plus_one_name ? reg.plus_one_name.split(',').length : 0;
      return sum + baseCount + guestCount;
    }, 0);
    
    const checkedInRegs = paidRegs.filter(r => r.checked_in);
    const checkedInAttendees = checkedInRegs.reduce((sum, reg) => {
      const baseCount = reg.quantity || 1;
      const guestCount = reg.plus_one_name ? reg.plus_one_name.split(',').length : 0;
      return sum + baseCount + guestCount;
    }, 0);
    
    const checkInPercentage = totalAttendees > 0 ? (checkedInAttendees / totalAttendees) * 100 : 0;
    
    return {
      totalAttendees,
      checkedInAttendees,
      pendingAttendees: totalAttendees - checkedInAttendees,
      checkInPercentage,
    };
  }, [registrations]);

  return (
    <AdminCard>
      <AdminCardHeader icon={UserCheck}>
        <AdminCardTitle>Check-In Progress</AdminCardTitle>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        {/* Progress Ring */}
        <div className="flex items-center justify-center py-2">
          <div className="relative">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-[hsl(var(--admin-hover))]"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (251.2 * stats.checkInPercentage) / 100}
                className="text-[hsl(var(--admin-success))] transition-all duration-700"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-[hsl(var(--admin-text))]">{stats.checkInPercentage.toFixed(0)}%</span>
            </div>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-3 rounded-lg bg-[hsl(var(--admin-hover))]">
            <Users className="w-4 h-4 mx-auto mb-1 text-[hsl(var(--admin-text-muted))]" />
            <div className="text-lg font-bold text-[hsl(var(--admin-text))]">{stats.totalAttendees}</div>
            <div className="text-[10px] text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">Expected</div>
          </div>
          
          <div className="text-center p-3 rounded-lg bg-[hsl(var(--admin-success)/0.1)]">
            <UserCheck className="w-4 h-4 mx-auto mb-1 text-[hsl(var(--admin-success))]" />
            <div className="text-lg font-bold text-[hsl(var(--admin-success))]">{stats.checkedInAttendees}</div>
            <div className="text-[10px] text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">Checked In</div>
          </div>
          
          <div className="text-center p-3 rounded-lg bg-[hsl(var(--admin-warning)/0.1)]">
            <Clock className="w-4 h-4 mx-auto mb-1 text-[hsl(var(--admin-warning))]" />
            <div className="text-lg font-bold text-[hsl(var(--admin-warning))]">{stats.pendingAttendees}</div>
            <div className="text-[10px] text-[hsl(var(--admin-text-muted))] uppercase tracking-wide">Pending</div>
          </div>
        </div>
      </AdminCardContent>
    </AdminCard>
  );
};
