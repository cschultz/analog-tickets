import type { GuestConfirmationState } from "@/lib/guest-confirmation-client";
import { CheckoutShell } from "./CheckoutShell";
import { Button } from "./ui/button";
import { catalogDate } from "@/lib/event-catalog-core";
import { GuestAdmissionPass } from "./GuestAdmissionPass";
import { GuestPurchasePricing } from "./GuestPurchasePricing";

export function GuestPurchaseConfirmationView({
  state,
  token,
  refresh,
}: {
  state: GuestConfirmationState;
  token: string | null;
  refresh(): void;
}) {
  const result = state.phase === "ready" ? state.result : null;
  const confirmed = result?.status === "confirmed" ? result : null;
  return (
    <CheckoutShell
      title={confirmed ? "Your TEST tickets" : "Your TEST purchase"}
      currentStep="Tickets"
      steps={["Details", "Payment", "Tickets"]}
      summary={
        confirmed ? (
          <>
            <h2>Purchase summary</h2>
            <GuestPurchasePricing purchase={confirmed} />
          </>
        ) : (
          <>
            <h2>Checking this purchase</h2>
            <p className="checkout-note">
              Returning here does not confirm a payment. We check the saved purchase against the
              server.
            </p>
          </>
        )
      }
    >
      <p role="status" aria-live="polite" className="checkout-status">
        {confirmed
          ? "Your purchase is confirmed. Your current tickets are below."
          : state.phase === "session-missing"
            ? "This browser no longer has the session for this purchase. No payment or ticket status has been confirmed."
            : state.phase === "reference-missing"
              ? "No saved purchase reference is available in this tab. Do not start another payment to recover tickets."
              : state.phase === "unavailable"
                ? "We could not check this purchase. Its outcome is uncertain; do not pay again."
                : result?.status === "pending"
                  ? "Waiting for payment confirmation. If you have paid, do not pay again."
                  : result?.status === "missing"
                    ? "The saved purchase was not found for this session. No payment or ticket outcome is confirmed."
                    : result?.status === "review"
                      ? "This purchase needs reconciliation. Do not start another payment; contact the organizer."
                      : "Checking your saved purchase…"}
      </p>
      {confirmed ? (
        <>
          {confirmed.tickets[0] ? (
            <div className="checkout-section">
              <h2>{confirmed.tickets[0].eventName}</h2>
              {confirmed.tickets[0].eventStartsAt && confirmed.tickets[0].eventTimezone ? (
                <p className="checkout-note">
                  {catalogDate(
                    confirmed.tickets[0].eventStartsAt,
                    confirmed.tickets[0].eventTimezone,
                  )}
                </p>
              ) : null}
              {confirmed.tickets[0].venueName ? (
                <p className="checkout-note">{confirmed.tickets[0].venueName}</p>
              ) : null}
            </div>
          ) : null}
          {confirmed.unavailableTickets ? (
            <p className="checkout-note">
              {confirmed.unavailableTickets} purchased ticket(s) are no longer owned by this
              session. Their passes and recipient details are not displayed.
            </p>
          ) : null}
          {token && confirmed.tickets.length ? (
            <GuestAdmissionPass key={token} token={token} tickets={confirmed.tickets} />
          ) : null}
        </>
      ) : null}
      {state.phase !== "loading" &&
      state.phase !== "idle" &&
      state.phase !== "reference-missing" &&
      state.phase !== "session-missing" ? (
        <Button type="button" className="checkout-action checkout-secondary" onClick={refresh}>
          Refresh purchase status
        </Button>
      ) : null}
      <p className="checkout-note checkout-section">
        For another device, <a href="/tickets/recover">request a fresh ticket-access email</a>. No
        account registration is required. TEST email access must be configured separately; this
        screen does not claim a message was delivered.
      </p>
    </CheckoutShell>
  );
}
