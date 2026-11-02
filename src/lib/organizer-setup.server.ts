import { isUuid, resolveWebhookConfig } from "./checkout-core";
import { resolveStripeAdapterConfig, normalizeStagingOrigin } from "./stripe-checkout.server";
import { resolveMailtrapConfig } from "./mailtrap-capture-core";
import { guestRecoveryEnabled } from "./guest-recovery-mail.server";
import { loadCallerMemberships } from "./refund-policy.server";
import { evaluateRefundPolicyAuthorization } from "./refund-policy-core";
import { object } from "./admin-workspace-core";
import { parseSetupInput, type DeliverySummary, type SetupResult } from "./organizer-setup-core";

interface DeliveryQuery extends PromiseLike<{
  data: unknown;
  error: unknown;
  count: number | null;
}> {
  eq: (column: string, value: string) => DeliveryQuery;
  limit: (maximum: number) => DeliveryQuery;
}
interface DeliveryClient {
  from: (table: string) => {
    select: (columns: string, options: { count: "exact" }) => DeliveryQuery;
  };
}

/** SELECT only, fixed joins and explicit event constraint. Never selects email, proofs or leases. */
async function deliverySummary(admin: unknown, eventId: string): Promise<DeliverySummary> {
  try {
    const result = await (admin as DeliveryClient)
      .from("guest_purchase_deliveries")
      .select("state,guest_checkout_carts!inner(ticket_types!inner(event_id))", { count: "exact" })
      .eq("guest_checkout_carts.ticket_types.event_id", eventId)
      .limit(1001);
    if (result.error)
      return {
        state: ["42P01", "PGRST200", "PGRST205"].includes(String(object(result.error)?.["code"]))
          ? "setup_required"
          : "unavailable",
      };
    if (
      !Array.isArray(result.data) ||
      !Number.isSafeInteger(result.count) ||
      result.count !== result.data.length ||
      result.data.length > 1000
    )
      return { state: "unavailable" };
    const counts = { state: "available" as const, pending: 0, sending: 0, sent: 0, uncertain: 0 };
    for (const value of result.data) {
      const row = object(value),
        cart = object(row?.["guest_checkout_carts"]),
        tier = object(cart?.["ticket_types"]);
      if (
        !row ||
        tier?.["event_id"] !== eventId ||
        !["pending", "sending", "sent", "uncertain"].includes(String(row["state"]))
      )
        return { state: "unavailable" };
      counts[row["state"] as "pending" | "sending" | "sent" | "uncertain"]++;
    }
    return counts;
  } catch {
    return { state: "unavailable" };
  }
}

/** Caller membership precedes environment access and the deferred read-only service client. */
export async function readOrganizerSetup(args: {
  input: unknown;
  userId: string;
  userClient: unknown;
  readEnvironment: () => Record<string, string | undefined>;
  loadAdmin: () => Promise<unknown>;
}): Promise<SetupResult> {
  const input = parseSetupInput(args.input);
  if (!input) return { ok: false, code: "invalid_request" };
  if (!isUuid(args.userId)) return { ok: false, code: "unavailable" };
  try {
    const memberships = await loadCallerMemberships(args.userClient, input.eventId);
    if (
      !evaluateRefundPolicyAuthorization({
        memberships,
        eventId: input.eventId,
        userId: args.userId,
      }).ok
    )
      return { ok: false, code: "unavailable" };
    const env = args.readEnvironment();
    if (env["PAYMENTS_TEST_MODE"] !== "true" || env["PAYMENT_PROVIDER"] !== "stripe_test")
      return { ok: false, code: "test_mode_required" };
    const checkout = typeof resolveStripeAdapterConfig(env) !== "string";
    const webhook = typeof resolveWebhookConfig(env) !== "string";
    const mail = resolveMailtrapConfig(env),
      email = mail.enabled;
    const recovery =
      guestRecoveryEnabled(env) &&
      !!normalizeStagingOrigin(env["STAGING_ALLOWED_ORIGIN"]) &&
      email &&
      env["MAILTRAP_RECIPIENT_DOMAIN"]?.trim().toLowerCase() === "example.test";
    let delivery: DeliverySummary;
    try {
      delivery = await deliverySummary(await args.loadAdmin(), input.eventId);
    } catch {
      delivery = { state: "unavailable" };
    }
    return {
      ok: true,
      configuration: {
        eventId: input.eventId,
        mode: "TEST",
        checkout: checkout ? "configured" : "needs_setup",
        webhook: webhook ? "configured" : "needs_setup",
        email: email ? "configured" : mail.reason === "mode_off" ? "disabled" : "needs_setup",
        recovery: recovery
          ? "configured"
          : env["GUEST_RECOVERY_SANDBOX_MODE"] === "true"
            ? "needs_setup"
            : "disabled",
        promotions: env["PROMOTION_PRICING_SANDBOX_MODE"] === "true" ? "configured" : "disabled",
      },
      delivery,
    };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
