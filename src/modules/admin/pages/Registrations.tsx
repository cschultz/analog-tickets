import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";
import { AdminButton, AdminBadge, AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTextarea } from "@/components/admin";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminInput } from "@/components/admin";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminSheet, AdminSheetContent, AdminSheetHeader, AdminSheetTitle, AdminSheetTrigger } from "@/components/admin/AdminSheet";
import { AdminCheckbox, AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { AdminCollapsible, AdminCollapsibleTrigger, AdminCollapsibleContent } from "@/components/admin/AdminCollapsible";
import { AdminTable, AdminTableBody, AdminTableCell, AdminTableHead, AdminTableHeader, AdminTableRow } from "@/components/admin";
import { Download, Search, ArrowUpDown, CalendarIcon, X, QrCode, Printer, Upload, ChevronLeft, ChevronRight, Mail, Eye, Ticket, Filter, MoreHorizontal, RefreshCw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { AdminCalendar } from "@/components/admin/AdminCalendar";
// AdminSheet already imported above
import { format, subDays, startOfDay } from "date-fns";
import { cn, formatTicketType } from "@/lib/utils";
import { BulkOperations } from "@/components/BulkOperations";
import { BulkActionBar, commonBulkActions } from "@/components/admin/BulkActionBar";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { ManualPayment } from "@/components/ManualPayment";
import { PaymentHistory } from "@/components/PaymentHistory";
import { EmailPreviewModal } from "@/components/admin/EmailPreviewModal";
import { Link, useSearchParams } from "react-router-dom";
import { StatusPill } from "@/components/admin/StatusPill";
import { PersonAvatar } from "@/components/admin/PersonAvatar";
import { DatabaseView, DatabaseViewTab } from "@/components/admin/DatabaseView";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AttendeeManager } from "@/components/admin/AttendeeManager";
import { RegistrationOrderExtras } from "@/components/admin/RegistrationOrderExtras";
import { getPrimaryEventId } from "@/platform/config/eventIds";

// Current active event ID - Cosmico 2026
const CURRENT_EVENT_ID = getPrimaryEventId();

interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  quantity?: number;
  plus_one_name: string | null;
  donation_amount: number;
  total_amount: number;
  comp_upgrade_amount?: number;
  payment_status: string;
  dietary_notes: string | null;
  stripe_session_id: string | null;
  created_at: string;
  checked_in: boolean | null;
  checked_in_at: string | null;
  event_id: string;
  metadata?: Record<string, any> | null;
}

interface UpgradeTotals {
  [registrationId: string]: number;
}

interface EventInfo {
  [eventId: string]: string;
}

