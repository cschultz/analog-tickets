import { isUuid } from "./transfer-otp-core";
import { PASS_CODE_RE } from "./checkin-core";

export interface OwnerPassState {
  ticketId: string | null;
  phase:
    | "idle"
    | "loading"
    | "ready"
    | "shown"
    | "state_changed"
    | "uncertain"
    | "not_eligible"
    | "signed-out";
  code: string | null;
  replacing: boolean;
  canInspect: boolean;
  canIssue: boolean;
}
export const INITIAL_OWNER_PASS: OwnerPassState = {
  ticketId: null,
  phase: "signed-out",
  code: null,
  replacing: false,
  canInspect: false,
  canIssue: false,
};

/** Raw code stays in memory. A new inspection and explicit consent are required for every issue. */
export function createOwnerPassController(
  publish: (state: OwnerPassState) => void,
  fetchImpl: typeof fetch = fetch,
  deadlineMs = 12000,
  displayMs = 120000,
) {
  let token: string | null = null,
    ticket: string | null = null;
  let expected: string | null | undefined;
  let generation = 0,
    disposed = false,
    busy = false;
  let pending: AbortController | null = null;
  let displayTimer: ReturnType<typeof setTimeout> | undefined;
  let state = INITIAL_OWNER_PASS;
  const emit = (phase: OwnerPassState["phase"], code: string | null = null) => {
    state = {
      ticketId: ticket,
      phase,
      code,
      replacing: typeof expected === "string",
      canInspect: Boolean(token && ticket && !busy),
      canIssue: Boolean(token && ticket && !busy && phase === "ready" && expected !== undefined),
    };
    if (!disposed) publish(state);
  };
  const invalidate = () => {
    generation++;
    pending?.abort();
    pending = null;
    busy = false;
    expected = undefined;
    clearTimeout(displayTimer);
    displayTimer = undefined;
  };
  async function request(action: "inspect" | "issue", confirmed = false) {
    if (
      disposed ||
      busy ||
      !token ||
      !ticket ||
      (action === "issue" && (!confirmed || !state.canIssue))
    )
      return;
    const epoch = ++generation;
    const body =
      action === "inspect"
        ? { action, ticketId: ticket }
        : { action, ticketId: ticket, expectedActivePassId: expected, confirmed: true };
    const bearer = token;
    expected = undefined;
    busy = true;
    clearTimeout(displayTimer);
    const abort = new AbortController();
    pending = abort;
    emit("loading");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = (async () => {
        const response = await fetchImpl("/api/public/owner-pass", {
          method: "POST",
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: abort.signal,
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.status === 401) return { outcome: "signed-out" };
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Error("unavailable");
        const r = data as Record<string, unknown>;
        if (
          action === "inspect" &&
          response.ok &&
          r["outcome"] === "ready" &&
          (r["activePassId"] === null || isUuid(r["activePassId"]))
        )
          return { outcome: "ready", expected: r["activePassId"] as string | null };
        if (
          action === "issue" &&
          response.ok &&
          r["outcome"] === "issued" &&
          isUuid(r["passId"]) &&
          typeof r["passCode"] === "string" &&
          PASS_CODE_RE.test(r["passCode"])
        )
          return { outcome: "shown", code: r["passCode"] };
        if (response.status === 409 && r["outcome"] === "not_eligible")
          return { outcome: "not_eligible" };
        if (action === "issue" && response.status === 409 && r["outcome"] === "state_changed")
          return { outcome: "state_changed" };
        throw new Error("unavailable");
      })();
      const result = await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            abort.abort();
            reject(new Error("unavailable"));
          }, deadlineMs);
        }),
      ]);
      if (disposed || epoch !== generation) return;
      busy = false;
      if (result.outcome === "signed-out") {
        token = null;
        emit("signed-out");
      } else if (result.outcome === "ready") {
        expected = result.expected;
        emit("ready");
      } else if (result.outcome === "shown") {
        emit("shown", result.code);
        displayTimer = setTimeout(() => {
          if (!disposed && epoch === generation) {
            invalidate();
            emit("idle");
          }
        }, displayMs);
      } else if (result.outcome === "state_changed") emit("state_changed");
      else emit("not_eligible");
    } catch {
      if (!disposed && epoch === generation) {
        busy = false;
        emit("uncertain");
      }
    } finally {
      clearTimeout(timeout);
      if (epoch === generation) pending = null;
    }
  }
  return {
    getSnapshot: () => state,
    session(value: string | null) {
      if (!disposed) {
        invalidate();
        token = value;
        ticket = null;
        emit(token ? "idle" : "signed-out");
      }
    },
    select(id: string) {
      if (!disposed) {
        invalidate();
        ticket = isUuid(id) ? id : null;
        emit(token ? "idle" : "signed-out");
      }
    },
    clearSelection() {
      if (!disposed) {
        invalidate();
        ticket = null;
        emit(token ? "idle" : "signed-out");
      }
    },
    inspect() {
      return request("inspect");
    },
    issue(confirmed: boolean) {
      return request("issue", confirmed);
    },
    hide() {
      if (!disposed) {
        invalidate();
        emit(token ? "idle" : "signed-out");
      }
    },
    dispose() {
      invalidate();
      token = null;
      ticket = null;
      disposed = true;
      state = INITIAL_OWNER_PASS;
    },
  };
}
