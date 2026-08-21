/**
 * MobileEmailRecipientsSummary
 * 
 * A compact summary bar showing recipient count that expands to a full
 * artist selection overlay when tapped. Follows Admin Mobile UX patterns.
 * 
 * ADMIN STYLE GUIDE COMPLIANCE:
 * - Uses AdminButton, AdminSearchInput
 * - All colors from admin tokens
 * - StatusDot for status indicators
 */

import { useState } from "react";
import { Users, Search, CheckCircle2, Clock, SkipForward, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  AdminButton, 
  AdminSearchInput, 
  StatusDot,
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminScrollArea,
} from "@/components/admin";

interface ArtistStatus {
  sent: boolean;
  skipped: boolean;
  sentAt?: string;
}

interface Artist {
  id: string;
  name: string;
  contacts: { id: string; name: string; email: string; role: string }[];
}

interface MobileEmailRecipientsSummaryProps {
  artists: Artist[];
  currentIndex: number;
  artistStatuses: Map<string, ArtistStatus>;
  onSelectArtist: (index: number) => void;
  sentCount: number;
  remainingCount: number;
}

export function MobileEmailRecipientsSummary({
  artists,
  currentIndex,
  artistStatuses,
  onSelectArtist,
  sentCount,
  remainingCount,
}: MobileEmailRecipientsSummaryProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredArtists = artists.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const currentArtist = artists[currentIndex];

  return (
    <>
      {/* Compact Summary Bar - Using AdminButton pattern */}
      <AdminButton
        variant="adminGhost"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full justify-between h-auto py-3 px-4 rounded-none",
          "border-b border-[hsl(var(--admin-border))]"
        )}
      >
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <div className="text-left">
            <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
              {currentArtist?.name || "Select recipient"}
            </span>
            <span className="text-xs text-[hsl(var(--admin-text-muted))] ml-2">
              {currentIndex + 1} of {artists.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[hsl(var(--admin-text-muted))]">
            {sentCount} sent • {remainingCount} remaining
          </span>
          <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
        </div>
      </AdminButton>

      {/* Full-Screen Artist Selection Sheet (AdminOverlay pattern via Sheet) */}
      <AdminSheet open={open} onOpenChange={setOpen}>
        <AdminSheetContent 
          side="bottom" 
          className="h-[85vh] p-0 rounded-t-xl"
        >
          <AdminSheetHeader className="p-4 border-b border-[hsl(var(--admin-border))]">
            <AdminSheetTitle className="text-base font-medium">
              Select Artist
            </AdminSheetTitle>
            <div className="flex items-center gap-4 text-xs text-[hsl(var(--admin-text-muted))] mt-1">
              <span className="flex items-center gap-1.5">
                <StatusDot status="success" />
                {sentCount} sent
              </span>
              <span className="flex items-center gap-1.5">
                <StatusDot status="neutral" />
                {remainingCount} pending
              </span>
            </div>
          </AdminSheetHeader>
          
          {/* Search using AdminSearchInput */}
          <div className="p-4 border-b border-[hsl(var(--admin-border))]">
            <AdminSearchInput
              placeholder="Search artists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Artist List */}
          <AdminScrollArea className="flex-1 h-[calc(85vh-140px)]">
            <div className="py-2">
              {filteredArtists.map((artist) => {
                const actualIndex = artists.findIndex(a => a.id === artist.id);
                const status = artistStatuses.get(artist.id);
                const isCurrent = actualIndex === currentIndex;

                return (
                  <AdminButton
                    key={artist.id}
                    variant="adminGhost"
                    onClick={() => {
                      onSelectArtist(actualIndex);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full justify-start h-auto px-4 py-3 rounded-none",
                      isCurrent && "bg-[hsl(var(--admin-hover))]",
                      status?.sent && "opacity-50"
                    )}
                  >
                    {status?.sent ? (
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--admin-success))] shrink-0 mr-3" />
                    ) : status?.skipped ? (
                      <SkipForward className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0 mr-3" />
                    ) : (
                      <Clock className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0 mr-3" />
                    )}
                    
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm font-medium truncate text-[hsl(var(--admin-text))]">
                        {artist.name}
                      </div>
                      <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                        {artist.contacts.length} contact{artist.contacts.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </AdminButton>
                );
              })}
            </div>
          </AdminScrollArea>
        </AdminSheetContent>
      </AdminSheet>
    </>
  );
}
