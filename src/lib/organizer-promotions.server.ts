import { isUuid } from "./checkout-core";
import { loadCallerMemberships } from "./refund-policy.server";
import { evaluateRefundPolicyAuthorization } from "./refund-policy-core";
import {
  object,
  parsePromotionInput,
  parsePromotionPage,
  type PromotionResult,
  type PromotionError,
} from "./organizer-promotions-core";
import type { PromoRpcClient } from "./guest-promo.server";
export async function manageOrganizerPromotions(o: {
  userClient: unknown;
  userId: string;
  input: unknown;
  env: {
    PAYMENTS_TEST_MODE?: string | undefined;
    PAYMENT_PROVIDER?: string | undefined;
    PROMOTION_PRICING_SANDBOX_MODE?: string | undefined;
  };
  loadAdmin: () => Promise<PromoRpcClient>;
}): Promise<PromotionResult> {
  const input = parsePromotionInput(o.input),
    unavailable: PromotionResult = { ok: false, code: "unavailable" };
  if (!input) return { ok: false, code: "invalid_request" };
  if (
    o.env.PAYMENTS_TEST_MODE !== "true" ||
    o.env.PAYMENT_PROVIDER !== "stripe_test" ||
    o.env.PROMOTION_PRICING_SANDBOX_MODE !== "true" ||
    !isUuid(o.userId)
  )
    return unavailable;
  try {
    const memberships = await loadCallerMemberships(o.userClient, input.eventId);
    if (
      !evaluateRefundPolicyAuthorization({ memberships, eventId: input.eventId, userId: o.userId })
        .ok
    )
      return unavailable;
    const admin = await o.loadAdmin();
    const args =
      input.action === "list"
        ? { p_actor: o.userId, p_event: input.eventId, p_after_code: input.after }
        : {
            p_actor: o.userId,
            p_event: input.eventId,
            p_id: input.id,
            p_version: input.version,
            p_code: input.code,
            p_tier: input.ticketTypeId,
            p_enabled: input.enabled,
            p_starts: input.startsAt,
            p_expires: input.expiresAt,
            p_kind: input.kind,
            p_value: input.value,
            p_limit: input.maxRedemptions,
          };
    const result = await admin.rpc(
      input.action === "list" ? "read_organizer_promotions" : "save_organizer_promotion",
      args,
    );
    if (result.error || !Array.isArray(result.data) || result.data.length !== 1) return unavailable;
    const row = object(result.data[0]);
    if (input.action === "list" && row?.["outcome"] === "ready") {
      const page = parsePromotionPage(row["payload"], input.eventId, input.after);
      return page ? { ok: true, action: "list", page } : unavailable;
    }
    if (
      input.action === "save" &&
      row?.["outcome"] === "saved" &&
      isUuid(row["promotion_id"]) &&
      row["version"] === (input.version ?? 0) + 1 &&
      (input.id === null || row["promotion_id"] === input.id)
    )
      return {
        ok: true,
        action: "save",
        id: row["promotion_id"],
        version: row["version"] as number,
      };
    const codes: PromotionError[] = [
      "invalid_request",
      "unavailable",
      "code_taken",
      "version_conflict",
      "immutable_scope",
      "invalid_scope",
      "limit_below_usage",
      "too_many_tiers",
    ];
    return typeof row?.["outcome"] === "string" && codes.includes(row["outcome"] as PromotionError)
      ? { ok: false, code: row["outcome"] as PromotionError }
      : unavailable;
  } catch {
    return unavailable;
  }
}
