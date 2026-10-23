/**
 * Private, unlinked, noindex staging Box Office check-in surface.
 *
 * Optional module: it renders nothing useful unless the server-side Box Office
 * flag is on AND the signed-in caller already holds a box_office / organizer /
 * admin membership. Authorized staff may enter the existing opaque pass code
 * manually or use a browser-native camera QR reader. The QR payload is never
 * displayed, stored, logged, or sent anywhere except the unchanged Gate 103
 * check-in endpoint after the existing parser validates it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/public-supabase-client";
import {
  BOX_OFFICE_DESCRIPTION,
  BOX_OFFICE_FIELD_LABEL,
  BOX_OFFICE_LOADING_MESSAGE,
  BOX_OFFICE_MODULE_OFF_MESSAGE,
  BOX_OFFICE_NOT_PERMITTED_MESSAGE,
  BOX_OFFICE_SUBMIT_LABEL,
  BOX_OFFICE_TITLE,
  BOX_OFFICE_WORKING_LABEL,
  checkInTransportFailure,
  createDoorSubmissionGate,
  DOOR_SUBMISSION_TIMEOUT_MS,
  PASS_ENTRY_MESSAGE,
  parsePassEntry,
  resultMessage,
  type BoxOfficeResult,
  type PassEntryError,
} from "@/lib/box-office-core";
import {
  startCameraQrScanner,
  stopCameraWhenBackgrounded,
  type CameraQrScannerSession,
} from "@/lib/camera-qr-scanner";
import { submitDoorCheckInRequest } from "@/lib/box-office-request";
import { getBoxOfficeSurfaceState } from "@/lib/box-office.functions";

export const Route = createFileRoute("/staging/box-office/check-in")({
  ssr: false,
  head: () => ({
    meta: [
      { title: BOX_OFFICE_TITLE },
      { name: "description", content: BOX_OFFICE_DESCRIPTION },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: BOX_OFFICE_TITLE },
      { property: "og:description", content: BOX_OFFICE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoxOfficeCheckIn,
});

/** Gate state. Every failure collapses to `denied`; nothing distinguishes them. */
type Gate = { kind: "loading" } | { kind: "off" } | { kind: "denied" } | { kind: "ready" };
type Entry = { kind: "idle" } | { kind: "error"; code: PassEntryError };
type Scanner = "idle" | "starting" | "active" | "unavailable";

