import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton, AdminInput } from "@/components/admin/AdminUI";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminDialog, AdminDialogContent, AdminDialogDescription, AdminDialogHeader, AdminDialogTitle } from "@/components/admin/AdminDialog";
import { AdminSheet, AdminSheetContent, AdminSheetDescription, AdminSheetHeader, AdminSheetTitle } from "@/components/admin/AdminSheet";
import { AdminActionMenu, createActionItem } from "@/components/admin/AdminActionMenu";
import { Clock, CheckCircle, Calendar, TrendingUp, Search, Filter, List, LayoutGrid, Smartphone, Download, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import ArtistContactsManager from "./ArtistContactsManager";
import ArtistOfferEditForm from "./ArtistOfferEditForm";
import ArtistListView from "./ArtistListView";
import ArtistTimelineView from "./ArtistTimelineView";
import ArtistBulkActions from "./ArtistBulkActions";
import ArtistMobileView from "./ArtistMobileView";
import { exportArtistSchedule } from "./ArtistScheduleExport";
import { ArtistOffer, parseSetTime } from "./types";

interface UnifiedArtistViewProps {
  eventId?: string;
}

interface OfferStats {
  total: number;
  totalValue: number;
  byStatus: Record<string, number>;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Confirmed" },
  { value: "declined", label: "Declined" },
  { value: "countered", label: "Countered" },
  { value: "expired", label: "Expired" },
];


const UnifiedArtistView = ({ eventId }: UnifiedArtistViewProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // View state
  const [viewMode, setViewMode] = useState<"list" | "timeline" | "mobile">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Sheet/Dialog state
  const [selectedOffer, setSelectedOffer] = useState<ArtistOffer | null>(null);
  const [editingOffer, setEditingOffer] = useState<ArtistOffer | null>(null);
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [selectedArtistForContacts, setSelectedArtistForContacts] = useState<{ id: string; name: string } | null>(null);

  // Fetch offer statistics
  const { data: offerStats } = useAuthQuery({
    queryKey: ['offer-stats', eventId],
    queryFn: async () => {
      if (!eventId) return { total: 0, totalValue: 0, byStatus: {} };
      const { data, error } = await supabase
        .from('artist_offers')
        .select('offer_amount, status')
        .eq('event_id', eventId);
      
      if (error) throw error;
      
      const stats: OfferStats = {
        total: data?.length || 0,
        totalValue: data?.reduce((sum, o) => sum + (o.offer_amount || 0), 0) || 0,
        byStatus: {}
      };
      
      data?.forEach(offer => {
        stats.byStatus[offer.status] = (stats.byStatus[offer.status] || 0) + 1;
      });
      
      return stats;
    },
    enabled: !!eventId,
  });

  // Fetch all artist offers
  const { data: offers, isLoading } = useAuthQuery({
    queryKey: ['all-artist-offers', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('artist_offers')
        .select('*')
        .eq('event_id', eventId)
        .order('performance_date', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return (data || []) as ArtistOffer[];
    },
    enabled: !!eventId,
  });

  // Fetch event details for export
  const { data: eventDetails } = useAuthQuery({
    queryKey: ['event-details', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('event_details')
        .select('title')
        .eq('id', eventId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ offerId, newStatus }: { offerId: string; newStatus: string }) => {
      const updateData: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('artist_offers')
        .update(updateData)
        .eq('id', offerId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-artist-offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-stats'] });
      toast.success("Status updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update status: " + error.message);
    }
  });

  // Bulk status update
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, newStatus }: { ids: string[]; newStatus: string }) => {
      const updateData: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('artist_offers')
        .update(updateData)
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: (_, { ids, newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['all-artist-offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-stats'] });
      toast.success(`Updated ${ids.length} artists to ${newStatus}`);
      setSelectedIds(new Set());
    },
    onError: (error: Error) => {
      toast.error("Failed to update: " + error.message);
    }
  });

  // Filter and sort offers
  const filteredOffers = useMemo(() => {
    return offers?.filter(offer => {
      const matchesSearch = offer.artist_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || offer.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      // Primary: by performance date
      const dateA = a.performance_date ? Date.parse(a.performance_date) : Number.MAX_SAFE_INTEGER;
      const dateB = b.performance_date ? Date.parse(b.performance_date) : Number.MAX_SAFE_INTEGER;
      if (dateA !== dateB) return dateA - dateB;
      
      // Secondary: by set time
      const timeA = parseSetTime(a.set_time);
      const timeB = parseSetTime(b.set_time);
      if (timeA !== timeB) return timeA - timeB;
      
      // Tertiary: alphabetical
      return a.artist_name.localeCompare(b.artist_name);
    }) || [];
  }, [offers, searchQuery, statusFilter]);

  // Detect scheduling conflicts (same stage, overlapping times)
  const conflicts = useMemo(() => {
    const conflictMap = new Map<string, string[]>();
    
    filteredOffers.forEach((offer, i) => {
      if (!offer.performance_date || !offer.set_time || !offer.stage) return;
      
      const offerStart = parseSetTime(offer.set_time);
      const offerEnd = offerStart + (offer.set_length_minutes || 60);
      
      filteredOffers.slice(i + 1).forEach(other => {
        if (offer.performance_date !== other.performance_date) return;
        if (offer.stage !== other.stage) return;
        if (!other.set_time) return;
        
        const otherStart = parseSetTime(other.set_time);
        const otherEnd = otherStart + (other.set_length_minutes || 60);
        
        // Check overlap
        if (offerStart < otherEnd && otherStart < offerEnd) {
          // Add to both
          if (!conflictMap.has(offer.id)) conflictMap.set(offer.id, []);
          if (!conflictMap.has(other.id)) conflictMap.set(other.id, []);
          conflictMap.get(offer.id)!.push(other.artist_name);
          conflictMap.get(other.id)!.push(offer.artist_name);
        }
      });
    });
    
    return conflictMap;
  }, [filteredOffers]);

  const confirmedValue = offers?.filter(o => o.status === 'accepted').reduce((sum, o) => sum + (o.offer_amount || 0), 0) || 0;
  const conflictCount = conflicts.size;

  const openContactsSheet = (artistId: string, artistName: string) => {
    setSelectedArtistForContacts({ id: artistId, name: artistName });
    setContactsSheetOpen(true);
  };

  const handleEmailArtist = (offer: ArtistOffer) => {
    if (offer.artist_id) {
      navigate(`/admin/artists?tab=compose&artistId=${offer.artist_id}`);
    } else {
      toast.error("No artist linked to this offer. Link an artist first.");
    }
  };

  const handleBulkEmail = () => {
    const selectedOffers = filteredOffers.filter(o => selectedIds.has(o.id) && o.artist_id);
    if (selectedOffers.length === 0) {
      toast.error("No linked artists in selection");
      return;
    }
    const artistIds = selectedOffers.map(o => o.artist_id).join(',');
    navigate(`/admin/artists?tab=compose&artistIds=${artistIds}`);
  };

  const handleExport = (format: 'csv' | 'print') => {
    const offersToExport = selectedIds.size > 0 
      ? filteredOffers.filter(o => selectedIds.has(o.id))
      : filteredOffers;
    
    exportArtistSchedule(offersToExport, eventDetails?.title || 'Event', { format });
  };

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <p className="text-[hsl(var(--admin-text-muted))] text-center">Please select an event to view artists.</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminCard>
          <AdminCardHeader className="flex flex-row items-center justify-between pb-2">
            <AdminCardTitle className="text-sm font-medium">Total Artists</AdminCardTitle>
            <TrendingUp className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          </AdminCardHeader>
          <AdminCardContent>
            <div className="text-2xl font-bold">{offerStats?.total || 0}</div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              ${(offerStats?.totalValue || 0).toLocaleString()} budget
            </p>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader className="flex flex-row items-center justify-between pb-2">
            <AdminCardTitle className="text-sm font-medium">Confirmed</AdminCardTitle>
            <CheckCircle className="h-4 w-4 text-[hsl(var(--admin-success))]" />
          </AdminCardHeader>
          <AdminCardContent>
            <div className="text-2xl font-bold text-[hsl(var(--admin-success))]">{offerStats?.byStatus?.accepted || 0}</div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              ${confirmedValue.toLocaleString()} committed
            </p>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader className="flex flex-row items-center justify-between pb-2">
            <AdminCardTitle className="text-sm font-medium">Pending</AdminCardTitle>
            <Clock className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
          </AdminCardHeader>
          <AdminCardContent>
            <div className="text-2xl font-bold">
              {(offerStats?.byStatus?.draft || 0) + (offerStats?.byStatus?.sent || 0)}
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              {offerStats?.byStatus?.draft || 0} draft, {offerStats?.byStatus?.sent || 0} sent
            </p>
          </AdminCardContent>
        </AdminCard>

        <AdminCard className={conflictCount > 0 ? 'border-[hsl(var(--admin-warning))/0.4] bg-[hsl(var(--admin-warning)/0.1)]' : ''}>
          <AdminCardHeader className="flex flex-row items-center justify-between pb-2">
            <AdminCardTitle className="text-sm font-medium">Schedule</AdminCardTitle>
            {conflictCount > 0 ? (
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
            ) : (
              <Calendar className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            )}
          </AdminCardHeader>
          <AdminCardContent>
            {conflictCount > 0 ? (
              <>
                <div className="text-2xl font-bold text-[hsl(var(--admin-warning))]">{conflictCount}</div>
                <p className="text-xs text-[hsl(var(--admin-warning))]">conflicts detected</p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-[hsl(var(--admin-success))]">✓</div>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">No conflicts</p>
              </>
            )}
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Artist List Card */}
      <AdminCard>
        <AdminCardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <AdminCardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Artist Lineup
              </AdminCardTitle>
              <AdminCardDescription>
                {filteredOffers.length} artist{filteredOffers.length !== 1 ? 's' : ''} 
                {statusFilter !== 'all' && ` (${statusFilter})`}
              </AdminCardDescription>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <AdminInput
                  placeholder="Search artists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full sm:w-[180px]"
                />
              </div>
              
              {/* Status Filter */}
              <AdminSelect value={statusFilter} onValueChange={setStatusFilter}>
                {STATUS_OPTIONS.map(option => (
                  <AdminSelectItem key={option.value} value={option.value}>
                    {option.label}
                  </AdminSelectItem>
                ))}
              </AdminSelect>

              {/* View Mode Toggle */}
              <div className="flex border border-[hsl(var(--admin-border))] rounded-md">
                <AdminButton
                  variant={viewMode === 'list' ? 'admin' : 'adminGhost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-r-none"
                >
                  <List className="h-4 w-4" />
                </AdminButton>
                <AdminButton
                  variant={viewMode === 'timeline' ? 'admin' : 'adminGhost'}
                  size="sm"
                  onClick={() => setViewMode('timeline')}
                  className="rounded-none border-x border-[hsl(var(--admin-border))]"
                >
                  <LayoutGrid className="h-4 w-4" />
                </AdminButton>
                <AdminButton
                  variant={viewMode === 'mobile' ? 'admin' : 'adminGhost'}
                  size="sm"
                  onClick={() => setViewMode('mobile')}
                  className="rounded-l-none"
                >
                  <Smartphone className="h-4 w-4" />
                </AdminButton>
              </div>

              {/* Export Menu */}
              <AdminActionMenu
                items={[
                  createActionItem("csv", "Download CSV"),
                  createActionItem("print", "Printable Schedule"),
                ]}
                onSelect={(item) => handleExport(item.id as 'csv' | 'print')}
                trigger={
                  <AdminButton variant="adminOutline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </AdminButton>
                }
              />
            </div>
          </div>
        </AdminCardHeader>
        
        <AdminCardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-accent))] border-t-transparent rounded-full" />
            </div>
          ) : filteredOffers.length === 0 ? (
            <p className="text-[hsl(var(--admin-text-muted))] text-center py-8">
              {searchQuery || statusFilter !== "all" 
                ? "No artists match your filters." 
                : "No artist offers yet. Import offers to get started."}
            </p>
          ) : (
            <>
              {viewMode === 'list' && (
                <ArtistListView
                  offers={filteredOffers}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  onEdit={setEditingOffer}
                  onViewDetails={setSelectedOffer}
                  onManageContacts={openContactsSheet}
                  onEmailArtist={handleEmailArtist}
                  onStatusChange={(id, status) => updateStatusMutation.mutate({ offerId: id, newStatus: status })}
                  conflicts={conflicts}
                />
              )}
              
              {viewMode === 'timeline' && (
                <ArtistTimelineView
                  offers={filteredOffers}
                  onSelectArtist={setSelectedOffer}
                />
              )}
              
              {viewMode === 'mobile' && (
                <ArtistMobileView
                  offers={filteredOffers}
                  contacts={new Map()}
                  onSelectArtist={setSelectedOffer}
                />
              )}
            </>
          )}
        </AdminCardContent>
      </AdminCard>

      {/* Bulk Actions Bar */}
      <ArtistBulkActions
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkStatusChange={(status) => bulkUpdateMutation.mutate({ ids: Array.from(selectedIds), newStatus: status })}
        onBulkEmail={handleBulkEmail}
        onExport={() => handleExport('csv')}
      />

      {/* Contacts Slide-out Sheet */}
      <AdminSheet open={contactsSheetOpen} onOpenChange={setContactsSheetOpen}>
        <AdminSheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <AdminSheetHeader>
            <AdminSheetTitle>Contacts</AdminSheetTitle>
            <AdminSheetDescription>
              Manage contacts for {selectedArtistForContacts?.name}
            </AdminSheetDescription>
          </AdminSheetHeader>
          <div className="mt-6">
            {selectedArtistForContacts && (
              <ArtistContactsManager
                artistId={selectedArtistForContacts.id}
                artistName={selectedArtistForContacts.name}
                onContactsChange={() => {
                  queryClient.invalidateQueries({ queryKey: ['all-artist-offers'] });
                }}
              />
            )}
          </div>
        </AdminSheetContent>
      </AdminSheet>

      {/* Offer Details Dialog */}
      <AdminDialog open={!!selectedOffer} onOpenChange={(open) => !open && setSelectedOffer(null)}>
        <AdminDialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <AdminDialogHeader>
            <AdminDialogTitle>{selectedOffer?.artist_name}</AdminDialogTitle>
            <AdminDialogDescription>Offer Details</AdminDialogDescription>
          </AdminDialogHeader>
          {selectedOffer && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[hsl(var(--admin-text-muted))]">Status</span>
                <AdminSelect
                  value={selectedOffer.status}
                  onValueChange={(newStatus) => {
                    updateStatusMutation.mutate({ offerId: selectedOffer.id, newStatus });
                    setSelectedOffer({ ...selectedOffer, status: newStatus });
                  }}
                >
                  <AdminSelectItem value="draft">Draft</AdminSelectItem>
                  <AdminSelectItem value="sent">Sent</AdminSelectItem>
                  <AdminSelectItem value="accepted">Confirmed</AdminSelectItem>
                  <AdminSelectItem value="declined">Declined</AdminSelectItem>
                  <AdminSelectItem value="countered">Countered</AdminSelectItem>
                  <AdminSelectItem value="expired">Expired</AdminSelectItem>
                </AdminSelect>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-[hsl(var(--admin-muted))] rounded-lg">
                <div>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">Offer Amount</p>
                  <p className="text-lg font-bold">
                    {selectedOffer.offer_amount ? `$${selectedOffer.offer_amount.toLocaleString()}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">Deposit</p>
                  <p className="text-lg font-bold">
                    {selectedOffer.deposit_percentage ? `${selectedOffer.deposit_percentage}%` : "—"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Performance Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[hsl(var(--admin-text-muted))]">Date</p>
                    <p>{selectedOffer.performance_date ? format(parseISO(selectedOffer.performance_date), 'MMMM d, yyyy') : "TBD"}</p>
                  </div>
                  <div>
                    <p className="text-[hsl(var(--admin-text-muted))]">Set Time</p>
                    <p>{selectedOffer.set_time || "TBD"}</p>
                  </div>
                  <div>
                    <p className="text-[hsl(var(--admin-text-muted))]">Stage</p>
                    <p>{selectedOffer.stage || "TBD"}</p>
                  </div>
                  <div>
                    <p className="text-[hsl(var(--admin-text-muted))]">Set Length</p>
                    <p>{selectedOffer.set_length_minutes ? `${selectedOffer.set_length_minutes} min` : "TBD"}</p>
                  </div>
                  <div>
                    <p className="text-[hsl(var(--admin-text-muted))]">Guest List</p>
                    <p>{selectedOffer.guest_list_count || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[hsl(var(--admin-text-muted))]">Venue</p>
                    <p>{selectedOffer.venue_name || "—"}</p>
                  </div>
                </div>
              </div>

              {(selectedOffer.additional_perks || selectedOffer.merchandise_terms || selectedOffer.radius_clause) && (
                <div className="space-y-3">
                  <h4 className="font-medium">Terms</h4>
                  <div className="text-sm space-y-2">
                    {selectedOffer.additional_perks && (
                      <div>
                        <p className="text-[hsl(var(--admin-text-muted))]">Additional Perks</p>
                        <p>{selectedOffer.additional_perks}</p>
                      </div>
                    )}
                    {selectedOffer.merchandise_terms && (
                      <div>
                        <p className="text-[hsl(var(--admin-text-muted))]">Merchandise</p>
                        <p>{selectedOffer.merchandise_terms}</p>
                      </div>
                    )}
                    {selectedOffer.radius_clause && (
                      <div>
                        <p className="text-[hsl(var(--admin-text-muted))]">Radius Clause</p>
                        <p>{selectedOffer.radius_clause}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedOffer.expiration_date && (
                <div className="text-sm text-[hsl(var(--admin-text-muted))]">
                  Expires: {format(parseISO(selectedOffer.expiration_date), 'MMMM d, yyyy')}
                </div>
              )}
            </div>
          )}
        </AdminDialogContent>
      </AdminDialog>

      {/* Edit Offer Sheet */}
      <AdminSheet open={!!editingOffer} onOpenChange={(open) => !open && setEditingOffer(null)}>
        <AdminSheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <AdminSheetHeader>
            <AdminSheetTitle>Edit Artist</AdminSheetTitle>
            <AdminSheetDescription>
              Update details for {editingOffer?.artist_name}
            </AdminSheetDescription>
          </AdminSheetHeader>
          <div className="mt-6">
            {editingOffer && (
              <ArtistOfferEditForm
                offer={editingOffer}
                onClose={() => setEditingOffer(null)}
                onSaved={() => {}}
              />
            )}
          </div>
        </AdminSheetContent>
      </AdminSheet>
    </div>
  );
};

export default UnifiedArtistView;