export default function RegistrationsPage() {
  const isMobile = useIsMobile();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [ticketTypeFilter, setTicketTypeFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("paid");
  const [dataViewFilter, setDataViewFilter] = useState<"paid" | "pending" | "all">("paid");
  const [eventViewFilter, setEventViewFilter] = useState<"current" | "past">("current");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Keep table filter in sync with the top view toggle
  useEffect(() => {
    setPaymentStatusFilter(dataViewFilter === 'all' ? 'all' : dataViewFilter);
  }, [dataViewFilter]);

  const [sortColumn, setSortColumn] = useState<"name" | "ticket_type" | "payment_status" | "created_at" | "total_amount" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isEditingGuestDetails, setIsEditingGuestDetails] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Only fetch when authenticated
  const isAuthenticated = !!user && !authLoading;

  // Auth-gated registrations query
  const { data: registrations = [], isLoading: regLoading, refetch: refetchRegistrations } = useAuthQuery({
    queryKey: ["registrations-page-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching registrations:", error);
        throw error;
      }
      return data as Registration[];
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000,
  });

  // Auto-open registration drawer when ?id= is present (e.g., from global search)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !registrations.length) return;
    if (selectedRegistration?.id === id) return;
    const match = registrations.find((r) => r.id === id);
    if (match) {
      setSelectedRegistration(match);
    } else {
      toast.error("Registration not found in current view. Try changing the filter.");
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, registrations, selectedRegistration?.id, setSearchParams]);

  // Auth-gated upgrade totals query
  const { data: upgradeData = [] } = useAuthQuery({
    queryKey: ["registrations-upgrade-totals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("upgrade_offers")
        .select("registration_id, total_amount")
        .eq("status", "completed");
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000, // 1 minute
  });

  // Compute upgrade totals from query data
  const upgradeTotals = useMemo(() => {
    const totals: UpgradeTotals = {};
    upgradeData.forEach((upgrade) => {
      totals[upgrade.registration_id] = (totals[upgrade.registration_id] || 0) + upgrade.total_amount;
    });
    return totals;
  }, [upgradeData]);

  // Auth-gated events query
  const { data: eventsData = [] } = useAuthQuery({
    queryKey: ["registrations-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("id, title");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Compute event names lookup
  const eventNames = useMemo(() => {
    const names: EventInfo = {};
    eventsData.forEach((event) => {
      names[event.id] = event.title;
    });
    return names;
  }, [eventsData]);

  const isLoading = regLoading;

  // Real-time subscription for registrations changes
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const channel = supabase
      .channel('registrations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        // Invalidate the query to trigger a refetch
        queryClient.invalidateQueries({ queryKey: ["registrations-page-data"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, queryClient]);

  // Compute filtered registrations with useMemo instead of useEffect + setState
  const filteredRegistrations = useMemo(() => {
    let filtered = [...registrations];

    // Filter by event (current vs past)
    if (eventViewFilter === "current") {
      filtered = filtered.filter(r => r.event_id === CURRENT_EVENT_ID);
    } else {
      filtered = filtered.filter(r => r.event_id !== CURRENT_EVENT_ID);
    }

    if (dataViewFilter === "paid") {
      filtered = filtered.filter(r => r.payment_status === "paid");
    } else if (dataViewFilter === "pending") {
      filtered = filtered.filter(r => r.payment_status === "pending");
    }

    if (searchTerm) {
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (ticketTypeFilter !== "all") {
      filtered = filtered.filter(r => r.ticket_type === ticketTypeFilter);
    }

    if (paymentStatusFilter !== "all") {
      filtered = filtered.filter(r => r.payment_status === paymentStatusFilter);
    }

    if (dateRange.from) {
      filtered = filtered.filter(r => new Date(r.created_at) >= dateRange.from!);
    }
    if (dateRange.to) {
      filtered = filtered.filter(r => new Date(r.created_at) <= dateRange.to!);
    }

    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        if (sortColumn === "created_at") {
          aVal = new Date(aVal as string).getTime();
          bVal = new Date(bVal as string).getTime();
        }

        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }

        return 0;
      });
    }

    return filtered;
  }, [registrations, searchTerm, ticketTypeFilter, paymentStatusFilter, dataViewFilter, eventViewFilter, sortColumn, sortDirection, dateRange]);

  // Compute unique ticket types from actual data
  const uniqueTicketTypes = useMemo(() => {
    const types = new Set<string>();
    registrations.forEach(r => {
      if (r.ticket_type) types.add(r.ticket_type);
    });
    return Array.from(types).sort();
  }, [registrations]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, ticketTypeFilter, paymentStatusFilter, dataViewFilter, eventViewFilter, dateRange]);

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Ticket Type', 'Guest Names', 'Donation Amount', 'Total Amount', 'Comp Upgrade Amount', 'Net Collected', 'Payment Status', 'Check-In Status', 'Check-In Time', 'Dietary Notes', 'Stripe Session ID', 'Created At'];
    const csvData = filteredRegistrations.map(reg => {
      const comp = reg.comp_upgrade_amount || 0;
      const net = reg.total_amount - comp;
      return [
        reg.name,
        reg.email,
        formatTicketType(reg.ticket_type),
        reg.plus_one_name || '',
        (reg.donation_amount / 100).toFixed(2),
        (reg.total_amount / 100).toFixed(2),
        (comp / 100).toFixed(2),
        (net / 100).toFixed(2),
        reg.payment_status,
        reg.checked_in ? 'Checked In' : 'Not Checked In',
        reg.checked_in_at ? new Date(reg.checked_in_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : '',
        reg.dietary_notes || '',
        reg.stripe_session_id || '',
        new Date(reg.created_at).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })
      ];
    });

    const csv = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registrations_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('CSV exported successfully!');
  };

  const setDatePreset = (preset: "7days" | "30days" | "thismonth" | "all") => {
    const now = new Date();
    switch (preset) {
      case "7days":
        setDateRange({ from: startOfDay(subDays(now, 7)), to: now });
        break;
      case "30days":
        setDateRange({ from: startOfDay(subDays(now, 30)), to: now });
        break;
      case "thismonth":
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        setDateRange({ from: firstDay, to: now });
        break;
      case "all":
        setDateRange({ from: undefined, to: undefined });
        break;
    }
    setIsDatePickerOpen(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRegistrations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRegistrations.map(r => r.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleResendEmail = async (registrationId: string) => {
    setIsResendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke('send-ticket-email', {
        body: { registrationId }
      });

      if (error) {
        toast.error('Failed to send confirmation email');
        return;
      }

      toast.success('Confirmation email sent successfully!');
    } catch (error) {
      toast.error('An error occurred while sending email');
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleSendReminder = async (registrationId: string) => {
    setIsResendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke('send-payment-reminder', {
        body: { registrationId }
      });

      if (error) {
        toast.error('Failed to send payment reminder');
        return;
      }

      toast.success('Payment reminder sent successfully!');
    } catch (error) {
      toast.error('An error occurred while sending reminder');
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleUpdateGuestDetails = async () => {
    if (!selectedRegistration) return;
    
    try {
      const newInternalNotes = (selectedRegistration.metadata as any)?.internal_notes ?? null;
      const mergedMetadata = {
        ...((selectedRegistration.metadata as any) || {}),
        internal_notes: newInternalNotes,
      };

      const { error } = await supabase
        .from('registrations')
        .update({
          name: selectedRegistration.name,
          email: selectedRegistration.email,
          plus_one_name: selectedRegistration.plus_one_name,
          dietary_notes: selectedRegistration.dietary_notes,
          metadata: mergedMetadata,
        })
        .eq('id', selectedRegistration.id);

      if (error) {
        toast.error('Failed to update guest details');
        return;
      }

      toast.success('Guest details updated successfully!');
      setIsEditingGuestDetails(false);
      refetchRegistrations();
    } catch (error) {
      toast.error('An error occurred while updating');
    }
  };

  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .in('id', selectedIds);
      if (error) throw error;
      toast.success(`Deleted ${selectedIds.length} registration${selectedIds.length === 1 ? '' : 's'}`);
      setSelectedIds([]);
      setShowBulkDelete(false);
      refetchRegistrations();
    } catch (err: any) {
      console.error('Bulk delete failed:', err);
      toast.error(err?.message || 'Failed to delete registrations');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <AdminBadge intent="success">Paid</AdminBadge>;
      case "pending":
        return <AdminBadge intent="warning">Pending</AdminBadge>;
      case "failed":
        return <AdminBadge intent="danger">Failed</AdminBadge>;
      default:
        return <AdminBadge intent="neutral">{status}</AdminBadge>;
    }
  };

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-primary))]"></div>
      </div>
    );
  }

  // View tabs for DatabaseView
  const viewTabs: DatabaseViewTab[] = [
    { id: "paid", label: "Paid", type: "table" },
    { id: "pending", label: "Pending", type: "table" },
    { id: "all", label: "All", type: "table" },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Registrations"
        subtitle={`${filteredRegistrations.length} registration${filteredRegistrations.length !== 1 ? 's' : ''} ${eventViewFilter === "current" ? "for Cosmico 2026" : "from past events"}`}
        icon={Ticket}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/checkin">
              <AdminButton variant="outline" size="sm" className="gap-2 h-8">
                <QrCode className="h-4 w-4" />
                <span className="hidden xs:inline">Check-In</span>
              </AdminButton>
            </Link>
            <Link to="/printable-manifest">
              <AdminButton variant="outline" size="sm" className="gap-2 h-8">
                <Printer className="h-4 w-4" />
                <span className="hidden xs:inline">Print</span>
              </AdminButton>
            </Link>
            <AdminButton onClick={exportToCSV} size="sm" className="gap-2 h-8">
              <Download className="h-4 w-4" />
              <span className="hidden xs:inline">Export</span>
            </AdminButton>
          </div>
        }
      />

      {/* Event tabs */}
      <AdminTabs value={eventViewFilter} onValueChange={(v) => setEventViewFilter(v as "current" | "past")} className="w-fit">
        <AdminTabsList>
          <AdminTabsTrigger value="current">
            Cosmico 2026
          </AdminTabsTrigger>
          <AdminTabsTrigger value="past">
            Past Events
          </AdminTabsTrigger>
        </AdminTabsList>
      </AdminTabs>

      {/* DatabaseView wrapper */}
      <DatabaseView
        tabs={viewTabs}
        activeTab={dataViewFilter}
        onTabChange={(tab) => setDataViewFilter(tab as "paid" | "pending" | "all")}
        searchPlaceholder="Search by name or email..."
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        selectedCount={selectedIds.length}
        bulkActions={[
          { label: "Send Confirmation", icon: <Mail className="h-3 w-3" />, onClick: () => toast.info("Use bulk operations below") },
          { label: "Export Selected", icon: <Download className="h-3 w-3" />, onClick: exportToCSV },
        ]}
        onClearSelection={() => setSelectedIds([])}
        onExport={exportToCSV}
      >
        {/* Additional filters row */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Ticket Type Filter - Dynamic from data */}
          <AdminSelect value={ticketTypeFilter} onValueChange={setTicketTypeFilter} placeholder="Type">
            <AdminSelectItem value="all">All Types</AdminSelectItem>
            {uniqueTicketTypes.map((type) => (
              <AdminSelectItem key={type} value={type}>
                {formatTicketType(type)}
              </AdminSelectItem>
            ))}
          </AdminSelect>

          {/* Date Range - Using AdminSheet instead of Popover */}
          <AdminSheet open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <AdminSheetTrigger asChild>
              <AdminButton variant="outline" size="sm" className={cn("h-8 justify-start text-left font-normal", !dateRange.from && !dateRange.to && "text-[hsl(var(--admin-text-muted))]")}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {dateRange.from ? (
                  dateRange.to ? (
                    <span className="text-xs">
                      {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                    </span>
                  ) : (
                    <span className="text-xs">{format(dateRange.from, "MMM d, yyyy")}</span>
                  )
                ) : (
                  <span className="text-xs">Date range</span>
                )}
                {(dateRange.from || dateRange.to) && (
                  <X
                    className="ml-2 h-3 w-3 opacity-50 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDateRange({ from: undefined, to: undefined });
                    }}
                  />
                )}
              </AdminButton>
            </AdminSheetTrigger>
            <AdminSheetContent side="bottom" className="h-auto max-h-[80vh]">
              <div className="p-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <AdminButton size="sm" variant="ghost" onClick={() => setDatePreset("7days")} className="h-8 text-xs">
                    Last 7 days
                  </AdminButton>
                  <AdminButton size="sm" variant="ghost" onClick={() => setDatePreset("30days")} className="h-8 text-xs">
                    Last 30 days
                  </AdminButton>
                  <AdminButton size="sm" variant="ghost" onClick={() => setDatePreset("all")} className="h-8 text-xs">
                    All time
                  </AdminButton>
                </div>
                <AdminCalendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={1}
                />
                <AdminButton onClick={() => setIsDatePickerOpen(false)} className="w-full">
                  Apply
                </AdminButton>
              </div>
            </AdminSheetContent>
          </AdminSheet>
        </div>

        {/* Bulk operations component when items selected */}
        {selectedIds.length > 0 && (
          <div className="mb-4">
            <BulkOperations
              selectedIds={selectedIds}
              registrations={registrations}
              onComplete={() => {
                setSelectedIds([]);
                refetchRegistrations();
              }}
            />
          </div>
        )}

      {/* Mobile Card View */}
      {isMobile ? (
        <div className="space-y-3">
          {/* Mobile Select All */}
          <div className="flex items-center gap-2 px-1">
            <AdminCheckbox
              checked={selectedIds.length === filteredRegistrations.length && filteredRegistrations.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-[hsl(var(--admin-text-muted))]">
              {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select all"}
            </span>
          </div>
          
          {filteredRegistrations
            .slice((currentPage - 1) * pageSize, currentPage * pageSize)
            .map((registration) => (
              <AdminCard key={registration.id} className="p-3">
                <div className="flex items-start gap-3">
                  <AdminCheckbox
                    checked={selectedIds.includes(registration.id)}
                    onCheckedChange={() => toggleSelectOne(registration.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{registration.name}</p>
                        <p className="text-sm text-[hsl(var(--admin-text-muted))] truncate">{registration.email}</p>
                      </div>
                      {getStatusBadge(registration.payment_status)}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-sm text-[hsl(var(--admin-text-muted))]">
                      <span>
                        {formatTicketType(registration.ticket_type)}
                        {(registration.quantity || 1) > 1 && ` × ${registration.quantity}`}
                      </span>
                      <span>
                        ${((registration.total_amount + (upgradeTotals[registration.id] || 0)) / 100).toFixed(0)}
                        {upgradeTotals[registration.id] > 0 && <span className="text-xs ml-0.5">+</span>}
                      </span>
                      <span>{new Date(registration.created_at).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</span>
                    </div>
                    {eventViewFilter === "past" && (
                      <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                        {eventNames[registration.event_id] || "Unknown Event"}
                      </p>
                    )}
                  </div>
                  <AdminButton
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setSelectedRegistration(registration)}
                  >
                    <Eye className="h-4 w-4" />
                  </AdminButton>
                </div>
              </AdminCard>
            ))}
          
          {/* Mobile Pagination */}
          {filteredRegistrations.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredRegistrations.length)} of {filteredRegistrations.length}
              </span>
              <div className="flex items-center gap-1">
                <AdminButton
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </AdminButton>
                <AdminButton
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredRegistrations.length / pageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(filteredRegistrations.length / pageSize)}
                >
                  <ChevronRight className="h-4 w-4" />
                </AdminButton>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Desktop Table View */
        <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden bg-[hsl(var(--admin-surface))]">
          <div className="overflow-x-auto">
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                  <AdminTableHead className="w-[50px]">
                    <AdminCheckbox
                      checked={selectedIds.length === filteredRegistrations.length && filteredRegistrations.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </AdminTableHead>
                  <AdminTableHead className="min-w-[120px]">
                    <AdminButton variant="ghost" onClick={() => handleSort("name")} className="flex items-center gap-1 px-0 h-auto">
                      Name
                      <ArrowUpDown className="h-3 w-3" />
                    </AdminButton>
                  </AdminTableHead>
                  <AdminTableHead className="min-w-[180px] hidden md:table-cell">Email</AdminTableHead>
                  {eventViewFilter === "past" && (
                    <AdminTableHead className="min-w-[120px]">Event</AdminTableHead>
                  )}
                  <AdminTableHead className="min-w-[100px]">
                    <AdminButton variant="ghost" onClick={() => handleSort("ticket_type")} className="flex items-center gap-1 px-0 h-auto">
                      Type
                      <ArrowUpDown className="h-3 w-3" />
                    </AdminButton>
                  </AdminTableHead>
                  <AdminTableHead className="min-w-[80px]">
                    <AdminButton variant="ghost" onClick={() => handleSort("total_amount")} className="flex items-center gap-1 px-0 h-auto">
                      Amount
                      <ArrowUpDown className="h-3 w-3" />
                    </AdminButton>
                  </AdminTableHead>
                  <AdminTableHead className="min-w-[80px]">
                    <AdminButton variant="ghost" onClick={() => handleSort("payment_status")} className="flex items-center gap-1 px-0 h-auto">
                      Status
                      <ArrowUpDown className="h-3 w-3" />
                    </AdminButton>
                  </AdminTableHead>
                  <AdminTableHead className="min-w-[90px] hidden sm:table-cell">
                    <AdminButton variant="ghost" onClick={() => handleSort("created_at")} className="flex items-center gap-1 px-0 h-auto">
                      Created
                      <ArrowUpDown className="h-3 w-3" />
                    </AdminButton>
                  </AdminTableHead>
                  <AdminTableHead className="w-[70px]">Actions</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {filteredRegistrations
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((registration) => (
                  <AdminTableRow key={registration.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell>
                      <AdminCheckbox
                        checked={selectedIds.includes(registration.id)}
                        onCheckedChange={() => toggleSelectOne(registration.id)}
                      />
                    </AdminTableCell>
                    <AdminTableCell className="font-medium">{registration.name}</AdminTableCell>
                    <AdminTableCell className="hidden md:table-cell text-sm text-[hsl(var(--admin-text-muted))]">{registration.email}</AdminTableCell>
                    {eventViewFilter === "past" && (
                      <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                        {eventNames[registration.event_id] || "Unknown"}
                      </AdminTableCell>
                    )}
                    <AdminTableCell className="text-sm">
                      {formatTicketType(registration.ticket_type)}
                      {(registration.quantity || 1) > 1 && (
                        <span className="text-[hsl(var(--admin-text-muted))]"> × {registration.quantity}</span>
                      )}
                    </AdminTableCell>
                    <AdminTableCell className="text-sm">
                      ${((registration.total_amount + (upgradeTotals[registration.id] || 0)) / 100).toFixed(0)}
                      {upgradeTotals[registration.id] > 0 && (
                        <span className="text-xs text-[hsl(var(--admin-text-muted))] ml-0.5">+</span>
                      )}
                    </AdminTableCell>
                    <AdminTableCell>{getStatusBadge(registration.payment_status)}</AdminTableCell>
                    <AdminTableCell className="hidden sm:table-cell text-sm text-[hsl(var(--admin-text-muted))]">{new Date(registration.created_at).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}</AdminTableCell>
                    <AdminTableCell>
                      <AdminButton
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSelectedRegistration(registration)}
                      >
                        View
                      </AdminButton>
                    </AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          </div>

          {/* Pagination Controls */}
          {filteredRegistrations.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
              <div className="flex items-center gap-2 text-xs text-[hsl(var(--admin-text-muted))]">
                <span className="hidden sm:inline">Show</span>
                <AdminSelect value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                  <AdminSelectItem value="10">10</AdminSelectItem>
                  <AdminSelectItem value="25">25</AdminSelectItem>
                  <AdminSelectItem value="50">50</AdminSelectItem>
                  <AdminSelectItem value="100">100</AdminSelectItem>
                </AdminSelect>
                <span>of {filteredRegistrations.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <AdminButton
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </AdminButton>
                <span className="px-2 text-xs text-[hsl(var(--admin-text-muted))]">
                  {currentPage} / {Math.ceil(filteredRegistrations.length / pageSize) || 1}
                </span>
                <AdminButton
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredRegistrations.length / pageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(filteredRegistrations.length / pageSize)}
                >
                  <ChevronRight className="h-4 w-4" />
                </AdminButton>
              </div>
            </div>
          )}
        </div>
      )}
      </DatabaseView>

      <AdminSheet open={!!selectedRegistration} onOpenChange={(open) => {
        if (!open) {
          setSelectedRegistration(null);
          if (searchParams.get("id")) {
            const next = new URLSearchParams(searchParams);
            next.delete("id");
            setSearchParams(next, { replace: true });
          }
        }
      }}>
        <AdminSheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <AdminSheetHeader className="border-b border-[hsl(var(--admin-border))] pb-4">
            <AdminSheetTitle>Registration Details</AdminSheetTitle>
          </AdminSheetHeader>
          {selectedRegistration && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <AdminLabel>Name</AdminLabel>
                  <AdminInput
                    value={selectedRegistration.name}
                    onChange={(e) => setSelectedRegistration({ ...selectedRegistration, name: e.target.value })}
                    disabled={!isEditingGuestDetails}
                  />
                </div>
                <div>
                  <AdminLabel>Email</AdminLabel>
                  <AdminInput
                    value={selectedRegistration.email}
                    onChange={(e) => setSelectedRegistration({ ...selectedRegistration, email: e.target.value })}
                    disabled={!isEditingGuestDetails}
                  />
                </div>
                <div>
                  <AdminLabel>Ticket Type</AdminLabel>
                  <AdminInput
                    value={formatTicketType(selectedRegistration.ticket_type)}
                    disabled
                  />
                </div>
                <div>
                  <AdminLabel>Quantity</AdminLabel>
                  <AdminInput
                    value={`${selectedRegistration.quantity || 1} ticket${(selectedRegistration.quantity || 1) > 1 ? 's' : ''}`}
                    disabled
                  />
                </div>
                <div>
                  <AdminLabel>Payment Status</AdminLabel>
                  <div className="mt-2">{getStatusBadge(selectedRegistration.payment_status)}</div>
                </div>
                <div className="col-span-2">
                  <AdminLabel>Guest Names</AdminLabel>
                  <AdminInput
                    value={selectedRegistration.plus_one_name || ''}
                    onChange={(e) => setSelectedRegistration({ ...selectedRegistration, plus_one_name: e.target.value })}
                    disabled={!isEditingGuestDetails}
                    placeholder="Enter guest names separated by commas"
                  />
                </div>
                <div className="col-span-2">
                  <AdminLabel>Dietary Notes</AdminLabel>
                  <AdminInput
                    value={selectedRegistration.dietary_notes || ''}
                    onChange={(e) => setSelectedRegistration({ ...selectedRegistration, dietary_notes: e.target.value })}
                    disabled={!isEditingGuestDetails}
                  />
                </div>
                <div className="col-span-2">
                  <AdminLabel>Internal Notes</AdminLabel>
                  <AdminTextarea
                    value={(selectedRegistration.metadata as any)?.internal_notes ?? (selectedRegistration.metadata as any)?.comp_notes ?? ''}
                    onChange={(e) => setSelectedRegistration({
                      ...selectedRegistration,
                      metadata: {
                        ...((selectedRegistration.metadata as any) || {}),
                        internal_notes: e.target.value,
                      },
                    })}
                    disabled={!isEditingGuestDetails}
                    placeholder="Admin-only notes (volunteer status, comp details, follow-ups…)"
                    rows={3}
                  />
                </div>
              </div>

              {selectedRegistration && (
                <RegistrationOrderExtras
                  registrationId={selectedRegistration.id}
                  email={selectedRegistration.email}
                  ticketAmountCents={selectedRegistration.total_amount}
                  ticketLabel={`${selectedRegistration.quantity || 1}x ${formatTicketType(selectedRegistration.ticket_type)}`}
                  ticketPaid={selectedRegistration.payment_status === "paid"}
                  registrationCreatedAt={selectedRegistration.created_at}
                />
              )}

              {selectedRegistration.payment_status === "paid" && (
                <div className="border-t pt-4">
                  <PaymentHistory 
                    registrationId={selectedRegistration.id}
                    originalAmount={selectedRegistration.total_amount}
                    originalTicketType={selectedRegistration.ticket_type}
                    purchaseDate={selectedRegistration.created_at}
                    compUpgradeAmount={selectedRegistration.comp_upgrade_amount || 0}
                  />
                </div>
              )}

              {selectedRegistration.payment_status === "paid" && (
                <AttendeeManager
                  registration={selectedRegistration}
                  onChanged={() => {
                    refetchRegistrations();
                    // Refresh the local sheet view by re-fetching the row
                    supabase
                      .from("registrations")
                      .select("*")
                      .eq("id", selectedRegistration.id)
                      .single()
                      .then(({ data }) => {
                        if (data) setSelectedRegistration(data as any);
                      });
                  }}
                />
              )}

              {/* Email Previews */}
              <div className="flex flex-wrap gap-2">
                {selectedRegistration.payment_status === "paid" && (
                  <AdminButton variant="outline" size="sm" asChild>
                    <Link to={`/admin/tickets?search=${encodeURIComponent(selectedRegistration.email)}`}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refund / manage tickets
                    </Link>
                  </AdminButton>
                )}
                {selectedRegistration.payment_status === "paid" && (
                  <EmailPreviewModal
                    type="ticket_confirmation"
                    name={selectedRegistration.name}
                    email={selectedRegistration.email}
                    ticketType={selectedRegistration.ticket_type}
                    quantity={selectedRegistration.quantity || 1}
                    totalAmount={selectedRegistration.total_amount}
                    donationAmount={selectedRegistration.donation_amount}
                    confirmationCode={selectedRegistration.id.substring(0, 8).toUpperCase()}
                    trigger={
                      <AdminButton variant="outline" size="sm">
                        <Mail className="w-4 h-4 mr-2" />
                        Preview Confirmation Email
                      </AdminButton>
                    }
                  />
                )}
                {selectedRegistration.payment_status === "pending" && (
                  <EmailPreviewModal
                    type="payment_reminder"
                    name={selectedRegistration.name}
                    email={selectedRegistration.email}
                    ticketType={selectedRegistration.ticket_type}
                    totalAmount={selectedRegistration.total_amount}
                    trigger={
                      <AdminButton variant="outline" size="sm">
                        <Mail className="w-4 h-4 mr-2" />
                        Preview Reminder Email
                      </AdminButton>
                    }
                  />
                )}
              </div>

              <div className="flex gap-2">
                {isEditingGuestDetails ? (
                  <>
                    <AdminButton onClick={handleUpdateGuestDetails}>Save Changes</AdminButton>
                    <AdminButton variant="outline" onClick={() => setIsEditingGuestDetails(false)}>Cancel</AdminButton>
                  </>
                ) : (
                  <>
                    <AdminButton onClick={() => setIsEditingGuestDetails(true)}>Edit Details</AdminButton>
                    {selectedRegistration.payment_status === "paid" && (
                      <AdminButton variant="outline" onClick={() => handleResendEmail(selectedRegistration.id)} disabled={isResendingEmail}>
                        Resend Email
                      </AdminButton>
                    )}
                    {selectedRegistration.payment_status === "pending" && (
                      <>
                        <AdminButton variant="outline" onClick={() => handleSendReminder(selectedRegistration.id)} disabled={isResendingEmail}>
                          Send Reminder
                        </AdminButton>
                        <ManualPayment registrationId={selectedRegistration.id} onComplete={refetchRegistrations} />
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="border-t pt-4">
                <QRCodeDisplay registrationId={selectedRegistration.id} name={selectedRegistration.name} />
              </div>
            </div>
          )}
        </AdminSheetContent>
      </AdminSheet>

      {/* Floating bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          commonBulkActions.email(() => toast.info("Use the bulk operations panel above")),
          commonBulkActions.export(exportToCSV),
          commonBulkActions.delete(() => setShowBulkDelete(true)),
        ]}
      />

      <AdminConfirmDialog
        open={showBulkDelete}
        onOpenChange={setShowBulkDelete}
        title={`Delete ${selectedIds.length} registration${selectedIds.length === 1 ? '' : 's'}?`}
        description="This permanently removes the selected registrations. Use this for test or duplicate records — paid orders should be refunded instead."
        consequences={[
          "Removes the registration row(s) from the database",
          "QR codes and tickets tied to these records will no longer be valid",
          "This cannot be undone",
        ]}
        actionType="destructive"
        actionLabel={isDeleting ? "Deleting…" : "Delete permanently"}
        icon="delete"
        isLoading={isDeleting}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
