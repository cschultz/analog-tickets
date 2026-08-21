import { Pencil, UserPlus, FileText, Mail, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { 
  AdminBadge, 
  AdminButton, 
  AdminCheckbox 
} from "@/components/admin";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { ArtistOffer, getStageColor, STATUS_VARIANTS } from "./types";

interface ArtistListViewProps {
  offers: ArtistOffer[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onEdit: (offer: ArtistOffer) => void;
  onViewDetails: (offer: ArtistOffer) => void;
  onManageContacts: (artistId: string, artistName: string) => void;
  onEmailArtist: (offer: ArtistOffer) => void;
  onStatusChange: (offerId: string, newStatus: string) => void;
  conflicts: Map<string, string[]>;
}

const getStatusBadge = (status: string) => {
  const variants: Record<string, { intent: "neutral" | "success" | "warning" | "danger" | "info"; className?: string }> = {
    draft: { intent: "neutral" },
    sent: { intent: "info" },
    accepted: { intent: "success" },
    declined: { intent: "danger" },
    countered: { intent: "warning" },
    expired: { intent: "neutral" },
  };
  
  const config = variants[status] || variants.draft;
  const label = status === "accepted" ? "Confirmed" : status.charAt(0).toUpperCase() + status.slice(1);
  
  return (
    <AdminBadge intent={config.intent} className={config.className}>
      {label}
    </AdminBadge>
  );
};

// Group offers by date
const groupByDate = (offers: ArtistOffer[]): Map<string, ArtistOffer[]> => {
  const groups = new Map<string, ArtistOffer[]>();
  
  offers.forEach(offer => {
    const key = offer.performance_date || 'TBD';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(offer);
  });
  
  return groups;
};

const ArtistListView = ({
  offers,
  selectedIds,
  onSelectionChange,
  onEdit,
  onViewDetails,
  onManageContacts,
  onEmailArtist,
  onStatusChange,
  conflicts,
}: ArtistListViewProps) => {
  const groupedOffers = groupByDate(offers);
  const allSelected = offers.length > 0 && selectedIds.size === offers.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < offers.length;

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(offers.map(o => o.id)));
    }
  };

  const toggleOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  };

  if (offers.length === 0) {
    return (
      <p className="text-[hsl(var(--admin-text-muted))] text-center py-8">
        No artists match your filters.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header Row */}
      <div className="hidden lg:grid lg:grid-cols-[40px_70px_1fr_120px_100px_90px_130px] gap-3 px-3 py-2 text-sm font-medium text-[hsl(var(--admin-text-muted))] border-b border-[hsl(var(--admin-border))]">
        <div className="flex items-center">
          <AdminCheckbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Select all"
            className={someSelected ? "data-[state=checked]:bg-[hsl(var(--admin-primary))/50]" : ""}
          />
        </div>
        <span>Date</span>
        <span>Artist</span>
        <span>Stage</span>
        <span>Set Time</span>
        <span>Status</span>
        <span>Actions</span>
      </div>

      {/* Grouped by Day */}
      {Array.from(groupedOffers.entries()).map(([date, dayOffers]) => (
        <div key={date} className="space-y-1">
          {/* Day Header */}
          <div className="sticky top-0 z-10 bg-gradient-to-r from-[hsl(var(--admin-primary))/10] via-[hsl(var(--admin-primary))/5] to-transparent px-4 py-2 rounded-lg border border-[hsl(var(--admin-primary))/20] mt-4 first:mt-0">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                {date !== 'TBD' ? (
                  <>
                    <span className="text-xs font-medium text-[hsl(var(--admin-primary))] uppercase tracking-wider">
                      {format(parseISO(date), 'EEEE')}
                    </span>
                    <span className="text-lg font-bold text-[hsl(var(--admin-text))]">
                      {format(parseISO(date), 'MMMM d, yyyy')}
                    </span>
                  </>
                ) : (
                  <span className="text-lg font-bold text-[hsl(var(--admin-text-muted))]">Date TBD</span>
                )}
              </div>
              <AdminBadge intent="neutral" className="ml-auto">
                {dayOffers.length} artist{dayOffers.length !== 1 ? 's' : ''}
              </AdminBadge>
            </div>
          </div>

          {/* Artist Rows for this Day */}
          {dayOffers.map(offer => {
            const stageColor = getStageColor(offer.stage);
            const hasConflict = conflicts.has(offer.id);
            const conflictWith = conflicts.get(offer.id);

            return (
              <div 
                key={offer.id} 
                className={cn(
                  "flex flex-col lg:grid lg:grid-cols-[40px_70px_1fr_120px_100px_90px_130px]",
                  "gap-2 lg:gap-3 p-3 rounded-lg border bg-[hsl(var(--admin-surface))] hover:bg-[hsl(var(--admin-hover))]",
                  "transition-colors items-center border-[hsl(var(--admin-border))]",
                  hasConflict && "border-[hsl(var(--admin-warning))/50] bg-[hsl(var(--admin-warning))/5]",
                  selectedIds.has(offer.id) && "ring-2 ring-[hsl(var(--admin-primary))/30] bg-[hsl(var(--admin-primary))/5]"
                )}
              >
                {/* Checkbox */}
                <div className="hidden lg:flex items-center">
                  <AdminCheckbox
                    checked={selectedIds.has(offer.id)}
                    onCheckedChange={() => toggleOne(offer.id)}
                    aria-label={`Select ${offer.artist_name}`}
                  />
                </div>

                {/* Date (compact) */}
                <div className="text-center lg:text-left lg:hidden">
                  <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                    {offer.performance_date ? format(parseISO(offer.performance_date), 'MMM d') : 'TBD'}
                  </span>
                </div>
                <div className="hidden lg:block text-center">
                  {offer.performance_date ? (
                    <>
                      <div className="text-xs text-[hsl(var(--admin-text-muted))] uppercase">
                        {format(parseISO(offer.performance_date), 'MMM')}
                      </div>
                      <div className="text-lg font-bold text-[hsl(var(--admin-text))]">
                        {format(parseISO(offer.performance_date), 'd')}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-[hsl(var(--admin-text-muted))]">TBD</div>
                  )}
                </div>

                {/* Artist Name + Amount */}
                <div className="text-center lg:text-left">
                  <div className="font-medium flex items-center gap-2 justify-center lg:justify-start text-[hsl(var(--admin-text))]">
                    {offer.artist_name}
                    {hasConflict && (
                      <span title={`Conflict with: ${conflictWith?.join(', ')}`}>
                        <AlertTriangle className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
                      </span>
                    )}
                  </div>
                  {offer.offer_amount && (
                    <div className="text-sm text-[hsl(var(--admin-text-muted))]">
                      ${offer.offer_amount.toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Stage with color */}
                <div className="flex justify-center lg:justify-start">
                  {offer.stage && offer.stage.toLowerCase() !== 'tbd' ? (
                    <AdminBadge 
                      intent="neutral"
                      className={`${stageColor.bg} ${stageColor.text} ${stageColor.border} border`}
                    >
                      {offer.stage}
                    </AdminBadge>
                  ) : (
                    <span className="text-sm text-[hsl(var(--admin-text-muted))]">—</span>
                  )}
                </div>

                {/* Set Time + Length */}
                <div className="text-center lg:text-left text-sm">
                  {offer.set_time ? (
                    <div>
                      <span className="font-medium text-[hsl(var(--admin-text))]">{offer.set_time}</span>
                      {offer.set_length_minutes && (
                        <span className="text-[hsl(var(--admin-text-muted))] block text-xs">
                          {offer.set_length_minutes} min
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[hsl(var(--admin-text-muted))]">TBD</span>
                  )}
                </div>

                {/* Status */}
                <div className="flex justify-center lg:justify-start">
                  <AdminSelect
                    value={offer.status}
                    onValueChange={(newStatus) => onStatusChange(offer.id, newStatus)}
                    className="border-0 p-0 h-auto w-auto shadow-none"
                  >
                    <AdminSelectItem value="draft">Draft</AdminSelectItem>
                    <AdminSelectItem value="sent">Sent</AdminSelectItem>
                    <AdminSelectItem value="accepted">Confirmed</AdminSelectItem>
                    <AdminSelectItem value="declined">Declined</AdminSelectItem>
                    <AdminSelectItem value="countered">Countered</AdminSelectItem>
                    <AdminSelectItem value="expired">Expired</AdminSelectItem>
                  </AdminSelect>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 justify-center lg:justify-start">
                  <AdminButton
                    variant="adminGhost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEdit(offer)}
                    title="Edit Details"
                  >
                    <Pencil className="h-4 w-4" />
                  </AdminButton>
                  {offer.artist_id && (
                    <AdminButton
                      variant="adminGhost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onManageContacts(offer.artist_id!, offer.artist_name)}
                      title="Manage Contacts"
                    >
                      <UserPlus className="h-4 w-4" />
                    </AdminButton>
                  )}
                  <AdminButton
                    variant="adminGhost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onViewDetails(offer)}
                    title="View Offer Details"
                  >
                    <FileText className="h-4 w-4" />
                  </AdminButton>
                  <AdminButton
                    variant="adminGhost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEmailArtist(offer)}
                    title="Email Artist"
                  >
                    <Mail className="h-4 w-4" />
                  </AdminButton>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default ArtistListView;
