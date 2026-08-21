import { useState } from "react";
import { 
  AdminSheet, 
  AdminSheetContent, 
  AdminSheetHeader, 
  AdminSheetTitle, 
  AdminSheetTrigger 
} from "@/components/admin/AdminSheet";
import { Label } from "@/components/ui/label";
import { Users, Filter, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton, AdminSearchInput, AdminCheckbox, AdminBadge, AdminScrollArea } from "@/components/admin";

interface Artist {
  id: string;
  name: string;
  contacts: { id: string; name: string; email: string; role: string }[];
}

interface Role {
  value: string;
  label: string;
}

interface MobileBulkArtistSelectorProps {
  artists: Artist[];
  roles: Role[];
  selectedArtists: string[];
  selectedRoles: string[];
  onArtistToggle: (artistId: string) => void;
  onRoleToggle: (role: string) => void;
  onSelectAllArtists: (checked: boolean) => void;
  selectAllArtists: boolean;
  recipientCount: number;
}

export function MobileBulkArtistSelector({
  artists,
  roles,
  selectedArtists,
  selectedRoles,
  onArtistToggle,
  onRoleToggle,
  onSelectAllArtists,
  selectAllArtists,
  recipientCount,
}: MobileBulkArtistSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"artists" | "roles">("artists");

  const filteredArtists = artists.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminSheet open={open} onOpenChange={setOpen}>
      <AdminSheetTrigger asChild>
        <AdminButton variant="adminOutline" className="w-full justify-between h-auto py-3 md:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-[hsl(var(--admin-hover))] flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-[hsl(var(--admin-muted-foreground))]" />
            </div>
            <div className="text-left min-w-0">
              <div className="font-medium text-[hsl(var(--admin-foreground))]">
                {selectedArtists.length} of {artists.length} artists
              </div>
              <div className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                {recipientCount} recipient(s) • {selectedRoles.includes("all") ? "All roles" : `${selectedRoles.length} role(s)`}
              </div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-[hsl(var(--admin-muted-foreground))] shrink-0" />
        </AdminButton>
      </AdminSheetTrigger>
      <AdminSheetContent side="bottom" className="h-[85vh] p-0">
        <AdminSheetHeader className="p-4 border-b border-[hsl(var(--admin-border))]">
          <AdminSheetTitle>Select Recipients</AdminSheetTitle>
        </AdminSheetHeader>
        
        {/* Tabs */}
        <div className="flex border-b border-[hsl(var(--admin-border))]">
          <button
            onClick={() => setActiveTab("artists")}
            className={cn(
              "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === "artists" 
                ? "border-[hsl(var(--admin-accent))] text-[hsl(var(--admin-accent))]" 
                : "border-transparent text-[hsl(var(--admin-text-muted))]"
            )}
          >
            <Users className="h-4 w-4 inline mr-2" />
            Artists ({selectedArtists.length})
          </button>
          <button
            onClick={() => setActiveTab("roles")}
            className={cn(
              "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === "roles" 
                ? "border-[hsl(var(--admin-accent))] text-[hsl(var(--admin-accent))]" 
                : "border-transparent text-[hsl(var(--admin-text-muted))]"
            )}
          >
            <Filter className="h-4 w-4 inline mr-2" />
            Roles
          </button>
        </div>

        {activeTab === "artists" && (
          <>
            <div className="p-4 border-b border-[hsl(var(--admin-border))] space-y-3">
              <AdminSearchInput
                placeholder="Search artists..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <AdminCheckbox
                  id="select-all-mobile"
                  checked={selectAllArtists}
                  onCheckedChange={(checked) => onSelectAllArtists(!!checked)}
                />
                <Label htmlFor="select-all-mobile" className="cursor-pointer font-medium text-sm text-[hsl(var(--admin-text))]">
                  Select All ({artists.length})
                </Label>
              </div>
            </div>

            <AdminScrollArea className="h-[calc(85vh-220px)]">
              <div className="p-2 space-y-1">
                {filteredArtists.map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => onArtistToggle(artist.id)}
                    className="w-full text-left p-3 rounded-lg flex items-center gap-3 hover:bg-[hsl(var(--admin-hover))] active:bg-[hsl(var(--admin-hover))] transition-colors"
                  >
                    <AdminCheckbox
                      checked={selectedArtists.includes(artist.id)}
                      onCheckedChange={() => onArtistToggle(artist.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-[hsl(var(--admin-text))]">{artist.name}</div>
                      <div className="text-xs text-[hsl(var(--admin-text-muted))]">
                        {artist.contacts.length} contact{artist.contacts.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <AdminBadge intent="neutral" className="shrink-0">
                      {artist.contacts.length}
                    </AdminBadge>
                  </button>
                ))}
              </div>
            </AdminScrollArea>
          </>
        )}

        {activeTab === "roles" && (
          <AdminScrollArea className="h-[calc(85vh-140px)]">
            <div className="p-4 space-y-2">
              {roles.map((role) => (
                <button
                  key={role.value}
                  onClick={() => onRoleToggle(role.value)}
                  className="w-full text-left p-3 rounded-lg flex items-center gap-3 hover:bg-[hsl(var(--admin-hover))] active:bg-[hsl(var(--admin-hover))] transition-colors"
                >
                  <AdminCheckbox
                    checked={selectedRoles.includes(role.value)}
                    onCheckedChange={() => onRoleToggle(role.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="font-medium text-[hsl(var(--admin-text))]">{role.label}</span>
                </button>
              ))}
            </div>
          </AdminScrollArea>
        )}

        {/* Done button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
          <AdminButton variant="admin" onClick={() => setOpen(false)} className="w-full">
            Done ({recipientCount} recipient{recipientCount !== 1 ? 's' : ''})
          </AdminButton>
        </div>
      </AdminSheetContent>
    </AdminSheet>
  );
}
