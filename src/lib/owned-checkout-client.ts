/** Private synthetic workflow. All I/O injected; no persistence or automatic retry. */
import { STAGING_STANDARD_TICKET_TYPE_ID } from "./checkout-probe";
import { OWNED_RESERVATION_MAX_REMAINING_MS } from "./owned-reservation-core";

const PREPARE = "/api/public/prepare-ticket-reservation";
const CHECKOUT = "/api/public/create-checkout-attempt";
const RECOVER = "/api/public/recover-expired-checkout";
const DISCOVER = "/api/public/discover-owned-checkout";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export interface OwnedCheckoutViewState {
  phase:
    | "signed_out"
    | "idle"
    | "preparing"
    | "ready"
    | "checkout"
    | "pending"
    | "redirect"
    | "blocked"
    | "recovering"
    | "inspecting"
    | "released";
  message: string;
  expiresAt: string | null;
  redirectUrl: string | null;
  canPrepare: boolean;
  canStart: boolean;
  canResume: boolean;
  canRecoverExpired: boolean;
  canInspect: boolean;
}
export interface OwnedCheckoutDependencies {
  ticketTypeId?: string;
  getToken: (accountId: string) => Promise<string | null>;
  fetchImpl: (
    path: string,
    init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
  ) => Promise<{ status: number; json: () => Promise<unknown> }>;
  newKey?: () => string;
  now?: () => number;
  timeoutMs?: number;
  /** Require explicit owner-scoped server inspection before a new action. */
  requireDiscovery?: boolean;
  /** Same-tab recovery reference only; never stores tokens or provider URLs. */
  persistence?: {
    read: (accountId: string) => unknown;
    write: (accountId: string, value: unknown) => void;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function safeOwnedCheckoutRedirect(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "checkout.stripe.com" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function createOwnedCheckoutFlow(deps: OwnedCheckoutDependencies) {
  const now = deps.now ?? Date.now;
  const ticketTypeId = deps.ticketTypeId ?? STAGING_STANDARD_TICKET_TYPE_ID;
  let account: string | null = null;
  let hold: { id: string; expiresAt: string } | null = null;
  let key: string | null = null;
  let started = false;
  let elapsed = false;
  let releaseRecorded = false;
  let busy = false;
  let generation = 0;
  let active: AbortController | null = null;
  let storageError = false;
  let inspectionRequired = Boolean(deps.requireDiscovery);
  let phase: OwnedCheckoutViewState["phase"] = "signed_out";
  let message = "Sign in with the approved synthetic account.";
  let redirect: string | null = null;
  const listeners = new Set<() => void>();
  const validHold = () => Boolean(hold && Date.parse(hold.expiresAt) > now());
  const view = (): OwnedCheckoutViewState => ({
    phase,
    message,
    expiresAt: hold?.expiresAt ?? null,
    redirectUrl: redirect,
    canPrepare: Boolean(account && !busy && !storageError && !inspectionRequired && !hold),
    canStart: Boolean(
      account && !busy && !storageError && !inspectionRequired && validHold() && !started,
    ),
    canResume: Boolean(
      account && !busy && !storageError && !inspectionRequired && validHold() && started,
    ),
    canRecoverExpired: Boolean(
      account &&
      !busy &&
      !storageError &&
      !inspectionRequired &&
      hold &&
      !validHold() &&
      started &&
      !releaseRecorded,
    ),
    canInspect: Boolean(account && !busy && !storageError && deps.requireDiscovery),
  });
  let snapshot = view();
  const emit = () => {
    snapshot = view();
    for (const listener of listeners) listener();
  };
  const persist = () => {
    if (!deps.persistence || !account) return true;
    if (!key && !hold) {
      storageError = true;
      phase = "blocked";
      message = "No original recovery reference is available. Stop and ask the operator.";
      return false;
    }
    try {
      deps.persistence.write(account, {
        version: 1,
        accountId: account,
        ticketTypeId,
        key,
        hold,
        started,
      });
      return true;
    } catch {
      storageError = true;
      phase = "blocked";
      message = "Local recovery reference could not be saved. Stop and ask the operator.";
      return false;
    }
  };
  const refresh = () => {
    if (hold && !validHold() && !elapsed) {
      generation++;
      elapsed = true;
      active?.abort();
      busy = false;
      redirect = null;
      phase = "blocked";
      message =
        "Reservation expired. Ask the operator to reconcile it before starting another checkout.";
      emit();
    }
  };
  async function request(path: string, body: unknown, accountId: string) {
    const controller = new AbortController();
    active = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(new Error("Cancelled local workflow"));
      controller.signal.addEventListener("abort", abortListener, { once: true });
      timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15000);
    });
    try {
      return await Promise.race([
        cancelled,
        (async () => {
          const token = await deps.getToken(accountId);
          if (controller.signal.aborted) throw new Error("Cancelled local workflow");
          if (!token) return { status: 401, payload: null };
          const response = await deps.fetchImpl(path, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          const payload: unknown = await response.json();
          return { status: response.status, payload };
        })(),
      ]);
    } finally {
      clearTimeout(timer);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      if (active === controller) active = null;
    }
  }
  async function recoverExpired() {
    refresh();
    if (!snapshot.canRecoverExpired || !account || !hold) return;
    const stamp = generation,
      owner = account,
      reservationId = hold.id;
    busy = true;
    redirect = null;
    phase = "recovering";
    message = "Checking the same expired reservation…";
    emit();
    try {
      const result = await request(RECOVER, { reservationId }, owner);
      if (stamp !== generation) return;
      const data = record(result.payload);
      releaseRecorded = Boolean(
        result.status === 200 &&
        data &&
        Object.keys(data).length === 1 &&
        (data["status"] === "released" || data["status"] === "already_released"),
      );
      phase = releaseRecorded ? "released" : "blocked";
      message = releaseRecorded
        ? "Reservation release recorded. This is not payment failure or a refund. Do not start another checkout; ask the operator about any payment uncertainty."
        : "Release not confirmed. Retry this same check deliberately or ask the operator. Do not start another checkout.";
    } catch {
      if (stamp === generation) {
        phase = "blocked";
        message =
          "Recovery response uncertain. Retry this same check deliberately; it may already have released the reservation. Do not start another checkout.";
      }
    } finally {
      if (stamp === generation) {
        busy = false;
        emit();
      }
    }
  }
  async function inspectOriginal() {
    if (!snapshot.canInspect || !account) return;
    const stamp = generation,
      owner = account;
    // A later inspection supersedes earlier clearance. If this read is
    // ambiguous or unavailable, no preparation or checkout action may remain
    // enabled from a previous successful result.
    inspectionRequired = true;
    busy = true;
    redirect = null;
    phase = "inspecting";
    message = "Looking for this account's original unresolved reservation…";
    emit();
    try {
      const result = await request(DISCOVER, {}, owner);
      if (stamp !== generation) return;
      const data = record(result.payload);
      if (result.status !== 200 || !data) throw new Error("Discovery unavailable");
      if (data["status"] === "none" && Object.keys(data).length === 1 && !hold && !started) {
        inspectionRequired = false;
        phase = "idle";
        message =
          "No active original reservation found. This is not payment proof; the operator must still verify before preparing a new one.";
        return;
      }
      if (
        data["status"] === "found" &&
        Object.keys(data).length === 5 &&
        typeof data["reservationId"] === "string" &&
        UUID.test(data["reservationId"]) &&
        data["ticketTypeId"] === ticketTypeId &&
        typeof data["expiresAt"] === "string" &&
        Number.isFinite(Date.parse(data["expiresAt"])) &&
        Date.parse(data["expiresAt"]) - now() <= OWNED_RESERVATION_MAX_REMAINING_MS &&
        typeof data["started"] === "boolean" &&
        (!key || hold !== null) &&
        (!hold || (hold.id === data["reservationId"] && hold.expiresAt === data["expiresAt"])) &&
        (!started || data["started"])
      ) {
        hold = { id: data["reservationId"], expiresAt: data["expiresAt"] };
        started = data["started"];
        inspectionRequired = false;
        if (!persist()) return;
        phase = validHold() ? (started ? "pending" : "ready") : "blocked";
        message = validHold()
          ? started
            ? "Original pending checkout found. Recover only that attempt; no new session will be requested."
            : "Original unstarted reservation found. Starting Checkout remains a separate action."
          : "Original reservation is expired. Ask the operator to reconcile it before another checkout.";
        return;
      }
      phase = "blocked";
      message = "Original checkout state needs operator review. Do not start another checkout.";
    } catch {
      if (stamp === generation) {
        phase = "blocked";
        message = "Original checkout inspection unavailable. Do not start another checkout.";
      }
    } finally {
      if (stamp === generation) {
        busy = false;
        emit();
      }
    }
  }
  async function prepare() {
    refresh();
    if (!snapshot.canPrepare || !account) return;
    const stamp = generation,
      owner = account;
    busy = true;
    phase = "preparing";
    redirect = null;
    message = "Preparing one synthetic reservation…";
    emit();
    try {
      key ??= (deps.newKey ?? (() => crypto.randomUUID()))();
      if (!UUID.test(key) || !UUID.test(ticketTypeId)) throw new Error("Invalid local request key");
      // Preserve the idempotency key before the first reservation write. A
      // response lost across reload must never silently mint a new key.
      if (!persist()) return;
      const result = await request(
        PREPARE,
        { ticketTypeId, quantity: 1, idempotencyKey: key },
        owner,
      );
      if (stamp !== generation) return;
      const data = record(result.payload);
      const expiresAt = data?.["expiresAt"],
        id = data?.["reservationId"];
      const duration = typeof expiresAt === "string" ? Date.parse(expiresAt) - now() : NaN;
      if (
        result.status === 200 &&
        data?.["ok"] === true &&
        data["status"] === "ready" &&
        typeof id === "string" &&
        UUID.test(id) &&
        typeof expiresAt === "string" &&
        duration > 0 &&
        // Accept new 35-minute holds and shorter legacy/replayed holds. This
        // display check never chooses, sends, or extends a server deadline.
        duration <= OWNED_RESERVATION_MAX_REMAINING_MS
      ) {
        hold = { id, expiresAt };
        if (persist()) {
          phase = "ready";
          message = "Reservation ready. Starting checkout is a separate approved action.";
        }
      } else {
        phase = "blocked";
        message =
          result.status === 401 || result.status === 403
            ? "Not authorized. Sign in again."
            : "Reservation unavailable. Retry only the same reservation request.";
      }
    } catch {
      if (stamp === generation) {
        phase = "blocked";
        message = "Reservation outcome uncertain. Retry only the same reservation request.";
      }
    } finally {
      if (stamp === generation) {
        busy = false;
        emit();
      }
    }
  }
  async function checkout(resume: boolean) {
    refresh();
    if (!(resume ? snapshot.canResume : snapshot.canStart) || !account || !hold) return;
    const stamp = generation,
      owner = account,
      reservationId = hold.id;
    started = true;
    busy = true;
    phase = "checkout";
    redirect = null;
    message = resume
      ? "Recovering the same checkout attempt…"
      : "Starting one linked test checkout…";
    emit();
    try {
      // Mark intent before provider transport. A lost response and reload may
      // recover the original attempt, never treat this hold as a fresh start.
      if (!persist()) return;
      const result = await request(
        CHECKOUT,
        {
          ticketTypeId,
          quantity: 1,
          reservationId,
          ...(resume ? { resume: true } : {}),
        },
        owner,
      );
      if (stamp !== generation) return;
      const data = record(result.payload);
      redirect =
        result.status === 200 && data?.["ok"] === true && data["status"] === "redirect"
          ? safeOwnedCheckoutRedirect(data["redirectUrl"])
          : null;
      phase = redirect ? "redirect" : "pending";
      message = redirect
        ? "Test checkout prepared. Continue manually; do not complete payment."
        : "No confirmed checkout link. Recover only this same attempt; do not start another checkout.";
    } catch {
      if (stamp === generation) {
        phase = "pending";
        message = "Checkout outcome uncertain. Recover only this same attempt.";
      }
    } finally {
      if (stamp === generation) {
        busy = false;
        refresh();
        emit();
      }
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setAccount: (next: string | null) => {
      if (next === account) return;
      generation++;
      active?.abort();
      account = next;
      hold = null;
      key = null;
      started = false;
      elapsed = false;
      releaseRecorded = false;
      busy = false;
      storageError = false;
      inspectionRequired = Boolean(deps.requireDiscovery);
      redirect = null;
      phase = next ? "idle" : "signed_out";
      message = next
        ? "Prepare one synthetic reservation when the test sequence is approved."
        : "Sign in with the approved synthetic account.";
      if (next && deps.persistence) {
        try {
          const saved = deps.persistence.read(next);
          if (saved !== null && saved !== undefined) {
            const value = record(saved);
            const savedHold = record(value?.["hold"]);
            if (
              value?.["version"] !== 1 ||
              value["accountId"] !== next ||
              value["ticketTypeId"] !== ticketTypeId ||
              (value["key"] !== null &&
                (typeof value["key"] !== "string" || !UUID.test(value["key"]))) ||
              typeof value["started"] !== "boolean" ||
              (value["hold"] !== null && !savedHold) ||
              (savedHold !== null &&
                (typeof savedHold["id"] !== "string" ||
                  !UUID.test(savedHold["id"]) ||
                  typeof savedHold["expiresAt"] !== "string" ||
                  !Number.isFinite(Date.parse(savedHold["expiresAt"])))) ||
              (value["started"] && !savedHold) ||
              (value["key"] === null && !savedHold)
            ) {
              throw new Error("Invalid local recovery reference");
            }
            key = value["key"] as string | null;
            hold = savedHold
              ? { id: savedHold["id"] as string, expiresAt: savedHold["expiresAt"] as string }
              : null;
            started = value["started"];
            phase = hold ? (started ? "pending" : "ready") : "blocked";
            message = hold
              ? started
                ? "Previous checkout may be pending. Recover only this original attempt; the server will recheck it."
                : "Local reservation reference restored. The server must recheck it before checkout."
              : "Earlier reservation preparation may have occurred. Retry only the same request key.";
            if (hold && !validHold()) {
              phase = "blocked";
              message =
                "Saved reservation is expired. Reconcile the original attempt before another checkout.";
            }
            if (inspectionRequired) {
              phase = "blocked";
              message = "Inspect the original checkout before taking another action.";
            }
          }
        } catch {
          storageError = true;
          phase = "blocked";
          message = "Local recovery reference is unavailable. Stop and ask the operator.";
        }
      }
      if (next && inspectionRequired && !storageError) {
        phase = "blocked";
        message = "Inspect the original checkout before taking another action.";
      }
      emit();
    },
    prepare,
    start: () => checkout(false),
    resume: () => checkout(true),
    recoverExpired,
    inspectOriginal,
    refresh,
  };
}
