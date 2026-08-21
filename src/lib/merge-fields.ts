/**
 * Centralized Merge Field Configuration
 * 
 * This module provides a single source of truth for all merge fields used
 * across email templates, contracts, and other personalized content.
 * 
 * Merge fields are organized by audience (customer, artist, vendor, etc.)
 * with common fields shared across all audiences.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MergeField {
  key: string;
  label: string;
  example: string;
  category: MergeFieldCategory;
}

export type MergeFieldCategory = 
  | "recipient" 
  | "event" 
  | "venue" 
  | "contact" 
  | "business" 
  | "logistics"
  | "financial";

export type MergeFieldAudience = 
  | "all" 
  | "customer" 
  | "artist" 
  | "vendor" 
  | "artisan" 
  | "partner" 
  | "production"
  | "internal";

// =============================================================================
// COMMON FIELDS (available to all audiences)
// =============================================================================

const COMMON_FIELDS: MergeField[] = [
  // Recipient fields
  { key: "{{first_name}}", label: "First Name", example: "Sarah", category: "recipient" },
  { key: "{{name}}", label: "Full Name", example: "Sarah Johnson", category: "recipient" },
  { key: "{{email}}", label: "Email Address", example: "sarah@example.com", category: "recipient" },
  
  // Event fields
  { key: "{{event_name}}", label: "Event Name", example: "Cosmico 2026", category: "event" },
  { key: "{{event_title}}", label: "Event Title", example: "Cosmico 2026", category: "event" },
  { key: "{{event_date}}", label: "Event Date", example: "May 14–16, 2027", category: "event" },
  { key: "{{event_time}}", label: "Event Time", example: "2:00 PM", category: "event" },
  { key: "{{event_year}}", label: "Event Year", example: "2026", category: "event" },
  
  // Venue fields
  { key: "{{venue_name}}", label: "Venue Name", example: "Example Meadow", category: "venue" },
  { key: "{{venue_address}}", label: "Venue Address", example: "123 River Road, Example Valley", category: "venue" },
  { key: "{{parking_info}}", label: "Parking Info", example: "Free parking available", category: "venue" },
];

// =============================================================================
// AUDIENCE-SPECIFIC FIELDS
// =============================================================================

const CUSTOMER_FIELDS: MergeField[] = [
  { key: "{{ticket_type}}", label: "Ticket Type", example: "Weekend Pass", category: "logistics" },
  { key: "{{ticket_count}}", label: "Ticket Count", example: "2", category: "logistics" },
  { key: "{{order_total}}", label: "Order Total", example: "$350.00", category: "financial" },
  { key: "{{confirmation_number}}", label: "Confirmation #", example: "ABC123", category: "logistics" },
  { key: "{{lodging_zone}}", label: "Lodging Zone", example: "Meadow View", category: "logistics" },
  { key: "{{check_in_time}}", label: "Check-in Time", example: "3:00 PM", category: "logistics" },
  { key: "{{check_out_time}}", label: "Check-out Time", example: "11:00 AM", category: "logistics" },
];

const ARTIST_FIELDS: MergeField[] = [
  { key: "{{artist_name}}", label: "Artist/Band Name", example: "The Example Rays", category: "recipient" },
  { key: "{{stage_name}}", label: "Stage Name", example: "Main Stage", category: "logistics" },
  { key: "{{set_time}}", label: "Set Time", example: "8:00 PM", category: "logistics" },
  { key: "{{set_length}}", label: "Set Length", example: "60 minutes", category: "logistics" },
  { key: "{{performance_date}}", label: "Performance Date", example: "May 16, 2026", category: "logistics" },
  { key: "{{sound_check_time}}", label: "Sound Check Time", example: "4:00 PM", category: "logistics" },
  { key: "{{green_room}}", label: "Green Room", example: "Artist Lounge A", category: "logistics" },
  { key: "{{hospitality_rider}}", label: "Hospitality Rider", example: "See attached", category: "logistics" },
  { key: "{{guest_list_count}}", label: "Guest List Count", example: "4", category: "logistics" },
];

const VENDOR_FIELDS: MergeField[] = [
  { key: "{{company}}", label: "Company Name", example: "Sunset Foods", category: "business" },
  { key: "{{company_name}}", label: "Company Name", example: "Sunset Foods", category: "business" },
  { key: "{{booth_number}}", label: "Booth Number", example: "A-12", category: "logistics" },
  { key: "{{booth_size}}", label: "Booth Size", example: "10x10", category: "logistics" },
  { key: "{{booth_fee}}", label: "Booth Fee", example: "$500", category: "financial" },
  { key: "{{load_in_time}}", label: "Load-in Time", example: "Friday 8:00 AM", category: "logistics" },
  { key: "{{load_out_time}}", label: "Load-out Time", example: "Sunday 8:00 PM", category: "logistics" },
  { key: "{{power_requirements}}", label: "Power Requirements", example: "20 amp circuit", category: "logistics" },
];

const ARTISAN_FIELDS: MergeField[] = [
  { key: "{{business_name}}", label: "Business Name", example: "Handcrafted Jewelry Co", category: "business" },
  { key: "{{craft_type}}", label: "Craft Type", example: "Jewelry", category: "business" },
  { key: "{{booth_number}}", label: "Booth Number", example: "M-5", category: "logistics" },
  { key: "{{booth_fee}}", label: "Booth Fee", example: "$300", category: "financial" },
  { key: "{{setup_time}}", label: "Setup Time", example: "Friday 10:00 AM", category: "logistics" },
];

const PARTNER_FIELDS: MergeField[] = [
  { key: "{{company}}", label: "Company Name", example: "Example Valley Wine Tours", category: "business" },
  { key: "{{company_name}}", label: "Company Name", example: "Example Valley Wine Tours", category: "business" },
  { key: "{{partnership_level}}", label: "Partnership Level", example: "Gold Sponsor", category: "business" },
  { key: "{{logo_placement}}", label: "Logo Placement", example: "Main stage banner", category: "logistics" },
  { key: "{{sponsorship_value}}", label: "Sponsorship Value", example: "$5,000", category: "financial" },
  { key: "{{activation_area}}", label: "Activation Area", example: "VIP Lounge", category: "logistics" },
];

const CONTACT_FIELDS: MergeField[] = [
  { key: "{{contact_name}}", label: "Contact Name", example: "John Smith", category: "contact" },
  { key: "{{contact_first_name}}", label: "Contact First Name", example: "John", category: "contact" },
  { key: "{{contact_email}}", label: "Contact Email", example: "john@company.com", category: "contact" },
  { key: "{{contact_phone}}", label: "Contact Phone", example: "(555) 123-4567", category: "contact" },
  { key: "{{contact_role}}", label: "Contact Role", example: "Manager", category: "contact" },
  { key: "{{primary_contact_first_name}}", label: "Primary Contact First Name", example: "John", category: "contact" },
];

const CONTRACT_FIELDS: MergeField[] = [
  { key: "{{today_date}}", label: "Today's Date", example: "February 3, 2026", category: "logistics" },
  { key: "{{expiration_date}}", label: "Expiration Date", example: "March 1, 2026", category: "logistics" },
  { key: "{{contract_amount}}", label: "Contract Amount", example: "$2,500", category: "financial" },
  { key: "{{deposit_amount}}", label: "Deposit Amount", example: "$500", category: "financial" },
  { key: "{{payment_due_date}}", label: "Payment Due Date", example: "April 1, 2026", category: "financial" },
];

// =============================================================================
// FIELD GETTERS
// =============================================================================

/**
 * Get merge fields for a specific audience
 */
