/** Email Testing sandbox only. No sending/bulk host, raw provider response or logging. */
import { resolveMailtrapConfig, sandboxSendUrl } from "./mailtrap-capture-core";
import { normalizeStagingOrigin } from "./stripe-checkout.server";
import { isUuid } from "./checkout-core";
import {
  parsePurchasePricing,
  purchasePricingText,
  type PurchasePricing,
} from "./purchase-pricing";
export function guestRecoveryEnabled(env: Record<string, string | undefined>): boolean {
  return (
    env["GUEST_RECOVERY_SANDBOX_MODE"] === "true" &&
    env["GUEST_CHECKOUT_SANDBOX_MODE"] === "true" &&
    env["PAYMENTS_TEST_MODE"] === "true" &&
    env["PAYMENT_PROVIDER"] === "stripe_test"
  );
}
export async function sendGuestRecoveryMail(
  email: string,
  link: string,
  quantity: number,
  deps: {
    env: Record<string, string | undefined>;
    fetchImpl: typeof fetch;
    pricing?: PurchasePricing;
  },
): Promise<boolean> {
  if (!guestRecoveryEnabled(deps.env)) return false;
  const config = resolveMailtrapConfig(deps.env);
  const origin = normalizeStagingOrigin(deps.env["STAGING_ALLOWED_ORIGIN"]);
  if (
    !config.enabled ||
    !origin ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10 ||
    !/^[^\s@]+@example\.test$/i.test(email) ||
    !email.toLowerCase().endsWith("@" + config.config.recipientDomain)
  )
    return false;
  const pricing =
    deps.pricing === undefined
      ? undefined
      : parsePurchasePricing(
          deps.pricing,
          quantity,
          deps.pricing?.totalCents ?? NaN,
          deps.pricing?.currency ?? "",
        );
  if (deps.pricing !== undefined && !pricing) return false;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  if (
    url.origin !== origin ||
    Boolean(url.username || url.password) ||
    url.pathname !== "/tickets/recover" ||
    (url.search !== "" &&
      (!isUuid(url.searchParams.get("purchase")) ||
        url.search !== `?purchase=${url.searchParams.get("purchase")}`)) ||
    !/^#token=[0-9a-f]{64}$/.test(url.hash)
  )
    return false;
  try {
    const response = await deps.fetchImpl(sandboxSendUrl(config.config), {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { "content-type": "application/json", "Api-Token": config.config.apiToken },
      body: JSON.stringify({
        from: { email: config.config.fromAddress },
        to: [{ email }],
        subject: "Your TEST tickets — passwordless access",
        category: "guest-ticket-recovery",
        text: `Your TEST purchase contains ${quantity} ticket(s).${pricing ? `\n\n${purchasePricingText(pricing)}` : ""}\n\nOpen your tickets here:\n${link}\n\nThis single-use link expires in 15 minutes. Open it on the device you want to use. No account or password is required. You can request a fresh link at ${origin}/tickets/recover. Ticket status and door validation remain authoritative; this message is not an admission pass. Synthetic TEST only; no real admission.`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
