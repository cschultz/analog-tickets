/**
 * Gate 105 — server-only helper for the private staging check-in reversal
 * command. Loaded via dynamic import inside the route handler only.
 *
 * `public.reverse_ticket_check_in(text, uuid, text)` is SECURITY INVOKER, empty
 * search_path, fully qualified, revoked from PUBLIC/anon/authenticated and
 * granted only to `service_role`; it is reachable solely through the
 * service-role client passed in here. It authorizes the staff member through
 * per-event `event_memberships` (organizer/admin only — never box_office)
 * inside the same transaction that locks the ticket, clears `checked_in_at`
 * exactly once, and appends the immutable reversal audit row.
 *
 * Nothing here logs or returns pass codes, digests, identifiers, holder
 * details, or raw backend errors.
 */
import { hashPassCode, type CheckInErrorCode } from "@/lib/checkin-core";
import {
  mapReversalOutcome,
  readReversalRow,
  type ReversalSuccess,
} from "@/lib/checkin-reversal-core";

interface LooseResult {
  data: unknown;
  error: unknown;
}
export interface LooseReversalClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<LooseResult>;
}

/**
 * Hashes the entered code server-side and runs the atomic routine.
 * The staff id MUST come from an already-validated bearer token.
 */
export async function reverseScannedCheckIn(
  admin: LooseReversalClient,
  args: { passCode: string; reason: string; staffUserId: string },
): Promise<ReversalSuccess | CheckInErrorCode> {
  const digest = await hashPassCode(args.passCode);
  const { data, error } = await admin.rpc("reverse_ticket_check_in", {
    p_code_digest: digest,
    p_staff_user_id: args.staffUserId,
    p_reason: args.reason,
  });
  if (error) return "server_error";
  return mapReversalOutcome(readReversalRow(data));
}
