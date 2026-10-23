/**
 * Gate 107 — private, unlinked, noindex staging check-in reversal surface.
 *
 * Optional module: it renders nothing useful unless the same Gate 104 Box
 * Office flag is on AND the signed-in caller already holds an organizer/admin
 * membership. box_office staff never see useful content. Manual entry of an
 * opaque pass code plus a mandatory reason only — no camera, no QR, no scanner
 * hardware, no offline storage, no queueing, no bulk operations, and no raw
 * ticket or order identifier anywhere.
 *
 * Both fields live in React state for the duration of one submit, are cleared
 * immediately afterwards, and are never written to the URL, browser storage,
 * the console, a DOM attribute, analytics, or an error report. The reversal
 * itself is performed by the unchanged Gate 105 server command.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/public-supabase-client";
import {
  MAX_REVERSAL_REASON_LENGTH,
  REVERSAL_CODE_LABEL,
  REVERSAL_DESCRIPTION,
  REVERSAL_ENTRY_MESSAGE,
  REVERSAL_LOADING_MESSAGE,
  REVERSAL_MODULE_OFF_MESSAGE,
  REVERSAL_NOT_PERMITTED_MESSAGE,
  REVERSAL_REASON_LABEL,
  REVERSAL_SUBMIT_LABEL,
  REVERSAL_TITLE,
  REVERSAL_WORKING_LABEL,
  parseReversalEntry,
  readReversalResponse,
  reversalResultMessage,
  type ReversalEntryError,
  type ReversalSurfaceResult,
} from "@/lib/reversal-surface-core";
import { getReversalSurfaceState } from "@/lib/reversal-surface.functions";

export const Route = createFileRoute("/staging/box-office/reverse-check-in")({
  ssr: false,
  head: () => ({
    meta: [
      { title: REVERSAL_TITLE },
      { name: "description", content: REVERSAL_DESCRIPTION },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: REVERSAL_TITLE },
      { property: "og:description", content: REVERSAL_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReverseCheckIn,
});

/** Gate state. Every failure collapses to `denied`; nothing distinguishes them. */
type Gate = { kind: "loading" } | { kind: "off" } | { kind: "denied" } | { kind: "ready" };
type Entry = { kind: "idle" } | { kind: "error"; code: ReversalEntryError };

function ReverseCheckIn() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [entry, setEntry] = useState<Entry>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReversalSurfaceResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    let evaluation = 0;

    async function evaluate() {
      const current = ++evaluation;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (cancelled || current !== evaluation) return;
        if (!token) {
          setGate({ kind: "denied" });
          return;
        }
        const state = await getReversalSurfaceState({
          headers: { authorization: `Bearer ${token}` },
        });
        if (cancelled || current !== evaluation) return;
        if (!state?.enabled) setGate({ kind: "off" });
        else setGate(state.authorized ? { kind: "ready" } : { kind: "denied" });
      } catch {
        // Signed out, nonmember, box_office, disabled, or transport failure — one state.
        if (!cancelled && current === evaluation) setGate({ kind: "denied" });
      }
    }

    void evaluate();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      ++evaluation;
      setResult(null);
      setEntry({ kind: "idle" });
      setCode("");
      setReason("");
      setGate({ kind: "loading" });
      void evaluate();
    });
    return () => {
      cancelled = true;
      ++evaluation;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || gate.kind !== "ready") return;
    setResult(null);
    const parsed = parseReversalEntry(code, reason);
    if (!parsed.ok) {
      setEntry({ kind: "error", code: parsed.code });
      return;
    }
    setEntry({ kind: "idle" });
    setBusy(true);
    // Cleared before the request resolves, so neither field lingers on screen.
    setCode("");
    setReason("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setResult({ kind: "denied" });
        return;
      }
      const response = await fetch("/api/public/reverse-check-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ passCode: parsed.entry.passCode, reason: parsed.entry.reason }),
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      setResult(readReversalResponse(response.status, body));
    } catch {
      setResult({ kind: "unavailable" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background px-6 py-12 text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">{REVERSAL_TITLE}</h1>

      {gate.kind === "loading" ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          {REVERSAL_LOADING_MESSAGE}
        </p>
      ) : null}

      {gate.kind === "off" ? (
        <p role="status" className="mt-6 text-sm font-medium">
          {REVERSAL_MODULE_OFF_MESSAGE}
        </p>
      ) : null}

      {gate.kind === "denied" ? (
        <p role="status" className="mt-6 text-sm font-medium">
          {REVERSAL_NOT_PERMITTED_MESSAGE}
        </p>
      ) : null}

      {gate.kind === "ready" ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Enter the pass code and why the check-in is being reversed. The server re-checks your
            permission for that event on every attempt.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 grid gap-3" autoComplete="off">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{REVERSAL_CODE_LABEL}</span>
              <input
                type="text"
                name="pass"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="text"
                aria-label={REVERSAL_CODE_LABEL}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{REVERSAL_REASON_LABEL}</span>
              <textarea
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={MAX_REVERSAL_REASON_LENGTH}
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                autoComplete="off"
                spellCheck={false}
                aria-label={REVERSAL_REASON_LABEL}
              />
            </label>
            <div>
              <button
                type="submit"
                disabled={busy}
                className="rounded border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {busy ? REVERSAL_WORKING_LABEL : REVERSAL_SUBMIT_LABEL}
              </button>
            </div>
          </form>

          {entry.kind === "error" ? (
            <p role="status" className="mt-4 text-sm">
              {REVERSAL_ENTRY_MESSAGE[entry.code]}
            </p>
          ) : null}

          {result ? (
            <p role="status" className="mt-4 text-base font-medium">
              {reversalResultMessage(result)}
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
