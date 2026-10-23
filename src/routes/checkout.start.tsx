import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/public-supabase-client";
import { catalogDate, catalogPrice } from "@/lib/event-catalog-core";
import {
  publicCheckoutSelection,
  selectedTierId,
  testCheckoutStorageKey,
  type PublicCheckoutSelection,
} from "@/lib/attendee-test-checkout-core";
import { createOwnedCheckoutFlow } from "@/lib/owned-checkout-client";
import { CheckoutShell } from "@/components/CheckoutShell";
import { Button } from "@/components/ui/button";
import { GuestCheckout } from "@/components/GuestCheckout";
import { PromoGuestCheckout } from "@/components/PromoGuestCheckout";
import { promoCheckoutStorageKey } from "@/lib/guest-promo-client";

export const Route = createFileRoute("/checkout/start")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ticketTypeId: selectedTierId(search["ticketTypeId"]),
  }),
  head: () => ({
    meta: [
      { title: "Analog Tickets — Private TEST checkout preview" },
      {
        name: "description",
        content:
          "Private synthetic ticket checkout. Ticket amount is shown separately from the final Stripe total; no real admission.",
      },
      { property: "og:title", content: "Analog Tickets — Private TEST checkout preview" },
      {
        property: "og:description",
        content: "Private synthetic ticket checkout. No real admission or payment confirmation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: TestCheckoutEntry,
});

type SelectionState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "missing" }
  | { status: "ready"; selection: PublicCheckoutSelection };

function TestCheckoutEntry() {
  const { ticketTypeId } = Route.useSearch();
  const [state, setState] = useState<SelectionState>({ status: "loading" });
  useEffect(() => {
    if (!ticketTypeId) {
      setState({ status: "missing" });
      return;
    }
    let active = true;
    setState({ status: "loading" });
    void (async () => {
      try {
        // Browser reads are deliberately limited to public catalog columns.
        // RLS and grants remain the access boundary; the server rechecks the
        // selected tier, inventory and monetary facts before any write.
        const tierResult = await supabase
          .from("ticket_types")
          .select(
            "id,event_id,name,description,price_cents,currency,sort_order,is_active,max_per_order",
          )
          .eq("id", ticketTypeId)
          .eq("is_active", true)
          .maybeSingle();
        if (tierResult.error) throw new Error("tier_unavailable");
        if (!tierResult.data) {
          if (active) setState({ status: "missing" });
          return;
        }
        const eventResult = await supabase
          .from("events")
          .select("id,slug,name,description,venue_name,starts_at,timezone,is_published")
          .eq("id", tierResult.data.event_id)
          .eq("is_published", true)
          .maybeSingle();
        if (eventResult.error) throw new Error("event_unavailable");
        const selection = publicCheckoutSelection(eventResult.data, tierResult.data);
        if (active) setState(selection ? { status: "ready", selection } : { status: "missing" });
      } catch {
        if (active) setState({ status: "unavailable" });
      }
    })();
    return () => {
      active = false;
    };
  }, [ticketTypeId]);

  if (state.status === "ready") {
    return <CheckoutExperience key={state.selection.tier.id} selection={state.selection} />;
  }
  return (
    <CheckoutShell
      currentStep="Account"
      summary={
        <>
          <h2>Order summary</h2>
          <p className="checkout-note">
            {state.status === "loading" ? "Loading ticket option…" : "No ticket option available."}
          </p>
        </>
      }
    >
      <p className="checkout-note checkout-intro">
        One ticket for an existing synthetic account only. No live payments or real recipients. This
        preview does not establish a completed purchase or public-release readiness.
      </p>
      {state.status === "loading" ? (
        <p role="status" className="checkout-status">
          Loading ticket option…
        </p>
      ) : state.status === "unavailable" ? (
        <p role="alert" className="checkout-status">
          Ticket options are temporarily unavailable.
        </p>
      ) : (
        <p role="status" className="checkout-status">
          This ticket option is not available.
        </p>
      )}
    </CheckoutShell>
  );
}

function CheckoutExperience({ selection }: { selection: PublicCheckoutSelection }) {
  const [guest, setGuest] = useState<boolean | null | "unavailable">(null);
  const [pricing, setPricing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      setGuest("unavailable");
    }, 8000);
    void fetch("/api/public/guest-checkout-config", { signal: controller.signal })
      .then(async (response) => {
        const data: unknown = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) {
          const enabled =
            data && typeof data === "object" && !Array.isArray(data)
              ? (data as Record<string, unknown>)["enabled"]
              : undefined;
          setGuest(typeof enabled === "boolean" ? enabled : "unavailable");
          setPricing(
            Boolean(
              enabled === true &&
              data &&
              typeof data === "object" &&
              (data as Record<string, unknown>)["pricingEnabled"] === true,
            ),
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setGuest("unavailable");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  if (guest === null)
    return (
      <CheckoutShell>
        <p role="status">Loading checkout…</p>
      </CheckoutShell>
    );
  if (guest === "unavailable")
    return (
      <CheckoutShell>
        <p role="alert">Checkout is temporarily unavailable. Please try again later.</p>
      </CheckoutShell>
    );
  // Preserve a pending legacy checkout when the feature is activated later.
  // Never reinterpret its reference as a new priced cart or silently replace it.
  let legacyPending = false;
  if (guest && pricing && typeof window !== "undefined") {
    try {
      legacyPending =
        sessionStorage.getItem(`analog-guest-purchase-v1:${selection.tier.id}`) !== null &&
        sessionStorage.getItem(promoCheckoutStorageKey(selection.tier.id)) === null;
    } catch {
      /* The promo controller will report unavailable storage and stop. */
    }
  }
  return guest && pricing && !legacyPending ? (
    <PromoGuestCheckout selection={selection} />
  ) : guest ? (
    <GuestCheckout selection={selection} />
  ) : (
    <SelectedTierCheckout selection={selection} />
  );
}

function SelectedTierCheckout({ selection }: { selection: PublicCheckoutSelection }) {
  const tierId = selection.tier.id;
  const flow = useMemo(
    () =>
      createOwnedCheckoutFlow({
        ticketTypeId: tierId,
        requireDiscovery: true,
        getToken: async (accountId) => {
          const { data } = await supabase.auth.getSession();
          return data.session?.user.id === accountId ? data.session.access_token : null;
        },
        fetchImpl: (path, init) => fetch(path, init),
        persistence: {
          read: (accountId) => {
            const saved = sessionStorage.getItem(testCheckoutStorageKey(accountId, tierId));
            return saved === null ? null : JSON.parse(saved);
          },
          write: (accountId, value) => {
            sessionStorage.setItem(
              testCheckoutStorageKey(accountId, tierId),
              JSON.stringify(value),
            );
          },
        },
      }),
    [tierId],
  );
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let authChanged = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      flow.setAccount(session?.user.id ?? null);
      setAuthReady(true);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled && !authChanged) flow.setAccount(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (!cancelled && !authChanged) flow.setAccount(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    const timer = setInterval(flow.refresh, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.unsubscribe();
      flow.setAccount(null);
    };
  }, [flow]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (signingIn || !email.trim().toLowerCase().endsWith("@example.test") || !password) {
      setAuthMessage("Use an existing synthetic @example.test account.");
      return;
    }
    setSigningIn(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setAuthMessage(
        error ? "Sign-in was not accepted." : "Signed in. Inspect your checkout first.",
      );
    } catch {
      setAuthMessage("Sign-in is unavailable.");
    } finally {
      setPassword("");
      setSigningIn(false);
    }
  }

  return (
    <CheckoutShell
      currentStep={
        state.phase === "signed_out" || !authReady
          ? "Account"
          : state.redirectUrl
            ? "Stripe TEST checkout"
            : "Reservation"
      }
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
              <dd>1</dd>
            </div>
            <div className="checkout-subtotal">
              <dt>Ticket amount</dt>
              <dd className="checkout-money">
                {catalogPrice(selection.tier.price_cents, selection.tier.currency)}{" "}
                {selection.tier.currency.toUpperCase()}
              </dd>
            </div>
          </dl>
          <p className="checkout-note">The final total is shown by Stripe before payment.</p>
          <p className="checkout-note">Synthetic TEST ticket only. No real admission.</p>
        </>
      }
    >
      <p className="checkout-note checkout-intro">
        One ticket for an existing synthetic account only. No live payments or real recipients. This
        preview does not establish a completed purchase or public-release readiness.
      </p>
      {!authReady ? (
        <p role="status" className="checkout-status">
          Checking your session…
        </p>
      ) : state.phase === "signed_out" ? (
        <form onSubmit={signIn} className="checkout-form" aria-describedby="checkout-auth-hint">
          <h2>Sign in to a synthetic test account</h2>
          <p id="checkout-auth-hint" className="checkout-note">
            Use an existing synthetic @example.test account.
          </p>
          <label htmlFor="checkout-email">Email</label>
          <input
            id="checkout-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={authMessage ? "checkout-auth-message" : "checkout-auth-hint"}
            aria-invalid={
              authMessage === "Use an existing synthetic @example.test account." ||
              authMessage === "Sign-in was not accepted." ||
              undefined
            }
          />
          <label htmlFor="checkout-password">Password</label>
          <input
            id="checkout-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={authMessage ? "checkout-auth-message" : undefined}
            aria-invalid={authMessage === "Sign-in was not accepted." || undefined}
          />
          <Button type="submit" disabled={signingIn} className="checkout-action checkout-primary">
            Sign in
          </Button>
          {authMessage ? (
            <p id="checkout-auth-message" role="status" aria-live="polite">
              {authMessage}
            </p>
          ) : null}
        </form>
      ) : (
        <section className="checkout-section" aria-labelledby="checkout-steps">
          <div className="checkout-section-header">
            <h2 id="checkout-steps">Your TEST checkout</h2>
            <Button
              variant="link"
              type="button"
              onClick={() => {
                void supabase.auth.signOut();
              }}
              className="checkout-text-action"
            >
              Sign out
            </Button>
          </div>
          <p className="checkout-note">
            Inspect your existing reservation before starting another. Every action is deliberate;
            there is no automatic retry or payment.
          </p>
          <div className="checkout-actions">
            <Button
              variant="outline"
              type="button"
              disabled={!state.canInspect}
              onClick={() => {
                void flow.inspectOriginal();
              }}
              className="checkout-action checkout-secondary"
            >
              Check existing checkout
            </Button>
            <Button
              type="button"
              disabled={!state.canPrepare}
              onClick={() => {
                void flow.prepare();
              }}
              className="checkout-action checkout-primary"
            >
              Reserve one TEST ticket
            </Button>
            <Button
              type="button"
              disabled={!state.canStart}
              onClick={() => {
                void flow.start();
              }}
              className="checkout-action checkout-primary"
            >
              Start linked TEST checkout
            </Button>
          </div>
          <p role="status" aria-live="polite" className="checkout-status">
            {state.message}
          </p>
          {state.expiresAt ? (
            <p className="checkout-deadline">
              Reservation deadline:{" "}
              <time dateTime={state.expiresAt}>
                {new Date(state.expiresAt).toLocaleTimeString()}
              </time>
              .
              <span className="checkout-note">
                {" "}
                This is not proof that the provider session has expired.
              </span>
            </p>
          ) : null}
          <details className="checkout-recovery">
            <summary>Recover an existing checkout</summary>
            <div className="checkout-actions">
              <Button
                variant="outline"
                type="button"
                disabled={!state.canResume}
                onClick={() => {
                  void flow.resume();
                }}
                className="checkout-action checkout-secondary"
              >
                Recover the same checkout
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={!state.canRecoverExpired}
                onClick={() => {
                  void flow.recoverExpired();
                }}
                className="checkout-action checkout-secondary"
              >
                Check expired reservation
              </Button>
            </div>
          </details>
          {state.redirectUrl ? (
            <Button asChild className="checkout-action checkout-primary checkout-ticket-link">
              <a href={state.redirectUrl} rel="noreferrer">
                Open Stripe TEST checkout link
              </a>
            </Button>
          ) : null}
          <p className="checkout-note checkout-section">
            A checkout return is not proof of payment or ticket issuance. View your owned tickets
            separately after the signed webhook has been processed. If the outcome is uncertain,
            stop and reconcile this attempt before trying again.
          </p>
          <a href="/my-tickets" className="checkout-ticket-link">
            View my TEST tickets
          </a>
        </section>
      )}
      <p className="checkout-payment-note">
        Payment handled by Stripe. The final total is shown by Stripe before payment. Do not
        complete payment without separate approval.
      </p>
    </CheckoutShell>
  );
}
