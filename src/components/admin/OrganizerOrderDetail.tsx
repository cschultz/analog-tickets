import { useEffect, useRef, type ReactNode } from "react";
import { AdminCard, AdminCardHeader, AdminCardContent } from "./AdminCard";
import { StatusPill } from "./StatusPill";
import {
  organizerDate,
  organizerMoney,
  organizerOrderActivity,
  type OrganizerOrderDetail as Detail,
} from "@/lib/organizer-order-detail-core";

export function OrganizerOrderDetail({
  order,
  onClose,
  ticketTypes = [],
  support,
  timeZone = "UTC",
}: {
  order: Detail;
  onClose: () => void;
  ticketTypes?: { id: string; name: string }[];
  support?: ReactNode;
  timeZone?: string;
}) {
  const activity = organizerOrderActivity(order);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [order.id]);
  return (
    <section className="admin-order-detail" aria-labelledby="order-detail-heading">
      <button type="button" onClick={onClose}>
        ← Back to search results
      </button>
      <div className="admin-record-heading">
        <h2 id="order-detail-heading" tabIndex={-1} ref={heading}>
          Order details
        </h2>
        <StatusPill status={order.status} />
      </div>
      <p className="admin-record-id">
        Order ID: <code>{order.id}</code>
      </p>
      <div className="admin-detail-grid">
        <AdminCard>
          <AdminCardHeader>
            <h3>Buyer</h3>
          </AdminCardHeader>
          <AdminCardContent>
            <p>{order.name || "Buyer name not provided"}</p>
            <p>{order.email || "Buyer email not provided"}</p>
            <p>Created {organizerDate(order.createdAt, timeZone)}</p>
          </AdminCardContent>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader>
            <h3>Payment context</h3>
          </AdminCardHeader>
          <AdminCardContent>
            <p>
              Original order total <strong>{organizerMoney(order.originalTotalCents)}</strong>
            </p>
            <p>
              {order.tickets.length} ticket record{order.tickets.length === 1 ? "" : "s"}
            </p>
            <p>
              Order status: {order.status}. This is recorded application state, not a fresh Stripe
              balance check. Original total is not net revenue or remaining refundable balance.
            </p>
          </AdminCardContent>
        </AdminCard>
      </div>
      {support}
      <h3>Saved purchase pricing</h3>
      {order.pricing ? (
        <>
          <div
            className="admin-table-scroll"
            role="region"
            aria-label="Saved order prices"
            tabIndex={0}
          >
            <table>
              <caption>Original order items — not current catalog prices</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Unit price</th>
                  <th scope="col">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.pricing.items.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      {ticketTypes.find((type) => type.id === item.ticketTypeId)?.name ??
                        `Ticket item ${index + 1}`}
                      <br />
                      <small>
                        {ticketTypes.some((type) => type.id === item.ticketTypeId)
                          ? "Current catalog name · "
                          : "Type "}
                        <code>{item.ticketTypeId.slice(0, 8)}…</code>
                      </small>
                    </td>
                    <td>{item.quantity}</td>
                    <td>{organizerMoney(item.unitPriceCents)}</td>
                    <td>{organizerMoney(item.unitPriceCents * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="admin-price-breakdown">
            <div>
              <dt>Ticket subtotal</dt>
              <dd>{organizerMoney(order.pricing.subtotalCents)}</dd>
            </div>
            {order.pricing.quote ? (
              <>
                <div>
                  <dt>
                    Discount
                    {order.pricing.quote.promotionCode
                      ? ` (${order.pricing.quote.promotionCode})`
                      : ""}
                  </dt>
                  <dd>−{organizerMoney(order.pricing.quote.discountCents)}</dd>
                </div>
                <div>
                  <dt>Added fees</dt>
                  <dd>{organizerMoney(order.pricing.quote.feeCents)}</dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>Not calculated in TEST</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>Discount, fee and tax breakdown</dt>
                <dd>Not recorded in a verified saved quote</dd>
              </div>
            )}
            <div>
              <dt>Original order total</dt>
              <dd>
                <strong>{organizerMoney(order.originalTotalCents)}</strong>
              </dd>
            </div>
          </dl>
          <p className="checkout-note">
            Saved prices remain unchanged after refunds. Catalog names are current labels;
            historical names were not saved.
            {order.pricing.quote
              ? " TEST tax not calculated is not a tax-exemption statement."
              : ""}
          </p>
        </>
      ) : (
        <p>
          Original itemized pricing is not recorded for this order. No discount, fee or tax
          breakdown is inferred.
        </p>
      )}
      <h3>Tickets and check-in</h3>
      <p>
        Holder details may differ from the buyer. A void ticket alone does not establish why it was
        voided.
      </p>
      {order.tickets.length ? (
        <div
          className="admin-table-scroll"
          role="region"
          aria-label="Order ticket details"
          tabIndex={0}
        >
          <table>
            <caption>Tickets for this order</caption>
            <thead>
              <tr>
                <th scope="col">Ticket</th>
                <th scope="col">Holder</th>
                <th scope="col">Status</th>
                <th scope="col">Check-in</th>
              </tr>
            </thead>
            <tbody>
              {order.tickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <code>{t.id}</code>
                  </td>
                  <td>
                    {t.name || "Holder name not provided"}
                    <br />
                    {t.email || "Holder email not provided"}
                  </td>
                  <td>
                    <StatusPill
                      status={
                        t.status === "void"
                          ? "Voided"
                          : t.checkedInAt || t.status === "checked_in"
                            ? "Checked in"
                            : "Valid — not checked in"
                      }
                    />
                  </td>
                  <td>
                    {t.checkedInAt
                      ? organizerDate(t.checkedInAt, timeZone)
                      : t.status === "checked_in"
                        ? "Check-in time not recorded"
                        : "Not checked in"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          No issued ticket records are visible for this order. A pending order may not have issued
          tickets yet.
        </p>
      )}
      <h3>Recorded refund reversals</h3>
      <p>
        Application reversal records only—not a live provider reconciliation report. Unknown
        historical amounts are not treated as zero. Pending or failed attempts are not included in
        this reversal history.
      </p>
      {order.refunds.length ? (
        <ul className="admin-refund-history">
          {order.refunds.map((r) => (
            <li key={r.id}>
              <strong>
                {r.amountCents === null ? "Amount not recorded" : organizerMoney(r.amountCents)}
              </strong>{" "}
              · {r.ticketCount} ticket{r.ticketCount === 1 ? "" : "s"} ·{" "}
              {organizerDate(r.createdAt, timeZone)}
            </li>
          ))}
        </ul>
      ) : (
        <p>No refund reversal records are recorded for this order.</p>
      )}
      <details className="admin-data-definitions">
        <summary>Recorded activity ({activity.length})</summary>
        <p>
          Oldest first. Recorded dates, not a complete audit log: payment completion, transfers,
          void reasons and earlier or reversed check-ins are not established by these records.
        </p>
        <ol className="admin-order-activity">
          {activity.map((entry) => (
            <li key={entry.id}>
              <time dateTime={entry.at}>{organizerDate(entry.at, timeZone)}</time>
              <span>{entry.label}</span>
            </li>
          ))}
        </ol>
      </details>
      <p className="admin-readonly">
        {support
          ? "TEST workspace. Refund actions require the separate reviewed selection and confirmation above; no real-money operation is enabled."
          : "Read-only TEST view. No payment, refund, check-in or buyer-edit action is performed here."}
      </p>
    </section>
  );
}
