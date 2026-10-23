/**
 * Gate 99.1 — server-only helpers for the private staging ticket-transfer
 * routes. Loaded via dynamic import inside route handlers only.
 *
 * Both SQL routines (`initiate_ticket_transfer`, `accept_ticket_transfer`) are
 * SECURITY INVOKER, empty search_path, revoked from PUBLIC/anon/authenticated
 * and granted only to `service_role`; they are reachable solely through the
 * service-role client held here. Generated Supabase types stay at baseline, so
 * the new columns/RPCs are reached through narrow loose-typed views.
 *
 * Nothing here logs or returns e-mail addresses, codes, tokens, or row data.
 */
import { hashOtp, randomSaltHex, verifyOtpHash } from "@/lib/transfer-otp-core";
import {
  acceptOutcomeToError,
  initiateOutcomeToError,
  readOutcome,
  recipientOtpScope,
} from "@/lib/ticket-transfer-core";
import type { OtpErrorCode } from "@/lib/transfer-otp-core";

interface LooseResult {
  data: unknown;
  error: unknown;
}
interface LooseQuery extends PromiseLike<LooseResult> {
  select: (columns: string) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  gt: (column: string, value: unknown) => LooseQuery;
  maybeSingle: () => PromiseLike<LooseResult>;
  update: (values: Record<string, unknown>) => LooseQuery;
}
export interface LooseAdminClient {
  from: (table: string) => LooseQuery;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<LooseResult>;
  auth: {
    admin: {
      listUsers: (opts: { page: number; perPage: number }) => PromiseLike<{
        data: { users: Array<{ id: string; email?: string | null }> } | null;
        error: unknown;
      }>;
    };
  };
}

/**
 * Resolves an already-existing account by exact (normalised) e-mail through
 * the admin auth API. Bounded pagination — private staging holds a handful of
 * synthetic users. Returns null when no account matches.
 */
export async function resolveRecipientUserId(
  admin: LooseAdminClient,
  normalizedEmail: string,
  maxPages = 5,
): Promise<string | null> {
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    // A failed admin lookup is not evidence that the recipient is unknown.
    // Let the route's generic error handler return a retryable server failure.
    if (error || !data) throw new Error("recipient lookup failed");
    const hit = data.users.find(
      (u) => typeof u.email === "string" && u.email.trim().toLowerCase() === normalizedEmail,
    );
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Unretrievable placeholder digest: nobody can accept until a recipient OTP is minted. */
export async function placeholderTokenHash(): Promise<string> {
  return hashOtp(randomSaltHex(), `placeholder:${randomSaltHex()}`, randomSaltHex());
}

export async function initiateTransfer(
  admin: LooseAdminClient,
  args: { ticketId: string; senderUserId: string; recipientUserId: string; expiresAt: string },
): Promise<OtpErrorCode | null> {
  const { data, error } = await admin.rpc("initiate_ticket_transfer", {
    p_ticket_id: args.ticketId,
    p_sender_user_id: args.senderUserId,
    p_recipient_user_id: args.recipientUserId,
    p_token_hash: await placeholderTokenHash(),
    p_expires_at: args.expiresAt,
  });
  if (error) return "server_error";
  return initiateOutcomeToError(readOutcome(data));
}

export interface PendingTransferRow {
  id: string;
  status: string;
  expires_at: string;
  recipient_user_id: string;
  token_hash: string;
  otp_issued_count: number;
}

/** The (at most one) pending transfer for a ticket, regardless of recipient. */
export async function loadPendingTransfer(
  admin: LooseAdminClient,
  ticketId: string,
): Promise<{ row: PendingTransferRow | null; failed: boolean }> {
  const { data, error } = await admin
    .from("pending_ticket_transfers")
    .select("id, status, expires_at, recipient_user_id, token_hash, otp_issued_count")
    .eq("ticket_id", ticketId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return { row: null, failed: true };
  return { row: (data as PendingTransferRow | null) ?? null, failed: false };
}

/**
 * Mints a recipient-bound code and rotates the stored digest with a
 * compare-and-set on the previous digest and issue counter, so concurrent
 * requests cannot exceed the cap or leave two live codes.
 */
export async function rotateRecipientOtp(
  admin: LooseAdminClient,
  row: PendingTransferRow,
  code: string,
): Promise<"rotated" | "lost_race" | "failed"> {
  const scope = recipientOtpScope(row.id, row.recipient_user_id);
  const nextHash = await hashOtp(randomSaltHex(), scope, code);
  // Hashing is asynchronous: use the write-time clock, not the earlier route read.
  const writeTime = new Date().toISOString();
  const { data, error } = await admin
    .from("pending_ticket_transfers")
    .update({
      token_hash: nextHash,
      otp_issued_count: row.otp_issued_count + 1,
      otp_last_issued_at: writeTime,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .gt("expires_at", writeTime)
    .eq("token_hash", row.token_hash)
    .eq("otp_issued_count", row.otp_issued_count)
    .select("id");
  if (error) return "failed";
  return Array.isArray(data) && data.length === 1 ? "rotated" : "lost_race";
}

export async function verifyRecipientOtp(
  row: PendingTransferRow,
  recipientUserId: string,
  code: string,
): Promise<boolean> {
  if (row.recipient_user_id !== recipientUserId) return false;
  return verifyOtpHash(row.token_hash, recipientOtpScope(row.id, recipientUserId), code);
}

/** Atomic acceptance: the digest is passed back as a compare-and-set token. */
export async function acceptTransfer(
  admin: LooseAdminClient,
  args: { transferId: string; recipientUserId: string; tokenHash: string },
): Promise<OtpErrorCode | null> {
  const { data, error } = await admin.rpc("accept_ticket_transfer", {
    p_transfer_id: args.transferId,
    p_recipient_user_id: args.recipientUserId,
    p_token_hash: args.tokenHash,
  });
  if (error) return "server_error";
  return acceptOutcomeToError(readOutcome(data));
}
