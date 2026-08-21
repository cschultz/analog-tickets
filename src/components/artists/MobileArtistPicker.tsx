import { useState } from "react";
import { 
  AdminSheet, 
  AdminSheetContent, 
  AdminSheetHeader, 
  AdminSheetTitle, 
  AdminSheetTrigger 
} from "@/components/admin/AdminSheet";
import { Users, CheckCircle2, Clock, SkipForward, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton, AdminSearchInput, AdminScrollArea } from "@/components/admin";

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

interface MobileArtistPickerProps {
  artists: Artist[];
  currentIndex: number;
  artistStatuses: Map<string, ArtistStatus>;
  onSelectArtist: (index: number) => void;
  sentCount: number;
  skippedCount: number;
  remainingCount: number;
}

export function MobileArtistPicker({
  artists,
  currentIndex,
  artistStatuses,
  onSelectArtist,
  sentCount,
  skippedCount,
  remainingCount,
}: MobileArtistPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredArtists = artists.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const currentArtist = artists[currentIndex];

  return (
    <AdminSheet open={open} onOpenChange={setOpen}>
      <AdminSheetTrigger asChild>
        <AdminButton variant="adminOutline" className="w-full justify-between h-auto py-3 md:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-[hsl(var(--admin-hover))] flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-[hsl(var(--admin-text-muted))]" />
            </div>
            <div className="text-left min-w-0">
              <div className="font-medium truncate text-[hsl(var(--admin-foreground))]">{currentArtist?.name || "Select Artist"}</div>
              <div className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                {sentCount} sent • {remainingCount} remaining
              </div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-[hsl(var(--admin-muted-foreground))] shrink-0" />
        </AdminButton>
      </AdminSheetTrigger>
      <AdminSheetContent side="bottom" className="h-[80vh] p-0">
        <AdminSheetHeader className="p-4 border-b border-[hsl(var(--admin-border))]">
          <AdminSheetTitle>Select Artist</AdminSheetTitle>
          <div className="flex items-center gap-3 text-xs text-[hsl(var(--admin-muted-foreground))]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--admin-success))]" />
              {sentCount} sent
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--admin-muted-foreground))]" />
              {skippedCount} skipped
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--admin-warning))]" />
              {remainingCount} pending
            </span>
          </div>
        </AdminSheetHeader>
        
        <div className="p-4 border-b border-[hsl(var(--admin-border))]">
          <AdminSearchInput
            placeholder="Search artists..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <AdminScrollArea className="flex-1 h-[calc(80vh-180px)]">
          <div className="p-2 space-y-0.5">
            {filteredArtists.map((artist) => {
              const actualIndex = artists.findIndex(a => a.id === artist.id);
              const status = artistStatuses.get(artist.id);
              const isCurrent = actualIndex === currentIndex;

              return (
                <button
                  key={artist.id}
                  onClick={() => {
                    onSelectArtist(actualIndex);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors",
                    "hover:bg-[hsl(var(--admin-hover))] active:bg-[hsl(var(--admin-hover))]",
                    isCurrent && "bg-[hsl(var(--admin-hover))] ring-1 ring-[hsl(var(--admin-border-strong))]",
                    status?.sent && "opacity-50"
                  )}
                >
                  {status?.sent ? (
                    <CheckCircle2 className="h-5 w-5 text-[hsl(var(--admin-success))] shrink-0" />
                  ) : status?.skipped ? (
                    <SkipForward className="h-5 w-5 text-[hsl(var(--admin-text-muted))] shrink-0" />
                  ) : (
                    <Clock className="h-5 w-5 text-[hsl(var(--admin-text-muted))] shrink-0" />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-[hsl(var(--admin-text))]">{artist.name}</div>
                    <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                      {artist.contacts.length} contact{artist.contacts.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <span className="text-xs text-[hsl(var(--admin-text-muted))] shrink-0 tabular-nums">
                    {artist.contacts.length}
                  </span>
                </button>
              );
            })}
          </div>
        </AdminScrollArea>
      </AdminSheetContent>
    </AdminSheet>
  );
}
