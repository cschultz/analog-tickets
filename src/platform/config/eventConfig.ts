/**
 * EventConfig — the platform's event contract.
 *
 * This module is deliberately framework-light: it exports only a Zod schema and
 * the types inferred from it. Nothing here imports React, the data layer, or any
 * event-specific value. A concrete event supplies a plain object that satisfies
 * `EventConfigInput`; the platform validates it once at load time.
 *
 * Scope note (Gate 3, slice 1): the schema describes the whole contract, but only
 * `identity` and `schedule` are consumed by application code so far. The other
 * sections are declared now so later slices can adopt them without a breaking
 * change to the shape.
 */
import { z } from "zod";

/** Lowercase, hyphen-safe identifier (`"analog-commons"`, `"friday"`). */
const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "must be a lowercase slug");

/** IANA timezone name. Validated against the runtime's own timezone database. */
const timezoneSchema = z.string().min(1).refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be a valid IANA timezone identifier" },
);

/** ISO calendar date, `YYYY-MM-DD`. Time-of-day is intentionally not modelled here. */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO calendar date (YYYY-MM-DD)");

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const eventIdentitySchema = z.object({
  /** Stable machine identifier for this event configuration. */
  slug: slugSchema,
  /** Display name used in titles, metadata, and transactional copy. */
  name: z.string().min(1),
  /** Short line shown under the name. Optional. */
  tagline: z.string().optional(),
  /** Public support/contact address. Never a personal mailbox. */
  supportEmail: z.string().email(),
  /**
   * Absolute canonical origin, no trailing slash, e.g. `https://example.test`.
   * When omitted, the platform falls back to the browser's own origin, which is
   * the correct behavior for local development and preview deployments.
   */
  canonicalUrl: z.string().url().optional(),
  /** Optional legal entity shown in terms/receipts. */
  legalEntity: z.string().optional(),
});

/**
 * One festival day.
 *
 * `key` is the canonical token persisted in data (`valid_days`, check-in rows).
 * It must be a slug, but it is NOT required to be a weekday name — an event may
 * legitimately use `day-1`, `opening`, etc.
 */
export const eventDaySchema = z.object({
  key: slugSchema,
  label: z.string().min(1),
  /** Two-or-three character badge form, e.g. `"Fr"`. */
  shortLabel: z.string().min(1).max(3),
  date: isoDateSchema.optional(),
});

export const eventScheduleSchema = z.object({
  /** All day-of-week derivation is locked to this timezone. */
  timezone: timezoneSchema,
  /** Ordered days. Order here is the canonical display and sort order. */
  days: z.array(eventDaySchema).min(1),
  /**
   * Historical/short tokens mapped onto canonical day keys, e.g.
   * `{ fri: "friday", thursday: "friday" }`. Lets an event absorb legacy data
   * without a migration. Keys are matched case-insensitively.
   */
  dayAliases: z.record(z.string(), z.string()).default({}),
});

export const eventVenueSchema = z.object({
  name: z.string().min(1),
  locality: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  /** Free-form address block for display. */
  address: z.string().optional(),
  mapUrl: z.string().url().optional(),
});

