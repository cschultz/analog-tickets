import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Check, X, ChevronDown, ChevronRight, Mail, AlertCircle, Loader2, Eye, Edit2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminSelectItem,
  AdminBadge,
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogFooter,
} from "@/components/admin";

interface ParsedContact {
  name: string;
  email: string;
  role: string;
  phone?: string;
  confidence: number;
}

interface ParsedArtist {
  name: string;
  contacts: ParsedContact[];
  genre?: string;
  bio?: string;
  website_url?: string;
  instagram_url?: string;
  spotify_url?: string;
  confidence: number;
  ambiguities?: string[];
}

interface PendingImport {
  id: string;
  event_id: string;
  source_email: string;
  source_subject: string | null;
  raw_content: string;
  parsed_data: ParsedArtist;
  confidence_score: number;
  status: string;
  notes: string | null;
  created_at: string;
}

const ROLE_OPTIONS = [
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Booking Agent" },
  { value: "marketing", label: "Marketing" },
  { value: "publicist", label: "Publicist" },
  { value: "tour_manager", label: "Tour Manager" },
  { value: "artist_direct", label: "Artist Direct" },
  { value: "label", label: "Label Rep" },
  { value: "other", label: "Other" },
];

interface PendingArtistImportsProps {
  eventId?: string;
}

