// Centralized ticket type configuration for FRONTEND display purposes.
//
// AUTHORITY: the database `ticket_types` table is the single source of truth for
// sellable inventory, pricing, and valid days. Checkout and every edge function
// read from the database only.
//
// REMAINING FALLBACK (intentional, unchanged in Gate 3 slice 1): the constants
// below are used for optimistic UI rendering before the ticket_types query
// resolves, and as labels when a row is missing. They are NOT authoritative — a
// value here that disagrees with the database is a display bug, never a price
// the customer is charged. Do not add pricing logic that reads this file
// without also reading the database.
//
// This file remains event-specific (May 2026) by design; migrating it onto
// EventConfig is a later slice.

export interface TicketTypeConfig {
  key: string;
  label: string;
  shortLabel: string;
  order: number;
  /** Price in cents */
  price: number;
  event?: 'may_2026' | 'all';
  /** Description shown on ticket selection */
  description?: string;
}

// Active ticket types for May 2026 event
// NOTE: Prices are in CENTS (e.g., 21500 = $215.00)
export const TICKET_TYPES: Record<string, TicketTypeConfig> = {
  // Tier 1 ticket types (currently on sale)
  tier_1_ga_2day: {
    key: 'tier_1_ga_2day',
    label: 'GA — 2 Day',
    shortLabel: 'GA',
    order: 1,
    price: 23900,
    event: 'may_2026',
    description: 'General Admission 2-day pass for Friday & Saturday (May 15-16)',
  },
  tier_1_krewe_3day: {
    key: 'tier_1_krewe_3day',
    label: 'Crew — 3 Day',
    shortLabel: 'Crew',
    order: 2,
    price: 9900,
    event: 'may_2026',
    description: 'Crew 3-day pass',
  },
  tier_1_vip_3day: {
    key: 'tier_1_vip_3day',
    label: 'VIP — 3 Day',
    shortLabel: 'VIP',
    order: 3,
    price: 44900,
    event: 'may_2026',
    description: 'VIP 3-day pass',
  },
  tier_1_ga_friday: {
    key: 'tier_1_ga_friday',
    label: 'GA — Friday',
    shortLabel: 'Fri',
    order: 4,
    price: 10900,
    event: 'may_2026',
    description: 'Single-day Friday pass (May 15)',
  },
  tier_1_ga_saturday: {
    key: 'tier_1_ga_saturday',
    label: 'GA — Saturday',
    shortLabel: 'Sat',
    order: 5,
    price: 16900,
    event: 'may_2026',
    description: 'Single-day Saturday pass (May 16)',
  },
  // Youth ticket types (ages 13-17)
  youth_2day: {
    key: 'youth_2day',
    label: 'Youth — 2 Day',
    shortLabel: 'Youth',
    order: 6,
    price: 10000,
    event: 'may_2026',
    description: 'Youth ticket (ages 13-17) for Friday & Saturday',
  },
  youth_saturday: {
    key: 'youth_saturday',
    label: 'Youth — Saturday',
    shortLabel: 'Youth Sat',
    order: 7,
    price: 6000,
    event: 'may_2026',
    description: 'Youth ticket (ages 13-17) for Saturday only',
  },
  // Child ticket type (ages 0-12)
  child_free: {
    key: 'child_free',
    label: 'Child (0-12)',
    shortLabel: 'Child',
    order: 8,
    price: 0,
    event: 'may_2026',
    description: 'Free admission for children ages 0-12',
  },
  // Patron ticket types
  patrons_premier: {
    key: 'patrons_premier',
    label: 'Patrons Premier',
    shortLabel: 'Premier',
    order: 9,
    price: 250000,
    event: 'may_2026',
    description: 'Premier Patron package with exclusive benefits',
  },
  patrons_ultimate: {
    key: 'patrons_ultimate',
    label: 'Patrons Ultimate',
    shortLabel: 'Ultimate',
    order: 10,
    price: 500000,
    event: 'may_2026',
    description: 'Ultimate Patron experience with all-access privileges',
  },
};

// Ticket tier options for inventory requirements (simplified categories)
export const TICKET_TIER_OPTIONS = [
  { value: 'krewe', label: 'Crew' },
  { value: 'vip', label: 'VIP' },
  { value: 'ga', label: 'GA' },
  { value: 'patrons', label: 'Patrons' },
];

// Helper functions
export function getTicketLabel(ticketType: string): string {
  return TICKET_TYPES[ticketType]?.label || 
    ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function getTicketShortLabel(ticketType: string): string {
  return TICKET_TYPES[ticketType]?.shortLabel || 
    ticketType.replace(/_/g, ' ');
}

export function getTicketOrder(ticketType: string): number {
  return TICKET_TYPES[ticketType]?.order || 99;
}

export function getTicketPrice(ticketType: string): number {
  return TICKET_TYPES[ticketType]?.price || 0;
}

export function getTicketDescription(ticketType: string): string {
  return TICKET_TYPES[ticketType]?.description || '';
}

export function formatTicketType(ticketType: string): string {
  return getTicketLabel(ticketType);
}

export function formatPrice(priceInCents: number): string {
  return `$${(priceInCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatPriceWithCents(priceInCents: number): string {
  return `$${(priceInCents / 100).toFixed(2)}`;
}

// Get all ticket types
export function getAllTicketTypes(): TicketTypeConfig[] {
  return Object.values(TICKET_TYPES).sort((a, b) => a.order - b.order);
}

// Get tier 1 ticket types
export function getTier1TicketTypes(): TicketTypeConfig[] {
  return Object.values(TICKET_TYPES)
    .filter(t => t.key.startsWith('tier_1_'))
    .sort((a, b) => a.order - b.order);
}

// Get ticket config by key
export function getTicketConfig(ticketType: string): TicketTypeConfig | undefined {
  return TICKET_TYPES[ticketType];
}

// Returns the human-readable date range and short day label for a given ticket type.
// Used in /my-tickets, ticket emails, and Apple Wallet passes so that valid days
// always match the actual ticket — never just the festival start date.
export function getTicketDateRange(ticketType: string): {
  /** Long form date range, e.g. "Fri, May 15 – Sat, May 16, 2026" */
  dateRange: string;
  /** Short day label, e.g. "Friday & Saturday" or "Saturday only" */
  dayDescription: string;
} {
  // Saturday-only passes
  if (ticketType === 'tier_1_ga_saturday' || ticketType === 'youth_saturday') {
    return { dateRange: 'Saturday, May 16, 2026', dayDescription: 'Saturday only' };
  }
  // Friday-only passes
  if (ticketType === 'tier_1_ga_friday') {
    return { dateRange: 'Friday, May 15, 2026', dayDescription: 'Friday only' };
  }
  // 2-day passes (Friday + Saturday)
  if (
    ticketType === 'ga_2day' ||
    ticketType === 'tier_1_ga_2day' ||
    ticketType === 'early_bird_ga_2day' ||
    ticketType === 'youth_2day' ||
    ticketType === 'child_free'
  ) {
    return { dateRange: 'Fri, May 15 – Sat, May 16, 2026', dayDescription: 'Friday & Saturday' };
  }
  // Everything else (Crew, VIP, Patrons, Artist Guest) is the full 3-day weekend
  return { dateRange: 'Fri, May 15 – Sun, May 17, 2026', dayDescription: 'Friday through Sunday' };
}

