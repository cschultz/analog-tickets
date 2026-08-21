/**
 * Event configuration loader.
 *
 * Resolves exactly one active `EventConfig` for the running app, synchronously,
 * at module-evaluation time. Synchronous resolution is deliberate: non-React
 * modules (day helpers, formatters) need the config without awaiting, and an
 * event's schedule cannot change while the app is running.
 *
 * Selecting an event: set `VITE_EVENT_SLUG` in your local `.env`. When unset,
 * the fictional demo event is used, so a fresh clone boots with no
 * configuration at all.
 */
import { parseEventConfig, type EventConfig, type EventConfigInput } from "./eventConfig";
import { getPublicEnv } from "./env";
import { analogCommonsConfig } from "@/events/analog-commons/config";

/**
 * Registry of available event configurations.
 * Add real events here alongside the demo; do not delete the demo, it is the
 * reference implementation and the fallback for a clone with no `.env`.
 */
export const EVENT_REGISTRY: Record<string, EventConfigInput> = {
  "analog-commons": analogCommonsConfig,
};

export const DEFAULT_EVENT_SLUG = "analog-commons";

function readEnvSlug(): string | undefined {
  // Centralized reader; never throws, so this also works under plain Node.
  return getPublicEnv().eventSlug;
}

/**
 * Resolve and validate a configuration by slug.
 * Throws when the slug is unknown or the config fails validation — a
 * misconfigured event must fail at startup, not halfway through a checkout.
 */
export function loadEventConfig(slug?: string): EventConfig {
  const requested = slug ?? readEnvSlug() ?? DEFAULT_EVENT_SLUG;
  const input = EVENT_REGISTRY[requested];

  if (!input) {
    const known = Object.keys(EVENT_REGISTRY).join(", ") || "(none)";
    throw new Error(
      `Unknown event slug "${requested}". Registered events: ${known}. ` +
        `Set VITE_EVENT_SLUG to a registered slug, or register the event in ` +
        `src/platform/config/loadEventConfig.ts.`,
    );
  }

  try {
    return parseEventConfig(input);
  } catch (error) {
    throw new Error(
      `Event configuration "${requested}" is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

let cached: EventConfig | null = null;

/**
 * The active configuration for this app instance.
 * Memoized; safe to call from anywhere, including module top level.
 */
export function getEventConfig(): EventConfig {
  if (!cached) cached = loadEventConfig();
  return cached;
}

/**
 * Test-only override. Lets a test evaluate helpers against a different event
 * (different day count, different timezone) without rebuilding the app.
 * Pass `null` to restore normal resolution.
 */
export function __setEventConfigForTests(config: EventConfig | null): void {
  cached = config;
}