export function getMergeFieldsForAudience(audience: MergeFieldAudience): MergeField[] {
  const fields: MergeField[] = [...COMMON_FIELDS];
  
  switch (audience) {
    case "customer":
      fields.push(...CUSTOMER_FIELDS);
      break;
    case "artist":
      fields.push(...ARTIST_FIELDS, ...CONTACT_FIELDS);
      break;
    case "vendor":
      fields.push(...VENDOR_FIELDS, ...CONTACT_FIELDS);
      break;
    case "artisan":
      fields.push(...ARTISAN_FIELDS, ...CONTACT_FIELDS);
      break;
    case "partner":
      fields.push(...PARTNER_FIELDS, ...CONTACT_FIELDS);
      break;
    case "production":
    case "internal":
      // Production/internal gets all fields
      fields.push(
        ...CUSTOMER_FIELDS,
        ...ARTIST_FIELDS,
        ...VENDOR_FIELDS,
        ...ARTISAN_FIELDS,
        ...PARTNER_FIELDS,
        ...CONTACT_FIELDS
      );
      break;
    case "all":
    default:
      // "all" returns common fields only
      break;
  }
  
  // Remove duplicates by key
  const seen = new Set<string>();
  return fields.filter(field => {
    if (seen.has(field.key)) return false;
    seen.add(field.key);
    return true;
  });
}

/**
 * Get merge fields for contracts (includes contract-specific fields)
 */
export function getContractMergeFields(entityType: "vendor" | "artisan" | "partner" | "artist"): MergeField[] {
  const baseFields = getMergeFieldsForAudience(entityType);
  return [...baseFields, ...CONTRACT_FIELDS];
}

/**
 * Get all available merge field categories for a given audience
 */
export function getCategoriesForAudience(audience: MergeFieldAudience): MergeFieldCategory[] {
  const fields = getMergeFieldsForAudience(audience);
  const categories = new Set(fields.map(f => f.category));
  return Array.from(categories) as MergeFieldCategory[];
}

/**
 * Group fields by category for organized display
 */
export function groupFieldsByCategory(fields: MergeField[]): Record<MergeFieldCategory, MergeField[]> {
  return fields.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<MergeFieldCategory, MergeField[]>);
}

/**
 * Get human-readable category label
 */
export function getCategoryLabel(category: MergeFieldCategory): string {
  const labels: Record<MergeFieldCategory, string> = {
    recipient: "Recipient",
    event: "Event",
    venue: "Venue",
    contact: "Contact",
    business: "Business",
    logistics: "Logistics",
    financial: "Financial",
  };
  return labels[category] || category;
}

// =============================================================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// =============================================================================

// Simple flat list for basic use cases
export const ALL_MERGE_FIELDS = getMergeFieldsForAudience("production");

// Export individual field sets for direct access if needed
export {
  COMMON_FIELDS,
  CUSTOMER_FIELDS,
  ARTIST_FIELDS,
  VENDOR_FIELDS,
  ARTISAN_FIELDS,
  PARTNER_FIELDS,
  CONTACT_FIELDS,
  CONTRACT_FIELDS,
};
