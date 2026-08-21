import { useState, useEffect } from "react";
import { 
  AdminButton, 
  AdminInput, 
  AdminBadge,
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminLabel,
  AdminTextarea,
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogTrigger,
} from "@/components/admin";
import { Plus, Pencil, Trash2, Users, ChevronDown, ChevronRight, Mail, DollarSign, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import ArtistContactsManager from "./ArtistContactsManager";

interface ArtistOffer {
  id: string;
  status: string;
  offer_amount: number | null;
  performance_date: string | null;
  set_time: string | null;
}

interface Artist {
  id: string;
  name: string;
  bio: string | null;
  genre: string | null;
  website_url: string | null;
  instagram_url: string | null;
  spotify_url: string | null;
  notes: string | null;
  created_at: string;
  contacts?: ArtistContact[];
  offer?: ArtistOffer | null;
}

interface ArtistContact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  role_notes: string | null;
  is_primary: boolean;
}

interface ArtistRosterProps {
  eventId?: string;
}

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  agent: "Agent",
  marketing: "Marketing",
  publicist: "Publicist",
  tour_manager: "Tour Manager",
  artist_direct: "Artist Direct",
  label_rep: "Label Rep",
  other: "Other",
};

const ArtistRoster = ({ eventId }: ArtistRosterProps) => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null);
  const [expandedArtist, setExpandedArtist] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    bio: "",
    genre: "",
    website_url: "",
    instagram_url: "",
    spotify_url: "",
    notes: "",
  });

  useEffect(() => {
    if (eventId) {
      fetchArtists();
    }
  }, [eventId]);

  const fetchArtists = async () => {
    if (!eventId) return;
    
    setLoading(true);
    try {
      const { data: artistsData, error: artistsError } = await supabase
        .from("artists")
        .select("*")
        .eq("event_id", eventId)
        .order("name");

      if (artistsError) throw artistsError;

      // Fetch contacts and offers for all artists (only if we have artists)
      const artistIds = artistsData?.map(a => a.id) || [];
      
      let contactsData: any[] = [];
      let offersData: any[] = [];
      
      if (artistIds.length > 0) {
        const { data: contacts, error: contactsError } = await supabase
          .from("artist_contacts")
          .select("*")
          .in("artist_id", artistIds);

        if (contactsError) throw contactsError;
        contactsData = contacts || [];

        const { data: offers, error: offersError } = await supabase
          .from("artist_offers")
          .select("id, artist_id, status, offer_amount, performance_date, set_time")
          .eq("event_id", eventId)
          .in("artist_id", artistIds);

        if (offersError) throw offersError;
        offersData = offers || [];
      }

      // Merge contacts and offers into artists
      const artistsWithData = artistsData?.map(artist => ({
        ...artist,
        contacts: contactsData?.filter(c => c.artist_id === artist.id) || [],
        offer: offersData?.find(o => o.artist_id === artist.id) || null,
      })) || [];

      // Sort by performance date and set time (earliest first)
      const sortedArtists = artistsWithData.sort((a, b) => {
        // Artists without offers go to the bottom
        if (!a.offer?.performance_date && !b.offer?.performance_date) {
          return a.name.localeCompare(b.name);
        }
        if (!a.offer?.performance_date) return 1;
        if (!b.offer?.performance_date) return -1;

        // Compare performance dates
        const dateA = new Date(a.offer.performance_date);
        const dateB = new Date(b.offer.performance_date);
        
        if (dateA.getTime() !== dateB.getTime()) {
          return dateA.getTime() - dateB.getTime();
        }

        // Same date - compare set times
        const timeA = a.offer?.set_time || '';
        const timeB = b.offer?.set_time || '';
        
        // Parse times (handle formats like "3:00pm", "8:00 PM", etc.)
        const parseTime = (timeStr: string): number => {
          if (!timeStr) return 999; // No time goes to end of day
          const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
          if (!match) return 999;
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2] || '0', 10);
          const period = (match[3] || '').toLowerCase();
          if (period === 'pm' && hours !== 12) hours += 12;
          if (period === 'am' && hours === 12) hours = 0;
          return hours * 60 + minutes;
        };

        return parseTime(timeA) - parseTime(timeB);
      });

      setArtists(sortedArtists);
    } catch (error: any) {
      toast.error("Failed to fetch artists: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const checkDuplicateArtist = async (name: string, excludeId?: string): Promise<boolean> => {
    const normalizedName = name.toLowerCase().trim();
    
    // Check within current artists list
    const existingArtist = artists.find(
      a => a.name.toLowerCase().trim() === normalizedName && a.id !== excludeId
    );
    
    if (existingArtist) {
      toast.error(`An artist named "${name}" already exists for this event`);
      return true;
    }
    
    return false;
  };

  const handleSubmit = async () => {
    if (!eventId || !formData.name.trim()) {
      toast.error("Artist name is required");
      return;
    }

    // Check for duplicates before saving
    const isDuplicate = await checkDuplicateArtist(
      formData.name,
      editingArtist?.id
    );
    
    if (isDuplicate) return;

    try {
      if (editingArtist) {
        const { error } = await supabase
          .from("artists")
          .update({
            name: formData.name,
            bio: formData.bio || null,
            genre: formData.genre || null,
            website_url: formData.website_url || null,
            instagram_url: formData.instagram_url || null,
            spotify_url: formData.spotify_url || null,
            notes: formData.notes || null,
          })
          .eq("id", editingArtist.id);

        if (error) throw error;
        toast.success("Artist updated successfully");
      } else {
        const { error } = await supabase
          .from("artists")
          .insert({
            event_id: eventId,
            name: formData.name,
            bio: formData.bio || null,
            genre: formData.genre || null,
            website_url: formData.website_url || null,
            instagram_url: formData.instagram_url || null,
            spotify_url: formData.spotify_url || null,
            notes: formData.notes || null,
          });

        if (error) throw error;
        toast.success("Artist added successfully");
      }

      resetForm();
      fetchArtists();
    } catch (error: any) {
      toast.error("Failed to save artist: " + error.message);
    }
  };

  const handleDelete = async (artistId: string) => {
    if (!confirm("Are you sure you want to delete this artist and all their contacts?")) return;

    try {
      const { error } = await supabase
        .from("artists")
        .delete()
        .eq("id", artistId);

      if (error) throw error;
      toast.success("Artist deleted successfully");
      fetchArtists();
    } catch (error: any) {
      toast.error("Failed to delete artist: " + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      bio: "",
      genre: "",
      website_url: "",
      instagram_url: "",
      spotify_url: "",
      notes: "",
    });
    setEditingArtist(null);
    setIsAddDialogOpen(false);
  };

  const openEditDialog = (artist: Artist) => {
    setFormData({
      name: artist.name,
      bio: artist.bio || "",
      genre: artist.genre || "",
      website_url: artist.website_url || "",
      instagram_url: artist.instagram_url || "",
      spotify_url: artist.spotify_url || "",
      notes: artist.notes || "",
    });
    setEditingArtist(artist);
    setIsAddDialogOpen(true);
  };

  const toggleExpanded = (artistId: string) => {
    setExpandedArtist(expandedArtist === artistId ? null : artistId);
  };

  const handleEmailArtist = (artistId: string) => {
    navigate(`/admin/artists?tab=compose&artistId=${artistId}`);
  };

  const getOfferStatusBadge = (offer: ArtistOffer | null | undefined) => {
    if (!offer) return null;
    
    const statusConfig: Record<string, { intent: "success" | "warning" | "danger" | "neutral" | "info"; label: string }> = {
      draft: { intent: "neutral", label: "Draft" },
      sent: { intent: "info", label: "Offer Sent" },
      accepted: { intent: "success", label: "Confirmed" },
      declined: { intent: "danger", label: "Declined" },
      expired: { intent: "neutral", label: "Expired" },
      countered: { intent: "warning", label: "Countered" },
    };
    
    const config = statusConfig[offer.status] || statusConfig.draft;
    return (
      <AdminBadge intent={config.intent} className="text-xs">
        {config.label}
      </AdminBadge>
    );
  };

  const filteredArtists = artists.filter(artist =>
    artist.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    artist.genre?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <p className="text-[hsl(var(--admin-text-muted))] text-center">Please select an event to manage artists.</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between">
          <div>
            <AdminCardTitle>Artist Roster</AdminCardTitle>
            <AdminCardDescription>
              Manage artists and their contact teams for this event
            </AdminCardDescription>
          </div>
          <AdminDialog open={isAddDialogOpen} onOpenChange={(open) => {
            if (!open) resetForm();
            setIsAddDialogOpen(open);
          }}>
            <AdminDialogTrigger asChild>
              <AdminButton variant="admin">
                <Plus className="h-4 w-4 mr-2" />
                Add Artist
              </AdminButton>
            </AdminDialogTrigger>
            <AdminDialogContent className="max-w-md">
              <AdminDialogHeader>
                <AdminDialogTitle>{editingArtist ? "Edit Artist" : "Add New Artist"}</AdminDialogTitle>
                <AdminDialogDescription>
                  Enter the artist's information below.
                </AdminDialogDescription>
              </AdminDialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <AdminLabel htmlFor="name">Artist Name *</AdminLabel>
                  <AdminInput
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Artist or band name"
                  />
                </div>
                <div className="space-y-2">
                  <AdminLabel htmlFor="genre">Genre</AdminLabel>
                  <AdminInput
                    id="genre"
                    value={formData.genre}
                    onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                    placeholder="e.g., Indie Rock, Electronic"
                  />
                </div>
                <div className="space-y-2">
                  <AdminLabel htmlFor="bio">Bio</AdminLabel>
                  <AdminTextarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Short artist bio"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <AdminLabel htmlFor="instagram_url">Instagram</AdminLabel>
                    <AdminInput
                      id="instagram_url"
                      value={formData.instagram_url}
                      onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                      placeholder="URL"
                    />
                  </div>
                  <div className="space-y-2">
                    <AdminLabel htmlFor="spotify_url">Spotify</AdminLabel>
                    <AdminInput
                      id="spotify_url"
                      value={formData.spotify_url}
                      onChange={(e) => setFormData({ ...formData, spotify_url: e.target.value })}
                      placeholder="URL"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <AdminLabel htmlFor="website_url">Website</AdminLabel>
                  <AdminInput
                    id="website_url"
                    value={formData.website_url}
                    onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <AdminLabel htmlFor="notes">Internal Notes</AdminLabel>
                  <AdminTextarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Private notes about the artist"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <AdminButton variant="adminOutline" onClick={resetForm}>Cancel</AdminButton>
                  <AdminButton variant="admin" onClick={handleSubmit}>
                    {editingArtist ? "Update" : "Add"} Artist
                  </AdminButton>
                </div>
              </div>
            </AdminDialogContent>
          </AdminDialog>
        </div>
        <AdminInput
          placeholder="Search artists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </AdminCardHeader>
      <AdminCardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-accent))] border-t-transparent rounded-full" />
          </div>
        ) : filteredArtists.length === 0 ? (
          <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No artists found.</p>
            <p className="text-sm">Click "Add Artist" to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredArtists.map((artist) => (
              <div key={artist.id} className="border border-[hsl(var(--admin-border))] rounded-lg">
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-[hsl(var(--admin-hover))]"
                  onClick={() => toggleExpanded(artist.id)}
                >
                  <div className="flex items-center gap-3">
                    <AdminButton variant="ghost" size="sm" className="p-0 h-auto">
                      {expandedArtist === artist.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </AdminButton>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{artist.name}</h3>
                        {getOfferStatusBadge(artist.offer)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[hsl(var(--admin-text-muted))]">
                        {artist.genre && <span>{artist.genre}</span>}
                        {artist.offer?.offer_amount && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {artist.offer.offer_amount.toLocaleString()}
                          </span>
                        )}
                        {artist.offer?.performance_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(artist.offer.performance_date), 'MMM d')}
                          </span>
                        )}
                        <AdminBadge intent="neutral">
                          {artist.contacts?.length || 0} contacts
                        </AdminBadge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {(artist.contacts?.length || 0) > 0 && (
                      <AdminButton 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleEmailArtist(artist.id)}
                        title="Email artist"
                      >
                        <Mail className="h-4 w-4" />
                      </AdminButton>
                    )}
                    <AdminButton variant="ghost" size="sm" onClick={() => openEditDialog(artist)}>
                      <Pencil className="h-4 w-4" />
                    </AdminButton>
                    <AdminButton variant="ghost" size="sm" onClick={() => handleDelete(artist.id)}>
                      <Trash2 className="h-4 w-4 text-[hsl(var(--admin-error))]" />
                    </AdminButton>
                  </div>
                </div>
                {expandedArtist === artist.id && (
                  <div className="border-t border-[hsl(var(--admin-border))] p-4 bg-[hsl(var(--admin-hover))]">
                    <ArtistContactsManager
                      artistId={artist.id} 
                      artistName={artist.name}
                      onContactsChange={fetchArtists}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
};

export default ArtistRoster;
