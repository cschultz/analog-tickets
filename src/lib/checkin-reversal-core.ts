/**
 * Gate 105 — pure, dependency-free logic for the private staging check-in
 * reversal command.
 *
 * Nothing here logs, persists, or returns raw backend errors, row contents,
 * identifiers, holder details, or secrets. Every denial collapses to one
 * generic code so a caller cannot distinguish unknown from cross-event from
 * ineligible from unauthorized.
 */
import {
  CHECKIN_ERROR_MESSAGE,
  CHECKIN_ERROR_STATUS,
  normalizePassCode,
  type CheckInErrorCode,
} from "@/lib/checkin-core";

export const MAX_REVERSAL_REASON_LENGTH = 500;

/** A staff-entered reason is mandatory and never optional. */
export function normalizeReversalReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim().replace(/\s+/g, " ");
  if (reason.length === 0 || reason.length > MAX_REVERSAL_REASON_LENGTH) return null;
  return reason;
}

export interface ReversalInput {
  /** Never logged, never echoed, never persisted in plaintext. */
  passCode: string;
  reason: string;
}

/**
 * The body carries exactly two fields. Event, ticket, staff identity and role
 * are NEVER accepted from the caller — they are derived from the pass digest
 * and from the validated bearer token.
 */
export function parseReversalInput(body: unknown): ReversalInput | CheckInErrorCode {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_request";
  const raw = body as Record<string, unknown>;
  const passCode = normalizePassCode(raw['passCode']);
  if (!passCode) return "invalid_request";
  const reason = normalizeReversalReason(raw['reason']);
  if (!reason) return "invalid_request";
  return { passCode, reason };
}

/* ------------------------------ RPC outcomes ------------------------------ */

export const REVERSAL_OUTCOMES = [
  "reversed",
  "invalid_input",
  "invalid_pass",
  "not_authorized",
  "not_reversible",
] as const;
export type CheckInReversalOutcome = (typeof REVERSAL_OUTCOMES)[number];

export function readReversalRow(
  data: unknown,
): { outcome: string; reversedAt: string | null } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const outcome = record['outcome'];
  if (typeof outcome !== "string") return null;
  const at = record['reversed_at'];
  return { outcome, reversedAt: typeof at === "string" ? at : null };
}

export interface ReversalSuccess {
  outcome: "reversed";
  reversedAt: string;
}

/**
 * Authorized-staff-safe result. `reversed` is the only outcome ever disclosed;
 * every other outcome — unknown pass, wrong event, box_office, nonmember, not
 * checked in, already reversed — becomes the same generic `forbidden`.
 */
export function mapReversalOutcome(
  row: { outcome: string; reversedAt: string | null } | null,
): ReversalSuccess | CheckInErrorCode {
  if (!row) return "server_error";
  switch (row.outcome) {
    case "reversed":
      return row.reversedAt ? { outcome: "reversed", reversedAt: row.reversedAt } : "server_error";
    case "invalid_input":
    case "invalid_pass":
    case "not_authorized":
    case "not_reversible":
      return "forbidden";
    default:
      return "server_error";
  }
}

/* ------------------------------- responses -------------------------------- */

export function reversalErrorResponse(
  code: CheckInErrorCode,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ error: code, message: CHECKIN_ERROR_MESSAGE[code] }),
    {
      status: CHECKIN_ERROR_STATUS[code],
      headers: { "content-type": "application/json", ...headers },
    },
  );
}

export function reversalSuccessResponse(
  result: ReversalSuccess,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ ok: true, outcome: "reversed", reversedAt: result.reversedAt }),
    { status: 200, headers: { "content-type": "application/json", ...headers } },
  );
}

/** Any thrown/unknown backend failure collapses to a generic code. */
export function normalizeReversalFailure(_error: unknown): CheckInErrorCode {
  return "server_error";
}