function BoxOfficeCheckIn() {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [entry, setEntry] = useState<Entry>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BoxOfficeResult | null>(null);
  const [scanner, setScanner] = useState<Scanner>("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<CameraQrScannerSession | null>(null);
  const scannerAbortRef = useRef<AbortController | null>(null);
  const scannerStartId = useRef(0);
  const submissionGate = useRef(createDoorSubmissionGate());

  const releaseCamera = useCallback(() => {
    scannerStartId.current += 1;
    scannerAbortRef.current?.abort();
    scannerAbortRef.current = null;
    scannerRef.current?.stop();
    scannerRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let evaluationId = 0;
    const submissions = submissionGate.current;

    async function evaluate() {
      const requestId = ++evaluationId;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled || requestId !== evaluationId) return;
        const token = session?.access_token;
        if (!token) {
          setGate({ kind: "denied" });
          return;
        }
        const state = await getBoxOfficeSurfaceState({
          headers: { authorization: `Bearer ${token}` },
        });
        if (cancelled || requestId !== evaluationId) return;
        if (!state?.enabled) setGate({ kind: "off" });
        else setGate(state.authorized ? { kind: "ready" } : { kind: "denied" });
      } catch {
        // Signed out, nonmember, disabled, or transport failure — one state.
        if (!cancelled && requestId === evaluationId) setGate({ kind: "denied" });
      }
    }

    void evaluate();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      submissions.invalidate();
      releaseCamera();
      setScanner("idle");
      setResult(null);
      setEntry({ kind: "idle" });
      setCode("");
      setGate({ kind: "loading" });
      void evaluate();
    });
    return () => {
      cancelled = true;
      evaluationId += 1;
      submissions.invalidate();
      subscription.unsubscribe();
    };
  }, [releaseCamera]);

  useEffect(() => {
    const unbind = stopCameraWhenBackgrounded(
      () => {
        releaseCamera();
        setScanner("idle");
      },
      document,
      window,
    );
    return () => {
      unbind();
      releaseCamera();
    };
  }, [releaseCamera]);

  function stopCameraScanner() {
    releaseCamera();
    setScanner("idle");
  }

  async function submitPass(rawValue: string) {
    if (gate.kind !== "ready") return;
    const lease = submissionGate.current.begin();
    if (!lease) return;
    setResult(null);
    const parsed = parsePassEntry(rawValue);
    if (!parsed.ok) {
      setEntry({ kind: "error", code: parsed.code });
      submissionGate.current.finish(lease);
      return;
    }
    setEntry({ kind: "idle" });
    setBusy(true);
    const controller = new AbortController();
    let postStarted = false;
    const timeout = window.setTimeout(() => {
      const current = submissionGate.current.isCurrent(lease);
      submissionGate.current.expire(lease);
      controller.abort();
      if (current) setResult(checkInTransportFailure(postStarted));
      if (!submissionGate.current.isActive()) setBusy(false);
    }, DOOR_SUBMISSION_TIMEOUT_MS);
    try {
      const { data } = await supabase.auth.getSession();
      // A sign-out or account switch while the session read was pending must
      // not start a check-in using the previous operator's token.
      if (!submissionGate.current.isCurrent(lease)) return;
      const token = data.session?.access_token;
      if (!token) {
        if (submissionGate.current.isCurrent(lease)) setResult({ kind: "denied" });
        return;
      }
      postStarted = true;
      const outcome = await submitDoorCheckInRequest(parsed.passCode, token, controller.signal);
      if (submissionGate.current.isCurrent(lease)) setResult(outcome);
    } catch {
      if (submissionGate.current.isCurrent(lease)) setResult(checkInTransportFailure(false));
    } finally {
      window.clearTimeout(timeout);
      submissionGate.current.finish(lease);
      if (!submissionGate.current.isActive()) setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submissionGate.current.isActive() || gate.kind !== "ready") return;
    const rawValue = code;
    // Clear before parsing or submitting, so a code never lingers after any attempt.
    setCode("");
    stopCameraScanner();
    void submitPass(rawValue);
  }

  function startCameraScanner() {
    if (
      submissionGate.current.isActive() ||
      gate.kind !== "ready" ||
      scanner === "starting" ||
      scanner === "active"
    )
      return;
    scannerAbortRef.current?.abort();
    const controller = new AbortController();
    scannerAbortRef.current = controller;
    const startId = scannerStartId.current + 1;
    scannerStartId.current = startId;
    setCode("");
    setEntry({ kind: "idle" });
    setResult(null);
    setScanner("starting");

    window.requestAnimationFrame(() => {
      void (async () => {
        const video = videoRef.current;
        if (scannerStartId.current !== startId) return;
        if (!video) {
          scannerAbortRef.current = null;
          setScanner("unavailable");
          return;
        }
        const session = await startCameraQrScanner({
          video,
          signal: controller.signal,
          onCode: (rawValue) => {
            if (scannerStartId.current !== startId) return;
            scannerRef.current = null;
            scannerAbortRef.current = null;
            setScanner("idle");
            void submitPass(rawValue);
          },
          onUnavailable: () => {
            if (scannerStartId.current !== startId) return;
            scannerRef.current = null;
            scannerAbortRef.current = null;
            setScanner("unavailable");
          },
        });
        if (scannerStartId.current !== startId) {
          session?.stop();
          return;
        }
        if (!session) {
          scannerAbortRef.current = null;
          setScanner("unavailable");
          return;
        }
        scannerRef.current = session;
        setScanner("active");
      })();
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background px-6 py-12 text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">{BOX_OFFICE_TITLE}</h1>

      {gate.kind === "loading" ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          {BOX_OFFICE_LOADING_MESSAGE}
        </p>
      ) : null}

      {gate.kind === "off" ? (
        <p role="status" className="mt-6 text-sm font-medium">
          {BOX_OFFICE_MODULE_OFF_MESSAGE}
        </p>
      ) : null}

      {gate.kind === "denied" ? (
        <p role="status" className="mt-6 text-sm font-medium">
          {BOX_OFFICE_NOT_PERMITTED_MESSAGE}
        </p>
      ) : null}

      {gate.kind === "ready" ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Enter the pass code presented at the door, or scan its QR code. The server re-checks
            your permission for that event on every attempt.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 grid gap-3" autoComplete="off">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{BOX_OFFICE_FIELD_LABEL}</span>
              <input
                type="text"
                name="pass"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="min-h-11 rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="text"
                aria-label={BOX_OFFICE_FIELD_LABEL}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="min-h-11 rounded border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {busy ? BOX_OFFICE_WORKING_LABEL : BOX_OFFICE_SUBMIT_LABEL}
              </button>
              <button
                type="button"
                onClick={startCameraScanner}
                disabled={busy || scanner === "starting" || scanner === "active"}
                className="min-h-11 rounded border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Scan QR code
              </button>
            </div>
          </form>

          {scanner === "starting" || scanner === "active" ? (
            <section className="mt-4 grid gap-2" aria-label="QR code scanner">
              <video
                ref={videoRef}
                className="aspect-video w-full rounded border border-border bg-muted"
                muted
                playsInline
                aria-label="Camera preview for QR code scanning"
              />
              <p role="status" className="text-sm text-muted-foreground">
                {scanner === "starting" ? "Starting camera…" : "Point the camera at a QR code."}
              </p>
              <div>
                <button
                  type="button"
                  onClick={stopCameraScanner}
                  className="min-h-11 rounded border border-border px-3 py-1.5 text-sm font-medium"
                >
                  Stop scanner
                </button>
              </div>
            </section>
          ) : null}

          {scanner === "unavailable" ? (
            <p role="status" className="mt-4 text-sm">
              Camera scanning is unavailable. Enter the pass code instead.
            </p>
          ) : null}

          {entry.kind === "error" ? (
            <p role="status" className="mt-4 text-sm">
              {PASS_ENTRY_MESSAGE[entry.code]}
            </p>
          ) : null}

          {result ? (
            <p role="status" className="mt-4 text-base font-medium">
              {resultMessage(result)}
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
