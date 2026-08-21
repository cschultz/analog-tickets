/**
 * Optional, opt-in analytics/advertising configuration.
 *
 * Rules this module enforces:
 *  - Nothing is hardcoded. A fresh remix ships with no tracking identifiers,
 *    so no tag manager, pixel, or third-party script is ever loaded and no
 *    tracking endpoint is contacted.
 *  - A remix operator opts in by supplying their OWN ids through `VITE_*`
 *    variables. These are public by definition (they end up in the browser
 *    bundle) — never put a secret here.
 *  - Malformed values are ignored rather than passed through, so a typo
 *    cannot cause a request to an unintended endpoint.
 *
 * Supported variables (all optional):
 *   VITE_GTM_CONTAINER_ID      e.g. GTM-XXXXXXX
 *   VITE_GA4_MEASUREMENT_ID    e.g. G-XXXXXXXXXX
 *   VITE_GOOGLE_ADS_IDS        comma-separated, e.g. AW-000000000,AW-111111111
 *   VITE_META_PIXEL_ID         numeric pixel id
 *   VITE_CONTENT_SCRIPT_URL    absolute https URL of an optional third-party
 *                              content/personalisation script
 */
import type { RawEnv } from "./env";

const GTM_ID = /^GTM-[A-Z0-9]{4,}$/;
const GA4_ID = /^G-[A-Z0-9]{6,}$/;
const ADS_ID = /^AW-\d{6,}$/;
const PIXEL_ID = /^\d{6,20}$/;

export interface TrackingConfig {
  /** Google Tag Manager container, when the operator configured one. */
  gtmContainerId?: string;
  /** GA4 measurement id, when the operator configured one. */
  ga4MeasurementId?: string;
  /** Google Ads conversion account ids. Empty when unconfigured. */
  googleAdsIds: string[];
  /** Meta (Facebook) pixel id, when the operator configured one. */
  metaPixelId?: string;
  /** Optional third-party content/personalisation script (absolute https URL). */
  contentScriptUrl?: string;
}

export const EMPTY_TRACKING_CONFIG: TrackingConfig = Object.freeze({
  googleAdsIds: [],
}) as TrackingConfig;

function importMetaEnv(): RawEnv {
  try {
    return ((import.meta as unknown as { env?: RawEnv }).env ?? {}) as RawEnv;
  } catch {
    return {};
  }
}

function read(source: RawEnv, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function match(value: string, pattern: RegExp): string | undefined {
  return pattern.test(value) ? value : undefined;
}

function httpsUrl(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads the opt-in tracking configuration. Never throws, never logs values.
 * With no variables set this returns {@link EMPTY_TRACKING_CONFIG}-shaped data.
 */
export function getTrackingConfig(source: RawEnv = importMetaEnv()): TrackingConfig {
  const googleAdsIds = read(source, "VITE_GOOGLE_ADS_IDS")
    .split(",")
    .map((id) => id.trim().toUpperCase())
    .filter((id) => ADS_ID.test(id));

  return {
    gtmContainerId: match(read(source, "VITE_GTM_CONTAINER_ID").toUpperCase(), GTM_ID),
    ga4MeasurementId: match(read(source, "VITE_GA4_MEASUREMENT_ID").toUpperCase(), GA4_ID),
    googleAdsIds,
    metaPixelId: match(read(source, "VITE_META_PIXEL_ID"), PIXEL_ID),
    contentScriptUrl: httpsUrl(read(source, "VITE_CONTENT_SCRIPT_URL")),
  };
}

/** True when the operator opted into at least one Google tag surface. */
export function hasGoogleTracking(config: TrackingConfig = getTrackingConfig()): boolean {
  return Boolean(config.ga4MeasurementId) || config.googleAdsIds.length > 0;
}

/** True when the operator opted into the Meta pixel. */
export function hasMetaTracking(config: TrackingConfig = getTrackingConfig()): boolean {
  return Boolean(config.metaPixelId);
}

/** True when any tracking surface at all is configured. */
export function isTrackingConfigured(config: TrackingConfig = getTrackingConfig()): boolean {
  return (
    hasGoogleTracking(config) ||
    hasMetaTracking(config) ||
    Boolean(config.gtmContainerId) ||
    Boolean(config.contentScriptUrl)
  );
}

/**
 * Routes that must never load tracking even when it is configured
 * (staff-facing surfaces).
 */
export function isTrackingExemptPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/box-office");
}
