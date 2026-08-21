import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ArtistOffer, getStageSolidColor, parseSetTime } from "./types";
import { AdminBadge, AdminCard, AdminTooltip } from "@/components/admin";

// Local helper for parsing time to minutes (returns null for unparseable)
const parseTimeToMinutes = (timeStr: string | null): number | null => {
  if (!timeStr || timeStr.toLowerCase() === 'tbd') return null;
  const result = parseSetTime(timeStr);
  return result === 9999 ? null : result;
};

// Alias for solid colors
const getStageColor = getStageSolidColor;

interface ArtistTimelineViewProps {
  offers: ArtistOffer[];
  onSelectArtist: (offer: ArtistOffer) => void;
}

const STATUS_OPACITY: Record<string, string> = {
  accepted: "opacity-100",
  sent: "opacity-80",
  draft: "opacity-60",
  declined: "opacity-30 line-through",
  countered: "opacity-70",
  expired: "opacity-30",
};

const ArtistTimelineView = ({ offers, onSelectArtist }: ArtistTimelineViewProps) => {
  // Group by date
  const dateGroups = useMemo(() => {
    const groups = new Map<string, ArtistOffer[]>();
    
    offers.forEach(offer => {
      const date = offer.performance_date || 'TBD';
      if (!groups.has(date)) {
        groups.set(date, []);
      }
      groups.get(date)!.push(offer);
    });
    
    // Sort dates
    return new Map([...groups.entries()].sort((a, b) => {
      if (a[0] === 'TBD') return 1;
      if (b[0] === 'TBD') return -1;
      return Date.parse(a[0]) - Date.parse(b[0]);
    }));
  }, [offers]);

  // Get all unique stages
  const stages = useMemo(() => {
    const stageSet = new Set<string>();
    offers.forEach(o => {
      if (o.stage) stageSet.add(o.stage);
    });
    return Array.from(stageSet).sort();
  }, [offers]);

  // Timeline hours (12pm to 3am = 12, 13, ... 23, 0, 1, 2, 3)
  const hours = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3];
  const timelineStart = 12 * 60; // 12pm in minutes
  const timelineEnd = 27 * 60; // 3am next day in minutes (24 + 3)

  const getPosition = (timeMinutes: number): number => {
    // Adjust for after midnight
    let adjusted = timeMinutes;
    if (timeMinutes < 12 * 60) {
      adjusted = timeMinutes + 24 * 60;
    }
    return ((adjusted - timelineStart) / (timelineEnd - timelineStart)) * 100;
  };

  const getWidth = (durationMinutes: number): number => {
    return (durationMinutes / (timelineEnd - timelineStart)) * 100;
  };

  if (stages.length === 0) {
    return (
      <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
        No stages defined yet. Add stage information to artists to see the timeline.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {Array.from(dateGroups.entries()).map(([date, dayOffers]) => {
        if (date === 'TBD') {
          // Show TBD artists as a simple list
          return (
            <AdminCard key={date} className="p-4">
              <h3 className="font-semibold text-lg mb-3 text-[hsl(var(--admin-text-muted))]">Date TBD</h3>
              <div className="flex flex-wrap gap-2">
                {dayOffers.map(offer => (
                  <AdminBadge
                    key={offer.id}
                    intent="neutral"
                    className="cursor-pointer hover:bg-[hsl(var(--admin-hover))]"
                    onClick={() => onSelectArtist(offer)}
                  >
                    {offer.artist_name}
                  </AdminBadge>
                ))}
              </div>
            </AdminCard>
          );
        }

        return (
          <AdminCard key={date} className="p-4 overflow-x-auto">
            {/* Day Header */}
            <div className="mb-4">
              <h3 className="font-semibold text-lg">
                {format(parseISO(date), 'EEEE, MMMM d')}
              </h3>
            </div>

            {/* Timeline Grid */}
            <div className="min-w-[800px]">
              {/* Hour Headers */}
              <div className="flex border-b pb-2 mb-2">
                <div className="w-28 flex-shrink-0" />
                <div className="flex-1 flex">
                  {hours.map(hour => (
                    <div 
                      key={hour} 
                      className="flex-1 text-xs text-[hsl(var(--admin-text-muted))] text-center"
                    >
                      {hour === 0 ? '12am' : hour === 12 ? '12pm' : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage Rows */}
              {stages.map(stage => {
                const stageOffers = dayOffers.filter(o => o.stage === stage);
                
                return (
                  <div key={stage} className="flex items-center min-h-[48px] border-b last:border-0">
                    {/* Stage Label */}
                    <div className="w-28 flex-shrink-0 pr-2">
                      <AdminBadge 
                        intent="neutral"
                        className={`${getStageColor(stage)} text-white border-0 text-xs`}
                      >
                        {stage}
                      </AdminBadge>
                    </div>

                    {/* Timeline Track */}
                    <div className="flex-1 relative h-10 bg-[hsl(var(--admin-hover))]/30 rounded">
                      {/* Hour Grid Lines */}
                      {hours.map((_, idx) => (
                        <div
                          key={idx}
                          className="absolute top-0 bottom-0 border-l border-dashed border-[hsl(var(--admin-text-muted))]/20"
                          style={{ left: `${(idx / hours.length) * 100}%` }}
                        />
                      ))}

                      {/* Artist Blocks */}
                      {stageOffers.map(offer => {
                        const startMinutes = parseTimeToMinutes(offer.set_time);
                        if (startMinutes === null) return null;

                        const duration = offer.set_length_minutes || 60;
                        const left = getPosition(startMinutes);
                        const width = getWidth(duration);

                        return (
                          <AdminTooltip
                            key={offer.id}
                            content={
                              <div className="text-sm">
                                <p className="font-semibold">{offer.artist_name}</p>
                                <p>{offer.set_time} • {duration} min</p>
                                {offer.offer_amount && (
                                  <p className="text-[hsl(var(--admin-text-muted))]">${offer.offer_amount.toLocaleString()}</p>
                                )}
                              </div>
                            }
                          >
                            <div
                              className={`
                                absolute top-1 bottom-1 rounded cursor-pointer
                                ${getStageColor(stage)} ${STATUS_OPACITY[offer.status] || 'opacity-100'}
                                hover:ring-2 hover:ring-white hover:ring-offset-1
                                flex items-center justify-center overflow-hidden
                                text-white text-xs font-medium px-1
                                transition-all
                              `}
                              style={{ 
                                left: `${Math.max(0, Math.min(left, 100))}%`, 
                                width: `${Math.max(2, Math.min(width, 100 - left))}%` 
                              }}
                              onClick={() => onSelectArtist(offer)}
                            >
                              <span className="truncate">{offer.artist_name}</span>
                            </div>
                          </AdminTooltip>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </AdminCard>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm text-[hsl(var(--admin-text-muted))]">
        <span className="font-medium">Stages:</span>
        {stages.map(stage => (
          <div key={stage} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${getStageColor(stage)}`} />
            <span>{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ArtistTimelineView;