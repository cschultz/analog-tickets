import { createUserClient, resolveUserId } from "@/lib/transfer-otp.server";
import { OWNER_TICKET_PAGE_SIZE } from "./owner-tickets-core";

export async function authenticateTicketOwner(token: string): Promise<string | null> {
  return resolveUserId(createUserClient(token), token);
}

/** Both the explicit owner predicate and the caller's existing RLS apply. Never service role. */
export async function loadOwnerTickets(
  token: string,
  ownerId: string,
  offset: number,
): Promise<unknown> {
  const { data, error } = await createUserClient(token)
    .from("tickets")
    .select(
      "id,owner_user_id,status,checked_in_at,events(name,starts_at,timezone,venue_name),ticket_types(name)",
    )
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + OWNER_TICKET_PAGE_SIZE)
    .abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error("unavailable");
  return data;
}
