import { useState } from "react";
import type { OwnerPassState } from "@/lib/owner-pass-client";
import { OwnerPassQr } from "./owner-pass-qr";

export function OwnerPassView({
  state,
  inspect,
  issue,
  hide,
}: {
  state: OwnerPassState;
  inspect: () => void;
  issue: (confirmed: boolean) => void;
  hide: () => void;
}) {
  const [consentFor, setConsentFor] = useState<OwnerPassState | null>(null);
  const confirmed = consentFor === state;
  return (
    <section aria-label="Private admission pass" className="mx-auto max-w-2xl px-6 pb-10">
      <h2 className="text-xl font-semibold">Synthetic admission pass — private preview</h2>
      {state.ticketId && (
        <p className="mt-3">
          Selected ticket reference (not a pass):{" "}
          <span className="block break-all">{state.ticketId}</span>
        </p>
      )}
      <p className="mt-3">
        Select an issued ticket above. Checking its pass state is read-only. Creating or replacing a
        pass changes the synthetic ticket; replacement invalidates the previous code.
      </p>
      <p role="status" aria-live="polite" className="mt-3">
        {state.phase === "shown"
          ? "Code shown briefly. Door validation is authoritative; transfers, refunds or replacement can invalidate it."
          : state.phase === "uncertain"
            ? "Outcome uncertain. A pass may have been created. Check current state before deciding to replace it; do not blindly retry."
            : state.phase === "state_changed"
              ? "That pass attempt was not applied. Check the current pass state again before deciding to create or replace it."
              : state.phase === "not_eligible"
                ? "Pass unavailable for this ticket. Refresh your tickets."
                : state.phase === "ready"
                  ? state.replacing
                    ? "An active pass exists. Its raw code cannot be recovered. Replacement invalidates it."
                    : "No active pass found. Explicit confirmation is required to create one."
                  : state.phase === "loading"
                    ? "Checking or creating pass…"
                    : "No pass is displayed."}
      </p>
      {state.phase === "shown" && state.code && (
        <div className="mt-4 rounded border p-4">
          <p>Show this QR to authorized door staff:</p>
          <OwnerPassQr code={state.code} />
          <p>Manual door code:</p>
          <code className="block break-all text-lg">{state.code}</code>
          <p className="mt-2 text-sm">
            Do not share or screenshot. Kept in memory only; hidden after two minutes, account
            changes, or leaving this page.
          </p>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          className="min-h-11 rounded border px-4 py-2 disabled:opacity-50"
          disabled={!state.canInspect}
          onClick={inspect}
        >
          Check current pass state
        </button>
        {state.canIssue && (
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConsentFor(e.target.checked ? state : null)}
            />
            I authorize{" "}
            {state.replacing
              ? "replacement and invalidation of the previous pass"
              : "creation of this synthetic pass"}
            .
          </label>
        )}
        <button
          type="button"
          className="min-h-11 rounded border px-4 py-2 disabled:opacity-50"
          disabled={!state.canIssue || !confirmed}
          onClick={() => {
            setConsentFor(null);
            issue(confirmed);
          }}
        >
          {state.replacing ? "Replace synthetic pass" : "Create synthetic pass"}
        </button>
        <button type="button" className="min-h-11 rounded border px-4 py-2" onClick={hide}>
          Hide and clear pass
        </button>
      </div>
    </section>
  );
}