export default function PendingArtistImports({ eventId }: PendingArtistImportsProps) {
  const [imports, setImports] = useState<PendingImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedImport, setSelectedImport] = useState<PendingImport | null>(null);
  const [editedData, setEditedData] = useState<ParsedArtist | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchImports = async () => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from("pending_artist_imports")
        .select("*")
        .eq("event_id", eventId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Error fetching imports:", fetchError);
        setError("Failed to load pending imports");
        toast.error("Failed to load pending imports");
        setImports([]);
      } else {
        console.log("Fetched imports raw data:", data?.length, "records");
        
        const validImports = (data || [])
          .map(item => ({
            ...item,
            parsed_data: item.parsed_data as unknown as ParsedArtist
          }))
          .filter(item => {
            return item.parsed_data && 
                   typeof item.parsed_data === 'object' && 
                   'name' in item.parsed_data &&
                   'contacts' in item.parsed_data &&
                   Array.isArray(item.parsed_data.contacts);
          });
        
        console.log("Valid imports:", validImports.length);
        
        const failedImports = (data || [])
          .filter(item => {
            const pd = item.parsed_data as any;
            return pd && (pd.error || (!pd.name && !pd.contacts));
          })
          .map(item => ({
            ...item,
            parsed_data: {
              name: item.source_subject || "Unknown Artist",
              contacts: [],
              confidence: 0,
              ambiguities: [(item.parsed_data as any)?.error || "Failed to parse email"]
            } as ParsedArtist
          }));
        
        console.log("Failed imports:", failedImports.length);
        
        setImports([...validImports, ...failedImports]);
      }
    } catch (err) {
      console.error("Exception fetching imports:", err);
      setError("An unexpected error occurred");
      setImports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImports();
  }, [eventId]);

  const handleApprove = async (importItem: PendingImport) => {
    setProcessing(importItem.id);
    const data = editedData || importItem.parsed_data;

    try {
      const { data: newArtist, error: artistError } = await supabase
        .from("artists")
        .insert({
          event_id: importItem.event_id,
          name: data.name,
          genre: data.genre,
          bio: data.bio,
          website_url: data.website_url,
          instagram_url: data.instagram_url,
          spotify_url: data.spotify_url,
        })
        .select("id")
        .single();

      if (artistError) throw artistError;

      for (let i = 0; i < data.contacts.length; i++) {
        const contact = data.contacts[i];
        const contactRole = ["manager", "agent", "marketing", "publicist", "tour_manager", "artist_direct", "label_rep", "other"].includes(contact.role) 
          ? contact.role as "manager" | "agent" | "marketing" | "publicist" | "tour_manager" | "artist_direct" | "label_rep" | "other"
          : "other";
        
        const { error: contactError } = await supabase
          .from("artist_contacts")
          .insert({
            artist_id: newArtist.id,
            name: contact.name,
            email: contact.email,
            role: contactRole,
            phone: contact.phone || null,
            is_primary: i === 0,
          });

        if (contactError) {
          console.error("Error inserting contact:", contactError);
        }
      }

      await supabase
        .from("pending_artist_imports")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", importItem.id);

      toast.success(`Added ${data.name} to artist roster`);
      fetchImports();
      setEditDialogOpen(false);
      setSelectedImport(null);
      setEditedData(null);
    } catch (error: any) {
      console.error("Error approving import:", error);
      toast.error(`Failed to add artist: ${error.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (importItem: PendingImport) => {
    setProcessing(importItem.id);
    
    try {
      await supabase
        .from("pending_artist_imports")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", importItem.id);

      toast.success("Import rejected");
      fetchImports();
    } catch (error: any) {
      console.error("Error rejecting import:", error);
      toast.error("Failed to reject import");
    } finally {
      setProcessing(null);
    }
  };

  const openEditDialog = (importItem: PendingImport) => {
    setSelectedImport(importItem);
    setEditedData({ ...importItem.parsed_data });
    setEditDialogOpen(true);
  };

  const updateContact = (index: number, field: keyof ParsedContact, value: string) => {
    if (!editedData) return;
    const newContacts = [...editedData.contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    setEditedData({ ...editedData, contacts: newContacts });
  };

  const removeContact = (index: number) => {
    if (!editedData) return;
    const newContacts = editedData.contacts.filter((_, i) => i !== index);
    setEditedData({ ...editedData, contacts: newContacts });
  };

  const addContact = () => {
    if (!editedData) return;
    setEditedData({
      ...editedData,
      contacts: [
        ...editedData.contacts,
        { name: "", email: "", role: "other", confidence: 1 }
      ]
    });
  };

  const getConfidenceBadge = (score: number | null | undefined) => {
    const safeScore = typeof score === 'number' ? score : 0;
    if (safeScore >= 0.8) return <AdminBadge intent="success">High: {Math.round(safeScore * 100)}%</AdminBadge>;
    if (safeScore >= 0.5) return <AdminBadge intent="warning">Medium: {Math.round(safeScore * 100)}%</AdminBadge>;
    return <AdminBadge intent="danger">Low: {Math.round(safeScore * 100)}%</AdminBadge>;
  };

  console.log("PendingArtistImports - eventId:", eventId, "loading:", loading, "imports count:", imports.length);

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
          Select an event to view pending imports
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (loading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          <p className="text-sm text-[hsl(var(--admin-text-muted))] mt-2">Loading imports...</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (error) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-[hsl(var(--admin-danger))] mb-2" />
          <p className="text-[hsl(var(--admin-danger))]">{error}</p>
          <AdminButton variant="adminOutline" className="mt-4" onClick={fetchImports}>
            Try Again
          </AdminButton>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminCardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Pending Artist Imports
        </AdminCardTitle>
        <AdminCardDescription>
          Review and approve artist information parsed from forwarded emails
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent>
        {imports.length === 0 ? (
          <div className="text-center py-8 text-[hsl(var(--admin-text-muted))]">
            <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pending imports</p>
            <p className="text-sm mt-2">
              Forward artist emails to your inbound address to add them here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {imports.map((importItem) => (
              <Collapsible
                key={importItem.id}
                open={expandedId === importItem.id}
                onOpenChange={(open) => setExpandedId(open ? importItem.id : null)}
              >
                <div className="border border-[hsl(var(--admin-border))] rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <CollapsibleTrigger className="flex items-center gap-2 text-left flex-1">
                      {expandedId === importItem.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <div>
                        <h4 className="font-semibold flex items-center gap-2">
                          {importItem.parsed_data?.name || "Unknown Artist"}
                          {importItem.confidence_score === 0 && (
                            <AdminBadge intent="danger" size="sm">Needs Manual Review</AdminBadge>
                          )}
                        </h4>
                        <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                          {importItem.parsed_data?.contacts?.length || 0} contact(s) • 
                          From: {importItem.source_email}
                        </p>
                        <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                          {format(new Date(importItem.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                        {importItem.parsed_data?.ambiguities && importItem.parsed_data.ambiguities.length > 0 && (
                          <p className="text-xs text-[hsl(var(--admin-danger))] mt-1">
                            {importItem.parsed_data.ambiguities[0]}
                          </p>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2">
                      {getConfidenceBadge(importItem.confidence_score)}
                      <AdminButton
                        size="sm"
                        variant="adminOutline"
                        onClick={() => openEditDialog(importItem)}
                        disabled={processing === importItem.id}
                      >
                        <Edit2 className="h-4 w-4" />
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="admin"
                        onClick={() => handleApprove(importItem)}
                        disabled={processing === importItem.id}
                      >
                        {processing === importItem.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="adminDestructive"
                        onClick={() => handleReject(importItem)}
                        disabled={processing === importItem.id}
                      >
                        <X className="h-4 w-4" />
                      </AdminButton>
                    </div>
                  </div>

                  <CollapsibleContent className="mt-4 space-y-4">
                    {importItem.notes && (
                      <div className="flex items-start gap-2 p-3 bg-[hsl(var(--admin-warning))]/10 rounded-md">
                        <AlertCircle className="h-4 w-4 text-[hsl(var(--admin-warning))] mt-0.5" />
                        <p className="text-sm">{importItem.notes}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-[hsl(var(--admin-text-muted))]">Genre:</span>{" "}
                        {importItem.parsed_data?.genre || "Not specified"}
                      </div>
                      {importItem.parsed_data?.website_url && (
                        <div>
                          <span className="text-[hsl(var(--admin-text-muted))]">Website:</span>{" "}
                          <a href={importItem.parsed_data.website_url} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--admin-text))] hover:underline">
                            {importItem.parsed_data.website_url}
                          </a>
                        </div>
                      )}
                    </div>

                    <div>
                      <h5 className="font-medium mb-2">Contacts</h5>
                      <div className="space-y-2">
                        {(importItem.parsed_data?.contacts || []).length === 0 ? (
                          <p className="text-sm text-[hsl(var(--admin-text-muted))] italic">No contacts parsed - review original email below</p>
                        ) : (
                          importItem.parsed_data.contacts.map((contact, idx) => (
                            <div key={idx} className="flex items-center gap-4 text-sm p-2 bg-[hsl(var(--admin-hover))]/50 rounded">
                              <span className="font-medium">{contact.name}</span>
                              <span>{contact.email}</span>
                              <AdminBadge intent="neutral">{contact.role}</AdminBadge>
                              {contact.phone && <span>{contact.phone}</span>}
                              {getConfidenceBadge(contact.confidence)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <Collapsible>
                      <CollapsibleTrigger className="text-sm text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))] flex items-center gap-1">
                        <Eye className="h-3 w-3" /> View original email
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="mt-2 p-3 bg-[hsl(var(--admin-hover))] rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {importItem.raw_content}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <AdminDialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <AdminDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <AdminDialogHeader>
              <AdminDialogTitle>Edit Artist Import</AdminDialogTitle>
              <AdminDialogDescription>
                Review and edit the parsed information before adding to the roster
              </AdminDialogDescription>
            </AdminDialogHeader>

            {editedData && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <AdminLabel>Artist Name</AdminLabel>
                    <AdminInput
                      value={editedData.name}
                      onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <AdminLabel>Genre</AdminLabel>
                    <AdminInput
                      value={editedData.genre || ""}
                      onChange={(e) => setEditedData({ ...editedData, genre: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <AdminLabel>Bio</AdminLabel>
                  <AdminInput
                    value={editedData.bio || ""}
                    onChange={(e) => setEditedData({ ...editedData, bio: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <AdminLabel>Website</AdminLabel>
                    <AdminInput
                      value={editedData.website_url || ""}
                      onChange={(e) => setEditedData({ ...editedData, website_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <AdminLabel>Instagram</AdminLabel>
                    <AdminInput
                      value={editedData.instagram_url || ""}
                      onChange={(e) => setEditedData({ ...editedData, instagram_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <AdminLabel>Spotify</AdminLabel>
                    <AdminInput
                      value={editedData.spotify_url || ""}
                      onChange={(e) => setEditedData({ ...editedData, spotify_url: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <AdminLabel>Contacts</AdminLabel>
                    <AdminButton size="sm" variant="adminOutline" onClick={addContact}>
                      Add Contact
                    </AdminButton>
                  </div>
                  <div className="space-y-3">
                    {editedData.contacts.map((contact, idx) => (
                      <div key={idx} className="grid grid-cols-5 gap-2 items-end p-3 border border-[hsl(var(--admin-border))] rounded">
                        <div>
                          <AdminLabel className="text-xs">Name</AdminLabel>
                          <AdminInput
                            value={contact.name}
                            onChange={(e) => updateContact(idx, "name", e.target.value)}
                          />
                        </div>
                        <div>
                          <AdminLabel className="text-xs">Email</AdminLabel>
                          <AdminInput
                            value={contact.email}
                            onChange={(e) => updateContact(idx, "email", e.target.value)}
                          />
                        </div>
                        <div>
                          <AdminLabel className="text-xs">Role</AdminLabel>
                          <AdminSelect
                            value={contact.role}
                            onValueChange={(value) => updateContact(idx, "role", value)}
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <AdminSelectItem key={role.value} value={role.value}>
                                {role.label}
                              </AdminSelectItem>
                            ))}
                          </AdminSelect>
                        </div>
                        <div>
                          <AdminLabel className="text-xs">Phone</AdminLabel>
                          <AdminInput
                            value={contact.phone || ""}
                            onChange={(e) => updateContact(idx, "phone", e.target.value)}
                          />
                        </div>
                        <AdminButton
                          size="icon"
                          variant="ghost"
                          className="text-[hsl(var(--admin-danger))]"
                          onClick={() => removeContact(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </AdminButton>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <AdminDialogFooter>
              <AdminButton variant="adminOutline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </AdminButton>
              <AdminButton
                onClick={() => selectedImport && handleApprove(selectedImport)}
                disabled={processing !== null}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Approve & Add
              </AdminButton>
            </AdminDialogFooter>
          </AdminDialogContent>
        </AdminDialog>
      </AdminCardContent>
    </AdminCard>
  );
}