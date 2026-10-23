import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CheckoutShell } from "./CheckoutShell";
import { Button } from "./ui/button";
import { supabase } from "@/lib/public-supabase-client";
import { createGuestCheckoutIdentity } from "@/lib/guest-checkout-identity";
import { createPromoBuyer, promoCheckoutStorageKey } from "@/lib/guest-promo-client";
import { GUEST_RETURN_REFERENCE_KEY } from "@/lib/guest-purchase-reference";
import { catalogDate, catalogPrice } from "@/lib/event-catalog-core";
import type { PublicCheckoutSelection } from "@/lib/attendee-test-checkout-core";

/** Mounted only when the server advertises the installed TEST pricing feature. */
export function PromoGuestCheckout({ selection }: { selection: PublicCheckoutSelection }) {
  const flow = useMemo(() => {
    const identity = createGuestCheckoutIdentity(supabase.auth);
    const key = promoCheckoutStorageKey(selection.tier.id);
    return createPromoBuyer({
      ticketTypeId: selection.tier.id,
      ensureIdentity: (allowCreate) => identity.ensure({ allowCreate }),
      getToken: async (owner) => {
        const { data, error } = await supabase.auth.getSession();
        return !error && data.session?.user.id === owner ? data.session.access_token : null;
      },
      fetchImpl: (input, init) => fetch(input, init),
      storage: {
        read: () => {
          const saved = sessionStorage.getItem(key);
          return saved === null ? null : (JSON.parse(saved) as unknown);
        },
        write: (value) => {
          sessionStorage.setItem(key, JSON.stringify(value));
          sessionStorage.setItem(GUEST_RETURN_REFERENCE_KEY, JSON.stringify(value));
        },
        clear: (value) => {
          for (const name of [key, GUEST_RETURN_REFERENCE_KEY]) {
            const saved = sessionStorage.getItem(name);
            if (
              saved !== null &&
              (JSON.parse(saved) as { cartId?: unknown }).cartId === value.cartId
            )
              sessionStorage.removeItem(name);
          }
        },
      },
      navigate: (url) => window.location.assign(url),
    });
  }, [selection.tier.id]);
  useEffect(() => {
    flow.activate();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      flow.sessionChanged(session?.user.id ?? null);
    });
    return () => {
      subscription.unsubscribe();
      flow.dispose();
    };
  }, [flow]);
  return <PromoCheckoutView selection={selection} flow={flow} />;
}

