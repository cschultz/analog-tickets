import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/public-supabase-client";
import { listUnfulfilledPaidReviews } from "@/lib/paid-review.functions";
import {
  PaidReviewRequestGuard,
  parsePaidReviewInput,
  type PaidReviewPage,
} from "@/lib/paid-review-core";

export const Route = createFileRoute("/staging/admin/paid-review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Analog Tickets — Private Payment Review" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PaidReviewScreen,
});

type Screen =
  { kind: "idle" | "loading" | "unavailable" } | { kind: "loaded"; page: PaidReviewPage };
function PaidReviewScreen() {
  const [signedIn, setSignedIn] = useState(false);
  // Client UX gate only, never server authorization. Close synchronously when
  // auth changes; React's display state may not have committed yet.
  const hasSession = useRef(false);
  const [eventId, setEventId] = useState("");
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const guard = useRef(new PaidReviewRequestGuard());
  function invalidate() {
    guard.current.invalidate();
    setScreen({ kind: "idle" });
  }
  useEffect(() => {
    const authGuard = guard.current;
    const initial = authGuard.version;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (authGuard.current(initial)) {
          hasSession.current = Boolean(data.session);
          setSignedIn(hasSession.current);
        }
      })
      .catch(() => {
        if (authGuard.current(initial)) {
          hasSession.current = false;
          setSignedIn(false);
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      hasSession.current = Boolean(session);
      authGuard.invalidate();
      setScreen({ kind: "idle" });
      setSignedIn(Boolean(session));
    });
    return () => {
      hasSession.current = false;
      authGuard.invalidate();
      subscription.unsubscribe();
    };
  }, []);
  async function load(after?: string) {
    if (!hasSession.current) return;
    const requestGeneration = guard.current.begin();
    if (requestGeneration === null) return;
    setScreen({ kind: "loading" });
    try {
      const input = parsePaidReviewInput({ eventId: eventId.trim(), ...(after ? { after } : {}) });
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!guard.current.current(requestGeneration) || !token) throw new Error("Unavailable");
      const page = await listUnfulfilledPaidReviews({
        data: input,
        headers: { authorization: `Bearer ${token}` },
      });
      if (guard.current.current(requestGeneration)) setScreen({ kind: "loaded", page });
    } catch {
      if (guard.current.current(requestGeneration)) setScreen({ kind: "unavailable" });
    } finally {
      guard.current.finish(requestGeneration);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Payment review — private test mode</h1>
      <p>
        Paid notifications that could not safely issue tickets. These records require investigation;
        they do not prove settlement or resolve a payment.
      </p>
      <p>
        This screen is read-only. It cannot issue tickets, release inventory, refund, contact a
        provider, or mark a case resolved.
      </p>
      {!signedIn ? (
        <p role="status">Not available. Sign in with an authorized event account.</p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
            className="space-y-3"
          >
            <label className="block">
              Event ID
              <input
                className="block min-h-11 w-full rounded border p-2"
                value={eventId}
                onChange={(e) => {
                  invalidate();
                  setEventId(e.target.value);
                }}
                autoComplete="off"
              />
            </label>
            <button
              className="min-h-11 rounded border px-4 py-2"
              disabled={screen.kind === "loading"}
            >
              Load / refresh reviews
            </button>
          </form>
          <div aria-live="polite">
            {screen.kind === "loading" && <p>Loading reviews…</p>}
            {screen.kind === "unavailable" && <p>Not available.</p>}
            {screen.kind === "loaded" && (
              <>
                <p>Identifier-ordered page; refresh from the beginning for newly recorded cases.</p>
                {screen.page.cases.length === 0 ? (
                  <p>
                    No matching review records on this page. This is not proof that payments are
                    reconciled.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {screen.page.cases.map((item) => (
                      <li key={item.caseId} className="rounded border p-3">
                        <p>Needs investigation</p>
                        <p className="break-all">Case: {item.caseId}</p>
                        <p>Recorded: {item.recordedAt}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {screen.page.next && (
                  <button
                    className="mt-4 min-h-11 rounded border px-4 py-2"
                    onClick={() => {
                      void load(screen.page.next!);
                    }}
                  >
                    Next page
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
