/**
 * Gate 104 — pure, dependency-free logic and copy for the private staging Box
 * Office check-in surface.
 *
 * This module owns no state, performs no I/O, and never touches storage, the
 * URL, analytics, or the console. It deliberately re-uses the Gate 103
 * boundary rather than inventing a second module system: the optional surface
 * is switched on by the same kind of explicit server-side environment flag
 * that already gates the transfer and check-in sandboxes, and it is OFF unless
 * that flag literally reads `true`.
 */

import { normalizePassCode } from "@/lib/checkin-core";

/* ------------------------------ module gate ------------------------------- */

/**
 * The optional Box Office surface. Absent, empty, malformed, or any value
 * other than `true` means the module is disabled, so a new remix starts with
 * the surface off and a legacy project that never sets the flag is unaffected.
 */
export function isBoxOfficeModuleEnabled(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/** The per-event roles allowed to work the door. Identical to Gate 103's routine. */
export const BOX_OFFICE_ROLES = ["box_office", "organizer", "admin"] as const;
export type BoxOfficeRole = (typeof BOX_OFFICE_ROLES)[number];

/** Pilot surface is useful only to staff assigned to one eligible event. */
export function hasOneDoorEvent(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const events = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") return false;
    const eventId = (row as Record<string, unknown>)["event_id"];
    if (typeof eventId !== "string" || eventId.length === 0) return false;
    events.add(eventId);
    if (events.size > 1) return false;
  }
  return events.size === 1;
}

/* --------------------------------- input ---------------------------------- */

export type PassEntryError = "empty" | "malformed";

/**
 * Client-only submission lease. React state can lag a second tap or camera
 * callback in the same tick; this synchronous guard permits one request and
 * suppresses its late result after an auth/session change. It never stores a
 * pass code or changes the server's admission decision.
 */
export function createDoorSubmissionGate() {
  let generation = 0;
  let nextId = 0;
  let active: { id: number; generation: number } | null = null;
  return {
    begin() {
      if (active) return null;
      active = { id: ++nextId, generation };
      return active;
    },
    isActive() {
      return active !== null;
    },
    isCurrent(lease: { id: number; generation: number }) {
      return active === lease && lease.generation === generation;
    },
    invalidate() {
      generation += 1;
    },
    expire(lease: { id: number; generation: number }) {
      if (active !== lease) return;
      generation += 1;
      active = null;
    },
    finish(lease: { id: number; generation: number }) {
      if (active === lease) active = null;
    },
  };
}

/**
 * The operator types, pastes, or scans an opaque pass code. This pure parser
 * has no camera access, clipboard watching, or ticket/order identifier input.
 */
export function parsePassEntry(raw: string):
  | { ok: true; passCode: string }
  | {
      ok: false;
      code: PassEntryError;
    } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, code: "empty" };
  const passCode = normalizePassCode(trimmed);
  if (!passCode) return { ok: false, code: "malformed" };
  return { ok: true, passCode };
}

/* --------------------------------- result --------------------------------- */

export type BoxOfficeResult =
  | { kind: "accepted" }
  | { kind: "already"; checkedInAt: string }
  | { kind: "denied" }
  | { kind: "uncertain" }
  | { kind: "unavailable" };

/** A dropped response after POST begins cannot prove whether admission committed. */
export function checkInTransportFailure(postStarted: boolean): BoxOfficeResult {
  return { kind: postStarted ? "uncertain" : "unavailable" };
}

/** Bounds a hung local session read or check-in response, not server execution. */
export const DOOR_SUBMISSION_TIMEOUT_MS = 15_000;

const CHECKED_IN_AT_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Maps a raw endpoint response to staff-safe outcomes. Explicit 400/401/403
 * denials carry no pass details; every other unexpected response remains
 * uncertain because it cannot prove that admission did not commit.
 */
export function readCheckInResponse(status: number, body: unknown): BoxOfficeResult {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (status === 200) {
    if (record?.["ok"] === true && record["outcome"] === "accepted") return { kind: "accepted" };
    if (record?.["ok"] === true && record["outcome"] === "already_checked_in") {
      const at = record["checkedInAt"];
      if (typeof at === "string" && formatCheckedInAt(at) !== null)
        return { kind: "already", checkedInAt: at };
    }
    // A successful POST with an unrecognized body may still have committed.
    return { kind: "uncertain" };
  }
  if (status === 400 || status === 401 || status === 403) return { kind: "denied" };
  return { kind: "uncertain" };
}

/** Renders only a bounded ISO timestamp; never echoes an arbitrary server value. */
export function formatCheckedInAt(value: string): string | null {
  if (value.length > 40) return null;
  const match = CHECKED_IN_AT_RE.exec(value);
  if (!match) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const zone = match[2]!;
  const offsetMinutes =
    zone === "Z"
      ? 0
      : (zone[0] === "+" ? 1 : -1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  const local = new Date(parsed.getTime() + offsetMinutes * 60_000).toISOString();
  if (!local.startsWith(match[1]!)) return null; // reject normalized invalid dates/times
  return parsed.toUTCString();
}

/* ---------------------------------- copy ---------------------------------- */

export const BOX_OFFICE_TITLE = "Analog Tickets — Box Office Check-In";
export const BOX_OFFICE_DESCRIPTION =
  "Private staging door surface. An authorized event staff member enters an opaque pass code and sees only whether it was accepted or already used.";

export const BOX_OFFICE_FIELD_LABEL = "Pass code";
export const BOX_OFFICE_SUBMIT_LABEL = "Check in";
export const BOX_OFFICE_WORKING_LABEL = "Checking…";

export const BOX_OFFICE_MODULE_OFF_MESSAGE = "Not available.";
export const BOX_OFFICE_NOT_PERMITTED_MESSAGE = "Not permitted.";
export const BOX_OFFICE_LOADING_MESSAGE = "Checking permission…";

export const PASS_ENTRY_MESSAGE: Record<PassEntryError, string> = {
  empty: "Enter a pass code.",
  malformed: "That is not a valid pass code.",
};

export const RESULT_MESSAGE = {
  accepted: "Accepted.",
  already: "Already checked in",
  denied: "Not valid.",
  uncertain:
    "Check-in outcome uncertain. Do not admit on this result; rescan when the connection is available.",
  unavailable: "Unable to check this pass right now. Do not admit on this result.",
} as const;

export function resultMessage(result: BoxOfficeResult): string {
  if (result.kind !== "already") return RESULT_MESSAGE[result.kind];
  const at = formatCheckedInAt(result.checkedInAt);
  return at === null ? RESULT_MESSAGE.unavailable : `${RESULT_MESSAGE.already} at ${at}.`;
}
