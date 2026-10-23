import { useEffect, useRef, useState } from "react";
import {
  createGuestRecoveryClient,
  INITIAL_GUEST_RECOVERY,
  takeRecoveryFragment,
  recoveryPurchaseReference,
} from "@/lib/guest-recovery-client";
import { CheckoutShell } from "./CheckoutShell";
import { GuestAdmissionPass } from "./GuestAdmissionPass";
import { Button } from "./ui/button";
import { catalogDate } from "@/lib/event-catalog-core";
import { GuestAccountPanel } from "./GuestAccountPanel";
import { GuestPurchasePricing } from "./GuestPurchasePricing";
export function GuestTicketRecovery() {
  const initialProof = useRef<string | null | undefined>(undefined);
  const [state, setState] = useState(INITIAL_GUEST_RECOVERY),
    [email, setEmail] = useState("");
  const [flow, setFlow] = useState<ReturnType<typeof createGuestRecoveryClient> | null>(null);
  useEffect(() => {
    if (initialProof.current === undefined)
      initialProof.current = takeRecoveryFragment(window.location, window.history);
    let current: ReturnType<typeof createGuestRecoveryClient>;
    const begin = () => {
      current?.dispose();
      current = createGuestRecoveryClient({
        proof: initialProof.current ?? null,
        cartId: recoveryPurchaseReference(window.location.search),
        fetchImpl: (input, init) => fetch(input, init),
        publish: setState,
      });
      setFlow(current);
      current.start();
    };
    const changed = () => {
      if (!window.location.hash) return;
      initialProof.current = takeRecoveryFragment(window.location, window.history);
      begin();
    };
    begin();
    window.addEventListener("hashchange", changed);
    return () => {
      window.removeEventListener("hashchange", changed);
      current.dispose();
    };
  }, []);
  const purchase = state.phase === "confirmed" ? state.purchase : null;
  return (
    <CheckoutShell
      title={purchase ? "Your TEST tickets" : "Find your TEST tickets"}
      currentStep="Tickets"
      steps={["Details", "Payment", "Tickets"]}
      summary={
        purchase ? (
          <>
            <h2>Purchase summary</h2>
            <GuestPurchasePricing purchase={purchase} />
            <p className="checkout-note">
              Refunds, transfers and check-in can affect admission. This device’s access expires
              after one hour.
            </p>
          </>
        ) : (
          <>
            <h2>Passwordless ticket access</h2>
            <p className="checkout-note">
              Use the email entered at checkout. This does not create an account or start a payment.
            </p>
          </>
        )
      }
    >
      <p role="status" aria-live="polite" className="checkout-status">
        {state.message}
      </p>
      {state.phase === "link" ? (
        <Button
          className="checkout-action checkout-primary"
          onClick={() => {
            initialProof.current = null;
            void flow?.open();
          }}
        >
          Open my tickets
        </Button>
      ) : null}
      {purchase ? (
        <>
          {purchase.tickets[0] ? (
            <>
              <h2>{purchase.tickets[0].eventName}</h2>
              {purchase.tickets[0].eventStartsAt && purchase.tickets[0].eventTimezone ? (
                <p className="checkout-note">
                  {catalogDate(
                    purchase.tickets[0].eventStartsAt,
                    purchase.tickets[0].eventTimezone,
                  )}
                </p>
              ) : null}
              {purchase.tickets[0].venueName ? (
                <p className="checkout-note">{purchase.tickets[0].venueName}</p>
              ) : null}
            </>
          ) : null}
          {purchase.unavailableTickets ? (
            <p className="checkout-note">
              {purchase.unavailableTickets} purchased ticket(s) are no longer owned by this purchase
              session. Recipient details are not shown.
            </p>
          ) : null}
          <GuestAdmissionPass token="scoped-recovery-cookie" recovered tickets={purchase.tickets} />
          <GuestAccountPanel key={purchase.cartId} cartId={purchase.cartId} />
        </>
      ) : null}
      {state.phase !== "working" && state.phase !== "link" && !purchase ? (
        <form
          className="checkout-form checkout-section"
          onSubmit={(e) => {
            e.preventDefault();
            void flow?.request(email);
            setEmail("");
          }}
        >
          <label htmlFor="recover-email">Email used at checkout</label>
          <input
            id="recover-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="checkout-action checkout-primary" disabled={!flow}>
            Email my tickets
          </Button>
        </form>
      ) : null}
      {state.phase !== "working" ? (
        <div className="checkout-section">
          <Button
            variant="outline"
            className="checkout-action checkout-secondary"
            onClick={() => {
              void flow?.refresh();
            }}
          >
            Check this device’s ticket access
          </Button>
          <Button
            variant="outline"
            className="checkout-action checkout-secondary"
            onClick={() => {
              void flow?.logout();
            }}
          >
            Close ticket access on this device
          </Button>
        </div>
      ) : null}
      <p className="checkout-note checkout-section">
        Synthetic TEST only. Email requests use a testing inbox, not a real recipient. No account
        registration or password is required.
      </p>
    </CheckoutShell>
  );
}
