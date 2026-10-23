import { RecoveryView } from "@/components/ticket-recovery-view";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/public-supabase-client";
import { createOwnerPassController, INITIAL_OWNER_PASS } from "@/lib/owner-pass-client";
import { OwnerPassView } from "@/components/owner-pass-view";
import {
  createRecoveryController,
  INITIAL_RECOVERY,
  observeRecoverySession,
} from "@/lib/owner-ticket-recovery";

export function TicketRecovery() {
  const [state, setState] = useState(INITIAL_RECOVERY);
  const [passState, setPassState] = useState(INITIAL_OWNER_PASS);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const pass = useRef<ReturnType<typeof createOwnerPassController> | null>(null);
  const controller = useRef<ReturnType<typeof createRecoveryController> | null>(null);
  useEffect(() => {
    const current = createRecoveryController(setState);
    const passController = createOwnerPassController(setPassState);
    pass.current = passController;
    controller.current = current;
    let stop: (() => void) | undefined;
    try {
      stop = observeRecoverySession(supabase.auth, {
        ...current,
        session(token) {
          current.session(token);
          passController.session(token);
        },
        unavailable() {
          current.unavailable();
          passController.session(null);
        },
        dispose() {
          current.dispose();
          passController.dispose();
        },
      });
    } catch {
      current.unavailable();
      passController.session(null);
    }
    const clear = () => passController.hide();
    const visibility = () => {
      if (document.visibilityState !== "visible") clear();
    };
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      if (stop) stop();
      else current.dispose();
      controller.current = null;
      passController.dispose();
      pass.current = null;
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (signingIn || !email.trim().toLowerCase().endsWith("@example.test") || !password) {
      setAuthMessage("Use an existing synthetic @example.test account.");
      return;
    }
    setSigningIn(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setAuthMessage(error ? "Sign-in was not accepted." : "Signed in. Load your tickets below.");
    } catch {
      setAuthMessage("Sign-in is unavailable.");
    } finally {
      setPassword("");
      setSigningIn(false);
    }
  }
  return (
    <>
      <p className="mx-auto max-w-2xl px-6 pt-4">
        <a href="/tickets/account">Open saved guest purchases</a>
      </p>
      <RecoveryView
        state={state}
        refresh={() => {
          pass.current?.clearSelection();
          void controller.current?.load();
        }}
        previous={() => {
          pass.current?.clearSelection();
          void controller.current?.previous();
        }}
        next={() => {
          pass.current?.clearSelection();
          void controller.current?.next();
        }}
        selectPass={(id) => pass.current?.select(id)}
      />
      {state.phase === "signed-out" ? (
        <form onSubmit={signIn} className="mx-auto grid max-w-2xl gap-3 px-6 pb-10">
          <h2 className="text-lg font-semibold">Sign in to your TEST account</h2>
          <label htmlFor="ticket-email">Synthetic email</label>
          <input
            id="ticket-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 rounded border border-border bg-background px-3"
          />
          <label htmlFor="ticket-password">Password</label>
          <input
            id="ticket-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 rounded border border-border bg-background px-3"
          />
          <button
            disabled={signingIn}
            className="min-h-11 rounded border border-border px-3 disabled:opacity-50"
          >
            Sign in
          </button>
          {authMessage ? <p role="status">{authMessage}</p> : null}
        </form>
      ) : state.phase !== "checking" ? (
        <div className="mx-auto max-w-2xl px-6 pb-10">
          <button
            type="button"
            onClick={() => {
              void supabase.auth.signOut();
            }}
            className="text-sm underline underline-offset-4"
          >
            Sign out
          </button>
        </div>
      ) : null}
      {state.phase !== "signed-out" && state.phase !== "checking" ? (
        <OwnerPassView
          state={passState}
          inspect={() => {
            void pass.current?.inspect();
          }}
          issue={(confirmed) => {
            void pass.current?.issue(confirmed);
          }}
          hide={() => pass.current?.hide()}
        />
      ) : null}
    </>
  );
}
