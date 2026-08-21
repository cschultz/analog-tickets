import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton, AdminBadge, AdminInput, AdminTable, AdminTableBody, AdminTableCell, AdminTableHead, AdminTableHeader, AdminTableRow } from "@/components/admin/AdminUI";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminDialog, AdminDialogContent, AdminDialogHeader, AdminDialogTitle } from "@/components/admin/AdminDialog";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { Loader2, Search, Eye, Trash2, Send, CheckCircle, XCircle, Clock, Mail, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface ArtistOffer {
  id: string;
  artist_name: string;
  artist_id: string | null;
  status: string;
  offer_amount: number | null;
  performance_date: string | null;
  set_time: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  expiration_date: string | null;
  created_at: string;
  raw_offer_text: string | null;
  additional_perks: string | null;
  deposit_percentage: number | null;
  guest_list_count: number | null;
  merchandise_terms: string | null;
  radius_clause: string | null;
  stage: string | null;
  set_length_minutes: number | null;
  indoor_outdoor: string | null;
  capacity: number | null;
  ticket_price: number | null;
  ages: string | null;
}

interface ArtistOffersManagerProps {
  eventId?: string;
  onEmailArtist?: (artistId: string, artistName: string) => void;
}

type SortField = 'artist_name' | 'offer_amount' | 'performance_date' | 'status' | 'expiration_date' | 'created_at';
type SortDirection = 'asc' | 'desc';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
  { value: 'countered', label: 'Countered' },
];

const STATUS_ORDER = ['draft', 'sent', 'countered', 'accepted', 'declined', 'expired'];

