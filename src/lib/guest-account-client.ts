import {
  verifiedGuestAccount,
  parseGuestAccountLibrary,
  type VerifiedGuestAccount,
  type GuestAccountPurchaseSummary,
} from "./guest-account-core";
import { parseGuestPurchaseStatus, type GuestPurchaseStatus } from "./guest-purchase-status";
export interface GuestAccountAuth {
  getSession(): Promise<{
    data: { session: { access_token: string; user: { id: string } } | null };
    error: unknown;
  }>;
  getUser(token: string): Promise<{ data: { user: unknown }; error: unknown }>;
  signInWithPassword(input: { email: string; password: string }): Promise<{ error: unknown }>;
  signUp(input: {
    email: string;
    password: string;
    options: { emailRedirectTo: string };
  }): Promise<{ error: unknown }>;
  signOut(): Promise<{ error: unknown }>;
}
export interface GuestAccountState {
  phase: "closed" | "loading" | "form" | "account" | "saved" | "unavailable";
  message: string;
  account: VerifiedGuestAccount | null;
  token: string | null;
  purchases: GuestAccountPurchaseSummary[];
  offset: number;
  hasMore: boolean;
  purchase: Extract<GuestPurchaseStatus, { status: "confirmed" }> | null;
}
export const INITIAL_GUEST_ACCOUNT: GuestAccountState = {
  phase: "closed",
  message: "",
  account: null,
  token: null,
  purchases: [],
  offset: 0,
  hasMore: false,
  purchase: null,
};
export function createGuestAccountClient(deps: {
  auth: GuestAccountAuth;
  cartId?: string | undefined;
  origin: string;
  fetchImpl: typeof fetch;
  publish(state: GuestAccountState): void;
  timeoutMs?: number;
}) {
  let state = INITIAL_GUEST_ACCOUNT,
    enabled = false,
    closed = false,
    busy = false,
    epoch = 0,
    signupAttempted = false;
  let pending: AbortController | null = null;
  const emit = (patch: Partial<GuestAccountState>) => {
    state = { ...state, ...patch };
    if (!closed) deps.publish(state);
  };
  const clear = (phase: GuestAccountState["phase"], message: string) =>
    emit({ ...INITIAL_GUEST_ACCOUNT, phase, message });
  async function bounded<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("unavailable")), deps.timeoutMs ?? 12000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function verify() {
    const before = await bounded(deps.auth.getSession());
    if (before.error || !before.data.session) return null;
    const token = before.data.session.access_token,
      r = await bounded(deps.auth.getUser(token)),
      account = !r.error ? verifiedGuestAccount(r.data.user) : null;
    const after = await bounded(deps.auth.getSession());
    return account &&
      !after.error &&
      before.data.session.user.id === account.id &&
      after.data.session?.user.id === account.id
      ? { account, token: after.data.session.access_token }
      : null;
  }
  async function request(path: string, body: unknown, token?: string) {
    const abort = new AbortController();
    pending = abort;
    try {
      return await bounded(
        (async () => {
          const response = await deps.fetchImpl(path, {
            method: token ? "POST" : "GET",
            credentials: token && path.endsWith("attach") ? "same-origin" : "omit",
            cache: "no-store",
            referrerPolicy: "no-referrer",
            signal: abort.signal,
            headers: token
              ? { "content-type": "application/json", authorization: `Bearer ${token}` }
              : {},
            ...(token ? { body: JSON.stringify(body) } : {}),
          });
          return { response, data: (await response.json()) as unknown };
        })(),
      );
    } finally {
      abort.abort();
      if (pending === abort) pending = null;
    }
  }
  async function action(work: (stamp: number) => Promise<void>) {
    if (closed || busy) return;
    busy = true;
    const stamp = ++epoch;
    try {
      await work(stamp);
    } catch {
      if (!closed && stamp === epoch)
        clear(
          "unavailable",
          "Account access could not be confirmed. Your email ticket access is unchanged. Check saved purchases before trying to save again.",
        );
    } finally {
      if (stamp === epoch) busy = false;
    }
  }
  const current = (stamp: number) => !closed && stamp === epoch;
  async function observe() {
    if (!enabled) return;
    await action(async (stamp) => {
      const v = await verify();
      if (!current(stamp)) return;
      if (!v) {
        clear(
          "form",
          "Sign in to a verified TEST account, or create one after recovering this purchase.",
        );
        return;
      }
      emit({
        phase: "account",
        account: v.account,
        token: v.token,
        message: "Review the signed-in account before saving. Email ticket access stays available.",
      });
    });
  }
  const api = {
    getSnapshot: () => state,
    async open() {
      await action(async (stamp) => {
        emit({ phase: "loading", message: "Checking optional account access…" });
        const r = await request("/api/public/guest-account-config", null);
        if (!current(stamp)) return;
        const v = r.data as Record<string, unknown> | null;
        enabled = r.response.ok && v?.["enabled"] === true;
        if (!enabled) {
          clear(
            "unavailable",
            "Optional TEST account access is not enabled. You can keep using your email ticket access.",
          );
          return;
        }
        const account = await verify();
        if (!current(stamp)) return;
        if (account)
          emit({
            phase: "account",
            account: account.account,
            token: account.token,
            message:
              "Review the signed-in account before saving. Email ticket access stays available.",
          });
        else
          clear(
            "form",
            "Sign in or create an account. This is optional; your tickets are already available above.",
          );
      });
    },
    observe,
    async credentials(mode: "signin" | "signup", email: string, password: string) {
      if (
        !enabled ||
        !/^[^\s@]+@example\.test$/i.test(email.trim()) ||
        email.length > 254 ||
        password.length < 8 ||
        password.length > 128
      ) {
        emit({
          message: "Use a synthetic @example.test email and a password of 8–128 characters.",
        });
        return;
      }
      if (mode === "signup" && (!deps.cartId || signupAttempted)) {
        emit({
          message:
            "Open your recovered purchase before creating an account. If a signup was already attempted, verify its email or sign in instead of repeating it.",
        });
        return;
      }
      await action(async (stamp) => {
        emit({
          phase: "loading",
          message: mode === "signup" ? "Creating your optional account…" : "Signing in…",
          purchase: null,
        });
        if (mode === "signup") signupAttempted = true;
        const result = await bounded(
          mode === "signup"
            ? deps.auth.signUp({
                email: email.trim(),
                password,
                options: { emailRedirectTo: deps.origin + "/tickets/account" },
              })
            : deps.auth.signInWithPassword({ email: email.trim(), password }),
        );
        if (!current(stamp)) return;
        if (result.error) {
          clear(
            "form",
            "Account sign-in or signup was not completed. If you already have an account, sign in; otherwise verify the email if requested. No purchase was saved.",
          );
          return;
        }
        const v = await verify();
        if (!current(stamp)) return;
        if (v && v.account.email.toLowerCase() === email.trim().toLowerCase())
          emit({
            phase: "account",
            account: v.account,
            token: v.token,
            message: "Account verified. Save this purchase only if this is the account you want.",
          });
        else
          clear(
            "form",
            "If signup was accepted, verify the account email, then sign in here. Existing-email conflicts never attach a purchase automatically.",
          );
      });
    },
    async save() {
      if (!enabled || !deps.cartId || !state.account) return;
      const expected = state.account.id;
      await action(async (stamp) => {
        emit({
          phase: "loading",
          message: "Saving this purchase to your account…",
          purchase: null,
        });
        const v = await verify();
        if (!current(stamp)) return;
        if (!v || v.account.id !== expected) {
          clear("form", "The signed-in account changed. Review it again before saving.");
          return;
        }
        const r = await request(
          "/api/public/guest-account-attach",
          { confirmed: true, expectedAccountId: expected },
          v.token,
        );
        if (!current(stamp)) return;
        const body = r.data as Record<string, unknown> | null;
        if (r.response.ok && body?.["saved"] === true)
          emit({
            phase: "saved",
            account: v.account,
            token: v.token,
            message:
              "Purchase saved to this account. Email ticket access and ticket ownership are unchanged.",
          });
        else
          emit({
            phase: "account",
            account: v.account,
            token: v.token,
            message:
              r.response.status === 409
                ? "This purchase could not be saved here. It may already be linked to another account; email access is unchanged."
                : "Save could not be confirmed. Check saved purchases before trying again.",
          });
      });
    },
    async load(offset = 0) {
      if (!enabled || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) return;
      await action(async (stamp) => {
        emit({
          phase: "loading",
          message: "Loading saved purchases…",
          purchase: null,
          purchases: [],
        });
        const v = await verify();
        if (!current(stamp)) return;
        if (!v) {
          clear("form", "Sign in to a verified TEST account.");
          return;
        }
        const r = await request("/api/public/guest-account-purchases", { offset }, v.token);
        if (!current(stamp)) return;
        const page = r.response.ok ? parseGuestAccountLibrary(r.data) : null;
        if (!page) throw new Error("unavailable");
        emit({
          phase: "account",
          account: v.account,
          token: v.token,
          purchases: page.purchases,
          hasMore: page.hasMore,
          offset,
          message: page.purchases.length
            ? "Your saved guest purchases."
            : "No saved purchases on this page. A typed email does not link purchases automatically.",
        });
      });
    },
    async select(cartId: string) {
      if (!enabled || !state.account || !state.purchases.some((p) => p.cartId === cartId)) return;
      const expected = state.account.id;
      await action(async (stamp) => {
        emit({ phase: "loading", message: "Opening this saved purchase…", purchase: null });
        const v = await verify();
        if (!current(stamp)) return;
        if (!v || v.account.id !== expected) {
          clear("form", "The account changed. Load its saved purchases again.");
          return;
        }
        const r = await request("/api/public/guest-account-status", { cartId }, v.token);
        if (!current(stamp)) return;
        const purchase = r.response.ok ? parseGuestPurchaseStatus(r.data) : null;
        if (purchase?.status !== "confirmed" || purchase.cartId !== cartId)
          throw new Error("unavailable");
        emit({
          phase: "account",
          account: v.account,
          token: v.token,
          purchase,
          message: "This purchase is confirmed. Current ticket status is shown below.",
        });
      });
    },
    async signOut() {
      if (!enabled) return;
      await action(async (stamp) => {
        const r = await bounded(deps.auth.signOut());
        if (current(stamp))
          clear(
            r.error ? "unavailable" : "form",
            r.error
              ? "Sign-out could not be confirmed."
              : "Signed out. Email ticket access is independent of this account.",
          );
      });
    },
    sessionChanged() {
      if (closed || !enabled) return;
      epoch++;
      pending?.abort();
      busy = false;
      clear("form", "The account session changed. Review it again; no new save was started.");
    },
    dispose() {
      closed = true;
      epoch++;
      pending?.abort();
    },
  };
  return api;
}
