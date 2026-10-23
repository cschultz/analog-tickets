import type { OwnedCheckoutViewState } from "@/lib/owned-checkout-client";

export function OwnedCheckoutView({
  state,
  prepare,
  start,
  resume,
  recoverExpired,
  inspectOriginal,
}: {
  state: OwnedCheckoutViewState;
  prepare: () => void;
  start: () => void;
  resume: () => void;
  recoverExpired: () => void;
  inspectOriginal: () => void;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-xl bg-background px-4 py-8 text-foreground">
      <h1 className="text-2xl font-semibold">Private synthetic checkout</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Source test harness only. Use the approved synthetic account and test sequence. This page
        does not authorize provider actions. Do not complete payment.
      </p>
      <p className="mt-3 text-sm">
        One synthetic ticket. Prices and ownership are determined by the server.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <button
          className="min-h-11 rounded border p-3 text-left disabled:opacity-50"
          disabled={!state.canInspect}
          onClick={inspectOriginal}
        >
          Find my original checkout
        </button>
        <button
          className="min-h-11 rounded border p-3 text-left disabled:opacity-50"
          disabled={!state.canPrepare}
          onClick={prepare}
        >
          1. Prepare reservation
        </button>
        <button
          className="min-h-11 rounded border p-3 text-left disabled:opacity-50"
          disabled={!state.canStart}
          onClick={start}
        >
          2. Start linked test checkout
        </button>
        <button
          className="min-h-11 rounded border p-3 text-left disabled:opacity-50"
          disabled={!state.canResume}
          onClick={resume}
        >
          Recover the same checkout
        </button>
        <button
          className="min-h-11 rounded border p-3 text-left disabled:opacity-50"
          disabled={!state.canRecoverExpired}
          onClick={recoverExpired}
        >
          Check expired reservation recovery
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-5 text-sm wrap-anywhere">
        {state.message}
      </p>
      {state.expiresAt ? (
        <p className="mt-3 text-sm">
          Reservation deadline:{" "}
          <time dateTime={state.expiresAt}>{new Date(state.expiresAt).toLocaleTimeString()}</time>.
          This is not proof that the provider session has expired.
        </p>
      ) : null}
      {state.redirectUrl ? (
        <a
          className="mt-4 inline-block min-h-11 rounded border p-3 wrap-anywhere"
          href={state.redirectUrl}
          rel="noopener noreferrer"
        >
          Continue manually to unpaid test checkout
        </a>
      ) : null}
      <p className="mt-6 text-sm text-muted-foreground">
        No automatic retries, replacement checkout, payment completion or navigation. Inspection
        reads this account's unresolved local records but does not prove provider status. The tab
        also keeps the original synthetic reference across reloads. Changing accounts hides the
        other account's recovery state. Ask the operator about any uncertainty.
      </p>
    </main>
  );
}
