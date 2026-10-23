import { parseGuestPurchaseStatus, type GuestPurchaseStatus } from "./guest-purchase-status";
import { isUuid } from "./checkout-core";
export function recoveryPurchaseReference(search: string): string | undefined {
  const id = new URLSearchParams(search).get("purchase");
  return isUuid(id) ? id : undefined;
}
export interface GuestRecoveryState {
  phase: "form" | "link" | "working" | "confirmed" | "unavailable";
  message: string;
  purchase: Extract<GuestPurchaseStatus, { status: "confirmed" }> | null;
}
export const INITIAL_GUEST_RECOVERY: GuestRecoveryState = {
  phase: "form",
  message: "Request a ticket-access email. No account or password is required.",
  purchase: null,
};
/** Remove the fragment before any request. Never copy its credential to browser storage. */
export function takeRecoveryFragment(
  location: { hash: string; pathname: string; search?: string },
  history: { replaceState(data: unknown, unused: string, url: string): void },
): string | null {
  const fragment = location.hash;
  const purchase = recoveryPurchaseReference(location.search ?? "");
  if (fragment)
    history.replaceState(null, "", location.pathname + (purchase ? "?purchase=" + purchase : ""));
  return /^#token=[0-9a-f]{64}$/.test(fragment) ? fragment.slice(7) : null;
}
export function createGuestRecoveryClient(deps: {
  proof: string | null;
  cartId?: string | undefined;
  fetchImpl: typeof fetch;
  publish(state: GuestRecoveryState): void;
  timeoutMs?: number;
}) {
  let proof = deps.proof,
    busy = false,
    disposed = false,
    generation = 0;
  let abort: AbortController | null = null;
  const emit = (
    phase: GuestRecoveryState["phase"],
    message: string,
    purchase: GuestRecoveryState["purchase"] = null,
  ) => {
    if (!disposed) deps.publish({ phase, message, purchase });
  };
  async function run(action: "request" | "redeem" | "status" | "logout", email?: string) {
    if (busy || disposed) return;
    if (
      action === "request" &&
      (!email || email.length > 254 || !/^[^\s@]+@example\.test$/i.test(email.trim()))
    ) {
      emit("form", "Use the synthetic @example.test email entered at checkout.");
      return;
    }
    if (action === "redeem" && !proof) {
      emit("form", "This link is no longer available. Request a fresh ticket-access email.");
      return;
    }
    busy = true;
    const stamp = ++generation;
    const body =
      action === "request"
        ? { email: email!.trim(), ...(isUuid(deps.cartId) ? { cartId: deps.cartId } : {}) }
        : action === "redeem"
          ? { proof }
          : {};
    if (action === "redeem") proof = null;
    emit(
      "working",
      action === "request"
        ? "Requesting a ticket email…"
        : action === "logout"
          ? "Closing ticket access…"
          : "Opening your tickets…",
    );
    const controller = new AbortController();
    abort = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let opened = false;
    try {
      const work = (async () => {
        const response = await deps.fetchImpl("/api/public/guest-recovery-" + action, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error("unavailable");
        const data: unknown = await response.json();
        if (action === "status") {
          const purchase = parseGuestPurchaseStatus(data);
          if (purchase?.status !== "confirmed") throw new Error("unavailable");
          return purchase;
        }
        if (
          !data ||
          typeof data !== "object" ||
          (data as Record<string, unknown>)[
            action === "request" ? "accepted" : action === "redeem" ? "opened" : "closed"
          ] !== true
        )
          throw new Error("unavailable");
        return null;
      })();
      const result = await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("deadline"));
          }, deps.timeoutMs ?? 12000);
        }),
      ]);
      if (disposed || stamp !== generation) return;
      if (action === "status") emit("confirmed", "Your purchase is confirmed.", result);
      else if (action === "request")
        emit(
          "form",
          "If an eligible purchase matches, a fresh link will arrive in the TEST inbox. Links expire in 15 minutes. Recent requests may be limited.",
        );
      else if (action === "logout")
        emit(
          "form",
          "Ticket access on this device is closed. Request a new email to open it again.",
        );
      if (action === "redeem") opened = true;
    } catch {
      if (!disposed && stamp === generation)
        emit(
          "unavailable",
          action === "logout"
            ? "Tickets are hidden, but we could not confirm that device access was closed. Try closing access again."
            : "Ticket access could not be confirmed. Check this device’s access or request a fresh email. Do not make another payment.",
        );
    } finally {
      clearTimeout(timer);
      if (stamp === generation) {
        busy = false;
        abort = null;
      }
    }
    if (action === "redeem" && opened && !disposed && stamp === generation) await run("status");
  }
  return {
    start() {
      if (proof)
        emit("link", "Open your tickets on this device. This email link can be used once.");
      else void run("status");
    },
    request: (email: string) => run("request", email),
    open: () => run("redeem"),
    refresh: () => run("status"),
    logout: () => run("logout"),
    dispose() {
      disposed = true;
      proof = null;
      generation++;
      abort?.abort();
    },
  };
}
