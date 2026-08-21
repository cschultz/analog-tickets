/**
 * Outbound links to real-world third parties (social accounts, producing
 * organization, partner booking engines, merchandise).
 *
 * These are *operator* identifiers, not platform behaviour. Shipping the
 * original operator's handles, charity page, newsletter, or hotel booking
 * links inside an open-source remix would send that remix's visitors — and
 * their bookings — to somebody else. So the defaults here are neutral
 * placeholders, and every consumer must treat an unset value as "render plain
 * text, no link".
 *
 * A remix operator replaces the values below with their own, or deletes the
 * entries they do not use. Nothing here reaches a backend.
 */

/** A link is only rendered when its url is a non-empty absolute https URL. */
export interface ExternalLink {
  label: string;
  url?: string;
}

function link(label: string, url?: string): ExternalLink {
  const trimmed = (url ?? "").trim();
  return { label, url: /^https:\/\/\S+$/i.test(trimmed) ? trimmed : undefined };
}

/** Social accounts. Unset by default — a fresh remix shows no social icons. */
export const SOCIAL_LINKS: ExternalLink[] = [
  link("Instagram"),
  link("Facebook"),
  link("YouTube"),
];

/** Only the entries an operator actually configured. */
export function configuredSocialLinks(): ExternalLink[] {
  return SOCIAL_LINKS.filter((l) => Boolean(l.url));
}

/** Newsletter / blog link shown in the footer. Unset by default. */
export const NEWSLETTER_LINK: ExternalLink = link("Substack");

/**
 * The organization that produces the event, if any. `name` is copy; `url` is
 * only linked when configured. Both unset means the attribution line is
 * omitted entirely.
 */
export const PRODUCER: {
  name?: string;
  url?: string;
  description?: string;
  /** Postal address used in legal copy (giveaway rules, privacy). */
  legalAddress?: string;
} = {
  name: undefined,
  url: undefined,
  description: undefined,
  legalAddress: undefined,
};

/** Placeholder shown wherever legal copy needs an operator value that is unset. */
export const PRODUCER_PLACEHOLDER = "[operator name — configure src/platform/externalLinks.ts]";

/** Optional merchandise / book link used by the story page. */
export const STORE_LINK: ExternalLink = link("Explore the Book");

/**
 * Partner lodging offers for the standalone sessions page. Booking-engine URLs
 * are operator-specific (they carry a chain id, a hotel id and a promo code),
 * so they ship unset: the page lists the partners as plain text until an
 * operator supplies their own booking links.
 */
export interface LodgingPartner {
  name: string;
  bookingUrl?: string;
}

export const SESSIONS_LODGING_PARTNERS: LodgingPartner[] = [
  { name: "Partner hotel one", bookingUrl: undefined },
  { name: "Partner hotel two", bookingUrl: undefined },
];

/** Promo code advertised alongside the partner lodging offers, if any. */
export const SESSIONS_LODGING_PROMO_CODE: string | undefined = undefined;

/** Name to render in prose. Falls back to a neutral demo label. */
export const PRODUCER_DISPLAY_NAME = PRODUCER.name ?? "the demo sponsor organization";
