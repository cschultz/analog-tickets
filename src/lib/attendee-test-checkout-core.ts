import { isUuid } from "./checkout-core";
import type { CatalogEventRow, CatalogTierRow } from "./event-catalog-core";

export type PublicCheckoutSelection = { event: CatalogEventRow; tier: CatalogTierRow };

export function selectedTierId(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

/** Browser projection only. The server rechecks ownership, stock and price. */
export function publicCheckoutSelection(
  event: CatalogEventRow | null,
  tier: CatalogTierRow | null,
): PublicCheckoutSelection | null {
  if (
    !event ||
    !tier ||
    !isUuid(event.id) ||
    !isUuid(tier.id) ||
    tier.event_id !== event.id ||
    !event.is_published ||
    !tier.is_active ||
    !Number.isSafeInteger(tier.price_cents) ||
    tier.price_cents < 0 ||
    !/^[a-z]{3}$/i.test(tier.currency)
  )
    return null;
  return { event, tier };
}

export function testCheckoutStorageKey(accountId: string, tierId: string): string {
  if (!isUuid(accountId) || !isUuid(tierId)) throw new Error("Invalid local checkout identity");
  return `analog-test-checkout-v1:${accountId}:${tierId}`;
}
