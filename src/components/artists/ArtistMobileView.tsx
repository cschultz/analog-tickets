import { useState } from "react";
import { CheckCircle, Clock, Search, Phone, Mail, ChevronRight, User } from "lucide-react";
import { format, parseISO, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { 
  AdminCard, 
  AdminCardContent,
  AdminBadge, 
  AdminButton, 
  AdminSearchInput,
} from "@/components/admin";
import { ArtistOffer, ArtistContact, getStageSolidColor } from "./types";

// Alias for component usage
const getStageColor = getStageSolidColor;

interface ArtistMobileViewProps {
  offers: ArtistOffer[];
  contacts: Map<string, ArtistContact[]>;
  onSelectArtist: (offer: ArtistOffer) => void;
}

const ArtistMobileView = ({ offers, contacts, onSelectArtist }: ArtistMobileViewProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyToday, setShowOnlyToday] = useState(false);

  // Filter and group
  let filteredOffers = offers.filter(o => 
    o.artist_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    o.status === 'accepted' // Only show confirmed artists in mobile view
  );

  if (showOnlyToday) {
    filteredOffers = filteredOffers.filter(o => 
      o.performance_date && isToday(parseISO(o.performance_date))
    );
  }

  // Group by date
  const byDate = new Map<string, ArtistOffer[]>();
  filteredOffers.forEach(offer => {
    const date = offer.performance_date || 'TBD';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(offer);
  });

  // Find "up next" - first artist with a future set time today
  const now = new Date();
  const upNext = filteredOffers.find(o => {
    if (!o.performance_date || !o.set_time) return false;
    if (!isToday(parseISO(o.performance_date))) return false;
    
    // Simple check - this would need proper time parsing for production
    const hour = parseInt(o.set_time.split(':')[0]);
    return hour >= now.getHours();
  });

  return (
    <div className="space-y-4 pb-20">
      {/* Search */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--admin-surface))] pb-2">
        <AdminSearchInput
          placeholder="Search artists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <AdminButton
            variant={showOnlyToday ? "admin" : "adminOutline"}
            size="sm"
            onClick={() => setShowOnlyToday(!showOnlyToday)}
          >
            Today Only
          </AdminButton>
          <AdminBadge intent="neutral" className="ml-auto">
            {filteredOffers.length} confirmed
          </AdminBadge>
        </div>
      </div>

      {/* Up Next Card */}
      {upNext && (
        <AdminCard className="bg-gradient-to-r from-[hsl(var(--admin-success))/10] to-[hsl(var(--admin-success))/5] border-[hsl(var(--admin-success))/30]">
          <AdminCardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--admin-success))] font-medium mb-2">
              <Clock className="h-4 w-4" />
              UP NEXT
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-[hsl(var(--admin-text))]">{upNext.artist_name}</h3>
                <p className="text-[hsl(var(--admin-text-muted))]">
                  {upNext.set_time} • {upNext.stage}
                </p>
              </div>
              <AdminButton size="sm" variant="admin" onClick={() => onSelectArtist(upNext)}>
                Details <ChevronRight className="h-4 w-4 ml-1" />
              </AdminButton>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Artist List by Day */}
      {Array.from(byDate.entries()).map(([date, dayOffers]) => (
        <div key={date}>
          {/* Day Header */}
          <div className="sticky top-[100px] bg-[hsl(var(--admin-hover))/80] backdrop-blur-sm px-3 py-2 rounded-lg mb-2 font-semibold text-[hsl(var(--admin-text))]">
            {date !== 'TBD' 
              ? format(parseISO(date), 'EEEE, MMM d')
              : 'Date TBD'
            }
          </div>

          {/* Artist Cards */}
          <div className="space-y-2">
            {dayOffers.map(offer => {
              const artistContacts = offer.artist_id ? contacts.get(offer.artist_id) : [];
              const primaryContact = artistContacts?.find(c => c.role === 'artist') || artistContacts?.[0];

              return (
                <AdminCard 
                  key={offer.id} 
                  className="cursor-pointer hover:bg-[hsl(var(--admin-hover))]"
                  onClick={() => onSelectArtist(offer)}
                >
                  <AdminCardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Time Block */}
                      <div className="text-center min-w-[60px]">
                        <div className="text-lg font-bold text-[hsl(var(--admin-text))]">
                          {offer.set_time?.replace(/\s?(AM|PM)/i, '') || 'TBD'}
                        </div>
                        <div className="text-xs text-[hsl(var(--admin-text-muted))] uppercase">
                          {offer.set_time?.match(/(AM|PM)/i)?.[1] || ''}
                        </div>
                      </div>

                      {/* Artist Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold truncate text-[hsl(var(--admin-text))]">{offer.artist_name}</h4>
                          <CheckCircle className="h-4 w-4 text-[hsl(var(--admin-success))] flex-shrink-0" />
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1">
                          <AdminBadge 
                            intent="neutral"
                            className={`${getStageColor(offer.stage)} text-white border-0 text-xs`}
                          >
                            {offer.stage || 'TBD'}
                          </AdminBadge>
                          {offer.set_length_minutes && (
                            <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                              {offer.set_length_minutes} min
                            </span>
                          )}
                        </div>

                        {/* Contact Quick Actions */}
                        {primaryContact && (
                          <div className="flex items-center gap-2 mt-2 text-sm">
                            <User className="h-3 w-3 text-[hsl(var(--admin-text-muted))]" />
                            <span className="text-[hsl(var(--admin-text-muted))] truncate">
                              {primaryContact.name}
                            </span>
                            {primaryContact.phone && (
                              <a 
                                href={`tel:${primaryContact.phone}`}
                                onClick={e => e.stopPropagation()}
                                className="p-1 hover:bg-[hsl(var(--admin-hover))] rounded"
                              >
                                <Phone className="h-4 w-4 text-[hsl(var(--admin-primary))]" />
                              </a>
                            )}
                            <a 
                              href={`mailto:${primaryContact.email}`}
                              onClick={e => e.stopPropagation()}
                              className="p-1 hover:bg-[hsl(var(--admin-hover))] rounded"
                            >
                              <Mail className="h-4 w-4 text-[hsl(var(--admin-primary))]" />
                            </a>
                          </div>
                        )}
                      </div>

                      <ChevronRight className="h-5 w-5 text-[hsl(var(--admin-text-muted))] flex-shrink-0" />
                    </div>
                  </AdminCardContent>
                </AdminCard>
              );
            })}
          </div>
        </div>
      ))}

      {filteredOffers.length === 0 && (
        <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
          {searchQuery 
            ? 'No artists match your search.'
            : showOnlyToday 
              ? 'No confirmed artists performing today.'
              : 'No confirmed artists yet.'
          }
        </div>
      )}
    </div>
  );
};

export default ArtistMobileView;
