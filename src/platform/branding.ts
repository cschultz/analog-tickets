/**
 * Central branding source for the public-facing product names.
 *
 * Approved hierarchy (Gate 6, slice 21):
 *  - Analog Commons — the open-source commons for mission-aligned analog
 *    experiences (the umbrella).
 *  - Analog Tickets — the free, remixable festival website + ticketing platform
 *    that this repository contains.
 *  - Cosmico — a festival we previously created. It is no longer produced as an
 *    active event; it lives on here purely as a demonstration site.
 *
 * Nothing in this module is event data. Event identity (name, schedule, venue)
 * still comes from `EventConfig`. These are product names and the demo-site
 * disclaimer copy, kept in one place so remixers can find and replace them.
 */

export const BRANDING = {
  /** Umbrella / community name. */
  commonsName: "Analog Commons",
  commonsDescription:
    "The open-source commons for mission-aligned analog experiences.",

  /** The platform in this repository. */
  platformName: "Analog Tickets",
  platformDescription:
    "A free, remixable festival website and ticketing platform.",

  /** The demonstration site this deployment shows. */
  demoSiteName: "Cosmico",
} as const;

/**
 * Demo-site disclaimer copy.
 *
 * Deliberately states no lineup, no date, no ticket availability and no active
 * operation. Keep it that way: the demo must never read as a live event.
 */
export const DEMO_SITE_DISCLAIMER = {
  heading: `${BRANDING.demoSiteName} is a demonstration site`,
  lines: [
    `${BRANDING.demoSiteName} was a festival we previously created.`,
    "We no longer produce it as an active event.",
    `It lives on here as a demonstration of ${BRANDING.platformName}, in the hope that others create their own analog experiences.`,
    "This is a demonstration site — tickets and bookings are not available.",
  ],
  /** Single-sentence form for tight surfaces (footer, meta description). */
  short: `${BRANDING.demoSiteName} is no longer an active event. This is a demonstration of ${BRANDING.platformName} — tickets and bookings are not available.`,
} as const;

export default BRANDING;
