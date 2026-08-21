/**
 * Redirect hardening helpers.
 *
 * Addresses the react-router / @remix-run/router open-redirect advisory class:
 * any navigation target that originates from a URL, query parameter, router
 * location state, persisted storage, or a backend response must be validated
 * before it is used, otherwise an attacker can steer users to an external
 * origin (`//evil.example`) or execute script (`javascript:`).
 *
 * Two distinct surfaces:
 *  - internal app routes  -> sanitizeInternalPath()
 *  - external destinations -> resolveExternalRedirect() / redirectToExternal()
 */

/** Schemes that must never be used as a navigation target. */
const UNSAFE_SCHEME = /^[a-z0-9+.-]*:/i;
const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Hosts that the application is allowed to hand users off to. Payment and
 * billing portals return absolute URLs from the backend; everything else must
 * be same-origin. Suffix matching is done on registrable-host boundaries
 * (`.stripe.com`) so `stripe.com.evil.test` cannot pass.
 */
export const DEFAULT_EXTERNAL_REDIRECT_HOSTS = [
  "checkout.stripe.com",
  "billing.stripe.com",
  "pay.stripe.com",
  "connect.stripe.com",
] as const;

function isAllowedHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const candidate = allowed.toLowerCase();
    return host === candidate || host.endsWith(`.${candidate}`);
  });
}

/**
 * Normalizes an app-internal navigation target.
 *
 * Accepts only same-origin relative paths beginning with a single `/`.
 * Rejects protocol-relative (`//host`), scheme-bearing (`javascript:`,
 * `data:`, `blob:`, `http:`), backslash-obfuscated (`/\evil.test`) and
 * control-character inputs, falling back to `fallback`.
 */
export function sanitizeInternalPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;

  const raw = value.trim();
  if (!raw) return fallback;

  // Strip control characters / whitespace used to smuggle schemes (java\tscript:).
  const candidate = raw.replace(/[\u0000-\u001f\u007f]/g, "");
  if (!candidate.startsWith("/")) return fallback;
  // Protocol-relative or backslash variants: //host, /\host, \\host
  if (/^[/\\]{2,}/.test(candidate)) return fallback;
  if (candidate.includes("\\")) return fallback;
  if (UNSAFE_SCHEME.test(candidate)) return fallback;

  return candidate;
}

/** True when `value` is a safe same-origin app path. */
export function isSafeInternalPath(value: unknown): boolean {
  return typeof value === "string" && sanitizeInternalPath(value, "\u0000") !== "\u0000";
}

export interface ExternalRedirectOptions {
  /** Extra hostnames permitted in addition to the defaults. */
  allowedHosts?: readonly string[];
  /** Origin treated as same-origin; defaults to window.location.origin. */
  currentOrigin?: string;
}

/**
 * Validates a fully-qualified redirect target (e.g. a hosted checkout URL
 * returned by an edge function). Returns the normalized URL string when the
 * destination is same-origin or an explicitly approved http(s) host, otherwise
 * `null`.
 */
export function resolveExternalRedirect(
  value: unknown,
  options: ExternalRedirectOptions = {},
): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!raw) return null;

  const origin =
    options.currentOrigin ??
    (typeof window !== "undefined" ? window.location.origin : undefined);

  // Relative targets are only safe if they are same-origin app paths.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    const internal = sanitizeInternalPath(raw, "\u0000");
    if (internal === "\u0000") return null;
    return origin ? `${origin}${internal}` : internal;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
  if (origin && parsed.origin === origin) return parsed.toString();

  const allowedHosts = [...DEFAULT_EXTERNAL_REDIRECT_HOSTS, ...(options.allowedHosts ?? [])];
  if (!isAllowedHost(parsed.hostname, allowedHosts)) return null;
  // Never allow credentials-bearing URLs (https://evil.test@allowed.host style confusion).
  if (parsed.username || parsed.password) return null;

  return parsed.toString();
}

/**
 * Performs a hardened full-page redirect. Returns true when the navigation was
 * allowed; callers should surface an error to the user when it returns false.
 */
export function redirectToExternal(
  value: unknown,
  options: ExternalRedirectOptions = {},
): boolean {
  const target = resolveExternalRedirect(value, options);
  if (!target || typeof window === "undefined") {
    if (!target) {
      console.error("[safeRedirect] Blocked unsafe redirect target");
    }
    return false;
  }
  window.location.href = target;
  return true;
}
