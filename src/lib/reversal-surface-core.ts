/**
 * Gate 107 — pure, dependency-free logic and copy for the private staging
 * check-in reversal surface.
 *
 * This module owns no state, performs no I/O, and never touches storage, the
 * URL, analytics, or the console. It reuses the Gate 104 optional Box Office
 * boundary (the same server-side `BOX_OFFICE_MODULE` flag) rather than adding
 * a second module system, and narrows the permitted roles to the two the
 * approved reversal policy allows.
 */

import { normalizePassCode } from "@/lib/checkin-core";
import { MAX_REVERSAL_REASON_LENGTH, normalizeReversalReason } from "@/lib/checkin-reversal-core";

export { MAX_REVERSAL_REASON_LENGTH };

/** Reversal is organizer/admin only — box_office must never see useful content. */
export const REVERSAL_ROLES = ["organizer", "admin"] as const;
export type ReversalRole = (typeof REVERSAL_ROLES)[number];

/* --------------------------------- input ---------------------------------- */

export type ReversalEntryError = "code_empty" | "code_malformed" | "reason_empty" | "reason_long";

export interface ReversalEntry {
  passCode: string;
  reason: string;
}

/**
 * Manual entry only: the operator types or pastes the opaque pass code and a
 * mandatory reason. No camera, no scanner hardware, no ticket or order id.
 */
export function parseReversalEntry(
  rawCode: string,
  rawReason: string,
): { ok: true; entry: ReversalEntry } | { ok: false; code: ReversalEntryError } {
  const trimmedCode = rawCode.trim();
  if (trimmedCode.length === 0) return { ok: false, code: "code_empty" };
  const passCode = normalizePassCode(trimmedCode);
  if (!passCode) return { ok: false, code: "code_malformed" };

  if (rawReason.trim().length === 0) return { ok: false, code: "reason_empty" };
  const reason = normalizeReversalReason(rawReason);
  if (!reason) return { ok: false, code: "reason_long" };

  return { ok: true, entry: { passCode, reason } };
}

/* --------------------------------- result --------------------------------- */

export type ReversalSurfaceResult =
  | { kind: "reversed" }
  | { kind: "denied" }
  | { kind: "unavailable" };

/**
 * Maps a raw endpoint response to the only outcomes staff may see. Anything
 * else collapses to a generic denial carrying no ticket, attendee, order,
 * pass, audit, backend, token, or credential data. No timestamp, audit id, or
 * identifier is ever surfaced.
 */
export function readReversalResponse(status: number, body: unknown): ReversalSurfaceResult {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (status === 200 && record && record['ok'] === true && record['outcome'] === "reversed") {
    return { kind: "reversed" };
  }
  if (status === 400 || status === 401 || status === 403) return { kind: "denied" };
  return { kind: "unavailable" };
}

/* ---------------------------------- copy ---------------------------------- */

export const REVERSAL_TITLE = "Analog Tickets — Reverse Check-In";
export const REVERSAL_DESCRIPTION =
  "Private staging surface. An authorized organizer or admin enters an opaque pass code and a reason, and sees only whether the check-in was reversed.";

export const REVERSAL_CODE_LABEL = "Pass code";
export const REVERSAL_REASON_LABEL = "Reason";
export const REVERSAL_SUBMIT_LABEL = "Reverse check-in";
export const REVERSAL_WORKING_LABEL = "Reversing…";

export const REVERSAL_MODULE_OFF_MESSAGE = "Not available.";
export const REVERSAL_NOT_PERMITTED_MESSAGE = "Not permitted.";
export const REVERSAL_LOADING_MESSAGE = "Checking permission…";

export const REVERSAL_ENTRY_MESSAGE: Record<ReversalEntryError, string> = {
  code_empty: "Enter a pass code.",
  code_malformed: "That is not a valid pass code.",
  reason_empty: "Enter a reason.",
  reason_long: `Use at most ${MAX_REVERSAL_REASON_LENGTH} characters.`,
};

export const REVERSAL_RESULT_MESSAGE = {
  reversed: "Reversed.",
  denied: "Not permitted.",
  unavailable: "Unable to reverse this pass right now.",
} as const;

export function reversalResultMessage(result: ReversalSurfaceResult): string {
  return REVERSAL_RESULT_MESSAGE[result.kind];
}
