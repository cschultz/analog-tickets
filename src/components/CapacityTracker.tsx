import { useEffect, useState } from "react";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { supabase } from "@/integrations/supabase/client";
import { Ticket } from "lucide-react";

interface TicketInventory {
  ticket_type: string;
  total_quantity: number;
  sold_quantity: number;
}

interface CapacityTrackerProps {
  eventId?: string;
}

export const CapacityTracker = ({ eventId }: CapacityTrackerProps) => {
  const [inventory, setInventory] = useState<TicketInventory[]>([]);

  useEffect(() => {
    if (eventId) {
      fetchInventory();
    }
  }, [eventId]);

  const fetchInventory = async () => {
    const query = supabase
      .from('ticket_inventory')
      .select('*');
    
    if (eventId) {
      query.eq('event_id', eventId);
    }
    
    const { data, error } = await query;
    
    if (!error && data) {
      setInventory(data);
    }
  };

  const formatTicketType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-[hsl(var(--admin-error))]';
    if (percentage >= 70) return 'bg-[hsl(var(--admin-warning))]';
    return 'bg-[hsl(var(--admin-primary))]';
  };

  return (
    <AdminCard>
      <AdminCardHeader icon={Ticket}>
        <AdminCardTitle>Ticket Capacity</AdminCardTitle>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        {inventory.length === 0 ? (
          <p className="text-[hsl(var(--admin-text-muted))] text-sm">No ticket types configured</p>
        ) : (
          inventory.map((item) => {
            const percentage = item.total_quantity > 0 
              ? (item.sold_quantity / item.total_quantity) * 100 
              : 0;
            const remaining = item.total_quantity - item.sold_quantity;
            
            return (
              <div key={item.ticket_type} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
                    {formatTicketType(item.ticket_type)}
                  </span>
                  <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                    {item.sold_quantity}/{item.total_quantity}
                  </span>
                </div>
                <div className="h-2 bg-[hsl(var(--admin-hover))] rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${getProgressColor(percentage)}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-[hsl(var(--admin-text-muted))]">
                  <span>{remaining} remaining</span>
                  <span className={percentage >= 90 ? "text-[hsl(var(--admin-error))] font-medium" : ""}>
                    {percentage.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </AdminCardContent>
    </AdminCard>
  );
};
