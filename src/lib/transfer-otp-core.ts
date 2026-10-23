/**
 * Pure, dependency-free logic shared by the private staging transfer-OTP
 * endpoints (`/api/public/send-transfer-otp`, `/api/public/verify-transfer-otp`).
 *
 * Nothing here logs, persists, or returns raw backend errors, row contents,
 * identifiers, or secrets. Every failure collapses to a generic safe code.
 */

export type OtpErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_eligible"
  | "rate_limited"
  | "invalid_code"
  | "configuration"
  | "server_error";

export const OTP_ERROR_STATUS: Record<OtpErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid_request: 400,
  not_eligible: 403,
  rate_limited: 429,
  invalid_code: 400,
  configuration: 500,
  server_error: 500,
};

/** Generic, non-revealing messages. Never include backend text. */
export const OTP_ERROR_MESSAGE: Record<OtpErrorCode, string> = {
  unauthorized: "Authentication required.",
  forbidden: "Not permitted.",
  invalid_request: "Invalid request.",
  not_eligible: "Not permitted.",
  rate_limited: "Too many requests.",
  invalid_code: "Invalid or expired code.",
  configuration: "Service unavailable.",
  server_error: "Service unavailable.",
};

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_HOURLY_LIMIT = 3;
export const OTP_RATE_WINDOW_MS = 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isSixDigitCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}

export interface SendInput {
  ticketId: string;
}

export function parseSendInput(body: unknown): SendInput | OtpErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const ticketId = raw['ticketId'];
  if (!isUuid(ticketId)) return "invalid_request";
  return { ticketId };
}

export interface VerifyInput {
  ticketId: string;
  code: string;
}

export function parseVerifyInput(body: unknown): VerifyInput | OtpErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const ticketId = raw['ticketId'];
  const code = raw['code'];
  if (!isUuid(ticketId)) return "invalid_request";
  if (!isSixDigitCode(code)) return "invalid_request";
  return { ticketId, code };
}

/** Extracts a bearer token from an Authorization header value. */
export function parseBearer(header: string | null | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(header.trim());
  return match ? (match[1] ?? null) : null;
}

/** Sandbox mode must be explicitly enabled; anything else fails closed. */
export function isSandboxEnabled(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/* --------------------------------- CORS ---------------------------------- */

export interface CorsDecision {
  allowed: boolean;
  headers: Record<string, string>;
}

/**
 * Strict CORS: only the exact configured staging origin is allowed.
 * Never `*`, never a reflected arbitrary origin. Same-origin requests
 * (no Origin header) are allowed and receive no CORS headers.
 */
export function resolveCors(
  requestOrigin: string | null | undefined,
  allowedOrigin: string | null | undefined,
): CorsDecision {
  const base = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (!requestOrigin) return { allowed: true, headers: {} };
  const configured = typeof allowedOrigin === "string" ? allowedOrigin.trim() : "";
  if (!configured || configured === "*") return { allowed: false, headers: { Vary: "Origin" } };
  if (requestOrigin !== configured) return { allowed: false, headers: { Vary: "Origin" } };
  return {
    allowed: true,
    headers: { ...base, "Access-Control-Allow-Origin": configured },
  };
}

/* ------------------------------ Code + digest ----------------------------- */

/** Cryptographically secure six-digit code (000000–999999, uniform). */
export function generateSixDigitCode(
  randomBytes: (n: number) => Uint8Array = defaultRandomBytes,
): string {
  // Rejection sampling over 24 random bits to keep the distribution uniform.
  const limit = 16_777_216 - (16_777_216 % 1_000_000);
  for (let i = 0; i < 64; i += 1) {
    const b = randomBytes(3);
    const n = ((b[0] ?? 0) << 16) | ((b[1] ?? 0) << 8) | (b[2] ?? 0);
    if (n < limit) return String(n % 1_000_000).padStart(6, "0");
  }
  const fallback = randomBytes(3);
  const n = ((fallback[0] ?? 0) << 16) | ((fallback[1] ?? 0) << 8) | (fallback[2] ?? 0);
  return String(n % 1_000_000).padStart(6, "0");
}

function defaultRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function randomSaltHex(
  randomBytes: (n: number) => Uint8Array = defaultRandomBytes,
): string {
  return toHex(randomBytes(16));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Salted digest stored in the database: `v1:<salt>:<sha256(salt|ticketId|code)>`. */
export async function hashOtp(salt: string, ticketId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}|${ticketId}|${code}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return `v1:${salt}:${toHex(new Uint8Array(digest))}`;
}

/** Constant-time-ish comparison of stored digest against a candidate code. */
export async function verifyOtpHash(
  storedHash: string,
  ticketId: string,
  code: string,
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const candidate = await hashOtp(parts[1] as string, ticketId, code);
  return timingSafeEqual(candidate, storedHash);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------ State checks ------------------------------ */

export interface TicketState {
  ownerUserId: string;
  status: string;
  checkedInAt: string | null;
}

/** Owner-only, issued, not checked in. No roles, no admin bypass. */
export function ticketEligibility(
  ticket: TicketState | null | undefined,
  userId: string,
): OtpErrorCode | null {
  if (!ticket) return "not_eligible";
  if (!userId || ticket.ownerUserId !== userId) return "forbidden";
  if (ticket.status !== "issued") return "not_eligible";
  if (ticket.checkedInAt) return "not_eligible";
  return null;
}

export function exceedsHourlyLimit(
  createdAtList: readonly string[],
  now: number,
  limit: number = OTP_HOURLY_LIMIT,
): boolean {
  const recent = createdAtList.filter((ts) => {
    const t = Date.parse(ts);
    return Number.isFinite(t) && now - t < OTP_RATE_WINDOW_MS;
  });
  return recent.length >= limit;
}

export function isExpired(expiresAt: string, now: number): boolean {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return true;
  return t <= now;
}

export function expiryTimestamp(now: number): string {
  return new Date(now + OTP_TTL_MS).toISOString();
}

export interface OtpRecordState {
  expiresAt: string;
  redeemedAt: string | null;
}

/** Redeemable only when unused and unexpired. Replays fail closed. */
export function recordUsability(record: OtpRecordState, now: number): OtpErrorCode | null {
  if (record.redeemedAt) return "invalid_code";
  if (isExpired(record.expiresAt, now)) return "invalid_code";
  return null;
}

/* ------------------------------- Responses -------------------------------- */

export function errorResponse(
  code: OtpErrorCode,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: code, message: OTP_ERROR_MESSAGE[code] }), {
    status: OTP_ERROR_STATUS[code],
    headers: { "content-type": "application/json", ...headers },
  });
}

export function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Any thrown/unknown backend failure collapses to a generic code. */
export function normalizeFailure(_error: unknown): OtpErrorCode {
  return "server_error";
}