const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    draft: { variant: "secondary", icon: <Clock className="h-3 w-3" /> },
    sent: { variant: "default", icon: <Send className="h-3 w-3" /> },
    accepted: { variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
    declined: { variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
    expired: { variant: "outline", icon: <Clock className="h-3 w-3" /> },
    countered: { variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  };
  
  const config = variants[status] || variants.draft;
  
  return (
    <AdminBadge intent={config.variant === "destructive" ? "danger" : config.variant === "default" ? "success" : "neutral"} className="flex items-center gap-1">
      {config.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </AdminBadge>
  );
};

export function ArtistOffersManager({ eventId, onEmailArtist }: ArtistOffersManagerProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOffer, setSelectedOffer] = useState<ArtistOffer | null>(null);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: offers, isLoading } = useAuthQuery({
    queryKey: ['artist-offers', eventId, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('artist_offers')
        .select('*')
        .order('created_at', { ascending: false });

      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ArtistOffer[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      
      if (status === 'sent') {
        updates.sent_at = new Date().toISOString();
      } else if (status === 'accepted') {
        updates.accepted_at = new Date().toISOString();
      } else if (status === 'declined') {
        updates.declined_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('artist_offers')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-offers'] });
      toast.success('Status updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    }
  });

  const deleteOfferMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('artist_offers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-offers'] });
      toast.success('Offer deleted');
      setSelectedOffer(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete offer');
    }
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'offer_amount' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" /> 
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const sortedAndFilteredOffers = offers
    ?.filter(offer =>
      offer.artist_name.toLowerCase().includes(search.toLowerCase()) ||
      offer.venue_name?.toLowerCase().includes(search.toLowerCase()) ||
      offer.city?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'artist_name':
          comparison = a.artist_name.localeCompare(b.artist_name);
          break;
        case 'offer_amount':
          comparison = (a.offer_amount || 0) - (b.offer_amount || 0);
          break;
        case 'performance_date':
          if (!a.performance_date && !b.performance_date) comparison = 0;
          else if (!a.performance_date) comparison = 1;
          else if (!b.performance_date) comparison = -1;
          else comparison = new Date(a.performance_date).getTime() - new Date(b.performance_date).getTime();
          break;
        case 'status':
          comparison = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
          break;
        case 'expiration_date':
          if (!a.expiration_date && !b.expiration_date) comparison = 0;
          else if (!a.expiration_date) comparison = 1;
          else if (!b.expiration_date) comparison = -1;
          else comparison = new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const handleEmailArtist = async (offer: ArtistOffer) => {
    if (!offer.artist_id) {
      toast.error("This offer is not linked to an artist. Link it first to send emails.");
      return;
    }
    
    if (onEmailArtist) {
      onEmailArtist(offer.artist_id, offer.artist_name);
    } else {
      // Navigate to compose tab with artist pre-selected
      navigate(`/admin/artists?tab=compose&artistId=${offer.artist_id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--admin-text-muted))]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--admin-text-muted))]" />
          <AdminInput
            placeholder="Search offers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <AdminSelect value={statusFilter} onValueChange={setStatusFilter} placeholder="All Statuses" className="w-[180px]">
          {STATUS_OPTIONS.map(opt => (
            <AdminSelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </AdminSelectItem>
          ))}
        </AdminSelect>
      </div>

      {!sortedAndFilteredOffers?.length ? (
        <AdminCard>
          <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
            No offers found. Use the parser above to create offers from emails.
          </AdminCardContent>
        </AdminCard>
      ) : (
        <AdminCard>
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead 
                  className="cursor-pointer select-none hover:bg-[hsl(var(--admin-hover))]"
                  onClick={() => handleSort('artist_name')}
                >
                  <div className="flex items-center">
                    Artist
                    <SortIcon field="artist_name" />
                  </div>
                </AdminTableHead>
                <AdminTableHead 
                  className="cursor-pointer select-none hover:bg-[hsl(var(--admin-hover))]"
                  onClick={() => handleSort('offer_amount')}
                >
                  <div className="flex items-center">
                    Amount
                    <SortIcon field="offer_amount" />
                  </div>
                </AdminTableHead>
                <AdminTableHead 
                  className="cursor-pointer select-none hover:bg-[hsl(var(--admin-hover))]"
                  onClick={() => handleSort('performance_date')}
                >
                  <div className="flex items-center">
                    Set Date
                    <SortIcon field="performance_date" />
                  </div>
                </AdminTableHead>
                <AdminTableHead 
                  className="cursor-pointer select-none hover:bg-[hsl(var(--admin-hover))]"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Status
                    <SortIcon field="status" />
                  </div>
                </AdminTableHead>
                <AdminTableHead 
                  className="cursor-pointer select-none hover:bg-[hsl(var(--admin-hover))]"
                  onClick={() => handleSort('expiration_date')}
                >
                  <div className="flex items-center">
                    Expires
                    <SortIcon field="expiration_date" />
                  </div>
                </AdminTableHead>
                <AdminTableHead className="text-right">Actions</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {sortedAndFilteredOffers.map((offer) => (
                <AdminTableRow key={offer.id}>
                  <AdminTableCell className="font-medium">
                    {offer.artist_name}
                    {offer.artist_id && (
                      <AdminBadge intent="neutral" className="ml-2 text-xs">Linked</AdminBadge>
                    )}
                  </AdminTableCell>
                  <AdminTableCell>
                    {offer.offer_amount ? `$${offer.offer_amount.toLocaleString()}` : '-'}
                  </AdminTableCell>
                  <AdminTableCell>
                    <div>
                      {offer.performance_date 
                        ? format(new Date(offer.performance_date), 'MMM d, yyyy')
                        : '-'}
                      {offer.set_time && (
                        <div className="text-xs text-[hsl(var(--admin-text-muted))]">{offer.set_time}</div>
                      )}
                    </div>
                  </AdminTableCell>
                  <AdminTableCell>{getStatusBadge(offer.status)}</AdminTableCell>
                  <AdminTableCell>
                    {offer.expiration_date
                      ? format(new Date(offer.expiration_date), 'MMM d, yyyy')
                      : '-'}
                  </AdminTableCell>
                  <AdminTableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {offer.artist_id && (
                        <AdminButton
                          variant="adminGhost"
                          size="icon"
                          onClick={() => handleEmailArtist(offer)}
                          title="Email artist"
                        >
                          <Mail className="h-4 w-4" />
                        </AdminButton>
                      )}
                      <AdminButton
                        variant="adminGhost"
                        size="icon"
                        onClick={() => setSelectedOffer(offer)}
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </AdminButton>
                      <AdminButton
                        variant="adminGhost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Delete this offer?')) {
                            deleteOfferMutation.mutate(offer.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </AdminButton>
                    </div>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        </AdminCard>
      )}

      {/* Offer Detail Dialog */}
      <AdminDialog open={!!selectedOffer} onOpenChange={() => setSelectedOffer(null)}>
        <AdminDialogContent className="max-w-2xl">
          <AdminDialogHeader>
            <AdminDialogTitle>Offer Details: {selectedOffer?.artist_name}</AdminDialogTitle>
          </AdminDialogHeader>
          
          {selectedOffer && (
            <AdminScrollArea className="max-h-[70vh]">
              <div className="space-y-6 pr-4">
                {/* Status Actions */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[hsl(var(--admin-text-muted))]">Status:</span>
                  {getStatusBadge(selectedOffer.status)}
                  <div className="flex-1" />
                  <AdminSelect 
                    value={selectedOffer.status}
                    onValueChange={(value) => {
                      updateStatusMutation.mutate({ id: selectedOffer.id, status: value });
                      setSelectedOffer({ ...selectedOffer, status: value });
                    }}
                    className="w-[140px]"
                    placeholder="Select status"
                  >
                    <AdminSelectItem value="draft">Draft</AdminSelectItem>
                    <AdminSelectItem value="sent">Sent</AdminSelectItem>
                    <AdminSelectItem value="accepted">Accepted</AdminSelectItem>
                    <AdminSelectItem value="declined">Declined</AdminSelectItem>
                    <AdminSelectItem value="expired">Expired</AdminSelectItem>
                    <AdminSelectItem value="countered">Countered</AdminSelectItem>
                  </AdminSelect>
                </div>

                {/* Financials */}
                <AdminCard>
                  <AdminCardHeader className="pb-2">
                    <AdminCardTitle className="text-sm">Financials & Logistics</AdminCardTitle>
                  </AdminCardHeader>
                  <AdminCardContent className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Offer:</span>
                      <span className="ml-2">{selectedOffer.offer_amount ? `$${selectedOffer.offer_amount.toLocaleString()}` : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Deposit:</span>
                      <span className="ml-2">{selectedOffer.deposit_percentage ? `${selectedOffer.deposit_percentage}%` : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Capacity:</span>
                      <span className="ml-2">{selectedOffer.capacity || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Ticket Price:</span>
                      <span className="ml-2">{selectedOffer.ticket_price ? `$${selectedOffer.ticket_price}` : '-'}</span>
                    </div>
                    {selectedOffer.additional_perks && (
                      <div className="col-span-2">
                        <span className="text-[hsl(var(--admin-text-muted))]">Perks:</span>
                        <span className="ml-2">{selectedOffer.additional_perks}</span>
                      </div>
                    )}
                  </AdminCardContent>
                </AdminCard>

                {/* Performance Details */}
                <AdminCard>
                  <AdminCardHeader className="pb-2">
                    <AdminCardTitle className="text-sm">Performance Details</AdminCardTitle>
                  </AdminCardHeader>
                  <AdminCardContent className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Date:</span>
                      <span className="ml-2">
                        {selectedOffer.performance_date 
                          ? format(new Date(selectedOffer.performance_date), 'EEEE, MMMM d, yyyy')
                          : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Set Time:</span>
                      <span className="ml-2">{selectedOffer.set_time || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Set Length:</span>
                      <span className="ml-2">{selectedOffer.set_length_minutes ? `${selectedOffer.set_length_minutes} min` : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Stage:</span>
                      <span className="ml-2">{selectedOffer.stage || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Indoor/Outdoor:</span>
                      <span className="ml-2">{selectedOffer.indoor_outdoor || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Venue:</span>
                      <span className="ml-2">
                        {[selectedOffer.venue_name, selectedOffer.city, selectedOffer.state]
                          .filter(Boolean).join(', ') || '-'}
                      </span>
                    </div>
                  </AdminCardContent>
                </AdminCard>

                {/* Terms */}
                <AdminCard>
                  <AdminCardHeader className="pb-2">
                    <AdminCardTitle className="text-sm">Terms</AdminCardTitle>
                  </AdminCardHeader>
                  <AdminCardContent className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Guest List:</span>
                      <span className="ml-2">{selectedOffer.guest_list_count || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Ages:</span>
                      <span className="ml-2">{selectedOffer.ages || '-'}</span>
                    </div>
                    {selectedOffer.merchandise_terms && (
                      <div className="col-span-2">
                        <span className="text-[hsl(var(--admin-text-muted))]">Merch:</span>
                        <span className="ml-2">{selectedOffer.merchandise_terms}</span>
                      </div>
                    )}
                    {selectedOffer.radius_clause && (
                      <div className="col-span-2">
                        <span className="text-[hsl(var(--admin-text-muted))]">Radius:</span>
                        <span className="ml-2">{selectedOffer.radius_clause}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[hsl(var(--admin-text-muted))]">Expires:</span>
                      <span className="ml-2">
                        {selectedOffer.expiration_date
                          ? format(new Date(selectedOffer.expiration_date), 'MMM d, yyyy')
                          : '-'}
                      </span>
                    </div>
                  </AdminCardContent>
                </AdminCard>

                {/* Raw Text */}
                {selectedOffer.raw_offer_text && (
                  <AdminCard>
                    <AdminCardHeader className="pb-2">
                      <AdminCardTitle className="text-sm">Original Offer Text</AdminCardTitle>
                    </AdminCardHeader>
                    <AdminCardContent>
                      <pre className="text-xs whitespace-pre-wrap bg-[hsl(var(--admin-hover))] p-3 rounded-md max-h-[200px] overflow-auto">
                        {selectedOffer.raw_offer_text}
                      </pre>
                    </AdminCardContent>
                  </AdminCard>
                )}
              </div>
            </AdminScrollArea>
          )}
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}
