import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CheckoutShell } from "./CheckoutShell";
import { Button } from "./ui/button";
import { supabase } from "@/lib/public-supabase-client";
import { createGuestCheckoutIdentity } from "@/lib/guest-checkout-identity";
import { createGuestPurchase } from "@/lib/guest-checkout-client";
import { GUEST_RETURN_REFERENCE_KEY } from "@/lib/guest-purchase-reference";
import { catalogDate, catalogPrice } from "@/lib/event-catalog-core";
import type { PublicCheckoutSelection } from "@/lib/attendee-test-checkout-core";

/** Only mounted when the server advertises the explicit TEST guest mode. */
export function GuestCheckout({ selection }: { selection: PublicCheckoutSelection }) {
  const flow = useMemo(() => {
    const identity = createGuestCheckoutIdentity(supabase.auth);
    const key = `analog-guest-purchase-v1:${selection.tier.id}`;
    return createGuestPurchase({
      ticketTypeId: selection.tier.id,
      ensureIdentity: (allowCreate) => identity.ensure({ allowCreate }),
      getToken: async (owner) => {
        const { data, error } = await supabase.auth.getSession();
        return !error && data.session?.user.id === owner ? data.session.access_token : null;
      },
      fetchImpl: (input, init) => fetch(input, init),
      storage: {
        read: () => {
          if (typeof window === "undefined") return null;
          const value = sessionStorage.getItem(key);
          return value === null ? null : (JSON.parse(value) as unknown);
        },
        write: (value) => {
          sessionStorage.setItem(key, JSON.stringify(value));
          sessionStorage.setItem(GUEST_RETURN_REFERENCE_KEY, JSON.stringify(value));
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
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const count = state.quantityLocked ? state.quantity : quantity;
  const max =
    Number.isSafeInteger(selection.tier.max_per_order) && selection.tier.max_per_order! > 0
      ? Math.min(10, selection.tier.max_per_order!)
      : 10;
  const amount = selection.tier.price_cents * count;
  const validAmount = Number.isSafeInteger(amount) && amount >= 0;
  return (
    <CheckoutShell
      currentStep={state.phase === "details" ? "Details" : "Payment"}
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
            <div className="checkout-subtotal">
              <dt>Ticket amount</dt>
              <dd className="checkout-money">
                {validAmount ? catalogPrice(amount, selection.tier.currency) : "Amount unavailable"}{" "}
                {selection.tier.currency.toUpperCase()}
              </dd>
            </div>
          </dl>
          <p className="checkout-note">The final total is shown by Stripe before payment.</p>
          <p className="checkout-note">Synthetic TEST tickets only. No real admission.</p>
        </>
      }
    >
      <p className="checkout-note checkout-intro">
        Continue as a guest. No account or password required.
      </p>
      {state.phase === "details" ? (
        <form
          className="checkout-form"
          aria-describedby="guest-test-hint"
          onSubmit={(event) => {
            event.preventDefault();
            // Preserve compounds/Unicode; never guess how to split a saved full name.
            const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
            void flow.continue({ quantity: count, contact: { name, email } });
          }}
        >
          <h2>Your details</h2>
          <p id="guest-test-hint" className="checkout-note">
            Use a synthetic @example.test email in this TEST demonstration. No real email is sent
            from this step.
          </p>
          <div className="checkout-ticket-choice">
            <div>
              <p id="guest-quantity-label">Tickets</p>
              <p id="guest-quantity-hint" className="checkout-note">
                Up to {max} per order
              </p>
            </div>
            <div
              className="checkout-quantity"
              role="group"
              aria-labelledby="guest-quantity-label"
              aria-describedby="guest-quantity-hint"
            >
              <button
                type="button"
                aria-label="Decrease ticket quantity"
                disabled={state.quantityLocked || count <= 1}
                onClick={() => setQuantity(count - 1)}
              >
                −
              </button>
              <output aria-label="Ticket quantity" aria-live="polite">
                {count}
              </output>
              <button
                type="button"
                aria-label="Increase ticket quantity"
                disabled={state.quantityLocked || count >= max}
                onClick={() => setQuantity(count + 1)}
              >
                +
              </button>
            </div>
          </div>
          <p className="checkout-note">
            {selection.tier.name} ·{" "}
            {catalogPrice(selection.tier.price_cents, selection.tier.currency)} each
          </p>
          <div className="checkout-name-fields">
            <div>
              <label htmlFor="guest-first-name">First name</label>
              <input
                id="guest-first-name"
                name="given-name"
                autoComplete="given-name"
                required
                maxLength={120}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                aria-describedby="guest-status"
              />
            </div>
            <div>
              <label htmlFor="guest-last-name">
                Last name <span className="checkout-note">(optional)</span>
              </label>
              <input
                id="guest-last-name"
                name="family-name"
                autoComplete="family-name"
                maxLength={120}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                aria-describedby="guest-status"
              />
            </div>
          </div>
          <label htmlFor="guest-email">Email</label>
          <input
            id="guest-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby="guest-test-hint guest-status"
          />
          <p className="checkout-note">
            Your receipt and ticket recovery link go to this email. Please check it carefully.
          </p>
          <Button
            type="submit"
            className="checkout-action checkout-primary"
            disabled={!validAmount}
          >
            Continue to TEST payment
          </Button>
        </form>
      ) : null}
      <p
        id="guest-status"
        role="status"
        aria-live="polite"
        className={state.message ? "checkout-status" : undefined}
      >
        {state.message}
      </p>
      {state.phase === "resume" ? (
        <Button
          type="button"
          className="checkout-action checkout-primary"
          onClick={() => {
            void flow.continue();
          }}
        >
          Resume TEST payment
        </Button>
      ) : null}
      {state.phase === "working" || state.phase === "redirect" ? (
        <Button type="button" disabled className="checkout-action checkout-primary">
          Preparing payment…
        </Button>
      ) : null}
      <p className="checkout-payment-note">
        Payment is handled by Stripe. A return from payment does not by itself confirm tickets.
      </p>
    </CheckoutShell>
  );
}
