/**
 * Site identity helpers derived from the event contract.
 *
 * Scope (Gate 3, slice 1): these back the canonical-URL and page-metadata
 * surfaces only. Marketing page copy is intentionally NOT routed through here
 * yet — that is a later slice.
 */
import { getEventConfig } from "./loadEventConfig";
import type { EventIdentity } from "./eventConfig";

export function getSiteIdentity(): EventIdentity {
  return getEventConfig().identity;
}

/**
 * Absolute canonical origin for the running app.
 *
 * Prefers the browser's own origin so preview and local builds are
 * self-consistent, and falls back to the configured `canonicalUrl` when there
 * is no DOM (SSR, scripts, tests).
 */
export function getCanonicalOrigin(identity: EventIdentity = getSiteIdentity()): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return identity.canonicalUrl ?? "";
}

/** Join the canonical origin with a path, normalizing slashes. */
export function buildCanonicalUrl(path: string, identity?: EventIdentity): string {
  const origin = getCanonicalOrigin(identity).replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath === "/" ? "/" : normalizedPath.replace(/\/+$/, "")}`;
}

/**
 * Compose a document title.
 *
 * Returns the event name alone for the site root, and `"<page> — <event>"`
 * otherwise. Pages that already include the event name in their own title are
 * left untouched so existing copy does not double up.
 */
export function buildPageTitle(pageTitle?: string, identity: EventIdentity = getSiteIdentity()): string {
  const eventName = identity.name;
  if (!pageTitle || !pageTitle.trim()) return eventName;
  const trimmed = pageTitle.trim();
  if (trimmed.toLowerCase().includes(eventName.toLowerCase())) return trimmed;
  return `${trimmed} — ${eventName}`;
}

/**
 * Support/contact address for visible "email us" surfaces.
 *
 * Demo-only by default: the fictional Cosmico config ships an
 * `example.org`-style placeholder. Real deployments set this in their own
 * event config; transactional sender addresses live in backend configuration,
 * not here.
 */
export function getSupportEmail(identity: EventIdentity = getSiteIdentity()): string {
  return identity.supportEmail ?? "hello@example.org";
}

/**
 * Apply the event contract to the document's default metadata surfaces
 * (title, description, canonical og:*). Per-page overrides still win because
 * `usePageMeta` runs after mount.
 */
export function applyDefaultDocumentMeta(identity: EventIdentity = getSiteIdentity()): void {
  if (typeof document === "undefined") return;
  const description = identity.tagline ?? "";
  document.title = buildPageTitle(undefined, identity);
  const set = (selector: string, attr: "content", value: string) => {
    const el = document.querySelector(selector);
    if (el && value) el.setAttribute(attr, value);
  };
  set('meta[name="description"]', "content", description);
  set('meta[property="og:title"]', "content", document.title);
  set('meta[name="twitter:title"]', "content", document.title);
  set('meta[property="og:description"]', "content", description);
  set('meta[name="twitter:description"]', "content", description);
  set('meta[property="og:url"]', "content", buildCanonicalUrl("/", identity));
}