export function PromoCheckoutView({
  selection,
  flow,
}: {
  selection: PublicCheckoutSelection;
  flow: ReturnType<typeof createPromoBuyer>;
}) {
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [code, setCode] = useState("");
  const count = state.locked ? state.quantity : quantity;
  const max =
    Number.isSafeInteger(selection.tier.max_per_order) && selection.tier.max_per_order! > 0
      ? Math.min(10, selection.tier.max_per_order!)
      : 10;
  const price = state.quote ?? state.preview;
  const money = (cents: number) => `${catalogPrice(cents, "usd")} USD`;
  const editable = state.phase === "details";
  const promoCode = state.quote?.discount?.code ?? state.preview?.code;
  return (
    <CheckoutShell
      currentStep={editable ? "Details" : "Payment"}
      steps={["Details", "Payment", "Tickets"]}
      summary={
        <>
          <h2>Order summary</h2>
          <h3>{selection.event.name}</h3>
          <p className="checkout-note">
            {catalogDate(selection.event.starts_at, selection.event.timezone)}
          </p>
          {selection.event.venue_name ? (
            <p className="checkout-note">{selection.event.venue_name}</p>
          ) : null}
          <dl>
            <div>
              <dt>Ticket type</dt>
              <dd>{selection.tier.name}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{count}</dd>
            </div>
            {price ? (
              <>
                <div>
                  <dt>Ticket subtotal</dt>
                  <dd>{money(price.subtotalCents)}</dd>
                </div>
                <div>
                  <dt>{promoCode ? `Discount · ${promoCode}` : "Discount"}</dt>
                  <dd>
                    {price.discountCents ? "−" : ""}
                    {money(price.discountCents)}
                  </dd>
                </div>
                <div>
                  <dt>Added fees</dt>
                  <dd>{money(price.feeCents)}</dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>Not calculated in TEST</dd>
                </div>
                <div className="checkout-subtotal">
                  <dt>{state.locked ? "Saved total" : "Total"}</dt>
                  <dd className="checkout-money">{money(price.totalCents)}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>Price</dt>
                <dd>Check your order for a current total</dd>
              </div>
            )}
          </dl>
          <p className="checkout-note">
            Tax is not calculated in TEST. This is not a tax-exemption statement.
          </p>
          <p className="checkout-note">Synthetic TEST tickets only. No real funds or admission.</p>
        </>
      }
    >
      <p className="checkout-note checkout-intro">
        Continue as a guest. No account or password required.
      </p>
      {editable ? (
        <form
          className="checkout-form"
          aria-describedby="promo-test-hint"
          onSubmit={(event) => {
            event.preventDefault();
            void flow.review({
              quantity: count,
              code: code.trim() ? code : null,
              contact: {
                name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
                email,
              },
            });
          }}
        >
          <h2>Your details</h2>
          <p id="promo-test-hint" className="checkout-note">
            Use a synthetic @example.test email. No real recipient or payment is used in this
            demonstration.
          </p>
          <fieldset className="checkout-promo-fields" disabled={state.busy}>
            <legend className="sr-only">Ticket quantity and buyer details</legend>
            <div className="checkout-ticket-choice">
              <div>
                <p id="promo-quantity-label">Tickets</p>
                <p id="promo-quantity-hint" className="checkout-note">
                  Up to {max} per order
                </p>
              </div>
              <div
                className="checkout-quantity"
                role="group"
                aria-labelledby="promo-quantity-label"
                aria-describedby="promo-quantity-hint"
              >
                <button
                  type="button"
                  aria-label="Decrease ticket quantity"
                  disabled={count <= 1}
                  onClick={() => {
                    flow.edit();
                    setQuantity(count - 1);
                  }}
                >
                  −
                </button>
                <output aria-label="Ticket quantity" aria-live="polite">
                  {count}
                </output>
                <button
                  type="button"
                  aria-label="Increase ticket quantity"
                  disabled={count >= max}
                  onClick={() => {
                    flow.edit();
                    setQuantity(count + 1);
                  }}
                >
                  +
                </button>
              </div>
            </div>
            <p className="checkout-note">
              {selection.tier.name} ·{" "}
              {catalogPrice(selection.tier.price_cents, selection.tier.currency)}{" "}
              {selection.tier.currency.toUpperCase()} listed per ticket
            </p>
            <div className="checkout-name-fields">
              <div>
                <label htmlFor="promo-first-name">First name</label>
                <input
                  id="promo-first-name"
                  name="given-name"
                  autoComplete="given-name"
                  required
                  maxLength={120}
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="promo-last-name">
                  Last name <span className="checkout-note">(optional)</span>
                </label>
                <input
                  id="promo-last-name"
                  name="family-name"
                  autoComplete="family-name"
                  maxLength={120}
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            </div>
            <label htmlFor="promo-email">Email</label>
            <input
              id="promo-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby="promo-test-hint"
            />
            <p className="checkout-note">
              Your ticket receipt and recovery link use this address. Check it carefully.
            </p>
            <details className="checkout-promo-entry">
              <summary>Have a promo code?</summary>
              <label htmlFor="promo-code">Promo code</label>
              <input
                id="promo-code"
                name="promo-code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                value={code}
                onChange={(event) => {
                  flow.edit();
                  setCode(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void flow.preview(count, code.trim() ? code : null);
                  }
                }}
                aria-describedby="promo-status"
              />
              <div className="checkout-promo-actions">
                <Button
                  type="button"
                  className="checkout-action"
                  disabled={!code.trim()}
                  onClick={() => {
                    void flow.preview(count, code);
                  }}
                >
                  Apply code
                </Button>
                <Button
                  type="button"
                  className="checkout-action"
                  disabled={!code && !promoCode}
                  onClick={() => {
                    setCode("");
                    void flow.preview(count, null);
                  }}
                >
                  Remove code
                </Button>
              </div>
              {promoCode && price ? (
                <p className="checkout-note">
                  Applied: {promoCode}. You save {money(price.discountCents)}.
                </p>
              ) : null}
            </details>
            <Button type="submit" className="checkout-action checkout-primary">
              Review order
            </Button>
          </fieldset>
        </form>
      ) : null}
      {state.phase === "review" ? (
        <section aria-labelledby="promo-review-heading">
          <h2 id="promo-review-heading">Review your order</h2>
          <p>{[firstName.trim(), lastName.trim()].filter(Boolean).join(" ")}</p>
          <p>{email}</p>
          <p className="checkout-note">
            {count} {count === 1 ? "ticket" : "tickets"}. Your total is{" "}
            {price ? money(price.totalCents) : "unavailable"}. The server will recheck this price
            and code availability before payment. Offer expiry stops new quotes; an accepted price
            stays saved until its ticket hold ends.
          </p>
          <div className="checkout-actions">
            <Button
              type="button"
              className="checkout-action checkout-primary"
              disabled={state.busy || !price}
              onClick={() => {
                void flow.pay();
              }}
            >
              Continue to Stripe TEST payment
            </Button>
            <Button
              type="button"
              className="checkout-action checkout-secondary"
              disabled={state.busy}
              onClick={() => flow.edit()}
            >
              Edit details or code
            </Button>
          </div>
        </section>
      ) : null}
      {state.phase === "saved" ? (
        <section>
          <h2>Your saved order</h2>
          <p className="checkout-note">
            Quantity and code are locked to your original order. Continuing uses the same payment
            attempt, not a new purchase.
          </p>
          <Button
            type="button"
            className="checkout-action checkout-primary"
            disabled={state.busy}
            onClick={() => {
              void flow.pay();
            }}
          >
            Continue saved TEST payment
          </Button>
        </section>
      ) : null}
      {state.phase === "recover" ? (
        <Button
          type="button"
          className="checkout-action checkout-primary"
          disabled={state.busy}
          onClick={() => {
            void flow.restore();
          }}
        >
          Check saved checkout
        </Button>
      ) : null}
      {state.phase === "expired" ? (
        <Button
          type="button"
          className="checkout-action checkout-secondary"
          disabled={state.busy}
          onClick={() => {
            void flow.expire();
          }}
        >
          Release unused expired checkout
        </Button>
      ) : null}
      <p
        id="promo-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="checkout-status"
      >
        {state.message}
      </p>
      <p className="checkout-payment-note">
        Payment is handled by Stripe. Only verified payment confirms tickets.{" "}
        <a href="/tickets/recover">Already paid? Recover your tickets.</a>
      </p>
    </CheckoutShell>
  );
}
