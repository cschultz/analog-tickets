import { useEffect, useState } from "react";
import { supabase } from "@/lib/public-supabase-client";
import {
  createGuestConfirmation,
  INITIAL_GUEST_CONFIRMATION,
} from "@/lib/guest-confirmation-client";
import { GUEST_RETURN_REFERENCE_KEY } from "@/lib/guest-purchase-reference";
import { GuestPurchaseConfirmationView } from "./GuestPurchaseConfirmationView";
import { CheckoutReturnView } from "./CheckoutReturnView";
import { CheckoutShell } from "./CheckoutShell";
import type { CheckoutReturnKind } from "@/lib/checkout-return-head";

/** URL parameters and return kind never select or confirm a purchase. */
export function GuestCheckoutReturn({ kind }: { kind: CheckoutReturnKind }) {
  const [enabled, setEnabled] = useState<boolean | null | "unavailable">(null);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
      setEnabled("unavailable");
    }, 8000);
    void fetch("/api/public/guest-checkout-config", { signal: abort.signal, cache: "no-store" })
      .then(async (r) => {
        const body: unknown = r.ok ? await r.json() : null;
        const enabled =
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>)["enabled"]
            : null;
        if (!abort.signal.aborted)
          setEnabled(typeof enabled === "boolean" ? enabled : "unavailable");
      })
      .catch(() => {
        if (!abort.signal.aborted) setEnabled("unavailable");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, []);
  if (enabled === false) return <CheckoutReturnView kind={kind} />;
  if (enabled === true) return <GuestReturnStatus />;
  return (
    <CheckoutShell title="Your TEST purchase">
      <p role="status">
        {enabled === "unavailable"
          ? "Purchase status is unavailable. Do not start another payment."
          : "Checking checkout availability. Payment is not confirmed."}
      </p>
    </CheckoutShell>
  );
}

function GuestReturnStatus() {
  const [state, setState] = useState(INITIAL_GUEST_CONFIRMATION);
  const [token, setToken] = useState<string | null>(null);
  const [flow, setFlow] = useState<ReturnType<typeof createGuestConfirmation> | null>(null);
  useEffect(() => {
    const current = createGuestConfirmation({
      readReference: () =>
        JSON.parse(sessionStorage.getItem(GUEST_RETURN_REFERENCE_KEY) ?? "null") as unknown,
      publish: setState,
      fetchImpl: (input, init) => fetch(input, init),
    });
    setFlow(current);
    let observed = false,
      closed = false;
    const session = (s: { user: { id: string }; access_token: string } | null) => {
      if (closed) return;
      setToken(s?.access_token ?? null);
      current.session(s ? { ownerId: s.user.id, token: s.access_token } : null);
    };
    const timer = setTimeout(() => {
      if (!closed && !observed) {
        observed = true;
        session(null);
      }
    }, 12000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      observed = true;
      clearTimeout(timer);
      session(s);
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!observed && !closed) {
          observed = true;
          clearTimeout(timer);
          session(error ? null : data.session);
        }
      })
      .catch(() => {
        if (!observed && !closed) {
          observed = true;
          clearTimeout(timer);
          session(null);
        }
      });
    return () => {
      closed = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      current.dispose();
    };
  }, []);
  return (
    <GuestPurchaseConfirmationView
      state={state}
      token={token}
      refresh={() => {
        void flow?.refresh();
      }}
    />
  );
}
