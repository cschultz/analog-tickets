/**
 * Festival day handling — single source of truth.
 *
 * Day identity, ordering, labels, and the timezone all come from the active
 * `EventConfig` (`schedule.timezone`, `schedule.days`, `schedule.dayAliases`).
 * Nothing in this module hardcodes a weekday, a day count, or a region.
 *
 * All day-of-week derivation MUST go through this module so a UTC vs local
 * boundary can never silently shift a label or a stored `valid_days` value.
 *
 * `DayKey` is a widened `string` because day keys are event data, not
 * compile-time knowledge. Every accessor here therefore tolerates an unknown
 * key: labels fall back to a humanized form and `normalize*` returns `null` or
 * drops the value rather than throwing.
 */
import { getEventConfig } from "@/platform/config/loadEventConfig";
import type { DayKey, EventDay, EventSchedule } from "@/platform/config/eventConfig";

export type { DayKey };

function schedule(): EventSchedule {
  return getEventConfig().schedule;
}

/** IANA timezone the event's days are observed in. */
export function festivalTimezone(): string {
  return schedule().timezone;
}

/** Ordered day definitions for the active event. */
export function festivalDays(): readonly EventDay[] {
  return schedule().days;
}

/** Ordered canonical day keys for the active event. */
export function dayOrder(): DayKey[] {
  return schedule().days.map((d) => d.key);
}

/** Full label for a day key, humanized when the key is unknown. */
export function dayLabel(key: DayKey): string {
  const day = schedule().days.find((d) => d.key === key);
  if (day) return day.label;
  return key.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short badge label for a day key, derived when the key is unknown. */
export function dayShortLabel(key: DayKey): string {
  const day = schedule().days.find((d) => d.key === key);
  if (day) return day.shortLabel;
  return key.slice(0, 2).replace(/^\w/, (c) => c.toUpperCase());
}

/** Calendar date (`YYYY-MM-DD`) for a day key, when the event declares one. */
export function dayDate(key: DayKey): string | null {
  return schedule().days.find((d) => d.key === key)?.date ?? null;
}

/**
 * Map any inbound day token to a canonical day key.
 *
 * Resolution order: exact key match, then the event's configured aliases, then
 * a case-insensitive label match. Unknown tokens return `null` — callers decide
 * whether that is a skip or an error.
 */
export function normalizeDayKey(value: string | null | undefined): DayKey | null {
  if (value === null || value === undefined) return null;
  const token = String(value).trim().toLowerCase();
  if (!token) return null;

  const { days, dayAliases } = schedule();

  const direct = days.find((d) => d.key.toLowerCase() === token);
  if (direct) return direct.key;

  for (const [alias, target] of Object.entries(dayAliases)) {
    if (alias.trim().toLowerCase() === token) {
      // Validated at config-parse time, but re-check so a hand-built config in a
      // test can never produce a key that is not in `days`.
      const resolved = days.find((d) => d.key === target);
      if (resolved) return resolved.key;
    }
  }

  const byLabel = days.find(
    (d) => d.label.toLowerCase() === token || d.shortLabel.toLowerCase() === token,
  );
  return byLabel ? byLabel.key : null;
}

/** Filter + de-duplicate + sort inbound day tokens into canonical event order. */
export function normalizeValidDays(
  days: readonly (string | null | undefined)[] | null | undefined,
): DayKey[] {
  if (!days) return [];
  const seen = new Set<DayKey>();
  for (const d of days) {
    const k = normalizeDayKey(d);
    if (k) seen.add(k);
  }
  return dayOrder().filter((d) => seen.has(d));
}

/**
 * Canonical day key for a date *as observed in the event's timezone*.
 * Returns `null` when the date does not land on a configured day.
 *
 * Use this anywhere you'd otherwise call `date.getDay()` — that uses the
 * runtime's local timezone (UTC on a server) and will drift.
 *
 * Matching prefers the day's explicit calendar `date`; when an event declares
 * no dates, it falls back to matching the weekday name.
 */
export function getEventDayKey(date: Date | string | number): DayKey | null {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;

    const tz = festivalTimezone();

    const isoInTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const byDate = schedule().days.find((day) => day.date === isoInTz);
    if (byDate) return byDate.key;

    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz })
      .format(d)
      .toLowerCase();
    return normalizeDayKey(weekday);
  } catch {
    return null;
  }
}

/**
 * @deprecated Timezone is no longer Pacific-specific. Use `getEventDayKey`.
 * Retained so existing call sites keep compiling during the Gate 3 migration.
 */
export const getPTDayKey = getEventDayKey;

/** Short badge string in canonical order, e.g. `"Fr·Sa·Su"`. */
export function dayBadge(
  days: readonly (string | null | undefined)[] | null | undefined,
): string {
  const normalized = normalizeValidDays(days);
  if (!normalized.length) return "—";
  return normalized.map((d) => dayShortLabel(d)).join("·");
}
