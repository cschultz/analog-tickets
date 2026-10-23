import { ticketStatusLabel, type RecoveryState } from "@/lib/owner-ticket-recovery";
import type { OwnerTicket } from "@/lib/owner-tickets-core";

function eventTimeLabel(ticket: OwnerTicket): string {
  if (!ticket.eventStartsAt || !ticket.eventTimezone)
    return "Time not listed — confirm with the organizer before attending";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: ticket.eventTimezone,
      timeZoneName: "short",
    }).format(new Date(ticket.eventStartsAt));
  } catch {
    return "Time not listed — confirm with the organizer before attending";
  }
}

/** Rendering only: no auth client, network call or admission code. */
export function RecoveryView({
  state,
  refresh,
  previous,
  next,
  selectPass,
}: {
  state: RecoveryState;
  refresh: () => void;
  previous: () => void;
  next: () => void;
  selectPass?: (ticketId: string) => void;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">My tickets — private preview</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Read-only ticket recovery for synthetic accounts. This list is not an admission pass.
        {selectPass
          ? " A synthetic pass can be created separately below with explicit confirmation."
          : " No QR or door code is displayed."}
      </p>
      <p role="status" aria-live="polite" className="mt-6">
        {state.phase === "checking"
          ? "Checking your session…"
          : state.phase === "signed-out"
            ? "Sign in below with an existing synthetic account, then load your tickets."
            : state.phase === "loading"
              ? "Loading your tickets…"
              : state.phase === "unavailable"
                ? "Tickets are unavailable. Check your session and try again. No payment or ticket change has been made."
                : state.phase === "idle"
                  ? "Your session is ready. Load your tickets below."
                  : state.tickets.length
                    ? "Your recorded tickets"
                    : "No tickets found on this page. This does not confirm a payment failed; issuance may still be pending or a ticket may have been transferred."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-11 rounded border px-4 py-2 disabled:opacity-50"
          disabled={!state.canLoad || state.phase === "loading"}
          onClick={refresh}
        >
          Refresh tickets
        </button>
        <a href="/" className="inline-flex min-h-11 items-center rounded border px-4 py-2">
          Browse TEST events
        </a>
      </div>
      {state.phase === "ready" && (
        <>
          <ul className="mt-6 space-y-4" aria-label="Your tickets">
            {state.tickets.map((ticket) => (
              <li key={ticket.ticketId} className="rounded-lg border p-4">
                <h2 className="wrap-anywhere font-semibold">{ticket.eventName}</h2>
                <p className="wrap-anywhere">{ticket.ticketTypeName}</p>
                <p className="mt-2 wrap-anywhere">When: {eventTimeLabel(ticket)}</p>
                <p className="wrap-anywhere">
                  Venue: {ticket.venueName ?? "Not listed — confirm with the organizer"}
                </p>
                <p className="mt-2">{ticketStatusLabel(ticket)}</p>
                {selectPass && ticket.status === "issued" && !ticket.checkedInAt && (
                  <button
                    type="button"
                    className="mt-3 min-h-11 rounded border px-4 py-2"
                    onClick={() => selectPass(ticket.ticketId)}
                  >
                    Select for synthetic pass
                  </button>
                )}
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Ticket reference (not a pass): {ticket.ticketId}
                </p>
              </li>
            ))}
          </ul>
          <nav aria-label="Ticket pages" className="mt-6 flex items-center gap-3">
            <button
              type="button"
              className="min-h-11 rounded border px-4 py-2 disabled:opacity-50"
              disabled={state.offset === 0}
              onClick={previous}
            >
              Previous
            </button>
            <span>Page {Math.floor(state.offset / 20) + 1}</span>
            <button
              type="button"
              className="min-h-11 rounded border px-4 py-2 disabled:opacity-50"
              disabled={!state.hasMore}
              onClick={next}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </main>
  );
}
