import type { GuestPurchaseStatus } from "@/lib/guest-purchase-status";
import { catalogPrice } from "@/lib/event-catalog-core";

/** Original payment presentation only. Current tickets/refunds are never inferred here. */
export function GuestPurchasePricing({
  purchase,
}: {
  purchase: Extract<GuestPurchaseStatus, { status: "confirmed" }>;
}) {
  const pricing = purchase.pricing;
  const money = (cents: number) =>
    `${catalogPrice(cents, purchase.currency)} ${purchase.currency.toUpperCase()}`;
  return (
    <>
      <dl className="checkout-price-breakdown" aria-label="Original purchase pricing">
        <div>
          <dt>Tickets purchased</dt>
          <dd>{purchase.quantity}</dd>
        </div>
        {pricing ? (
          <>
            <div>
              <dt>Ticket subtotal</dt>
              <dd>{money(pricing.subtotalCents)}</dd>
            </div>
            <div>
              <dt>{pricing.promotionCode ? `Discount · ${pricing.promotionCode}` : "Discount"}</dt>
              <dd>
                {pricing.discountCents ? "−" : ""}
                {money(pricing.discountCents)}
              </dd>
            </div>
            <div>
              <dt>Added fees</dt>
              <dd>{money(pricing.feeCents)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>Not calculated in TEST</dd>
            </div>
          </>
        ) : null}
        <div className="checkout-subtotal">
          <dt>Original paid amount</dt>
          <dd className="checkout-money">{money(purchase.amountCents)}</dd>
        </div>
      </dl>
      <p className="checkout-note">
        Ticket status reflects refunds, transfers and check-in. The original paid amount does not
        subtract later refunds.
      </p>
      {pricing ? (
        <p className="checkout-note">
          Tax was not calculated in TEST. This is not a tax-exemption statement.
        </p>
      ) : null}
    </>
  );
}
