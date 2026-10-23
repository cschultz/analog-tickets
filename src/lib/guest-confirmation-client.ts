import { parseGuestPurchaseReference } from "./guest-purchase-reference";
import { parseGuestPurchaseStatus, type GuestPurchaseStatus } from "./guest-purchase-status";

export interface GuestConfirmationState {
  phase: "idle" | "loading" | "ready" | "unavailable" | "session-missing" | "reference-missing";
  result: GuestPurchaseStatus | null;
}
export const INITIAL_GUEST_CONFIRMATION: GuestConfirmationState = { phase: "idle", result: null };
/** Read-only automatic status, bounded polling (six reads maximum) and manual refresh.
 * Auth is observed, never created or replaced. Purchase IDs never come from URLs.
 */
export function createGuestConfirmation(deps: {
  readReference(): unknown;
  publish(state: GuestConfirmationState): void;
  fetchImpl: typeof fetch;
  deadlineMs?: number;
  pollMs?: number;
}) {
  let reference: ReturnType<typeof parseGuestPurchaseReference> = null;
  try {
    reference = parseGuestPurchaseReference(deps.readReference());
  } catch {
    /* no usable reference */
  }
  let session: { ownerId: string; token: string } | null = null;
  let epoch = 0,
    disposed = false,
    busy = false;
  let abort: AbortController | null = null;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let state = INITIAL_GUEST_CONFIRMATION;
  let reads = 0;
  const emit = (next: GuestConfirmationState) => {
    state = next;
    if (!disposed) deps.publish(next);
  };
  const invalidate = () => {
    epoch++;
    abort?.abort();
    abort = null;
    busy = false;
    clearTimeout(poll);
  };
  async function load(reset = false) {
    if (disposed || busy || !reference || !session || session.ownerId !== reference.ownerId) return;
    if (reset) reads = 0;
    if (reads >= 6) return;
    clearTimeout(poll);
    reads++;
    busy = true;
    const stamp = ++epoch;
    const currentSession = session;
    const controller = new AbortController();
    abort = controller;
    emit({ phase: "loading", result: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = (async () => {
        const response = await deps.fetchImpl("/api/public/guest-purchase-status", {
          method: "POST",
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${currentSession.token}`,
          },
          body: JSON.stringify({ cartId: reference!.cartId }),
        });
        if (!response.ok) throw new Error("unavailable");
        return parseGuestPurchaseStatus(await response.json());
      })();
      const result = await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("deadline"));
          }, deps.deadlineMs ?? 12000);
        }),
      ]);
      if (disposed || stamp !== epoch) return;
      if (
        !result ||
        (result.status === "confirmed" &&
          (result.cartId !== reference.cartId ||
            result.ticketTypeId !== reference.ticketTypeId ||
            result.quantity !== reference.quantity))
      )
        throw new Error("correlation");
      emit({ phase: "ready", result });
      if (result.status === "pending" && reads < 6)
        poll = setTimeout(() => {
          void load();
        }, deps.pollMs ?? 3000);
    } catch {
      if (!disposed && stamp === epoch) emit({ phase: "unavailable", result: null });
    } finally {
      clearTimeout(timer);
      if (stamp === epoch) {
        busy = false;
        abort = null;
      }
    }
  }
  return {
    session(value: { ownerId: string; token: string } | null) {
      if (disposed) return;
      const sameOwner = Boolean(value && session && value.ownerId === session.ownerId);
      invalidate();
      session = value;
      if (!reference) {
        emit({ phase: "reference-missing", result: null });
        return;
      }
      if (!session || session.ownerId !== reference.ownerId) {
        emit({ phase: "session-missing", result: null });
        return;
      }
      // Token refresh does not create an unbounded polling loop.
      if (!sameOwner) reads = 0;
      if (reads < 6) void load();
      else emit(state.phase === "loading" ? { phase: "unavailable", result: null } : state);
    },
    refresh() {
      return load(true);
    },
    dispose() {
      disposed = true;
      invalidate();
      session = null;
    },
  };
}
