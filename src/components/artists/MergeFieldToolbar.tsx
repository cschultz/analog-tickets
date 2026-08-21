import { AdminDropdown } from "@/components/admin/AdminOverlay";
import { AdminButton } from "@/components/admin";
import { Variable, User, Calendar, MapPin, DollarSign, Music, Clock, Users, Info } from "lucide-react";

interface MergeField {
  tag: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  description: string;
}

const MERGE_FIELDS: MergeField[] = [
  // Artist fields
  { tag: "{{artist_name}}", label: "Artist Name", category: "Artist", icon: <Music className="h-3 w-3" />, description: "The artist or band name" },
  
  // Contact fields (current recipient)
  { tag: "{{contact_name}}", label: "Contact Name", category: "Contact", icon: <User className="h-3 w-3" />, description: "Full name of recipient" },
  { tag: "{{contact_first_name}}", label: "First Name", category: "Contact", icon: <User className="h-3 w-3" />, description: "First name only" },
  { tag: "{{contact_last_name}}", label: "Last Name", category: "Contact", icon: <User className="h-3 w-3" />, description: "Last name only" },
  { tag: "{{contact_role}}", label: "Contact Role", category: "Contact", icon: <User className="h-3 w-3" />, description: "Manager, Agent, etc." },
  
  // Primary contact fields (always the primary contact)
  { tag: "{{primary_contact_name}}", label: "Primary Contact Name", category: "Primary Contact", icon: <User className="h-3 w-3" />, description: "Primary contact's full name" },
  { tag: "{{primary_contact_first_name}}", label: "Primary Contact First Name", category: "Primary Contact", icon: <User className="h-3 w-3" />, description: "Primary contact's first name" },
  
  // Performance fields
  { tag: "{{performance_date}}", label: "Performance Date", category: "Performance", icon: <Calendar className="h-3 w-3" />, description: "e.g., Saturday, May 16" },
  { tag: "{{set_time}}", label: "Set Time", category: "Performance", icon: <Clock className="h-3 w-3" />, description: "e.g., 3:00pm" },
  { tag: "{{stage}}", label: "Stage", category: "Performance", icon: <MapPin className="h-3 w-3" />, description: "Main Stage, etc." },
  { tag: "{{set_length}}", label: "Set Length", category: "Performance", icon: <Clock className="h-3 w-3" />, description: "e.g., 90 min" },
  
  // Offer fields
  { tag: "{{offer_amount}}", label: "Offer Amount", category: "Offer", icon: <DollarSign className="h-3 w-3" />, description: "e.g., $2,500" },
  { tag: "{{guest_list}}", label: "Guest List Count", category: "Offer", icon: <Users className="h-3 w-3" />, description: "Number of comps" },
  
  // Event fields
  { tag: "{{event_name}}", label: "Event Name", category: "Event", icon: <Info className="h-3 w-3" />, description: "Cosmico 2026" },
  { tag: "{{event_dates}}", label: "Event Dates", category: "Event", icon: <Calendar className="h-3 w-3" />, description: "May 14–16, 2027" },
  { tag: "{{venue_name}}", label: "Venue Name", category: "Event", icon: <MapPin className="h-3 w-3" />, description: "Wild Haven Example Valley" },
];

interface MergeFieldToolbarProps {
  onInsertField: (tag: string) => void;
}

const MergeFieldToolbar = ({ onInsertField }: MergeFieldToolbarProps) => {
  const categories = [...new Set(MERGE_FIELDS.map(f => f.category))];

  return (
    <AdminDropdown
      align="end"
      trigger={
        <AdminButton variant="adminOutline" size="sm" className="gap-2">
          <Variable className="h-4 w-4" />
          Insert Field
        </AdminButton>
      }
    >
      <div className="w-72">
        <div className="px-3 py-2 border-b border-[hsl(var(--admin-border))]">
          <h4 className="font-medium text-sm text-[hsl(var(--admin-text))]">Merge Fields</h4>
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">Click to insert dynamic content</p>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {categories.map(category => (
            <div key={category} className="p-2">
              <div className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1 px-2 uppercase tracking-wider">{category}</div>
              <div className="space-y-0.5">
                {MERGE_FIELDS.filter(f => f.category === category).map(field => (
                  <button
                    key={field.tag}
                    onClick={() => onInsertField(field.tag)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[hsl(var(--admin-hover))] text-left transition-colors"
                  >
                    <span className="text-[hsl(var(--admin-text-muted))]">{field.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[hsl(var(--admin-text))]">{field.label}</div>
                      <div className="text-xs text-[hsl(var(--admin-text-muted))] truncate">{field.description}</div>
                    </div>
                    <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-muted))]">
                      {field.tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminDropdown>
  );
};

export default MergeFieldToolbar;
export { MERGE_FIELDS };
export type { MergeField };
