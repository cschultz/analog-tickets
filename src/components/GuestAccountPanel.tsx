import { useEffect, useRef, useState } from "react";
import { createGuestAccountClient, INITIAL_GUEST_ACCOUNT } from "@/lib/guest-account-client";
import { supabase } from "@/lib/public-supabase-client";
import { Button } from "./ui/button";
import { GuestAdmissionPass } from "./GuestAdmissionPass";
import { catalogDate } from "@/lib/event-catalog-core";
import { GuestPurchasePricing } from "./GuestPurchasePricing";
export function GuestAccountPanel({ cartId }: { cartId?: string }) {
  const [active, setActive] = useState(!cartId),
    [state, setState] = useState(INITIAL_GUEST_ACCOUNT),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [mode, setMode] = useState<"signin" | "signup">("signin");
  const flow = useRef<ReturnType<typeof createGuestAccountClient> | null>(null);
  useEffect(() => {
    if (!active) return;
    const current = createGuestAccountClient({
      auth: supabase.auth,
      cartId,
      origin: window.location.origin,
      fetchImpl: (input, init) => fetch(input, init),
      publish: setState,
    });
    flow.current = current;
    // No account creation/sign-in/save occurs on mount or an Auth event.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      current.sessionChanged();
      clearTimeout(timer);
      timer = setTimeout(() => {
        void current.observe();
      }, 0);
    });
    void current.open();
    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
      current.dispose();
      flow.current = null;
    };
  }, [active, cartId]);
  useEffect(() => {
    if (cartId || !state.account?.id) return;
    const timer = setTimeout(() => {
      void flow.current?.load();
    }, 0);
    return () => clearTimeout(timer);
  }, [cartId, state.account?.id]);
  if (!active)
    return (
      <section className="checkout-section">
        <h2>Keep your tickets in an account</h2>
        <p className="checkout-note">Optional. Email ticket access works without registration.</p>
        <Button className="checkout-action checkout-secondary" onClick={() => setActive(true)}>
          Save to an account (optional)
        </Button>
      </section>
    );
  return (
    <section aria-label="Optional ticket account" className="checkout-section">
      <h2>{cartId ? "Save this purchase to an account" : "Saved guest purchases"}</h2>
      <p className="checkout-note">
        Saving adds account access; it does not transfer tickets or change the original buyer. Email
        access remains available.
      </p>
      <p role="status" aria-live="polite" className="checkout-status">
        {state.message}
      </p>
      {state.account ? (
        <>
          <p>Signed in as {state.account.email}</p>
          {cartId ? (
            <Button
              className="checkout-action checkout-primary"
              disabled={state.phase === "loading" || state.phase === "saved"}
              onClick={() => {
                void flow.current?.save();
              }}
            >
              Save this purchase to this account
            </Button>
          ) : null}
          {!cartId ? (
            <Button
              className="checkout-action checkout-secondary"
              disabled={state.phase === "loading"}
              onClick={() => {
                void flow.current?.load();
              }}
            >
              Refresh saved purchases
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => {
              void flow.current?.signOut();
            }}
          >
            Sign out of account
          </Button>
        </>
      ) : state.phase === "form" ? (
        <form
          className="checkout-form"
          onSubmit={(e) => {
            e.preventDefault();
            void flow.current?.credentials(mode, email, password);
            setPassword("");
          }}
        >
          <label htmlFor="optional-account-email">Account email</label>
          <input
            id="optional-account-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="optional-account-password">Account password</label>
          <input
            id="optional-account-password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="checkout-action checkout-primary">
            {mode === "signup" ? "Create optional TEST account" : "Sign in to TEST account"}
          </Button>
          {cartId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPassword("");
                setMode(mode === "signup" ? "signin" : "signup");
              }}
            >
              {mode === "signup"
                ? "Use an existing account instead"
                : "Create a new account instead"}
            </Button>
          ) : null}
          <p className="checkout-note">
            Use synthetic @example.test accounts only. New accounts may require email verification.
            An existing email is never enough to claim tickets.
          </p>
        </form>
      ) : null}
      {state.phase === "unavailable" ? (
        <Button
          variant="outline"
          onClick={() => {
            void flow.current?.open();
          }}
        >
          Retry optional account access
        </Button>
      ) : null}
      {state.phase === "saved" ? (
        <p>
          <a href="/tickets/account">Open saved guest purchases</a>
        </p>
      ) : null}
      {state.purchases.map((p) => (
        <div className="checkout-section" key={p.cartId}>
          <h3>{p.eventName}</h3>
          <p className="checkout-note">
            {p.quantity} · {p.ticketTypeName}
          </p>
          <Button
            variant="outline"
            disabled={state.phase === "loading"}
            onClick={() => {
              void flow.current?.select(p.cartId);
            }}
          >
            Open saved purchase
          </Button>
        </div>
      ))}
      {state.offset > 0 ? (
        <Button
          variant="outline"
          onClick={() => {
            void flow.current?.load(state.offset - 20);
          }}
        >
          Newer purchases
        </Button>
      ) : null}
      {state.hasMore ? (
        <Button
          variant="outline"
          onClick={() => {
            void flow.current?.load(state.offset + 20);
          }}
        >
          Older purchases
        </Button>
      ) : null}
      {state.purchase && state.token ? (
        <section className="checkout-section">
          <h3>Confirmed purchase</h3>
          <GuestPurchasePricing purchase={state.purchase} />
          {state.purchase.tickets[0]?.eventStartsAt && state.purchase.tickets[0].eventTimezone ? (
            <p className="checkout-note">
              {catalogDate(
                state.purchase.tickets[0].eventStartsAt,
                state.purchase.tickets[0].eventTimezone,
              )}
            </p>
          ) : null}
          {state.purchase.unavailableTickets ? (
            <p className="checkout-note">
              {state.purchase.unavailableTickets} ticket(s) are no longer owned by this purchase
              session. Recipient details are not shown.
            </p>
          ) : null}
          <GuestAdmissionPass
            key={state.token + state.purchase.cartId}
            token={state.token}
            accountCartId={state.purchase.cartId}
            tickets={state.purchase.tickets}
          />
        </section>
      ) : null}
    </section>
  );
}
