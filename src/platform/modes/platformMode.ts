/**
 * Platform mode resolution.
 *
 * A deployment of this platform can run as:
 *  - "site"       presentation / marketing routes only
 *  - "ticketing"  commerce + operations routes only (checkout, tickets,
 *                 my-tickets, box office, admin)
 *  - "integrated" everything (default, preserves existing behavior)
 *
 * Configured with the `VITE_PLATFORM_MODE` environment variable.
 * Unknown or empty values fail safe to "integrated".
 */

import { getPlatformModeSetting } from "@/platform/config/env";

export const PLATFORM_MODES = ["site", "ticketing", "integrated"] as const;

export type PlatformMode = (typeof PLATFORM_MODES)[number];

export const DEFAULT_PLATFORM_MODE: PlatformMode = "integrated";

export function isPlatformMode(value: unknown): value is PlatformMode {
  return typeof value === "string" && (PLATFORM_MODES as readonly string[]).includes(value);
}

/**
 * Normalizes a raw env value into a PlatformMode.
 * Invalid values fall back to "integrated" and warn in development.
 */
export function resolvePlatformMode(
  raw: unknown,
  options: { warn?: (message: string) => void; isDev?: boolean } = {},
): PlatformMode {
  const { warn = console.warn, isDev = false } = options;

  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_PLATFORM_MODE;
  }

  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : raw;

  if (isPlatformMode(normalized)) {
    return normalized;
  }

  if (isDev) {
    warn(
      `[platform] Invalid VITE_PLATFORM_MODE value ${JSON.stringify(raw)}. ` +
        `Expected one of: ${PLATFORM_MODES.join(", ")}. Falling back to "${DEFAULT_PLATFORM_MODE}".`,
    );
  }

  return DEFAULT_PLATFORM_MODE;
}

let cachedMode: PlatformMode | null = null;

export function getPlatformMode(): PlatformMode {
  if (cachedMode) return cachedMode;

  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  cachedMode = resolvePlatformMode(getPlatformModeSetting(env), { isDev: Boolean(env.DEV) });
  return cachedMode;
}

/** Test-only escape hatch. */
export function __setPlatformModeForTests(mode: PlatformMode | null) {
  cachedMode = mode;
}
