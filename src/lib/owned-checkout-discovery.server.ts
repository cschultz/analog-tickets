/** Read-only owner discovery for one unresolved checkout. No provider call. */
import { isUuid } from "./checkout-core";

type Row = Record<string, unknown>;
interface Query extends PromiseLike<{ data: Row[] | null; error: unknown; count: number | null }> {
  eq: (column: string, value: unknown) => Query;
  limit: (n: number) => Query;
}
export interface DiscoveryAdmin {
  from: (table: string) => {
    select: (columns: string, options: { count: "exact" }) => Query;
  };
}
export type OwnedCheckoutDiscovery =
  | { status: "none" }
  | { status: "review" }
  | {
      status: "found";
      reservationId: string;
      ticketTypeId: string;
      expiresAt: string;
      started: boolean;
    };

type Limited = Row[] | "many" | null;
async function limited(query: Query): Promise<Limited> {
  const { data, error, count } = await query.limit(2);
  if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count === null || count < 0)
    return null;
  if (count > 1) return "many";
  return data.length === count ? data : null;
}

/**
 * Counts are exact, not inferred from a potentially truncated Data API page.
 * Anything plural, malformed, stale-linked or unreadable needs human review.
 * A `none` result is not proof that no payment or completed order exists.
 */
export async function discoverOwnedCheckout(
  admin: DiscoveryAdmin,
  verifiedOwnerId: string,
): Promise<OwnedCheckoutDiscovery> {
  const review = { status: "review" as const };
  if (!isUuid(verifiedOwnerId)) return review;
  try {
    const holds = await limited(
      admin
        .from("inventory_reservations")
        .select("id,owner_user_id,event_id,ticket_type_id,quantity,status,expires_at", {
          count: "exact",
        })
        .eq("owner_user_id", verifiedOwnerId),
    );
    if (!holds || holds === "many") return review;
    const attempts = await limited(
      admin
        .from("checkout_attempts")
        .select(
          "id,user_id,reservation_id,event_id,ticket_type_id,quantity,status,provider,provider_request_version",
          { count: "exact" },
        )
        .eq("user_id", verifiedOwnerId),
    );
    if (!attempts || attempts === "many") return review;
    if (holds.length === 0) return attempts.length === 0 ? { status: "none" } : review;
    const hold = holds[0]!;
    const id = hold["id"],
      eventId = hold["event_id"],
      ticketTypeId = hold["ticket_type_id"],
      expiresAt = hold["expires_at"];
    if (
      hold["owner_user_id"] !== verifiedOwnerId ||
      hold["status"] !== "confirmed" ||
      !isUuid(id) ||
      !isUuid(eventId) ||
      !isUuid(ticketTypeId) ||
      hold["quantity"] !== 1 ||
      typeof expiresAt !== "string" ||
      !Number.isFinite(Date.parse(expiresAt))
    )
      return review;
    const linked = await limited(
      admin
        .from("checkout_attempts")
        .select(
          "id,user_id,reservation_id,event_id,ticket_type_id,quantity,status,provider,provider_request_version",
          { count: "exact" },
        )
        .eq("reservation_id", id),
    );
    if (!linked || linked === "many" || linked.length !== attempts.length) return review;
    if (linked.length === 1) {
      const attempt = linked[0]!;
      if (
        attempt["id"] !== attempts[0]?.["id"] ||
        !isUuid(attempt["id"]) ||
        attempt["user_id"] !== verifiedOwnerId ||
        attempt["reservation_id"] !== id ||
        attempt["event_id"] !== eventId ||
        attempt["ticket_type_id"] !== ticketTypeId ||
        attempt["quantity"] !== 1 ||
        attempt["status"] !== "pending" ||
        attempt["provider"] !== "stripe_test" ||
        attempt["provider_request_version"] !== 2
      )
        return review;
    }
    return {
      status: "found",
      reservationId: id,
      ticketTypeId,
      expiresAt,
      started: linked.length === 1,
    };
  } catch {
    return review;
  }
}
