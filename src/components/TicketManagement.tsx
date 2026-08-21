import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardDescription, 
  AdminCardHeader, 
  AdminCardTitle 
} from "@/components/admin/AdminCard";
import {
  AdminTabs,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTabsContent,
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
} from "@/components/admin";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin/AdminDialog";
import { AdminLabel, AdminSwitch } from "@/components/admin/AdminFormPrimitives";
import { AdminInput, AdminTextarea, AdminButton } from "@/components/admin";
import { ArrowRightLeft, RefreshCw, History, Clock, XCircle, Users, Send, Ticket, Home, Gift, ChevronRight, ChevronDown } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import IssueCompTicket from "@/components/admin/IssueCompTicket";
import CompTicketsTable from "@/components/admin/CompTicketsTable";

export function TicketManagement() {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const toggleOrder = (regId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(regId)) next.delete(regId); else next.add(regId);
      return next;
    });
  };
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [newHolderName, setNewHolderName] = useState("");
  const [newHolderEmail, setNewHolderEmail] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [isPartialRefund, setIsPartialRefund] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTicketId, setHistoryTicketId] = useState<string | null>(null);
  const [lodgingSearchQuery, setLodgingSearchQuery] = useState("");
  const [lodgingRefundDialogOpen, setLodgingRefundDialogOpen] = useState(false);
  const [selectedLodging, setSelectedLodging] = useState<any>(null);
  const [lodgingRefundReason, setLodgingRefundReason] = useState("");
  const [lodgingRefundAmount, setLodgingRefundAmount] = useState("");
  const [isLodgingPartialRefund, setIsLodgingPartialRefund] = useState(false);
  const [compDialogOpen, setCompDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: tickets, isLoading } = useAuthQuery({
    queryKey: ["tickets", searchQuery],
    queryFn: async () => {
      // First find matching registration ids when searching, so guest seats also surface
      let matchedRegIds: string[] = [];
      if (searchQuery) {
        const { data: regs } = await supabase
          .from("registrations")
          .select("id")
          .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
        matchedRegIds = (regs || []).map((r: any) => r.id);
      }

      let query = supabase
        .from("tickets")
        .select("*, registrations(name, email, event_id, payment_status, stripe_session_id, quantity, total_amount)")
        .order("created_at", { ascending: false });

      if (searchQuery) {
        const orParts = [
          `holder_name.ilike.%${searchQuery}%`,
          `holder_email.ilike.%${searchQuery}%`,
        ];
        if (matchedRegIds.length > 0) {
          orParts.push(`registration_id.in.(${matchedRegIds.join(",")})`);
        }
        query = query.or(orParts.join(","));
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching tickets:", error);
        throw error;
      }
      return data;
    },
    staleTime: 30 * 1000,
  });

  // Group tickets by registration_id (order) for collapsible rendering
  const groupedOrders = (() => {
    if (!tickets) return [] as Array<{ regId: string; reg: any; tickets: any[] }>;
    const map = new Map<string, { regId: string; reg: any; tickets: any[] }>();
    for (const t of tickets) {
      const key = t.registration_id || `solo-${t.id}`;
      if (!map.has(key)) {
        map.set(key, { regId: key, reg: t.registrations, tickets: [] });
      }
      map.get(key)!.tickets.push(t);
    }
    return Array.from(map.values());
  })();

  // Query for pending transfers
  const { data: pendingTransfers, isLoading: isLoadingPending } = useAuthQuery({
    queryKey: ["pending-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_ticket_transfers")
        .select("*, tickets(holder_name, ticket_type, event_details(title))")
        .is("completed_at", null)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching pending transfers:", error);
        throw error;
      }
      return data;
    },
    staleTime: 30 * 1000,
  });

  // Query for completed transfers
  const { data: transferHistory, isLoading: isLoadingTransferHistory } = useAuthQuery({
    queryKey: ["transfer-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_transfers")
        .select("*, tickets(holder_name, ticket_type), profiles(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("Error fetching transfer history:", error);
        throw error;
      }
      return data;
    },
    staleTime: 60 * 1000,
  });

  const { data: refundHistory, isLoading: isLoadingHistory } = useAuthQuery({
    queryKey: ["refund-history", historyTicketId],
    queryFn: async () => {
      if (!historyTicketId) return [];
      const { data, error } = await supabase
        .from("refunds")
        .select("*, profiles(full_name, email)")
        .eq("ticket_id", historyTicketId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching refund history:", error);
        throw error;
      }
      return data;
    },
    enabled: !!historyTicketId,
    staleTime: 30 * 1000,
  });

  // Query for lodging bookings
  const { data: lodgingBookings, isLoading: isLoadingLodging } = useAuthQuery({
    queryKey: ["lodging-bookings-admin", lodgingSearchQuery],
    queryFn: async () => {
      let query = supabase
        .from("lodging_bookings")
        .select("*, accommodation_zones(zone_name)")
        .order("created_at", { ascending: false });

      if (lodgingSearchQuery) {
        query = query.ilike("email", `%${lodgingSearchQuery}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching lodging bookings:", error);
        throw error;
      }
      return data;
    },
    staleTime: 30 * 1000,
  });

  const transferMutation = useMutation({
    mutationFn: async ({ ticketId, newHolderName, newHolderEmail }: any) => {
      const { data, error } = await supabase.functions.invoke("transfer-ticket", {
        body: { ticketId, newHolderName, newHolderEmail },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Ticket transferred successfully");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["transfer-history"] });
      setTransferDialogOpen(false);
      resetTransferForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to transfer ticket");
    },
  });

  const cancelPendingTransferMutation = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase
        .from("pending_ticket_transfers")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", transferId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pending transfer cancelled");
      queryClient.invalidateQueries({ queryKey: ["pending-transfers"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to cancel transfer");
    },
  });

  const refundMutation = useMutation({
    mutationFn: async ({ ticketId, reason, amount }: any) => {
      const { data, error } = await supabase.functions.invoke("refund-ticket", {
        body: { ticketId, reason, amount: amount || undefined },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.isPartialRefund ? "Partial refund processed successfully" : "Ticket refunded successfully");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setRefundDialogOpen(false);
      setRefundReason("");
      setRefundAmount("");
      setIsPartialRefund(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to refund ticket");
    },
  });

  const lodgingRefundMutation = useMutation({
    mutationFn: async ({ bookingId, reason, amount }: any) => {
      const { data, error } = await supabase.functions.invoke("refund-lodging", {
        body: { bookingId, reason, amount: amount || undefined },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.isPartialRefund ? "Partial lodging refund processed" : "Lodging refunded successfully");
      queryClient.invalidateQueries({ queryKey: ["lodging-bookings-admin"] });
      setLodgingRefundDialogOpen(false);
      setLodgingRefundReason("");
      setLodgingRefundAmount("");
      setIsLodgingPartialRefund(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to refund lodging");
    },
  });

  const resetTransferForm = () => {
    setNewHolderName("");
    setNewHolderEmail("");
    setSelectedTicket(null);
  };

  const handleTransferClick = (ticket: any) => {
    setSelectedTicket(ticket);
    setNewHolderName("");
    setNewHolderEmail("");
    setTransferDialogOpen(true);
  };

  const handleRefundClick = (ticket: any) => {
    setSelectedTicket(ticket);
    setRefundReason("");
    setRefundAmount("");
    setIsPartialRefund(false);
    setRefundDialogOpen(true);
  };

  const handleHistoryClick = (ticket: any) => {
    setHistoryTicketId(ticket.id);
    setSelectedTicket(ticket);
    setHistoryDialogOpen(true);
  };

  const handleTransfer = () => {
    if (!selectedTicket || !newHolderName || !newHolderEmail) return;
    transferMutation.mutate({
      ticketId: selectedTicket.id,
      newHolderName,
      newHolderEmail,
    });
  };

  const handleRefund = () => {
    if (!selectedTicket) return;
    const amount = isPartialRefund && refundAmount ? parseFloat(refundAmount) : undefined;
    refundMutation.mutate({
      ticketId: selectedTicket.id,
      reason: refundReason,
      amount,
    });
  };

  const handleLodgingRefundClick = (booking: any) => {
    setSelectedLodging(booking);
    setLodgingRefundReason("");
    setLodgingRefundAmount("");
    setIsLodgingPartialRefund(false);
    setLodgingRefundDialogOpen(true);
  };

  const handleLodgingRefund = () => {
    if (!selectedLodging) return;
    const amount = isLodgingPartialRefund && lodgingRefundAmount ? parseFloat(lodgingRefundAmount) : undefined;
    lodgingRefundMutation.mutate({
      bookingId: selectedLodging.id,
      reason: lodgingRefundReason,
      amount,
    });
  };

  const canRefundLodging = (booking: any) => {
    return booking.payment_status === "paid";
  };

  const getLodgingStatusBadge = (status: string) => {
    const intentMap: Record<string, "neutral" | "success" | "warning" | "danger"> = {
      paid: "success",
      pending: "warning",
      refunded: "danger",
      partially_refunded: "warning",
    };
    return <AdminBadge intent={intentMap[status] || "neutral"} showDot>{status.replace("_", " ")}</AdminBadge>;
  };

  const getStatusBadge = (status: string) => {
    const intentMap: Record<string, "neutral" | "success" | "warning" | "danger"> = {
      active: "success",
      transferred: "neutral",
      used: "neutral",
      refunded: "danger",
      cancelled: "danger",
    };

    return <AdminBadge intent={intentMap[status] || "neutral"} showDot>{status}</AdminBadge>;
  };

  const canTransfer = (ticket: any) => {
    return (
      ticket.status === "active" &&
      !ticket.checked_in_at &&
      ticket.is_transferable !== false
    );
  };

  const canRefund = (ticket: any) => {
    return (
      ticket.status === "active" &&
      ticket.registrations?.payment_status === "paid"
    );
  };

  const pendingCount = pendingTransfers?.filter(t => new Date(t.expires_at) > new Date()).length || 0;

  return (
    <div className="space-y-6">
      <AdminTabs defaultValue="tickets">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <AdminTabsList>
            <AdminTabsTrigger value="tickets">
              <Ticket className="h-4 w-4 mr-2" />
              Tickets
            </AdminTabsTrigger>
            <AdminTabsTrigger value="comps">
              <Gift className="h-4 w-4 mr-2" />
              Guest List
            </AdminTabsTrigger>
            <AdminTabsTrigger value="lodging">
              <Home className="h-4 w-4 mr-2" />
              Lodging
              {lodgingBookings && lodgingBookings.filter(b => b.payment_status === 'paid').length > 0 && (
                <AdminBadge intent="success" size="sm" className="ml-2">
                  {lodgingBookings.filter(b => b.payment_status === 'paid').length}
                </AdminBadge>
              )}
            </AdminTabsTrigger>
            <AdminTabsTrigger value="pending">
              <Clock className="h-4 w-4 mr-2" />
              Pending Transfers
              {pendingCount > 0 && (
                <AdminBadge intent="warning" size="sm" className="ml-2">{pendingCount}</AdminBadge>
              )}
            </AdminTabsTrigger>
            <AdminTabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              Transfer History
            </AdminTabsTrigger>
          </AdminTabsList>
          <AdminButton variant="admin" onClick={() => setCompDialogOpen(true)} className="gap-2">
            <Gift className="h-4 w-4" />
            Issue Comp Ticket
          </AdminButton>
        </div>

        <AdminTabsContent value="tickets" className="mt-6">
          <AdminToolbar>
            <AdminToolbarLeft>
              <AdminSearchInput
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64"
              />
            </AdminToolbarLeft>
          </AdminToolbar>

          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] w-8"></AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Buyer / Holder</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden md:table-cell">Email</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Type</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-center">Qty</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Order Total</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Status</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {isLoading ? (
                <AdminTableLoading rows={5} cols={8} />
              ) : groupedOrders.length === 0 ? (
                <AdminTableEmpty
                  icon={<Ticket className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />}
                  title="No tickets found"
                  description="No tickets match your search criteria."
                />
              ) : (
                groupedOrders.flatMap((group) => {
                  const isExpanded = expandedOrders.has(group.regId);
                  const buyer = group.reg?.name || group.tickets[0]?.holder_name || "Unknown";
                  const buyerEmail = group.reg?.email || group.tickets[0]?.holder_email || "—";
                  const qty = group.tickets.length;
                  const orderTotal = group.reg?.total_amount ?? group.tickets.reduce((s, t) => s + (t.unit_price || 0), 0);
                  const firstTicket = group.tickets[0];
                  const allActive = group.tickets.every(t => t.status === "active");
                  const summaryStatus = allActive ? "active" : (group.tickets.some(t => t.status === "active") ? "partial" : firstTicket.status);

                  const summaryRow = (
                    <AdminTableRow
                      key={`order-${group.regId}`}
                      className="hover:bg-[hsl(var(--admin-hover))] cursor-pointer"
                      onClick={() => qty > 1 && toggleOrder(group.regId)}
                    >
                      <AdminTableCell>
                        {qty > 1 ? (
                          isExpanded
                            ? <ChevronDown className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                            : <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                        ) : null}
                      </AdminTableCell>
                      <AdminTableCell className="font-medium text-[hsl(var(--admin-text))]">{buyer}</AdminTableCell>
                      <AdminTableCell className="hidden md:table-cell text-sm text-[hsl(var(--admin-text-muted))]">{buyerEmail}</AdminTableCell>
                      <AdminTableCell className="text-sm text-[hsl(var(--admin-text))]">{firstTicket.ticket_type}</AdminTableCell>
                      <AdminTableCell className="text-sm text-center font-semibold">{qty}</AdminTableCell>
                      <AdminTableCell className="text-sm text-[hsl(var(--admin-text))]">${(orderTotal / 100).toFixed(0)}</AdminTableCell>
                      <AdminTableCell>
                        {summaryStatus === "partial"
                          ? <AdminBadge intent="warning" size="sm">Partial</AdminBadge>
                          : getStatusBadge(summaryStatus)}
                      </AdminTableCell>
                      <AdminTableCell>
                        <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                          {qty > 1 ? `Expand to manage individual tickets` : ""}
                        </span>
                      </AdminTableCell>
                    </AdminTableRow>
                  );

                  const detailRows = (qty === 1 || isExpanded)
                    ? group.tickets.map((ticket, idx) => (
                        <AdminTableRow key={ticket.id} className="bg-[hsl(var(--admin-bg-subtle))]/30 hover:bg-[hsl(var(--admin-hover))]">
                          <AdminTableCell></AdminTableCell>
                          <AdminTableCell className="text-sm text-[hsl(var(--admin-text))]">
                            <span className="text-[hsl(var(--admin-text-muted))] mr-2">#{idx + 1}</span>
                            {ticket.holder_name}
                          </AdminTableCell>
                          <AdminTableCell className="hidden md:table-cell text-sm text-[hsl(var(--admin-text-muted))]">
                            {ticket.holder_email || "—"}
                          </AdminTableCell>
                          <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">{ticket.ticket_type}</AdminTableCell>
                          <AdminTableCell className="text-sm text-center text-[hsl(var(--admin-text))]">
                            <span
                              className="font-semibold"
                              title={
                                ticket.is_transferable === false
                                  ? "Not transferable"
                                  : `Transfers used: ${ticket.transfer_count || 0} of 2`
                              }
                            >
                              1
                            </span>
                          </AdminTableCell>
                          <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">${(ticket.unit_price / 100).toFixed(0)}</AdminTableCell>
                          <AdminTableCell>{getStatusBadge(ticket.status)}</AdminTableCell>
                          <AdminTableCell>
                            <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              <AdminButton
                                size="sm"
                                variant="adminOutline"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleTransferClick(ticket)}
                                disabled={!canTransfer(ticket)}
                              >
                                <Send className="h-3 w-3 mr-1" />
                                Transfer
                              </AdminButton>
                              <AdminButton
                                size="sm"
                                variant="adminDestructive"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleRefundClick(ticket)}
                                disabled={!canRefund(ticket)}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Refund
                              </AdminButton>
                              <AdminButton
                                size="sm"
                                variant="adminGhost"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleHistoryClick(ticket)}
                              >
                                <History className="h-3 w-3" />
                              </AdminButton>
                            </div>
                          </AdminTableCell>
                        </AdminTableRow>
                      ))
                    : [];

                  // For single-ticket orders, just render the detail row (no need for collapsed summary)
                  return qty === 1 ? detailRows : [summaryRow, ...detailRows];
                })
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminTabsContent>

        {/* Comp Tickets Tab */}
        <AdminTabsContent value="comps" className="mt-6">
          <CompTicketsTable onRefetch={() => queryClient.invalidateQueries({ queryKey: ["comp-tickets"] })} />
        </AdminTabsContent>

        {/* Lodging Bookings Tab */}
        <AdminTabsContent value="lodging" className="mt-6">
          <AdminToolbar>
            <AdminToolbarLeft>
              <AdminSearchInput
                placeholder="Search by email..."
                value={lodgingSearchQuery}
                onChange={(e) => setLodgingSearchQuery(e.target.value)}
                className="w-64"
              />
            </AdminToolbarLeft>
          </AdminToolbar>

          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Guest Email</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Zone</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] text-center">Qty</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Amount</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Status</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden md:table-cell">Date</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {isLoadingLodging ? (
                <AdminTableLoading rows={5} cols={7} />
              ) : lodgingBookings?.length === 0 ? (
                <AdminTableEmpty
                  icon={<Home className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />}
                  title="No lodging bookings"
                  description="Lodging reservations will appear here."
                />
              ) : (
                lodgingBookings?.map((booking) => (
                  <AdminTableRow key={booking.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell className="font-medium text-[hsl(var(--admin-text))]">
                      <Link 
                        to={`/admin/customers/${encodeURIComponent(booking.email)}`}
                        className="text-[hsl(var(--admin-accent))] hover:underline"
                      >
                        {booking.email}
                      </Link>
                    </AdminTableCell>
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-text))]">
                      {booking.accommodation_zones?.zone_name || booking.zone_key.replace(/_/g, ' ')}
                    </AdminTableCell>
                    <AdminTableCell className="text-center text-sm text-[hsl(var(--admin-text))]">
                      {booking.quantity}
                    </AdminTableCell>
                    <AdminTableCell className="text-sm font-medium text-[hsl(var(--admin-text))]">
                      ${((booking.total_amount || 0) / 100).toFixed(0)}
                    </AdminTableCell>
                    <AdminTableCell>{getLodgingStatusBadge(booking.payment_status)}</AdminTableCell>
                    <AdminTableCell className="hidden md:table-cell text-sm text-[hsl(var(--admin-text-muted))]">
                      {format(new Date(booking.created_at), "MMM d, yyyy")}
                    </AdminTableCell>
                    <AdminTableCell>
                      <AdminButton
                        size="sm"
                        variant="adminDestructive"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleLodgingRefundClick(booking)}
                        disabled={!canRefundLodging(booking)}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refund
                      </AdminButton>
                    </AdminTableCell>
                  </AdminTableRow>
                ))
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminTabsContent>

        <AdminTabsContent value="pending" className="mt-6">
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">From</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">To</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden md:table-cell">Ticket</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Status</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Expires</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {isLoadingPending ? (
                <AdminTableLoading rows={3} cols={6} />
              ) : pendingTransfers?.length === 0 ? (
                <AdminTableEmpty
                  icon={<Clock className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />}
                  title="No pending transfers"
                  description="Self-service transfers awaiting email verification will appear here."
                />
              ) : (
                pendingTransfers?.map((transfer) => {
                  const isExpired = new Date(transfer.expires_at) < new Date();
                  return (
                    <AdminTableRow key={transfer.id} className={isExpired ? "opacity-50" : "hover:bg-[hsl(var(--admin-hover))]"}>
                      <AdminTableCell>
                        <div>
                          <p className="font-medium text-[hsl(var(--admin-text))]">{transfer.old_holder_name || "—"}</p>
                          <p className="text-xs text-[hsl(var(--admin-text-muted))]">{transfer.old_holder_email || "—"}</p>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell>
                        <div>
                          <p className="font-medium text-[hsl(var(--admin-text))]">{transfer.new_holder_name}</p>
                          <p className="text-xs text-[hsl(var(--admin-text-muted))]">{transfer.new_holder_email}</p>
                        </div>
                      </AdminTableCell>
                      <AdminTableCell className="hidden md:table-cell text-sm text-[hsl(var(--admin-text))]">
                        {transfer.tickets?.ticket_type}
                      </AdminTableCell>
                      <AdminTableCell>
                        {isExpired ? (
                          <AdminBadge intent="danger" showDot>Expired</AdminBadge>
                        ) : (
                          <AdminBadge intent="warning" showDot>Pending</AdminBadge>
                        )}
                      </AdminTableCell>
                      <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                        {isExpired 
                          ? "Expired" 
                          : formatDistanceToNow(new Date(transfer.expires_at), { addSuffix: true })}
                      </AdminTableCell>
                      <AdminTableCell>
                        {!isExpired && (
                          <AdminButton
                            size="sm"
                            variant="adminOutline"
                            className="h-7 px-2 text-xs"
                            onClick={() => cancelPendingTransferMutation.mutate(transfer.id)}
                            disabled={cancelPendingTransferMutation.isPending}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Cancel
                          </AdminButton>
                        )}
                      </AdminTableCell>
                    </AdminTableRow>
                  );
                })
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminTabsContent>

        <AdminTabsContent value="history" className="mt-6">
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow className="bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-hover))]">
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">Date</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">From</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">To</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))] hidden md:table-cell">Type</AdminTableHead>
                <AdminTableHead className="font-semibold text-xs uppercase tracking-wide text-[hsl(var(--admin-text-muted))]">By</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {isLoadingTransferHistory ? (
                <AdminTableLoading rows={5} cols={5} />
              ) : transferHistory?.length === 0 ? (
                <AdminTableEmpty
                  icon={<History className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />}
                  title="No transfers yet"
                  description="Completed ticket transfers will appear here."
                />
              ) : (
                transferHistory?.map((transfer) => (
                  <AdminTableRow key={transfer.id} className="hover:bg-[hsl(var(--admin-hover))]">
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                      {format(new Date(transfer.created_at), "MMM d, yyyy")}
                    </AdminTableCell>
                    <AdminTableCell>
                      <div>
                        <p className="font-medium text-[hsl(var(--admin-text))]">{transfer.old_holder_name || "—"}</p>
                        <p className="text-xs text-[hsl(var(--admin-text-muted))]">{transfer.old_holder_email || "—"}</p>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <div>
                        <p className="font-medium text-[hsl(var(--admin-text))]">{transfer.new_holder_name}</p>
                        <p className="text-xs text-[hsl(var(--admin-text-muted))]">{transfer.new_holder_email || "—"}</p>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell className="hidden md:table-cell text-sm text-[hsl(var(--admin-text))]">
                      {transfer.tickets?.ticket_type}
                    </AdminTableCell>
                    <AdminTableCell className="text-sm text-[hsl(var(--admin-text-muted))]">
                      {transfer.profiles?.full_name || transfer.profiles?.email || "Admin"}
                    </AdminTableCell>
                  </AdminTableRow>
                ))
              )}
            </AdminTableBody>
          </AdminTable>
        </AdminTabsContent>
      </AdminTabs>

      {/* Transfer Dialog */}
      <AdminDialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Transfer Ticket Ownership</AdminDialogTitle>
            <AdminDialogDescription>
              Immediately transfer ownership to a new holder (admin action, no verification required)
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="space-y-4">
            <div>
              <AdminLabel className="text-[hsl(var(--admin-text-muted))]">Current Holder</AdminLabel>
              <div className="mt-1">
                <p className="font-medium">{selectedTicket?.holder_name}</p>
                <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                  {selectedTicket?.holder_email || "No email"}
                </p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                  Transfers: {selectedTicket?.transfer_count || 0}/2
                </p>
              </div>
            </div>
            <div>
              <AdminLabel htmlFor="newName">New Owner Name *</AdminLabel>
              <AdminInput
                id="newName"
                value={newHolderName}
                onChange={(e) => setNewHolderName(e.target.value)}
                placeholder="Enter new owner name"
              />
            </div>
            <div>
              <AdminLabel htmlFor="newEmail">New Owner Email *</AdminLabel>
              <AdminInput
                id="newEmail"
                type="email"
                value={newHolderEmail}
                onChange={(e) => setNewHolderEmail(e.target.value)}
                placeholder="Enter new owner email"
              />
              <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                Required. They will be able to manage this ticket.
              </p>
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton
              variant="adminOutline"
              onClick={() => setTransferDialogOpen(false)}
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="admin"
              onClick={handleTransfer}
              disabled={!newHolderName || !newHolderEmail || transferMutation.isPending}
            >
              {transferMutation.isPending ? "Transferring..." : "Transfer Ticket"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Refund Dialog - Destructive Action with Confirmation */}
      <AdminDialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <AdminDialogContent className="bg-[hsl(var(--admin-surface))]">
          <AdminDialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-[hsl(var(--admin-error-muted))]">
                <RefreshCw className="h-5 w-5 text-[hsl(var(--admin-error))]" />
              </div>
              <div>
                <AdminDialogTitle className="text-[hsl(var(--admin-error))]">Refund Ticket</AdminDialogTitle>
                <AdminDialogDescription>
                  Process a refund for this ticket through Stripe
                </AdminDialogDescription>
              </div>
            </div>
          </AdminDialogHeader>
          <div className="space-y-4">
            <div className="bg-[hsl(var(--admin-hover))] p-3 rounded-lg">
              <p className="font-medium">{selectedTicket?.holder_name}</p>
              <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                {selectedTicket?.ticket_type} • Full price: ${(selectedTicket?.unit_price / 100).toFixed(2)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <AdminLabel htmlFor="partial-refund">Partial Refund</AdminLabel>
              <AdminSwitch
                id="partial-refund"
                checked={isPartialRefund}
                onCheckedChange={(checked) => {
                  setIsPartialRefund(checked);
                  if (!checked) setRefundAmount("");
                }}
              />
            </div>
            {isPartialRefund && (
              <div>
                <AdminLabel htmlFor="amount">Refund Amount ($)</AdminLabel>
                <AdminInput
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(selectedTicket?.unit_price / 100).toFixed(2)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder={`Max: $${(selectedTicket?.unit_price / 100).toFixed(2)}`}
                />
              </div>
            )}
            <div>
              <AdminLabel htmlFor="reason">Refund Reason (Optional)</AdminLabel>
              <AdminTextarea
                id="reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Enter reason for refund..."
                rows={3}
              />
            </div>
            
            {/* Consequences Warning */}
            <div className="bg-[hsl(var(--admin-error-muted))] border border-[hsl(var(--admin-error))]/20 p-4 rounded-lg">
              <p className="text-sm font-medium text-[hsl(var(--admin-error))] mb-2">
                This action will:
              </p>
              <ul className="list-disc list-inside text-sm text-[hsl(var(--admin-text-secondary))] space-y-1">
                {isPartialRefund ? (
                  <>
                    <li>Process a partial refund of ${refundAmount || '0'} through Stripe</li>
                    <li>Keep the ticket active for use</li>
                    <li>Record the refund in payment history</li>
                  </>
                ) : (
                  <>
                    <li>Process a full refund of ${(selectedTicket?.unit_price / 100).toFixed(2)} through Stripe</li>
                    <li>Mark the ticket as "refunded" and invalidate it</li>
                    <li>This action cannot be undone</li>
                  </>
                )}
              </ul>
            </div>
            
            <div className="flex items-center gap-2 px-3 py-2 bg-[hsl(var(--admin-info-muted))] rounded-lg text-sm">
              <span className="text-[hsl(var(--admin-info))]">Scope:</span>
              <span className="text-[hsl(var(--admin-text-secondary))]">This refund applies to the selected ticket only</span>
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton
              variant="adminOutline"
              onClick={() => setRefundDialogOpen(false)}
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="adminDestructive"
              onClick={handleRefund}
              disabled={refundMutation.isPending}
            >
              {refundMutation.isPending ? "Processing..." : isPartialRefund ? "Process Partial Refund" : "Process Full Refund"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Refund History Dialog */}
      <AdminDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <AdminDialogContent className="max-w-lg">
          <AdminDialogHeader>
            <AdminDialogTitle>Refund History</AdminDialogTitle>
            <AdminDialogDescription>
              {selectedTicket?.holder_name} • {selectedTicket?.ticket_type}
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="space-y-4">
            {isLoadingHistory ? (
              <div className="text-center py-4 text-[hsl(var(--admin-text-muted))]">Loading...</div>
            ) : refundHistory?.length === 0 ? (
              <div className="text-center py-4 text-[hsl(var(--admin-text-muted))]">
                No refunds have been processed for this ticket.
              </div>
            ) : (
              <div className="space-y-3">
                {refundHistory?.map((refund) => (
                  <div key={refund.id} className="border border-[hsl(var(--admin-border))] rounded-lg p-3 space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-[hsl(var(--admin-error))]">
                        -${(refund.amount / 100).toFixed(2)}
                      </span>
                      <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                        {format(new Date(refund.created_at), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                    {refund.reason && (
                      <p className="text-sm text-[hsl(var(--admin-text-muted))]">{refund.reason}</p>
                    )}
                    <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                      By: {refund.profiles?.full_name || refund.profiles?.email || "Admin"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setHistoryDialogOpen(false)}>
              Close
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      {/* Lodging Refund Dialog */}
      <AdminDialog open={lodgingRefundDialogOpen} onOpenChange={setLodgingRefundDialogOpen}>
        <AdminDialogContent className="bg-[hsl(var(--admin-surface))]">
          <AdminDialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-[hsl(var(--admin-error-muted))]">
                <RefreshCw className="h-5 w-5 text-[hsl(var(--admin-error))]" />
              </div>
              <div>
                <AdminDialogTitle className="text-[hsl(var(--admin-error))]">Refund Lodging</AdminDialogTitle>
                <AdminDialogDescription>
                  Process a refund for this lodging booking through Stripe
                </AdminDialogDescription>
              </div>
            </div>
          </AdminDialogHeader>
          <div className="space-y-4">
            <div className="bg-[hsl(var(--admin-hover))] p-3 rounded-lg">
              <p className="font-medium">{selectedLodging?.email}</p>
              <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                {selectedLodging?.accommodation_zones?.zone_name || selectedLodging?.zone_key?.replace(/_/g, ' ')} • Full price: ${((selectedLodging?.total_amount || 0) / 100).toFixed(2)}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <AdminLabel htmlFor="lodging-partial-refund">Partial Refund</AdminLabel>
              <AdminSwitch
                id="lodging-partial-refund"
                checked={isLodgingPartialRefund}
                onCheckedChange={(checked) => {
                  setIsLodgingPartialRefund(checked);
                  if (!checked) setLodgingRefundAmount("");
                }}
              />
            </div>
            {isLodgingPartialRefund && (
              <div>
                <AdminLabel htmlFor="lodging-amount">Refund Amount ($)</AdminLabel>
                <AdminInput
                  id="lodging-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={((selectedLodging?.total_amount || 0) / 100).toFixed(2)}
                  value={lodgingRefundAmount}
                  onChange={(e) => setLodgingRefundAmount(e.target.value)}
                  placeholder={`Max: $${((selectedLodging?.total_amount || 0) / 100).toFixed(2)}`}
                />
              </div>
            )}
            <div>
              <AdminLabel htmlFor="lodging-reason">Refund Reason (Optional)</AdminLabel>
              <AdminTextarea
                id="lodging-reason"
                value={lodgingRefundReason}
                onChange={(e) => setLodgingRefundReason(e.target.value)}
                placeholder="Enter reason for refund..."
                rows={3}
              />
            </div>
            
            {/* Consequences Warning */}
            <div className="bg-[hsl(var(--admin-error-muted))] border border-[hsl(var(--admin-error))]/20 p-4 rounded-lg">
              <p className="text-sm font-medium text-[hsl(var(--admin-error))] mb-2">
                This action will:
              </p>
              <ul className="list-disc list-inside text-sm text-[hsl(var(--admin-text-secondary))] space-y-1">
                {isLodgingPartialRefund ? (
                  <>
                    <li>Process a partial refund of ${lodgingRefundAmount || '0'} through Stripe</li>
                    <li>Mark the booking as "partially refunded"</li>
                    <li>Record the refund in payment history</li>
                  </>
                ) : (
                  <>
                    <li>Process a full refund of ${((selectedLodging?.total_amount || 0) / 100).toFixed(2)} through Stripe</li>
                    <li>Mark the booking as "refunded"</li>
                    <li>Release the assigned accommodation unit back to inventory</li>
                    <li>This action cannot be undone</li>
                  </>
                )}
              </ul>
            </div>
          </div>
          <AdminDialogFooter>
            <AdminButton
              variant="adminOutline"
              onClick={() => setLodgingRefundDialogOpen(false)}
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="adminDestructive"
              onClick={handleLodgingRefund}
              disabled={lodgingRefundMutation.isPending}
            >
              {lodgingRefundMutation.isPending ? "Processing..." : isLodgingPartialRefund ? "Process Partial Refund" : "Process Full Refund"}
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>

      <IssueCompTicket
        open={compDialogOpen}
        onClose={() => setCompDialogOpen(false)}
        onSuccess={() => {
          setCompDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["comp-tickets"] });
        }}
      />
    </div>
  );
}
