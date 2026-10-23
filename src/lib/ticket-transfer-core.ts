/**
 * Gate 99.1 — pure, dependency-free logic for the private staging ticket
 * transfer lifecycle (initiate → recipient OTP → accept).
 *
 * Nothing here logs, persists, or returns raw backend errors, row contents,
 * identifiers, e-mail addresses, codes, or secrets. Every failure collapses to
 * one of the existing generic OTP error codes.
 */
import { isSixDigitCode, isUuid, type OtpErrorCode } from "@/lib/transfer-otp-core";

/** Whole pending transfer lifetime. The recipient OTP can never outlive it. */
export const TRANSFER_TTL_MS = 15 * 60 * 1000;
/** Maximum recipient OTP issuances per pending transfer. */
export const TRANSFER_OTP_MAX_ISSUES = 3;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,189}\.[a-z]{2,24}$/i;

/* --------------------------------- inputs --------------------------------- */

export interface InitiateInput {
  ticketId: string;
  /** Normalised (trimmed, lower-cased). Never logged or echoed. */
  recipientEmail: string;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function parseInitiateInput(body: unknown): InitiateInput | OtpErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const ticketId = raw['ticketId'];
  const recipientEmail = normalizeEmail(raw['recipientEmail']);
  if (!isUuid(ticketId) || !recipientEmail) return "invalid_request";
  return { ticketId, recipientEmail };
}

export interface RecipientOtpInput {
  ticketId: string;
}

export function parseRecipientOtpInput(body: unknown): RecipientOtpInput | OtpErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const ticketId = (body as Record<string, unknown>)['ticketId'];
  if (!isUuid(ticketId)) return "invalid_request";
  return { ticketId };
}

export interface AcceptInput {
  ticketId: string;
  code: string;
}

export function parseAcceptInput(body: unknown): AcceptInput | OtpErrorCode {
  if (!body || typeof body !== "object") return "invalid_request";
  const raw = body as Record<string, unknown>;
  const ticketId = raw['ticketId'];
  const code = raw['code'];
  if (!isUuid(ticketId) || !isSixDigitCode(code)) return "invalid_request";
  return { ticketId, code };
}

/* ------------------------------ OTP binding ------------------------------- */

/**
 * The digest scope binds a recipient OTP to exactly one pending transfer row
 * AND one recipient account. A code minted for another transfer, another
 * recipient, or the ticket's current owner can never verify against it.
 */
export function recipientOtpScope(transferId: string, recipientUserId: string): string {
  return `transfer:${transferId}:recipient:${recipientUserId}`;
}

export function transferExpiry(now: number): string {
  return new Date(now + TRANSFER_TTL_MS).toISOString();
}

/* ------------------------------ row state --------------------------------- */

export interface PendingTransferState {
  status: string;
  expiresAt: string;
  recipientUserId: string;
  otpIssuedCount: number;
}

/** Recipient may request/use a code only for their own live pending transfer. */
export function pendingTransferUsability(
  row: PendingTransferState | null | undefined,
  recipientUserId: string,
  now: number,
): OtpErrorCode | null {
  if (!row) return "not_eligible";
  if (!recipientUserId || row.recipientUserId !== recipientUserId) return "not_eligible";
  if (row.status !== "pending") return "not_eligible";
  const t = Date.parse(row.expiresAt);
  if (!Number.isFinite(t) || t <= now) return "not_eligible";
  return null;
}

export function otpIssuanceAllowed(issuedCount: number): boolean {
  return Number.isInteger(issuedCount) && issuedCount >= 0 && issuedCount < TRANSFER_OTP_MAX_ISSUES;
}

/* ------------------------------ RPC outcomes ------------------------------ */

export const INITIATE_OUTCOMES = [
  "initiated",
  "invalid_input",
  "invalid_recipient",
  "invalid_expiry",
  "unknown_ticket",
  "not_owner",
  "ticket_not_transferable",
  "already_transferred",
  "transfer_pending",
  "unknown_recipient",
] as const;
export type InitiateOutcome = (typeof INITIATE_OUTCOMES)[number];

export const ACCEPT_OUTCOMES = [
  "accepted",
  "invalid_input",
  "unknown_transfer",
  "already_accepted",
  "not_acceptable",
  "expired",
  "not_recipient",
  "token_mismatch",
  "ticket_not_transferable",
  "already_transferred",
] as const;
export type AcceptOutcome = (typeof ACCEPT_OUTCOMES)[number];

export function readOutcome(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const outcome = (row as Record<string, unknown>)['outcome'];
  return typeof outcome === "string" ? outcome : null;
}

/** Sender-side outcome → generic error code (null means success). */
export function initiateOutcomeToError(outcome: string | null): OtpErrorCode | null {
  switch (outcome) {
    case "initiated":
      return null;
    case "not_owner":
      return "forbidden";
    case "invalid_input":
    case "invalid_expiry":
      return "invalid_request";
    case "invalid_recipient":
    case "unknown_ticket":
    case "ticket_not_transferable":
    case "already_transferred":
    case "transfer_pending":
    case "unknown_recipient":
      return "not_eligible";
    default:
      return "server_error";
  }
}

/**
 * Recipient-side outcome → generic error code. Every denial collapses to the
 * same `invalid_code` so a caller cannot distinguish wrong code, expiry,
 * replay, racing loss, wrong recipient, or ticket-state problems.
 */
export function acceptOutcomeToError(outcome: string | null): OtpErrorCode | null {
  if (outcome === "accepted") return null;
  if (outcome === null) return "server_error";
  return (ACCEPT_OUTCOMES as readonly string[]).includes(outcome) ? "invalid_code" : "server_error";
}
