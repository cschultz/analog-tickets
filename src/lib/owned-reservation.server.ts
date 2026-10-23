/** Server-only; one atomic RPC, no provider calls or automatic write retries. */
import { isUuid, type CheckoutErrorCode } from "./checkout-core";
import {
  OWNED_RESERVATION_MAX_REMAINING_MS,
  type OwnedReservationInput,
} from "./owned-reservation-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface OwnedReservationClient {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}
export type OwnedReservationResult =
  { ok: true; reservationId: string; expiresAt: string } | { ok: false; code: CheckoutErrorCode };
export async function prepareOwnedReservation(
  client: OwnedReservationClient | SupabaseClient<Database>,
  ownerUserId: string,
  input: OwnedReservationInput,
  now: () => number = Date.now,
): Promise<OwnedReservationResult> {
  if (!isUuid(ownerUserId)) return { ok: false, code: "unauthorized" };
  try {
    // Proposed RPC is deliberately not claimed as installed in generated types.
    const { data, error } = await (client as unknown as OwnedReservationClient).rpc(
      "prepare_owned_ticket_reservation",
      {
        p_owner_user_id: ownerUserId,
        p_ticket_type_id: input.ticketTypeId,
        p_quantity: input.quantity,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (
      error ||
      !Array.isArray(data) ||
      data.length !== 1 ||
      !data[0] ||
      typeof data[0] !== "object"
    )
      return { ok: false, code: "server_error" };
    const row = data[0] as Record<string, unknown>;
    if (row["outcome"] === "invalid_request") return { ok: false, code: "invalid_request" };
    if (
      [
        "not_available",
        "over_capacity",
        "inactive",
        "unknown_ticket_type",
        "unbounded_capacity",
      ].includes(String(row["outcome"]))
    )
      return { ok: false, code: "not_available" };
    if (
      row["outcome"] !== "ready" ||
      !isUuid(row["reservation_id"]) ||
      typeof row["expires_at"] !== "string"
    )
      return { ok: false, code: "server_error" };
    const remaining = Date.parse(row["expires_at"]) - now();
    if (
      !Number.isFinite(remaining) ||
      remaining <= 0 ||
      remaining > OWNED_RESERVATION_MAX_REMAINING_MS
    )
      return { ok: false, code: "server_error" };
    return { ok: true, reservationId: row["reservation_id"], expiresAt: row["expires_at"] };
  } catch {
    return { ok: false, code: "server_error" };
  }
}
