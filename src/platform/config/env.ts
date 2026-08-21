/**
 * Centralized, typed access to public (client-side) environment configuration.
 *
 * Rules this module enforces:
 *  - Only `VITE_*` values, which are compiled into the browser bundle and are
 *    therefore public by definition. Never put a secret here.
 *  - Values are never logged, echoed, or included in error messages.
 *  - Importing this module NEVER throws. Validation happens only when a caller
 *    explicitly asks for it (`requirePublicEnv`, `assertPublicEnv`), so test
 *    discovery and non-backend surfaces keep working with no `.env` at all.
 *
 * Remixers configure their own backend; see docs/OPEN_SOURCE_RELEASE_BASELINE.md.
 */
import { z } from "zod";

export const PLATFORM_MODE_VALUES = ["site", "ticketing", "integrated"] as const;

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

/** Shape of the raw, unvalidated env record this module understands. */
export type RawEnv = Record<string, unknown>;

/**
 * Strict schema. Only used when a caller explicitly requests validation.
 * The error messages are remixer-facing and never contain the offending value.
 */
export const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: z
    .string({ required_error: "VITE_SUPABASE_URL is required." })
    .trim()
    .min(1, "VITE_SUPABASE_URL is required.")
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "VITE_SUPABASE_URL must be an absolute http(s) URL, e.g. https://<your-project-ref>.supabase.co"),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string({ required_error: "VITE_SUPABASE_PUBLISHABLE_KEY is required." })
    .trim()
    .min(1, "VITE_SUPABASE_PUBLISHABLE_KEY is required."),
  VITE_SUPABASE_PROJECT_ID: optionalString,
  VITE_PLATFORM_MODE: optionalString,
  VITE_EVENT_SLUG: optionalString,
  VITE_ENABLE_TESTING: optionalString,
  VITE_PRODUCTION_HOSTS: optionalString,
  // Optional, opt-in analytics/advertising. Absent by default; see
  // ./tracking.ts for parsing and validation.
  VITE_GTM_CONTAINER_ID: optionalString,
  VITE_GA4_MEASUREMENT_ID: optionalString,
  VITE_GOOGLE_ADS_IDS: optionalString,
  VITE_META_PIXEL_ID: optionalString,
  VITE_CONTENT_SCRIPT_URL: optionalString,
});


export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Lenient view: whatever is present, normalized, with no validation errors. */
export interface LenientPublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseProjectId?: string;
  platformMode?: string;
  eventSlug?: string;
  enableTesting: boolean;
  productionHosts: string[];
}

function importMetaEnv(): RawEnv {
  try {
    return ((import.meta as unknown as { env?: RawEnv }).env ?? {}) as RawEnv;
  } catch {
    return {};
  }
}

function str(source: RawEnv, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads and normalizes the public env. Never throws, never logs.
 * Pass `source` to test against an explicit record.
 */
export function getPublicEnv(source: RawEnv = importMetaEnv()): LenientPublicEnv {
  const hosts = str(source, "VITE_PRODUCTION_HOSTS")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return {
    supabaseUrl: str(source, "VITE_SUPABASE_URL"),
    supabaseAnonKey: str(source, "VITE_SUPABASE_PUBLISHABLE_KEY"),
    supabaseProjectId: str(source, "VITE_SUPABASE_PROJECT_ID") || undefined,
    platformMode: str(source, "VITE_PLATFORM_MODE") || undefined,
    eventSlug: str(source, "VITE_EVENT_SLUG") || undefined,
    enableTesting: str(source, "VITE_ENABLE_TESTING") === "true",
    productionHosts: hosts,
  };
}

const SETUP_HINT =
  "Copy .env.example to .env and fill in the public values from your own backend project. " +
  "See docs/OPEN_SOURCE_RELEASE_BASELINE.md.";

/**
 * Strict validation. Throws a remixer-facing error listing the offending
 * variable names only — never their values.
 */
export function requirePublicEnv(source: RawEnv = importMetaEnv()): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "environment";
    return `  - ${key}: ${issue.message}`;
  });

  throw new Error(
    `Missing or invalid public environment configuration:\n${problems.join("\n")}\n${SETUP_HINT}`,
  );
}

/** Boolean form of {@link requirePublicEnv}; never throws, never logs values. */
export function hasRequiredPublicEnv(source: RawEnv = importMetaEnv()): boolean {
  return publicEnvSchema.safeParse(source).success;
}

/** Throwing assertion helper for backend-dependent entry points. */
export function assertPublicEnv(source: RawEnv = importMetaEnv()): void {
  requirePublicEnv(source);
}

/** Base URL of the configured backend, with trailing slashes removed. May be "". */
export function getSupabaseUrl(source?: RawEnv): string {
  return getPublicEnv(source).supabaseUrl.replace(/\/+$/, "");
}

/** Public/anon key of the configured backend. May be "". */
export function getSupabaseAnonKey(source?: RawEnv): string {
  return getPublicEnv(source).supabaseAnonKey;
}

/** Origin of the configured backend, or "" when unset/malformed. */
export function getSupabaseOrigin(source?: RawEnv): string {
  const url = getSupabaseUrl(source);
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Absolute URL of an edge function, or "" when the backend is not configured. */
export function getFunctionUrl(name: string, source?: RawEnv): string {
  const base = getSupabaseUrl(source);
  return base ? `${base}/functions/v1/${name}` : "";
}

/** Absolute URL of a public storage object path, or "" when unconfigured. */
export function getPublicStorageUrl(path: string, source?: RawEnv): string {
  const base = getSupabaseUrl(source);
  if (!base) return "";
  return `${base}/storage/v1/object/public/${path.replace(/^\/+/, "")}`;
}

/** Raw platform mode string; resolution/fallback lives in platform/modes. */
export function getPlatformModeSetting(source?: RawEnv): string | undefined {
  return getPublicEnv(source).platformMode;
}

/** Hostnames treated as production. Empty by default — fails closed. */
export function getProductionHosts(source?: RawEnv): string[] {
  return getPublicEnv(source).productionHosts;
}
