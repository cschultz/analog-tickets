import { useEffect, useState } from "react";
import { createOwnerPassController, INITIAL_OWNER_PASS } from "@/lib/owner-pass-client";
import { showGuestPass } from "@/lib/guest-pass-display";
import { OwnerPassQr } from "./owner-pass-qr";
import type { OwnerTicket } from "@/lib/owner-tickets-core";
import { Button } from "./ui/button";

export function GuestAdmissionPass({
  token,
  tickets,
  recovered = false,
  accountCartId,
}: {
  token: string;
  tickets: OwnerTicket[];
  recovered?: boolean;
  accountCartId?: string;
}) {
  const [state, setState] = useState(INITIAL_OWNER_PASS);
  const [controller, setController] = useState<ReturnType<typeof createOwnerPassController> | null>(
    null,
  );
  useEffect(() => {
    const flow = createOwnerPassController(setState, (input, init) => {
      if (accountCartId)
        return fetch("/api/public/guest-account-pass", {
          ...init,
          body: JSON.stringify({
            ...(JSON.parse(String(init?.body)) as Record<string, unknown>),
            cartId: accountCartId,
          }),
        });
      if (!recovered) return fetch(input, init);
      const headers = new Headers(init?.headers);
      headers.delete("authorization");
      return fetch("/api/public/guest-recovery-pass", {
        ...init,
        headers,
        credentials: "same-origin",
      });
    });
    flow.session(token);
    setController(flow);
    const hide = () => flow.hide();
    const visibility = () => {
      if (document.visibilityState !== "visible") hide();
    };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
      flow.dispose();
    };
  }, [token, recovered, accountCartId]);
  return (
    <section aria-label="Your admission passes" className="checkout-section">
      <h2>Your admission passes</h2>
      <p className="checkout-note">
        Show a pass to door staff. Refunded, transferred or checked-in tickets cannot be used for
        another admission.
      </p>
      {tickets.map((ticket, index) => (
        <div key={ticket.ticketId} className="checkout-section">
          <h3>
            Ticket {index + 1} · {ticket.ticketTypeName}
          </h3>
          <p className="checkout-note">
            {ticket.status === "void" || ticket.status === "refunded"
              ? "Not valid for entry"
              : ticket.checkedInAt
                ? "Already checked in"
                : ticket.status === "issued"
                  ? "Ready to show at the door"
                  : "Status unavailable"}
          </p>
          {ticket.status === "issued" && !ticket.checkedInAt ? (
            <Button
              type="button"
              className="checkout-action checkout-secondary"
              disabled={!controller || state.phase === "loading"}
              onClick={() => {
                if (controller) void showGuestPass(controller, ticket.ticketId);
              }}
            >
              Show pass for ticket {index + 1}
            </Button>
          ) : null}
        </div>
      ))}
      <p role="status" aria-live="polite" className="checkout-note">
        {state.phase === "loading"
          ? "Preparing your pass…"
          : state.phase === "uncertain"
            ? "The pass could not be confirmed. Check its current state before replacing it."
            : state.phase === "state_changed"
              ? "The pass changed. Select your ticket again to check the current state."
              : state.phase === "not_eligible"
                ? "This ticket is no longer eligible. Refresh purchase status."
                : state.phase === "ready" && state.replacing
                  ? "An existing pass will be invalidated if you replace it."
                  : " "}
      </p>
      {state.phase === "ready" && state.replacing ? (
        <Button
          type="button"
          className="checkout-action checkout-secondary"
          onClick={() => {
            void controller?.issue(true);
          }}
        >
          Replace existing pass and invalidate its old code
        </Button>
      ) : null}
      {state.phase === "shown" && state.code ? (
        <div className="checkout-section">
          <OwnerPassQr code={state.code} />
          <p>Manual door code</p>
          <code className="block break-all">{state.code}</code>
          <p className="checkout-note">
            Keep this code private. It is hidden after two minutes or when you leave this page.
          </p>
          <Button type="button" variant="outline" onClick={() => controller?.hide()}>
            Hide pass
          </Button>
        </div>
      ) : null}
    </section>
  );
}
