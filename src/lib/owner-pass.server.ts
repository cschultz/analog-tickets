import { isUuid } from "./transfer-otp-core";
import { issueOwnerPass, type PassIssuanceClient } from "./pass-issuance.server";
import type { OwnerPassInspection } from "./owner-pass-core";

/** Private metadata only after explicit ownership check. Snapshot is advisory; RPC rechecks atomically. */
export async function inspectOwnerPass(
  ticketId: string,
  ownerId: string,
): Promise<OwnerPassInspection> {
  if (!isUuid(ticketId) || !isUuid(ownerId)) return { outcome: "not_eligible" };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await supabaseAdmin
      .from("tickets")
      .select("id,owner_user_id,status,checked_in_at,ticket_pass_codes(id)")
      .eq("id", ticketId)
      .eq("owner_user_id", ownerId)
      .eq("ticket_pass_codes.status", "active")
      .limit(2, { referencedTable: "ticket_pass_codes" })
      .abortSignal(AbortSignal.timeout(10000))
      .maybeSingle();
    if (error) return { outcome: "unavailable" };
    if (
      !ticket ||
      ticket.id !== ticketId ||
      ticket.owner_user_id !== ownerId ||
      ticket.status !== "issued" ||
      ticket.checked_in_at !== null
    )
      return { outcome: "not_eligible" };
    // One statement snapshot: do not split ownership and pass metadata into separate reads.
    const data = ticket.ticket_pass_codes;
    if (!Array.isArray(data) || data.length > 1 || (data.length === 1 && !isUuid(data[0]?.id)))
      return { outcome: "unavailable" };
    return { outcome: "ready", activePassId: data[0]?.id ?? null };
  } catch {
    return { outcome: "unavailable" };
  }
}

export async function createOwnerPass(
  ticketId: string,
  verifiedOwnerId: string,
  expectedActivePassId: string | null,
) {
  // Uninstalled draft RPC is intentionally absent from captured generated Database types.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return issueOwnerPass(supabaseAdmin as unknown as PassIssuanceClient, {
    ticketId,
    verifiedOwnerId,
    expectedActivePassId,
    confirmed: true,
  });
}
