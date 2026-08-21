/**
 * Cosmico — DEMONSTRATION EVENT (NOT ACTIVE).
 *
 * Cosmico was a festival we previously created. It is no longer produced as an
 * active event; this record exists only as demo data for the open-source
 * platform. The schedule, venue, town and contact address below are invented
 * placeholders — there are no real people, no real organizations, no real
 * domains (`example.test` is reserved by RFC 6761 and can never resolve), and
 * no credentials of any kind. Nothing here is on sale.

 * The internal slug stays `analog-commons` on purpose: it is a backend key,
 * not visible copy.
 *
 * Use this file as the template when adding a real event: copy it to
 * `src/events/<your-event>/config.ts`, edit the values, and register it in
 * `src/platform/config/loadEventConfig.ts`. Never put an API key, token, or
 * secret in an event config — those are supplied to the runtime separately
 * (see docs/SECRETS_SETUP.md).
 */
import { defineEventConfig } from "@/platform/config/eventConfig";

export const analogCommonsConfig = defineEventConfig({
  identity: {
    slug: "analog-commons",
    name: "Cosmico",
    tagline: "An inactive demonstration event for the Analog Tickets platform. Tickets and bookings are not available.",
    supportEmail: "hello@example.test",
    canonicalUrl: "https://example.test",
    legalEntity: "Example Gatherings Cooperative",
  },

  schedule: {
    // Day-of-week derivation is locked to this zone so a UTC boundary can never
    // silently shift a label or a stored `valid_days` value.
    timezone: "America/Los_Angeles",
    days: [
      { key: "friday", label: "Friday", shortLabel: "Fr", date: "2027-05-14" },
      { key: "saturday", label: "Saturday", shortLabel: "Sa", date: "2027-05-15" },
      { key: "sunday", label: "Sunday", shortLabel: "Su", date: "2027-05-16" },
    ],
    // Legacy and short tokens seen in historical data. `thursday` is a
    // deliberate off-by-one absorber: earlier records labelled the opening day
    // Thursday before the calendar was corrected.
    dayAliases: {
      fri: "friday",
      sat: "saturday",
      sun: "sunday",
      thursday: "friday",
      thu: "friday",
    },
  },

  venue: {
    name: "Example Meadow",
    locality: "Example Valley",
    region: "CA",
    country: "US",
    address: "1 Example Meadow Road, Example Valley, CA 90000",
  },

  capacity: {
    total: 700,
    perTier: {},
  },

  commerce: {
    currency: "USD",
    minorUnits: true,
    paymentPlans: { enabled: true, minimumSubtotal: 10000 },
    promoCodes: { enabled: true },
  },

  modules: {
    site: true,
    ticketing: true,
    boxOffice: true,
    admin: true,
    lodging: true,
    addons: true,
    crew: true,
    wallet: true,
  },

  theme: {
    name: "default",
    fonts: {},
  },

  // Adapter selection only — never credentials. `none` means the port degrades
  // to a no-op, which is the correct default for a fresh clone.
  integrations: {
    payments: "none",
    email: "none",
    sms: "none",
    analytics: [],
    storage: "none",
    wallet: "none",
    crm: "none",
  },
});

export default analogCommonsConfig;
