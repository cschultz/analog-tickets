/**
 * Gate 103 — server-only helper for the private staging attendance command.
 * Loaded via dynamic import inside the route handler only.
 *
 * `public.check_in_ticket(text, uuid)` is SECURITY INVOKER, empty search_path,
 * fully qualified, revoked from PUBLIC/anon/authenticated and granted only to
 * `service_role`; it is reachable solely through the service-role client passed
 * in here. It authorizes the staff member through per-event
 * `event_memberships` (box_office/organizer/admin) inside the same transaction
 * that locks the ticket, sets `checked_in_at` exactly once, and appends the
 * immutable audit row.
 *
 * Nothing here logs or returns pass codes, digests, identifiers, holder
 * details, or raw backend errors.
 */
import {
  hashPassCode,
  mapCheckInOutcome,
  readCheckInRow,
  type CheckInErrorCode,
  type CheckInSuccess,
} from "@/lib/checkin-core";

interface LooseResult {
  data: unknown;
  error: unknown;
}
export interface LooseCheckInClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<LooseResult>;
}

/**
 * Hashes the scanned code server-side and runs the atomic routine.
 * The staff id MUST come from an already-validated bearer token.
 */
export async function checkInScannedPass(
  admin: LooseCheckInClient,
  args: { passCode: string; staffUserId: string },
): Promise<CheckInSuccess | CheckInErrorCode> {
  const digest = await hashPassCode(args.passCode);
  const { data, error } = await admin.rpc("check_in_ticket", {
    p_code_digest: digest,
    p_staff_user_id: args.staffUserId,
  });
  if (error) return "server_error";
  return mapCheckInOutcome(readCheckInRow(data));
}
