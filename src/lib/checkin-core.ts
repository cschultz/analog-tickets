/**
 * Gate 103 — pure, dependency-free logic for the private staging attendance
 * (check-in) command.
 *
 * Nothing here logs, persists, or returns raw backend errors, row contents,
 * identifiers, holder details, or secrets. Every denial collapses to one
 * generic code so a caller cannot distinguish unknown from cross-event from
 * ineligible from unauthorized.
 */

export type CheckInErrorCode =
  "unauthorized" | "forbidden" | "invalid_request" | "configuration" | "server_error";

export const CHECKIN_ERROR_STATUS: Record<CheckInErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid_request: 400,
  configuration: 500,
  server_error: 500,
};

/** Generic, non-revealing messages. Never include backend text. */
export const CHECKIN_ERROR_MESSAGE: Record<CheckInErrorCode, string> = {
  unauthorized: "Authentication required.",
  forbidden: "Not permitted.",
  invalid_request: "Invalid request.",
  configuration: "Service unavailable.",
  server_error: "Service unavailable.",
};

/** Opaque scan code: 128 bits of randomness, rendered lower-case hex. */
export const PASS_CODE_RE = /^[0-9a-f]{32}$/;

export function normalizePassCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return PASS_CODE_RE.test(code) ? code : null;
}

export interface CheckInInput {
  /** Never logged, never echoed, never persisted in plaintext. */
  passCode: string;
}

/** The only accepted JSON body is a single 32-character opaque pass code. */
export const CHECKIN_MAX_BODY_BYTES = 256;

/** Read no more than the small command needs, even for chunked requests. */
export async function readCheckInBody(request: Request): Promise<unknown | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const statedLength = request.headers.get("content-length");
  if (statedLength !== null && Number(statedLength) > CHECKIN_MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CHECKIN_MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

/**
 * The body carries exactly one field. Event, ticket, staff identity and role
 * are NEVER accepted from the caller — they are derived from the pass digest
 * and from the validated bearer token.
 */
export function parseCheckInInput(body: unknown): CheckInInput | CheckInErrorCode {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_request";
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).length !== 1) return "invalid_request";
  const passCode = normalizePassCode(raw["passCode"]);
  if (!passCode) return "invalid_request";
  return { passCode };
}

/** Sandbox mode must be explicitly enabled; anything else fails closed. */
export function isCheckInEnabled(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/* ------------------------------- pass digest ------------------------------ */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cryptographically secure opaque pass code (128 bits). */
export function generatePassCode(
  randomBytes: (n: number) => Uint8Array = (n) => {
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
  },
): string {
  return toHex(randomBytes(16));
}

/**
 * Deterministic one-way digest stored in the database: `v1:<sha256(code)>`.
 * Deterministic because a scan must be looked up by digest; the code itself is
 * unguessable, so no salt is required and no plaintext is ever stored.
 */
export async function hashPassCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(`ticket-pass:v1:${code}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return `v1:${toHex(new Uint8Array(digest))}`;
}

/* ------------------------------ RPC outcomes ------------------------------ */

export const CHECKIN_OUTCOMES = [
  "accepted",
  "already_checked_in",
  "invalid_input",
  "invalid_pass",
  "not_authorized",
  "not_checkinable",
] as const;
export type CheckInOutcome = (typeof CHECKIN_OUTCOMES)[number];

export function readCheckInRow(
  data: unknown,
): { outcome: string; checkedInAt: string | null } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const outcome = record["outcome"];
  if (typeof outcome !== "string") return null;
  const at = record["attended_at"];
  return { outcome, checkedInAt: typeof at === "string" ? at : null };
}

export type CheckInSuccess =
  { outcome: "accepted" } | { outcome: "already_checked_in"; checkedInAt: string };

/**
 * Authorized-staff-safe result. `accepted` and `already_checked_in` are the
 * only outcomes ever disclosed; every other outcome — unknown pass, wrong
 * event, non-issued, voided, refunded, nonmember, wrong role — becomes the
 * same generic `forbidden`.
 */
export function mapCheckInOutcome(
  row: { outcome: string; checkedInAt: string | null } | null,
): CheckInSuccess | CheckInErrorCode {
  if (!row) return "server_error";
  switch (row.outcome) {
    case "accepted":
      return { outcome: "accepted" };
    case "already_checked_in":
      return row.checkedInAt
        ? { outcome: "already_checked_in", checkedInAt: row.checkedInAt }
        : "server_error";
    case "invalid_input":
    case "invalid_pass":
    case "not_authorized":
    case "not_checkinable":
      return "forbidden";
    default:
      return "server_error";
  }
}

/* ------------------------------- responses -------------------------------- */

export function checkInErrorResponse(
  code: CheckInErrorCode,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: code, message: CHECKIN_ERROR_MESSAGE[code] }), {
    status: CHECKIN_ERROR_STATUS[code],
    headers: { "content-type": "application/json", ...headers },
  });
}

export function checkInSuccessResponse(
  result: CheckInSuccess,
  headers: Record<string, string> = {},
): Response {
  const body =
    result.outcome === "accepted"
      ? { ok: true, outcome: "accepted" }
      : { ok: true, outcome: "already_checked_in", checkedInAt: result.checkedInAt };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Any thrown/unknown backend failure collapses to a generic code. */
export function normalizeCheckInFailure(_error: unknown): CheckInErrorCode {
  return "server_error";
}
