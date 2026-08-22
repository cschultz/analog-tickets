import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
} from "@/components/admin/AdminCard";
import { AdminButton, AdminBadge, AdminInput } from "@/components/admin/AdminUI";
import { AdminTable, AdminTableBody, AdminTableCell, AdminTableHead, AdminTableHeader, AdminTableRow } from "@/components/admin/AdminUI";
import { AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { AdminDialog, AdminDialogContent, AdminDialogFooter, AdminDialogHeader, AdminDialogTitle } from "@/components/admin/AdminDialog";
import { toast } from "sonner";
import { Loader2, Send, ArrowUpCircle, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useQueryClient } from "@tanstack/react-query";

interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  created_at: string;
  tickets: Ticket[];
}

interface Ticket {
  id: string;
  holder_name: string;
  ticket_type: string;
  status: string;
  unit_price: number;
}

interface UpgradeOffer {
  id: string;
  registration_id: string;
  ticket_ids: string[];
  unit_upgrade_price: number;
  total_amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  registrations: { name: string; email: string };
}

export default function Upgrades() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [customPrice, setCustomPrice] = useState<string>("");
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: registrations = [], isLoading: regsLoading } = useAuthQuery({
    queryKey: ["upgrades-registrations"],
    queryFn: async () => {
      const { data: regs } = await supabase
        .from("registrations")
        .select(`
          id, name, email, ticket_type, created_at,
          tickets (id, holder_name, ticket_type, status, unit_price)
        `)
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false });

      return (regs || []).filter(r => 
        r.tickets?.some((t: Ticket) => t.ticket_type === "party_only" && t.status === "active")
      ) as Registration[];
    },
    enabled: !!user && isAdmin,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const { data: upgradeOffers = [], isLoading: offersLoading } = useAuthQuery({
    queryKey: ["upgrade-offers"],
    queryFn: async () => {
      const { data: offers } = await supabase
        .from("upgrade_offers")
        .select(`*, registrations (name, email)`)
        .order("created_at", { ascending: false });
      return (offers || []) as UpgradeOffer[];
    },
    enabled: !!user && isAdmin,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const isLoading = regsLoading || offersLoading;

  const handleSelectRegistration = (reg: Registration) => {
    setSelectedReg(reg);
    const partyOnlyTickets = reg.tickets.filter(t => t.ticket_type === "party_only" && t.status === "active");
    setSelectedTickets(partyOnlyTickets.map(t => t.id));
    setCustomPrice("");
    setUseCustomPrice(false);
  };

  const handleCreateOffer = async () => {
    if (!selectedReg || selectedTickets.length === 0) return;
    
    setIsProcessing(true);
    const selectedPartyOnlyTickets = selectedReg.tickets.filter(
      (ticket) => selectedTickets.includes(ticket.id) && ticket.ticket_type === "party_only" && ticket.status === "active"
    );
    const defaultUnitPrice = selectedPartyOnlyTickets.length > 0
      ? Math.round(selectedPartyOnlyTickets.reduce((sum, ticket) => sum + (ticket.unit_price || 0), 0) / selectedPartyOnlyTickets.length)
      : 0;
    const unitPrice = useCustomPrice && customPrice ? parseFloat(customPrice) * 100 : defaultUnitPrice;

    const { data, error } = await supabase.functions.invoke("create-upgrade-checkout", {
      body: {
        registrationId: selectedReg.id,
        ticketIds: selectedTickets,
        unitUpgradePrice: unitPrice,
      },
    });

    if (error || !data?.success) {
      toast.error(error?.message || data?.error || "Failed to create upgrade offer");
      setIsProcessing(false);
      return;
    }

    const { error: emailError } = await supabase.functions.invoke("send-upgrade-invitation", {
      body: { upgradeOfferId: data.upgradeOfferId },
    });

    if (emailError) {
      toast.error("Offer created but email failed to send");
    } else {
      toast.success(`Upgrade invitation sent to ${selectedReg.email}`);
    }

    setSelectedReg(null);
    setSelectedTickets([]);
    setIsProcessing(false);
    queryClient.invalidateQueries({ queryKey: ["upgrade-offers"] });
    queryClient.invalidateQueries({ queryKey: ["upgrades-registrations"] });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <AdminBadge intent="neutral">Draft</AdminBadge>;
      case "invited": return <AdminBadge intent="warning">Pending</AdminBadge>;
      case "completed": return <AdminBadge intent="success">Paid</AdminBadge>;
      case "expired": return <AdminBadge intent="danger">Expired</AdminBadge>;
      default: return <AdminBadge intent="neutral">{status}</AdminBadge>;
    }
  };

  const isOfferExpired = (offer: UpgradeOffer) => {
    if (offer.status !== "invited") return false;
    const createdAt = new Date(offer.created_at);
    const expiresAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000);
    return new Date() > expiresAt;
  };

  const getDisplayStatus = (offer: UpgradeOffer) => {
    if (isOfferExpired(offer)) return "expired";
    return offer.status;
  };

  const defaultUnitPriceForSelection = selectedReg
    ? (() => {
        const selectedPartyOnlyTickets = selectedReg.tickets.filter(
          (ticket) => selectedTickets.includes(ticket.id) && ticket.ticket_type === "party_only" && ticket.status === "active"
        );
        return selectedPartyOnlyTickets.length > 0
          ? Math.round(selectedPartyOnlyTickets.reduce((sum, ticket) => sum + (ticket.unit_price || 0), 0) / selectedPartyOnlyTickets.length) / 100
          : 0;
      })()
    : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Ticket Upgrades"
        subtitle="Offer dinner upgrades to party-only ticket holders"
        icon={ArrowUpCircle}
      />

      <AdminCard>
        <AdminCardHeader icon={ArrowUpCircle}>
          <AdminCardTitle>Eligible for Upgrade ({registrations.length})</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          {registrations.length === 0 ? (
            <p className="text-[hsl(var(--admin-text-muted))] text-center py-4">No party-only registrations available for upgrade</p>
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Name</AdminTableHead>
                  <AdminTableHead>Email</AdminTableHead>
                  <AdminTableHead>Party-Only Tickets</AdminTableHead>
                  <AdminTableHead>Date</AdminTableHead>
                  <AdminTableHead>Action</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {registrations.map((reg) => {
                  const partyOnlyCount = reg.tickets.filter(t => t.ticket_type === "party_only" && t.status === "active").length;
                  return (
                    <AdminTableRow key={reg.id}>
                      <AdminTableCell className="font-medium">{reg.name}</AdminTableCell>
                      <AdminTableCell>{reg.email}</AdminTableCell>
                      <AdminTableCell>{partyOnlyCount}</AdminTableCell>
                      <AdminTableCell>{format(new Date(reg.created_at), "MMM d, yyyy")}</AdminTableCell>
                      <AdminTableCell>
                        <AdminButton variant="default" size="sm" onClick={() => handleSelectRegistration(reg)}>
                          <Send className="h-4 w-4 mr-1" /> Offer Upgrade
                        </AdminButton>
                      </AdminTableCell>
                    </AdminTableRow>
                  );
                })}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle>Upgrade Offers History</AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          {upgradeOffers.length === 0 ? (
            <p className="text-[hsl(var(--admin-text-muted))] text-center py-4">No upgrade offers sent yet</p>
          ) : (
            <AdminTable>
              <AdminTableHeader>
                <AdminTableRow>
                  <AdminTableHead>Customer</AdminTableHead>
                  <AdminTableHead>Tickets</AdminTableHead>
                  <AdminTableHead>Amount</AdminTableHead>
                  <AdminTableHead>Status</AdminTableHead>
                  <AdminTableHead>Created</AdminTableHead>
                  <AdminTableHead>Paid</AdminTableHead>
                </AdminTableRow>
              </AdminTableHeader>
              <AdminTableBody>
                {upgradeOffers.map((offer) => (
                  <AdminTableRow key={offer.id}>
                    <AdminTableCell>
                      <div>
                        <div className="font-medium">{offer.registrations?.name}</div>
                        <div className="text-sm text-[hsl(var(--admin-text-muted))]">{offer.registrations?.email}</div>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>{offer.ticket_ids.length}</AdminTableCell>
                    <AdminTableCell>${(offer.total_amount / 100).toFixed(2)}</AdminTableCell>
                    <AdminTableCell>{getStatusBadge(getDisplayStatus(offer))}</AdminTableCell>
                    <AdminTableCell>{format(new Date(offer.created_at), "MMM d, yyyy")}</AdminTableCell>
                    <AdminTableCell>{offer.paid_at ? format(new Date(offer.paid_at), "MMM d, yyyy") : "-"}</AdminTableCell>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}
        </AdminCardContent>
      </AdminCard>

      <AdminDialog open={!!selectedReg} onOpenChange={() => setSelectedReg(null)}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Create Upgrade Offer</AdminDialogTitle>
          </AdminDialogHeader>
          {selectedReg && (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{selectedReg.name}</p>
                <p className="text-sm text-[hsl(var(--admin-text-muted))]">{selectedReg.email}</p>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Select tickets to upgrade:</p>
                {selectedReg.tickets
                  .filter(t => t.ticket_type === "party_only" && t.status === "active")
                  .map(ticket => (
                    <div key={ticket.id} className="flex items-center space-x-2 py-1">
                      <AdminCheckbox
                        checked={selectedTickets.includes(ticket.id)}
                        onCheckedChange={(checked) => {
                          setSelectedTickets(prev => 
                            checked 
                              ? [...prev, ticket.id]
                              : prev.filter(id => id !== ticket.id)
                          );
                        }}
                      />
                      <span>{ticket.holder_name}</span>
                    </div>
                  ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <AdminCheckbox
                    checked={useCustomPrice}
                    onCheckedChange={(checked) => setUseCustomPrice(!!checked)}
                  />
                  <span className="text-sm">Use custom price (default: ${defaultUnitPriceForSelection.toFixed(2)})</span>
                </div>
                {useCustomPrice && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    <AdminInput
                      type="number"
                      placeholder="Custom price per ticket"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      className="w-40"
                    />
                  </div>
                )}
              </div>

              <div className="bg-[hsl(var(--admin-surface-hover))] p-3 rounded-lg">
                <div className="space-y-1 text-sm">
                  <p>
                    <strong>Total:</strong> ${((useCustomPrice && customPrice ? parseFloat(customPrice) : defaultUnitPriceForSelection) * selectedTickets.length).toFixed(2)}
                    <span className="text-[hsl(var(--admin-text-muted))] ml-2">({selectedTickets.length} ticket{selectedTickets.length !== 1 ? "s" : ""})</span>
                  </p>
                  <p className="text-[hsl(var(--admin-text-muted))]">
                    Same tier price as originally paid. Promo code discounts do not carry into upgrades.
                  </p>
                </div>
              </div>
            </div>
          )}
          <AdminDialogFooter>
            <AdminButton variant="outline" onClick={() => setSelectedReg(null)}>Cancel</AdminButton>
            <AdminButton onClick={handleCreateOffer} disabled={isProcessing || selectedTickets.length === 0}>
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Upgrade Invitation
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}