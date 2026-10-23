/** Static return screen. URL/navigation is not evidence of payment or issuance. */
import type { CheckoutReturnKind } from "@/lib/checkout-return-head";
import { CheckoutShell } from "@/components/CheckoutShell";
import { Button } from "@/components/ui/button";
export function CheckoutReturnView({ kind }: { kind: CheckoutReturnKind }) {
  return (
    <CheckoutShell
      title={
        kind === "complete" ? "Returned from TEST checkout" : "TEST checkout cancellation return"
      }
    >
      <p className="checkout-note checkout-section">
        {kind === "complete"
          ? "You returned from the test checkout. This page cannot confirm payment or ticket availability."
          : "You returned through the cancellation link. This page cannot confirm that payment stopped or that your reservation was released."}
      </p>
      <section aria-labelledby="checkout-next-step" className="checkout-section">
        <h2 id="checkout-next-step">Check your tickets separately</h2>
        <p className="checkout-note checkout-section">
          Sign in to the same account and deliberately refresh ticket recovery. If no ticket
          appears, the outcome may still be pending or unavailable; it is not proof of failure. A
          ticket shown there may belong to an earlier purchase.
        </p>
        <Button
          asChild
          variant="outline"
          className="checkout-action checkout-secondary checkout-ticket-link"
        >
          <a href="/my-tickets" rel="noreferrer">
            Open private ticket recovery
          </a>
        </Button>
      </section>
      <section aria-labelledby="checkout-uncertain" className="checkout-section">
        <h2 id="checkout-uncertain">If the outcome is uncertain</h2>
        <p className="checkout-note checkout-section">
          Ask the operator to reconcile the existing checkout before starting another one. Returning
          here or reloading does not cancel a reservation, retry a payment, create tickets, or
          confirm fulfillment. This page performs no status checks or backend actions.
        </p>
        <p className="checkout-note checkout-section">
          Private synthetic testing only. Do not complete payment without separate approval.
        </p>
      </section>
    </CheckoutShell>
  );
}
