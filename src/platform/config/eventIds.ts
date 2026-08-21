/**
 * Backend event-row identifiers, resolved from public configuration.
 *
 * A handful of surfaces (lineup, registrations, photos, lodging units, the
 * sessions RSVP page) query a single event row by primary key. Those UUIDs are
 * rows in *your* backend, not platform constants — hardcoding one operator's
 * UUIDs into the source ships their identifiers to every remix and makes those
 * screens query rows that do not exist in a fresh project.
 *
 * Configure them in `.env`:
 *   VITE_PRIMARY_EVENT_ID   — the main event row the site/admin screens read
 *   VITE_LODGING_EVENT_ID   — event row used by lodging/accommodation units
 *                             (defaults to the primary event when unset)
 *   VITE_SESSIONS_EVENT_ID  — event row used by the standalone sessions RSVP
 *                             page (defaults to the primary event when unset)
 *
 * When unset, every getter returns the nil UUID. Queries then return no rows
 * instead of silently reading or writing somebody else's event.
 */
import { getPublicEnv } from "./env";

/** RFC 4122 nil UUID — a valid uuid that matches no row. */
export const NIL_EVENT_ID = "00000000-0000-0000-0000-000000000000";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawEnv = Record<string, unknown>;

function readUuid(source: RawEnv | undefined, key: string): string | undefined {
  const raw = source ? source[key] : undefined;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  return UUID.test(value) ? value : undefined;
}

function env(source?: RawEnv): RawEnv {
  if (source) return source;
  try {
    return ((import.meta as unknown as { env?: RawEnv }).env ?? {}) as RawEnv;
  } catch {
    return {};
  }
}

/** The main event row id, or the nil UUID when unconfigured. */
export function getPrimaryEventId(source?: RawEnv): string {
  return readUuid(env(source), "VITE_PRIMARY_EVENT_ID") ?? NIL_EVENT_ID;
}

/** Lodging/accommodation event row id. Falls back to the primary event. */
export function getLodgingEventId(source?: RawEnv): string {
  return readUuid(env(source), "VITE_LODGING_EVENT_ID") ?? getPrimaryEventId(source);
}

/** Standalone sessions RSVP event row id. Falls back to the primary event. */
export function getSessionsEventId(source?: RawEnv): string {
  return readUuid(env(source), "VITE_SESSIONS_EVENT_ID") ?? getPrimaryEventId(source);
}

/** True when no event id has been configured for this deployment. */
export function hasConfiguredEventId(source?: RawEnv): boolean {
  return getPrimaryEventId(source) !== NIL_EVENT_ID;
}

/** Event slug from public env, for surfaces that key off the slug instead. */
export function getConfiguredEventSlug(): string | undefined {
  return getPublicEnv().eventSlug;
}
