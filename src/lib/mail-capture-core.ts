/**
 * Gate 121 — pure, dependency-free logic for the private staging
 * test-only e-mail/OTP capture adapter.
 *
 * This module holds no transport, no credentials, and no environment access.
 * It never returns, formats, or logs a raw OTP code, recipient address,
 * token, or configuration value. Every consumer is server-side only; the
 * accompanying static guards assert that no browser module imports either
 * this file or `mail-capture.server.ts`.
 */

/** Server-only configuration names. None of these may ever be `VITE_*`. */
export const CAPTURE_ENV_NAMES = [
  "TEST_MAIL_CAPTURE_PROVIDER",
  "TEST_MAIL_CAPTURE_BASE_URL",
  "TEST_MAIL_CAPTURE_API_KEY",
  "TEST_MAIL_FROM_ADDRESS",
  "TEST_MAIL_RECIPIENT_DOMAIN",
  "TEST_MAIL_CAPTURE_MODE",
] as const;

export type CaptureEnvName = (typeof CAPTURE_ENV_NAMES)[number];

/** The only name that carries a credential. */
export const CAPTURE_SECRET_ENV_NAMES: readonly CaptureEnvName[] = ["TEST_MAIL_CAPTURE_API_KEY"];

/** Reserved, non-routable top-level labels approved for synthetic recipients. */
export const SYNTHETIC_TLDS = ["test", "invalid", "example", "localhost"] as const;

export type CaptureDisabledReason =
  | "mode_off"
  | "missing_configuration"
  | "invalid_base_url"
  | "non_synthetic_domain"
  | "non_synthetic_sender";

export type CaptureFailureReason =
  | "disabled"
  | "recipient_not_allowed"
  | "invalid_input"
  | "provider_unavailable";

export interface CaptureConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  fromAddress: string;
  recipientDomain: string;
}

export type CaptureResolution =
  | { enabled: true; config: CaptureConfig }
  | { enabled: false; reason: CaptureDisabledReason };

/** Fail-closed: only the exact literal `true` enables capture. */
export function isCaptureModeEnabled(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function trimmed(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A domain is synthetic when its final label is a reserved, non-routable one. */
export function isSyntheticDomain(domain: string): boolean {
  const clean = trimmed(domain).toLowerCase().replace(/\.$/, "");
  if (!clean || clean.includes("@") || clean.includes("/") || clean.startsWith(".")) return false;
  if (!/^[a-z0-9.-]+$/.test(clean)) return false;
  const last = clean.split(".").pop() ?? "";
  return (SYNTHETIC_TLDS as readonly string[]).includes(last);
}

/** Lowercases and trims an address; returns null when it is not a plain address. */
export function normalizeRecipient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) return null;
  return clean;
}

/** A recipient is accepted only inside the configured synthetic domain. */
export function isAllowedRecipient(address: string | null, recipientDomain: string): boolean {
  if (!address) return false;
  const domain = trimmed(recipientDomain).toLowerCase();
  if (!isSyntheticDomain(domain)) return false;
  return address.endsWith(`@${domain}`);
}

/**
 * Resolves configuration into an enabled adapter or an explicit disabled
 * reason. Absent, partial, or non-synthetic configuration means disabled.
 */
export function resolveCaptureConfig(
  env: Partial<Record<CaptureEnvName, string | undefined>>,
): CaptureResolution {
  if (!isCaptureModeEnabled(env.TEST_MAIL_CAPTURE_MODE)) {
    return { enabled: false, reason: "mode_off" };
  }
  const provider = trimmed(env.TEST_MAIL_CAPTURE_PROVIDER);
  const baseUrl = trimmed(env.TEST_MAIL_CAPTURE_BASE_URL).replace(/\/+$/, "");
  const apiKey = trimmed(env.TEST_MAIL_CAPTURE_API_KEY);
  const fromAddress = normalizeRecipient(env.TEST_MAIL_FROM_ADDRESS) ?? "";
  const recipientDomain = trimmed(env.TEST_MAIL_RECIPIENT_DOMAIN).toLowerCase();

  if (!provider || !baseUrl || !apiKey || !fromAddress || !recipientDomain) {
    return { enabled: false, reason: "missing_configuration" };
  }
  if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?(?:\/.*)?$/i.test(baseUrl)) {
    return { enabled: false, reason: "invalid_base_url" };
  }
  if (!isSyntheticDomain(recipientDomain)) {
    return { enabled: false, reason: "non_synthetic_domain" };
  }
  if (!isSyntheticDomain(fromAddress.split("@")[1] ?? "")) {
    return { enabled: false, reason: "non_synthetic_sender" };
  }
  return { enabled: true, config: { provider, baseUrl, apiKey, fromAddress, recipientDomain } };
}

/**
 * Harness-only retrieval gate. Retrieval is available solely when capture is
 * enabled AND the caller is an in-process test harness that passes the
 * explicit opt-in. No HTTP route may ever satisfy this.
 */
export function canRetrieve(
  resolution: CaptureResolution,
  opts: { harness?: boolean } | undefined,
): boolean {
  return resolution.enabled === true && opts?.harness === true;
}

/* ----------------------------- Message shaping ---------------------------- */

export interface CaptureMessage {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
}

/** Deterministic key so a repeated issuance never doubles a delivery. */
export async function idempotencyKey(scope: string, address: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${scope}|${address}|${salt}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * Builds the message body. The code appears only inside the body handed to
 * the capture transport; it is never returned in any other shape and never
 * logged.
 */
export function buildOtpMessage(input: {
  to: string;
  code: string;
  idempotencyKey: string;
}): CaptureMessage {
  return {
    to: input.to,
    subject: "Your test verification code",
    body: `Test-only verification code: ${input.code}. It expires in 10 minutes.`,
    idempotencyKey: input.idempotencyKey,
  };
}

/** Extracts a six-digit code from a captured body; null when absent. */
export function extractCode(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const match = /(?<![0-9])([0-9]{6})(?![0-9])/.exec(body);
  return match ? (match[1] ?? null) : null;
}

/* -------------------------------- Logging -------------------------------- */

export interface CaptureLogRecord {
  event: "capture_deliver" | "capture_retrieve" | "capture_purge";
  outcome: "ok" | "skipped" | "failed";
  reason?: CaptureFailureReason | CaptureDisabledReason;
}

/**
 * Aggregate-only log record. Recipients, codes, credentials, URLs, and raw
 * provider text are structurally impossible to include.
 */
export function captureLog(
  event: CaptureLogRecord["event"],
  outcome: CaptureLogRecord["outcome"],
  reason?: CaptureFailureReason | CaptureDisabledReason,
): CaptureLogRecord {
  return reason ? { event, outcome, reason } : { event, outcome };
}
