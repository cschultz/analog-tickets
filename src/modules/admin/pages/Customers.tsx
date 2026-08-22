import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { AdminCard, AdminStatCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminToolbar,
  AdminToolbarLeft,
  AdminToolbarRight,
  AdminSearchInput,
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
  AdminTableEmpty,
  AdminTableLoading,
  AdminBadge,
  AdminPagination,
  AdminButton,
} from "@/components/admin";
import { AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { AdminSelect, AdminSelectItem } from "@/components/admin";
import { BulkActionBar, commonBulkActions } from "@/components/admin/BulkActionBar";
import { Users, DollarSign, Ticket, TrendingUp, Download, Eye, ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  total_amount: number;
  quantity: number;
  payment_status: string;
  checked_in: boolean;
  checked_in_at: string | null;
  dietary_notes: string | null;
  plus_one_name: string | null;
  created_at: string;
  event_id: string;
  order_number: string | null;
}

interface Event {
  id: string;
  title: string;
  event_date: string;
}

interface UpgradeOffer {
  id: string;
  registration_id: string;
  total_amount: number;
  status: string;
  upgrade_from: string;
  upgrade_to: string;
  paid_at: string | null;
}

interface CustomerProfile {
  email: string;
  names: string[];
  totalSpent: number;
  totalTickets: number;
  totalUpgrades: number;
  eventsAttended: string[];
  firstPurchase: Date;
  lastPurchase: Date;
  averageOrderValue: number;
  ticketTypes: Record<string, number>;
  checkInRate: number;
  dietaryNotes: string[];
  registrations: (Registration & { eventTitle: string })[];
  upgrades: UpgradeOffer[];
}

export default function CustomersPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  // Use auth-gated queries for data fetching
  const { data: registrations = [], isLoading: regLoading } = useAuthQuery({
    queryKey: ["customers-registrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Registration[];
    },
    staleTime: 60 * 1000, // 1 minute
  });

  const { data: events = [] } = useAuthQuery({
    queryKey: ["customers-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("id, title, event_date");
      if (error) throw error;
      return data as Event[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - events don't change often
  });

  const { data: upgrades = [] } = useAuthQuery({
    queryKey: ["customers-upgrades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("upgrade_offers")
        .select("*")
        .eq("status", "paid");
      if (error) throw error;
      return data as UpgradeOffer[];
    },
    staleTime: 60 * 1000, // 1 minute
  });

  const loading = regLoading;

  const eventMap = useMemo(() => {
    const map: Record<string, Event> = {};
    events.forEach(e => map[e.id] = e);
    return map;
  }, [events]);

  const customerProfiles = useMemo(() => {
    const profileMap: Record<string, CustomerProfile> = {};

    registrations.forEach(reg => {
      const email = reg.email.toLowerCase();
      if (!profileMap[email]) {
        profileMap[email] = {
          email,
          names: [],
          totalSpent: 0,
          totalTickets: 0,
          totalUpgrades: 0,
          eventsAttended: [],
          firstPurchase: new Date(reg.created_at),
          lastPurchase: new Date(reg.created_at),
          averageOrderValue: 0,
          ticketTypes: {},
          checkInRate: 0,
          dietaryNotes: [],
          registrations: [],
          upgrades: []
        };
      }

      const profile = profileMap[email];
      
      if (!profile.names.includes(reg.name)) {
        profile.names.push(reg.name);
      }

      if (reg.payment_status === "paid") {
        profile.totalSpent += reg.total_amount;
        profile.totalTickets += reg.quantity;
      }

      const eventTitle = eventMap[reg.event_id]?.title || "Unknown Event";
      if (!profile.eventsAttended.includes(eventTitle)) {
        profile.eventsAttended.push(eventTitle);
      }

      const regDate = new Date(reg.created_at);
      if (regDate < profile.firstPurchase) profile.firstPurchase = regDate;
      if (regDate > profile.lastPurchase) profile.lastPurchase = regDate;

      profile.ticketTypes[reg.ticket_type] = (profile.ticketTypes[reg.ticket_type] || 0) + reg.quantity;

      if (reg.dietary_notes && !profile.dietaryNotes.includes(reg.dietary_notes)) {
        profile.dietaryNotes.push(reg.dietary_notes);
      }

      profile.registrations.push({ ...reg, eventTitle });
    });

    upgrades.forEach(upgrade => {
      const reg = registrations.find(r => r.id === upgrade.registration_id);
      if (reg) {
        const email = reg.email.toLowerCase();
        if (profileMap[email]) {
          profileMap[email].upgrades.push(upgrade);
          profileMap[email].totalUpgrades += upgrade.total_amount;
          profileMap[email].totalSpent += upgrade.total_amount;
        }
      }
    });

    Object.values(profileMap).forEach(profile => {
      const paidRegistrations = profile.registrations.filter(r => r.payment_status === "paid");
      const orderCount = paidRegistrations.length + profile.upgrades.length;
      profile.averageOrderValue = orderCount > 0 ? profile.totalSpent / orderCount : 0;
      
      const checkedIn = paidRegistrations.filter(r => r.checked_in).length;
      profile.checkInRate = paidRegistrations.length > 0 ? (checkedIn / paidRegistrations.length) * 100 : 0;
    });

    return Object.values(profileMap).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [registrations, events, upgrades, eventMap]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customerProfiles;
    const term = searchTerm.toLowerCase();
    return customerProfiles.filter(
      c => c.email.includes(term) || 
           c.names.some(n => n.toLowerCase().includes(term)) ||
           c.registrations.some(r => r.order_number?.toLowerCase().includes(term))
    );
  }, [customerProfiles, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredCustomers.length / pageSize);
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(startIndex, startIndex + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  const totals = useMemo(() => ({
    customers: customerProfiles.length,
    revenue: customerProfiles.reduce((sum, c) => sum + c.totalSpent, 0),
    tickets: customerProfiles.reduce((sum, c) => sum + c.totalTickets, 0),
    avgValue: customerProfiles.length > 0 
      ? customerProfiles.reduce((sum, c) => sum + c.totalSpent, 0) / customerProfiles.length 
      : 0
  }), [customerProfiles]);

  const exportToCSV = (selectedOnly = false) => {
    const toExport = selectedOnly && selectedEmails.length > 0
      ? filteredCustomers.filter(c => selectedEmails.includes(c.email))
      : filteredCustomers;
      
    const headers = ["Email", "Name(s)", "Total Spent", "Total Tickets", "Events Attended", "First Purchase", "Last Purchase", "Check-In Rate", "Dietary Notes"];
    const rows = toExport.map(c => [
      c.email,
      c.names.join("; "),
      (c.totalSpent / 100).toFixed(2),
      c.totalTickets,
      c.eventsAttended.join("; "),
      format(c.firstPurchase, "yyyy-MM-dd"),
      format(c.lastPurchase, "yyyy-MM-dd"),
      c.checkInRate.toFixed(0) + "%",
      c.dietaryNotes.join("; ")
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-profiles-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${toExport.length} customer(s)`);
  };

  const toggleSelectAll = () => {
    if (selectedEmails.length === paginatedCustomers.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(paginatedCustomers.map(c => c.email));
    }
  };

  const toggleSelect = (email: string) => {
    setSelectedEmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-primary))]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Users}
        title="Customers"
        subtitle={`${totals.customers.toLocaleString()} total customers`}
        actions={
          <AdminButton onClick={() => exportToCSV()} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </AdminButton>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard
          label="Customers"
          value={totals.customers.toLocaleString()}
          icon={Users}
        />
        <AdminStatCard
          label="Revenue"
          value={`$${(totals.revenue / 100).toLocaleString()}`}
          icon={DollarSign}
        />
        <AdminStatCard
          label="Tickets"
          value={totals.tickets.toLocaleString()}
          icon={Ticket}
        />
        <AdminStatCard
          label="Avg Value"
          value={`$${(totals.avgValue / 100).toFixed(0)}`}
          icon={TrendingUp}
        />
      </div>

      {/* Toolbar */}
      <AdminToolbar>
        <AdminToolbarLeft>
          <AdminSearchInput
            placeholder="Search by name, email, or order #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-72"
          />
        </AdminToolbarLeft>
        <AdminToolbarRight>
          <AdminSelect value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))} className="w-20">
            <AdminSelectItem value="25">25</AdminSelectItem>
            <AdminSelectItem value="50">50</AdminSelectItem>
            <AdminSelectItem value="100">100</AdminSelectItem>
          </AdminSelect>
        </AdminToolbarRight>
      </AdminToolbar>

      {/* Customer List */}
      {isMobile ? (
        /* Mobile Card View */
        <div className="space-y-3">
          {paginatedCustomers.map((customer) => (
            <AdminCard 
              key={customer.email} 
              className="p-3 cursor-pointer hover:bg-[hsl(var(--admin-hover))] transition-colors"
              onClick={() => navigate(`/admin/customers/${encodeURIComponent(customer.email)}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-[hsl(var(--admin-text))]">{customer.names[0]}</p>
                  <p className="text-sm text-[hsl(var(--admin-text-muted))] truncate">{customer.email}</p>
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="font-semibold text-[hsl(var(--admin-text))]">${(customer.totalSpent / 100).toLocaleString()}</span>
                    <span className="text-[hsl(var(--admin-text-muted))]">{customer.totalTickets} tickets</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {customer.eventsAttended.slice(0, 2).map((event, i) => (
                      <AdminBadge key={i} intent="neutral" size="sm">
                        {event.length > 15 ? event.slice(0, 15) + "…" : event}
                      </AdminBadge>
                    ))}
                    {customer.eventsAttended.length > 2 && (
                      <AdminBadge intent="neutral" size="sm">
                        +{customer.eventsAttended.length - 2}
                      </AdminBadge>
                    )}
                  </div>
                </div>
                <Eye className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0 mt-1" />
              </div>
            </AdminCard>
          ))}
          
          {/* Mobile Pagination */}
          {filteredCustomers.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredCustomers.length)} of {filteredCustomers.length}
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
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </AdminButton>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Desktop Table View */
        <>
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                <AdminTableHead className="w-10">
                  <AdminCheckbox
                    checked={selectedEmails.length === paginatedCustomers.length && paginatedCustomers.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Customer</AdminTableHead>
                <AdminTableHead className="text-right font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Spent</AdminTableHead>
                <AdminTableHead className="text-right font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Tickets</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden lg:table-cell">Events</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden md:table-cell">First</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden md:table-cell">Last</AdminTableHead>
                <AdminTableHead className="w-10"></AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {loading ? (
                <AdminTableLoading rows={10} cols={8} />
              ) : paginatedCustomers.length === 0 ? (
                <AdminTableEmpty
                  icon={<Users className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />}
                  title="No customers found"
                  description="No customers match your search criteria."
                />
              ) : (
                paginatedCustomers.map((customer) => (
                  <AdminTableRow 
                    key={customer.email} 
                    className="hover:bg-[hsl(var(--admin-hover))]"
                    data-selected={selectedEmails.includes(customer.email)}
                  >
                    <AdminTableCell onClick={(e) => e.stopPropagation()}>
                      <AdminCheckbox
                        checked={selectedEmails.includes(customer.email)}
                        onCheckedChange={() => toggleSelect(customer.email)}
                      />
                    </AdminTableCell>
                    <AdminTableCell className="py-3">
                      <div>
                        <div className="font-medium text-sm text-[hsl(var(--admin-text))]">{customer.names[0]}</div>
                        <div className="text-xs text-[hsl(var(--admin-text-muted))]">{customer.email}</div>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="text-right font-semibold text-sm text-[hsl(var(--admin-text))]">
                      ${(customer.totalSpent / 100).toLocaleString()}
                    </AdminTableCell>
                    <AdminTableCell className="text-right text-sm text-[hsl(var(--admin-text))]">{customer.totalTickets}</AdminTableCell>
                    <AdminTableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {customer.eventsAttended.slice(0, 2).map((event, i) => (
                          <AdminBadge key={i} intent="neutral" size="sm">
                            {event.length > 12 ? event.slice(0, 12) + "…" : event}
                          </AdminBadge>
                        ))}
                        {customer.eventsAttended.length > 2 && (
                          <AdminBadge intent="neutral" size="sm">
                            +{customer.eventsAttended.length - 2}
                          </AdminBadge>
                        )}
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-[hsl(var(--admin-text-muted))] hidden md:table-cell">
                      {format(customer.firstPurchase, "MMM d, yyyy")}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-[hsl(var(--admin-text-muted))] hidden md:table-cell">
                      {format(customer.lastPurchase, "MMM d, yyyy")}
                    </AdminTableCell>
                    <AdminTableCell>
                      <AdminButton 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onClick={() => navigate(`/admin/customers/${encodeURIComponent(customer.email)}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </AdminButton>
                    </AdminTableCell>
                  </AdminTableRow>
                ))
              )}
            </AdminTableBody>
          </AdminTable>

          {/* Pagination Controls */}
          {filteredCustomers.length > 0 && (
            <AdminPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedEmails.length}
        onClearSelection={() => setSelectedEmails([])}
        actions={[
          commonBulkActions.email(() => toast.info("Email feature coming soon")),
          commonBulkActions.export(() => exportToCSV(true)),
        ]}
      />
    </div>
  );
}
