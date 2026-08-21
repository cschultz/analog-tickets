import { useState } from "react";
import { Eye, User } from "lucide-react";
import { format } from "date-fns";
import {
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminCardTitle,
  AdminSelect,
  AdminSelectItem,
  AdminBadge,
} from "@/components/admin";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface ArtistOffer {
  performance_date: string | null;
  set_time: string | null;
  stage: string | null;
  set_length_minutes: number | null;
  offer_amount: number | null;
  guest_list_count: number | null;
  venue_name: string | null;
}

interface Artist {
  id: string;
  name: string;
  contacts: {
    id: string;
    name: string;
    first_name?: string | null;
    last_name?: string | null;
    email: string;
    role: string;
  }[];
  offer?: ArtistOffer | null;
}

interface EventDetails {
  title: string;
  event_date: string;
  venue_name: string;
}

interface EmailPreviewPanelProps {
  subject: string;
  bodyHtml: string;
  artists: Artist[];
  selectedArtistIds: string[];
  eventDetails: EventDetails | null;
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

const EmailPreviewPanel = ({ 
  subject, 
  bodyHtml, 
  artists, 
  selectedArtistIds,
  eventDetails 
}: EmailPreviewPanelProps) => {
  const selectedArtists = artists.filter(a => selectedArtistIds.includes(a.id));
  const [previewArtistId, setPreviewArtistId] = useState<string>(selectedArtists[0]?.id || "");
  const [previewContactId, setPreviewContactId] = useState<string>("");

  const previewArtist = artists.find(a => a.id === previewArtistId);
  const previewContact = previewArtist?.contacts.find(c => c.id === previewContactId) || previewArtist?.contacts[0];

  // Replace merge fields with actual values
  const replaceMergeFields = (text: string): string => {
    if (!text) return "";
    
    let result = text;
    
    // Get first/last name from stored fields or parse from name
    const contactFirstName = previewContact?.first_name || previewContact?.name?.split(' ')[0] || "";
    const contactLastName = previewContact?.last_name || previewContact?.name?.split(' ').slice(1).join(' ') || "";
    
    // Get primary contact (first contact marked as primary, or first contact)
    const primaryContact = previewArtist?.contacts.find(c => c.id === previewArtist.contacts[0]?.id) || previewArtist?.contacts[0];
    const primaryFirstName = primaryContact?.first_name || primaryContact?.name?.split(' ')[0] || "";
    
    // Artist fields
    result = result.replace(/\{\{artist_name\}\}/gi, previewArtist?.name || "[Artist Name]");
    
    // Contact fields (current recipient)
    result = result.replace(/\{\{contact_name\}\}/gi, previewContact?.name || "[Contact Name]");
    result = result.replace(/\{\{contact_first_name\}\}/gi, contactFirstName || "[First Name]");
    result = result.replace(/\{\{contact_last_name\}\}/gi, contactLastName || "[Last Name]");
    result = result.replace(/\{\{contact_role\}\}/gi, ROLE_LABELS[previewContact?.role || ""] || "[Role]");
    
    // Primary contact fields (always the primary contact regardless of recipient)
    result = result.replace(/\{\{primary_contact_name\}\}/gi, primaryContact?.name || "[Primary Contact]");
    result = result.replace(/\{\{primary_contact_first_name\}\}/gi, primaryFirstName || "[Primary First Name]");
    
    // Performance fields
    const offer = previewArtist?.offer;
    if (offer?.performance_date) {
      const date = new Date(offer.performance_date);
      result = result.replace(/\{\{performance_date\}\}/gi, format(date, "EEEE, MMMM d"));
    } else {
      result = result.replace(/\{\{performance_date\}\}/gi, "[Performance Date]");
    }
    
    result = result.replace(/\{\{set_time\}\}/gi, offer?.set_time || "[Set Time]");
    result = result.replace(/\{\{stage\}\}/gi, offer?.stage || "[Stage]");
    result = result.replace(/\{\{set_length\}\}/gi, offer?.set_length_minutes ? `${offer.set_length_minutes} min` : "[Set Length]");
    result = result.replace(/\{\{offer_amount\}\}/gi, offer?.offer_amount ? `$${offer.offer_amount.toLocaleString()}` : "[Offer Amount]");
    result = result.replace(/\{\{guest_list\}\}/gi, offer?.guest_list_count?.toString() || "[Guest List]");
    
    // Event fields
    result = result.replace(/\{\{event_name\}\}/gi, eventDetails?.title || "[Event Name]");
    result = result.replace(/\{\{venue_name\}\}/gi, offer?.venue_name || eventDetails?.venue_name || "[Venue Name]");
    
    // Event dates - format nicely
    if (eventDetails?.event_date) {
      const eventDate = new Date(eventDetails.event_date);
      // Assuming 3-day festival
      const endDate = new Date(eventDate);
      endDate.setDate(endDate.getDate() + 2);
      result = result.replace(/\{\{event_dates\}\}/gi, `${format(eventDate, "MMMM d")}-${format(endDate, "d, yyyy")}`);
    } else {
      result = result.replace(/\{\{event_dates\}\}/gi, "[Event Dates]");
    }
    
    return result;
  };

  const previewSubject = replaceMergeFields(subject);
  const previewBody = replaceMergeFields(bodyHtml);

  // Update contact when artist changes
  const handleArtistChange = (artistId: string) => {
    setPreviewArtistId(artistId);
    const artist = artists.find(a => a.id === artistId);
    if (artist?.contacts.length) {
      setPreviewContactId(artist.contacts[0].id);
    }
  };

  if (selectedArtists.length === 0) {
    return (
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Email Preview
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-4">
            Select artists to preview the email
          </p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <AdminCardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Email Preview
        </AdminCardTitle>
        <div className="space-y-2 pt-2">
          <AdminSelect value={previewArtistId} onValueChange={handleArtistChange} placeholder="Select artist to preview">
            {selectedArtists.map((artist) => (
              <AdminSelectItem key={artist.id} value={artist.id}>
                {artist.name}
              </AdminSelectItem>
            ))}
          </AdminSelect>
          
          {previewArtist && previewArtist.contacts.length > 1 && (
            <AdminSelect value={previewContactId || previewArtist.contacts[0]?.id} onValueChange={setPreviewContactId} placeholder="Select contact">
              {previewArtist.contacts.map((contact) => (
                <AdminSelectItem key={contact.id} value={contact.id}>
                  <span className="flex items-center gap-2">
                    <User className="h-3 w-3" />
                    {contact.name}
                    <AdminBadge intent="neutral" size="sm">
                      {ROLE_LABELS[contact.role] || contact.role}
                    </AdminBadge>
                  </span>
                </AdminSelectItem>
              ))}
            </AdminSelect>
          )}
        </div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        {/* Subject preview */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">Subject</div>
          <div className="p-2 bg-[hsl(var(--admin-hover))] rounded-md text-sm font-medium">
            {previewSubject || "(No subject)"}
          </div>
        </div>

        {/* Body preview */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">Body</div>
          <div 
            className="p-3 bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] rounded-md text-sm prose prose-sm max-w-none max-h-80 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewBody || "<p class='text-[hsl(var(--admin-text-muted))]'>(No content)</p>") }}
          />
        </div>

        {/* Merge field values for selected artist */}
        {previewArtist?.offer && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-[hsl(var(--admin-text-muted))]">Available Data</div>
            <div className="flex flex-wrap gap-1">
              {previewArtist.offer.performance_date && (
                <AdminBadge intent="neutral" size="sm">
                  Date: {format(new Date(previewArtist.offer.performance_date), "MMM d")}
                </AdminBadge>
              )}
              {previewArtist.offer.set_time && (
                <AdminBadge intent="neutral" size="sm">
                  Time: {previewArtist.offer.set_time}
                </AdminBadge>
              )}
              {previewArtist.offer.stage && (
                <AdminBadge intent="neutral" size="sm">
                  Stage: {previewArtist.offer.stage}
                </AdminBadge>
              )}
              {previewArtist.offer.offer_amount && (
                <AdminBadge intent="neutral" size="sm">
                  Offer: ${previewArtist.offer.offer_amount.toLocaleString()}
                </AdminBadge>
              )}
            </div>
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
};

export default EmailPreviewPanel;