export const eventCapacitySchema = z.object({
  /** Hard attendance cap for the whole event, or null when uncapped. */
  total: z.number().int().positive().nullable().default(null),
  /** Optional per-tier caps keyed by ticket type key. */
  perTier: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

export const eventCommerceSchema = z.object({
  /** ISO 4217, uppercase. */
  currency: z.string().length(3).toUpperCase().default("USD"),
  /**
   * All monetary values in this platform are minor units (cents). Declared here
   * so the assumption is contractual rather than tribal knowledge.
   */
  minorUnits: z.literal(true).default(true),
  paymentPlans: z
    .object({
      enabled: z.boolean().default(false),
      /** Minimum cart subtotal, in minor units, required to offer a plan. */
      minimumSubtotal: z.number().int().nonnegative().default(0),
    })
    .default({ enabled: false, minimumSubtotal: 0 }),
  promoCodes: z.object({ enabled: z.boolean().default(true) }).default({ enabled: true }),
});

/** Optional product surfaces. Anything false must be safely absent from the UI. */
export const eventModulesSchema = z.object({
  site: z.boolean().default(true),
  ticketing: z.boolean().default(true),
  boxOffice: z.boolean().default(true),
  admin: z.boolean().default(true),
  lodging: z.boolean().default(false),
  addons: z.boolean().default(false),
  crew: z.boolean().default(false),
  wallet: z.boolean().default(false),
});

export const eventThemeSchema = z.object({
  /** Theme directory/token-set name. */
  name: z.string().min(1).default("default"),
  fonts: z
    .object({ heading: z.string().optional(), body: z.string().optional() })
    .default({}),
});

/**
 * Which adapter backs each integration port. `"none"` is always valid and means
 * the port degrades to a no-op. No credentials ever appear in this file — only
 * the choice of adapter.
 */
export const eventIntegrationsSchema = z.object({
  payments: z.enum(["none", "stripe"]).default("none"),
  email: z.enum(["none", "console", "resend"]).default("none"),
  sms: z.enum(["none", "simpletexting"]).default("none"),
  analytics: z.array(z.enum(["ga4", "meta"])).default([]),
  storage: z.enum(["none", "supabase", "dropbox"]).default("none"),
  wallet: z.enum(["none", "apple"]).default("none"),
  crm: z.enum(["none", "flodesk", "convertkit"]).default("none"),
});

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export const eventConfigSchema = z
  .object({
    identity: eventIdentitySchema,
    schedule: eventScheduleSchema,
    venue: eventVenueSchema,
    capacity: eventCapacitySchema.default({ total: null, perTier: {} }),
    commerce: eventCommerceSchema.default({}),
    modules: eventModulesSchema.default({}),
    theme: eventThemeSchema.default({}),
    integrations: eventIntegrationsSchema.default({}),
  })
  .superRefine((config, ctx) => {
    const keys = config.schedule.days.map((d) => d.key);
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (duplicates.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedule", "days"],
        message: `duplicate day keys: ${[...new Set(duplicates)].join(", ")}`,
      });
    }
    for (const [alias, target] of Object.entries(config.schedule.dayAliases)) {
      if (!keys.includes(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["schedule", "dayAliases", alias],
          message: `alias "${alias}" points at unknown day key "${target}"`,
        });
      }
    }
  });

/** Fully-resolved config, with every default applied. */
export type EventConfig = z.output<typeof eventConfigSchema>;
/** What an event file may supply — defaults still unapplied. */
export type EventConfigInput = z.input<typeof eventConfigSchema>;

export type EventIdentity = EventConfig["identity"];
export type EventSchedule = EventConfig["schedule"];
export type EventDay = EventConfig["schedule"]["days"][number];
export type EventModules = EventConfig["modules"];
export type EventIntegrations = EventConfig["integrations"];

/**
 * Canonical day token.
 *
 * Intentionally a widened `string` rather than a literal union: day keys are now
 * event data, so they cannot be known at compile time. Code that indexes by
 * `DayKey` must therefore tolerate an unknown key at runtime — see
 * `@/lib/festivalDays` for the safe accessors.
 */
export type DayKey = string;

/**
 * Validate an event configuration. Throws a `ZodError` with a readable path when
 * the object is malformed; misconfiguration should fail loudly at startup rather
 * than produce a subtly wrong festival.
 */
export function parseEventConfig(input: unknown): EventConfig {
  return eventConfigSchema.parse(input);
}

/** Non-throwing variant, for callers that want to render their own error state. */
export function safeParseEventConfig(input: unknown) {
  return eventConfigSchema.safeParse(input);
}

/** Helper for event files: gives authoring-time type checking without widening. */
export function defineEventConfig(config: EventConfigInput): EventConfigInput {
  return config;
}
