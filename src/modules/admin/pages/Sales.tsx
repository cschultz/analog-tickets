import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SalesReport } from "@/components/SalesReport";
import { DailyPulse } from "@/components/admin/DailyPulse";
import { VerifyPendingPayments } from "@/components/VerifyPendingPayments";
import { BulkPaymentReminders } from "@/components/BulkPaymentReminders";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminButton } from "@/components/admin/AdminUI";
import { Printer, Mail, Loader2, DollarSign } from "lucide-react";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { toast } from "sonner";

interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  quantity?: number;
  total_amount: number;
  donation_amount?: number;
  payment_status: string;
  created_at: string;
  event_id: string;
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

export default function SalesPage() {
  const { selectedEventId, selectedEvent, isLoading: eventLoading } = useAdminEvent();
  const [isSendingReport, setIsSendingReport] = useState(false);

  // Fetch registrations for selected event
  const { data: registrations = [], isLoading: regLoading, refetch: refetchRegistrations } = useAuthQuery({
    queryKey: ["registrations", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [] as Registration[];
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .eq("event_id", selectedEventId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching registrations:", error);
        throw error;
      }
      return data as Registration[];
    },
    enabled: !!selectedEventId,
  });

  // Fetch refunds for registrations in this event
  const { data: refunds = [], isLoading: refundsLoading } = useAuthQuery({
    queryKey: ["refunds", selectedEventId, registrations.length],
    queryFn: async () => {
      if (!selectedEventId || registrations.length === 0) return [] as Refund[];
      
      // Get registration IDs for this event
      const regIds = registrations.map(r => r.id);
      
      const { data, error } = await supabase
        .from("refunds")
        .select("id, registration_id, ticket_id, amount, reason, created_at")
        .in("registration_id", regIds)
        .order("created_at", { ascending: false });
        
      if (error) {
        console.error("Error fetching refunds:", error);
        throw error;
      }
      return (data || []) as Refund[];
    },
    enabled: !!selectedEventId && registrations.length > 0,
  });

  // Fetch lodging bookings for selected event
  const { data: lodgingBookings = [], isLoading: lodgingLoading } = useAuthQuery({
    queryKey: ["lodging-bookings-sales", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [] as LodgingBooking[];
      const { data, error } = await supabase
        .from("lodging_bookings")
        .select("id, email, zone_key, quantity, total_amount, payment_status, created_at, registration_id")
        .eq("event_id", selectedEventId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching lodging bookings:", error);
        throw error;
      }
      return (data || []) as LodgingBooking[];
    },
    enabled: !!selectedEventId,
  });

  // Fetch addon purchases for selected event (via inventory join)
  const { data: addonPurchases = [], isLoading: addonsLoading } = useAuthQuery({
    queryKey: ["addon-purchases-sales", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [] as AddonPurchase[];
      const { data, error } = await supabase
        .from("addon_purchases")
        .select("id, inventory_id, purchaser_email, quantity, unit_price, total_amount, payment_status, purchase_type, created_at, registration_id, addon_inventory!inner(event_id, display_name, addon_type)")
        .eq("addon_inventory.event_id", selectedEventId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching addon purchases:", error);
        throw error;
      }
      return (data || []).map((p: any) => ({
        ...p,
        display_name: p.addon_inventory?.display_name,
        addon_type: p.addon_inventory?.addon_type,
      })) as AddonPurchase[];
    },
    enabled: !!selectedEventId,
  });

  const pendingCount = useMemo(() => {
    // Exclude expired/failed Stripe sessions and known internal/test emails so the KPI
    // reflects truly in-flight payments only.
    const isTestEmail = (e: string | null | undefined) => {
      if (!e) return false;
      const lower = e.toLowerCase();
      return lower.includes("+test") || lower.endsWith("@example.com") || lower.includes("smoke") || lower.includes("debug");
    };
    return registrations.filter(r =>
      r.payment_status === "pending" && !isTestEmail(r.email)
    ).length;
  }, [registrations]);

  const paymentPlanCount = useMemo(() => {
    return registrations.filter(r => r.payment_status === "payment_plan").length;
  }, [registrations]);

  // Include refundsLoading and lodgingLoading to prevent rendering before all data is ready
  // But if no registrations, refunds query won't run so check for that
  const isRefundsReady = registrations.length === 0 || !refundsLoading;
  const isLoading = eventLoading || regLoading || !isRefundsReady || lodgingLoading || addonsLoading || !selectedEventId;

  // Debug logging - enable with localStorage.setItem('DEBUG', 'true')
  if (localStorage.getItem('DEBUG') === 'true') {
    console.log("[Sales Page Debug]", {
      selectedEventId,
      eventLoading,
      regLoading,
      refundsLoading,
      lodgingLoading,
      isRefundsReady,
      registrationsCount: registrations?.length,
      refundsCount: refunds?.length,
      lodgingBookingsCount: lodgingBookings?.length,
      isLoading,
    });
  }

  const handleDataRefresh = () => {
    refetchRegistrations();
  };

  const handleSendSalesReport = async () => {
    setIsSendingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-daily-sales-report");
      if (error) throw error;
      toast.success(data.message || "Sales report sent to admins");
    } catch (error: any) {
      console.error("Error sending sales report:", error);
      toast.error(error.message || "Failed to send sales report");
    } finally {
      setIsSendingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={DollarSign}
        title="Sales Report"
        subtitle="View detailed sales information and manage payments"
        actions={
          <>
            <AdminButton 
              variant="adminOutline" 
              size="sm" 
              onClick={handleSendSalesReport}
              disabled={isSendingReport}
            >
              {isSendingReport ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              <span className="hidden sm:inline">Email Report</span>
              <span className="sm:hidden">Email</span>
            </AdminButton>
            <AdminButton asChild variant="adminOutline" size="sm">
              <Link to="/printable-dinner-manifest">
                <Printer className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Print Dinner Manifest</span>
                <span className="sm:hidden">Print</span>
              </Link>
            </AdminButton>
          </>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-primary))]"></div>
        </div>
      ) : !selectedEventId ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-[hsl(var(--admin-text-muted))]">Please select an event</p>
        </div>
      ) : (
        <>
          <DailyPulse eventId={selectedEventId} />
          <SalesReport registrations={registrations} refunds={refunds} lodgingBookings={lodgingBookings} addonPurchases={addonPurchases} />

          <div className="grid gap-6 md:grid-cols-2">
            <VerifyPendingPayments />
            <BulkPaymentReminders pendingCount={pendingCount} onComplete={handleDataRefresh} />
          </div>
        </>
      )}
    </div>
  );
}
