// Operator-specific runtime configuration for edge functions.
//
// Nothing in this file may contain a real domain, email address, event id or
// payment-provider id. Every value is read from the function runtime's
// environment and FAILS CLOSED (neutral placeholder / empty / nil UUID) when
// the deployer has not configured it.
//
// Required for a working deployment:
//   SITE_URL                  public base URL of your site, e.g. https://tickets.example.org
//
// Strongly recommended (outbound email will be dropped without them):
//   OPERATOR_FROM_EMAIL       envelope sender used by transactional email
//   OPERATOR_REPLY_TO_EMAIL   address humans reply to
//   OPERATOR_ALERT_EMAIL      address that receives platform/incident alerts
//   OPERATOR_BRAND_NAME       display name shown in the From header
//   OPERATOR_MAIL_DOMAIN      subdomain used for machine addresses / threading
//
// Optional (feature specific):
//   PRIMARY_EVENT_ID, LODGING_EVENT_ID   event row ids used by a few jobs
//   STRIPE_PRICE_*                        price ids used by canaries/checkouts

/** Neutral, non-routable placeholder. Reserved by RFC 2606/6761. */
export const PLACEHOLDER_ORIGIN = "https://example.invalid";
export const PLACEHOLDER_MAIL_DOMAIN = "example.invalid";
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

/**
 * Public base URL, without a trailing slash.
 *
 * When SITE_URL is unset this returns the neutral placeholder origin so links
 * are obviously broken in a fresh remix instead of silently pointing at
 * somebody else's production site.
 */
export function getSiteUrl(): string {
  const raw = env("SITE_URL");
  if (!raw) {
    console.warn(
      "[operator-config] SITE_URL is not configured; using neutral placeholder " +
        PLACEHOLDER_ORIGIN,
    );
    return PLACEHOLDER_ORIGIN;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`unsupported protocol ${url.protocol}`);
    }
    return raw.replace(/\/+$/, "");
  } catch {
    console.warn(`[operator-config] SITE_URL is not a valid URL; using ${PLACEHOLDER_ORIGIN}`);
    return PLACEHOLDER_ORIGIN;
  }
}

/** Throws when SITE_URL is missing. Use where a bad link is worse than a 500. */
export function requireSiteUrl(): string {
  const url = getSiteUrl();
  if (url === PLACEHOLDER_ORIGIN) {
    throw new Error("SITE_URL is not configured for this deployment");
  }
  return url;
}

export function isSiteUrlConfigured(): boolean {
  return getSiteUrl() !== PLACEHOLDER_ORIGIN;
}

/** Mail subdomain used for machine/threaded addresses. Empty when unset. */
export function getMailDomain(): string {
  return env("OPERATOR_MAIL_DOMAIN") || PLACEHOLDER_MAIL_DOMAIN;
}

/** Display name used in From headers. Empty-safe. */
export function getBrandName(): string {
  return env("OPERATOR_BRAND_NAME") || "Event Team";
}

/** Envelope sender. Empty string when unconfigured — callers must skip sending. */
export function getFromEmail(): string {
  return env("OPERATOR_FROM_EMAIL");
}

/** Reply-to address. Empty string when unconfigured. */
export function getReplyToEmail(): string {
  return env("OPERATOR_REPLY_TO_EMAIL") || getFromEmail();
}

/** Alert/incident recipient. Empty string when unconfigured. */
export function getAlertEmail(): string {
  return env("OPERATOR_ALERT_EMAIL");
}

/** `Name <email>` header, or an empty string when no sender is configured. */
export function getFromAddress(name?: string): string {
  const email = getFromEmail();
  if (!email) return "";
  return `${name || getBrandName()} <${email}>`;
}

/** Recipient list for platform alerts. Empty array disables the notification. */
export function getAlertRecipients(): string[] {
  const alert = getAlertEmail();
  return alert ? [alert] : [];
}

/** Event row id from the environment, nil UUID when unset. */
export function getEventId(
  name: "PRIMARY_EVENT_ID" | "LODGING_EVENT_ID" | "SESSIONS_EVENT_ID",
): string {
  const raw = env(name);
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  if (!valid) {
    if (raw) console.warn(`[operator-config] ${name} is not a valid UUID; using nil UUID`);
    return NIL_UUID;
  }
  return raw.toLowerCase();
}

/** Stripe price id from the environment. Empty string when unset. */
export function getStripePriceId(name: string): string {
  return env(name);
}

/**
 * SMS alert destination (E.164 or bare digits, provider dependent).
 * Empty string when unconfigured — callers MUST skip sending.
 */
export function getAlertPhone(): string {
  return env("OPERATOR_ALERT_PHONE");
}
