/**
 * Gate 140 — pure view-model helpers for the private staging ticket-type
 * refundability admin screen.
 *
 * Presentation only. Nothing here writes a row, reads a secret, contacts a
 * payment provider, or touches an issued ticket. The single write path is the
 * Gate 85 server contract `setTicketTypeRefundPolicy`, which re-derives the
 * caller's `event_memberships` role server-side and stays authoritative.
 *
 * Policy restated for the operator, unchanged since Gate 85: the setting on a
 * ticket type applies to FUTURE issuance only. Tickets already issued keep the
 * immutable `refundable_at_issue` snapshot taken at purchase, and no control on
 * this screen can rewrite, backfill, or reinterpret it.
 */

import { isUuid } from "@/lib/refund-policy-core";

export { isUuid };

/** Generic screen states. None of them disclose why a caller was denied. */
export const NOT_PERMITTED_MESSAGE = "Not permitted.";
export const UNAVAILABLE_MESSAGE = "This setting is unavailable right now.";
export const INVALID_SELECTION_MESSAGE = "That isn't a valid ticket type ID.";
export const LOADING_MESSAGE = "Loading…";
export const SAVING_MESSAGE = "Saving…";
export const SAVED_MESSAGE = "Saved. Future sales of this ticket type follow the new setting.";

export const CONTROL_LABEL = "Refundable";
export const LOAD_LABEL = "Load ticket type";
export const SAVE_LABEL = "Save refundability";

/** The default presentation must make nonrefundable status plain. */
export const REFUNDABLE_STATE_LABEL = {
  on: "Refundable — tickets sold from now on may be refunded",
  off: "Nonrefundable (default) — tickets sold from now on cannot be refunded",
} as const;

export function refundableStateLabel(isRefundable: unknown): string {
  return isRefundable === true ? REFUNDABLE_STATE_LABEL.on : REFUNDABLE_STATE_LABEL.off;
}

/**
 * Fail-closed presentation coercion: anything that is not literally `true`
 * shows as nonrefundable, mirroring `normalizeRefundableSetting`.
 */
export function displayedSetting(value: unknown): boolean {
  return value === true;
}

/**
 * The scope notice rendered next to the control. It exists so the screen can
 * never be read as rewriting the refundability of tickets already sold.
 */
export const SCOPE_LINES = [
  "This setting applies to tickets issued from now on.",
  "Tickets already sold keep the refundability recorded at purchase; changing this does not alter them.",
  "There is no backfill, re-stamp, or override of sold tickets on this screen.",
  "New ticket types are nonrefundable until an admin turns this on.",
] as const;

export type PolicyScreenKind = "idle" | "loading" | "loaded" | "denied" | "unavailable" | "invalid";

export type SaveResultKind = "saved" | "denied" | "unavailable";

export const SAVE_RESULT_MESSAGE: Record<SaveResultKind, string> = {
  saved: SAVED_MESSAGE,
  denied: NOT_PERMITTED_MESSAGE,
  unavailable: UNAVAILABLE_MESSAGE,
};

/** Every save failure collapses to one of two generic states. */
export function saveResultMessage(kind: SaveResultKind): string {
  return SAVE_RESULT_MESSAGE[kind] ?? UNAVAILABLE_MESSAGE;
}
