import type { OwnerTicket } from "./owner-tickets-core";
import { OWNER_TICKET_PAGE_SIZE, validEventStart, validEventTimezone } from "./owner-tickets-core";
import { isUuid } from "./transfer-otp-core";

export type RecoveryState = {
  phase: "checking" | "signed-out" | "idle" | "loading" | "ready" | "unavailable";
  tickets: OwnerTicket[];
  offset: number;
  hasMore: boolean;
  canLoad: boolean;
};
export const INITIAL_RECOVERY: RecoveryState = {
  phase: "checking",
  tickets: [],
  offset: 0,
  hasMore: false,
  canLoad: false,
};

export function parseRecoveryPage(
  body: unknown,
): { tickets: OwnerTicket[]; hasMore: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (
    !Array.isArray(b["tickets"]) ||
    b["tickets"].length > OWNER_TICKET_PAGE_SIZE ||
    typeof b["hasMore"] !== "boolean"
  )
    return null;
  const ids = new Set<string>();
  const tickets: OwnerTicket[] = [];
  for (const raw of b["tickets"]) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (!isUuid(r["ticketId"]) || ids.has(r["ticketId"])) return null;
    ids.add(r["ticketId"]);
    if (
      typeof r["eventName"] !== "string" ||
      !r["eventName"].trim() ||
      r["eventName"].length > 200 ||
      typeof r["ticketTypeName"] !== "string" ||
      !r["ticketTypeName"].trim() ||
      r["ticketTypeName"].length > 200
    )
      return null;
    const checked = r["checkedInAt"];
    if (checked !== null && (typeof checked !== "string" || !Number.isFinite(Date.parse(checked))))
      return null;
    const status = r["status"];
    if (status !== "issued" && status !== "refunded" && status !== "void" && status !== "unknown")
      return null;
    const eventStartsAt = r["eventStartsAt"];
    const eventTimezone = r["eventTimezone"];
    const venueName = r["venueName"];
    if (
      !(
        (eventStartsAt === null && eventTimezone === null) ||
        (validEventStart(eventStartsAt) && validEventTimezone(eventTimezone))
      ) ||
      !(
        venueName === null ||
        (typeof venueName === "string" &&
          venueName.trim() === venueName &&
          venueName.length > 0 &&
          venueName.length <= 200)
      )
    )
      return null;
    tickets.push({
      ticketId: r["ticketId"],
      eventName: r["eventName"],
      ticketTypeName: r["ticketTypeName"],
      eventStartsAt: eventStartsAt as string | null,
      eventTimezone: eventTimezone as string | null,
      venueName: venueName as string | null,
      status,
      checkedInAt: checked as string | null,
    });
  }
  if (b["hasMore"] && tickets.length !== OWNER_TICKET_PAGE_SIZE) return null;
  return { tickets, hasMore: b["hasMore"] };
}

/** In-memory only. Every session/refresh change invalidates pending work. */
export function createRecoveryController(
  publish: (state: RecoveryState) => void,
  fetchImpl: typeof fetch = fetch,
  deadlineMs = 12000,
) {
  let token: string | null = null;
  let epoch = 0;
  let disposed = false;
  let pending: AbortController | null = null;
  let state = INITIAL_RECOVERY;
  const emit = (next: RecoveryState) => {
    state = next;
    if (!disposed) publish(next);
  };
  const clear = (phase: RecoveryState["phase"]) =>
    emit({ phase, tickets: [], offset: 0, hasMore: false, canLoad: Boolean(token) });
  function invalidate() {
    epoch++;
    pending?.abort();
    pending = null;
  }
  return {
    session(accessToken: string | null) {
      if (disposed) return;
      invalidate();
      token = accessToken;
      clear(token ? "idle" : "signed-out");
    },
    unavailable() {
      if (!disposed) {
        invalidate();
        token = null;
        clear("unavailable");
      }
    },
    async load(offset = 0) {
      if (disposed || !token || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
        return;
      invalidate();
      const generation = epoch;
      const bearer = token;
      const abort = new AbortController();
      pending = abort;
      emit({ phase: "loading", tickets: [], offset, hasMore: false, canLoad: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abort.abort();
            reject(new Error("unavailable"));
          }, deadlineMs);
        });
        const work = (async () => {
          const response = await fetchImpl("/api/public/owner-tickets", {
            method: "POST",
            cache: "no-store",
            credentials: "omit",
            referrerPolicy: "no-referrer",
            headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
            body: JSON.stringify({ offset }),
            signal: abort.signal,
          });
          if (response.status === 401) return "signed-out" as const;
          if (!response.ok) throw new Error("unavailable");
          const page = parseRecoveryPage(await response.json());
          if (!page) throw new Error("unavailable");
          return page;
        })();
        const result = await Promise.race([work, timeout]);
        if (disposed || generation !== epoch) return;
        if (result === "signed-out") {
          token = null;
          clear("signed-out");
        } else
          emit({
            phase: "ready",
            tickets: result.tickets,
            offset,
            hasMore: result.hasMore,
            canLoad: true,
          });
      } catch {
        if (!disposed && generation === epoch) clear("unavailable");
      } finally {
        clearTimeout(timer);
        if (generation === epoch) pending = null;
      }
    },
    next() {
      return state.phase === "ready" && state.hasMore
        ? this.load(state.offset + OWNER_TICKET_PAGE_SIZE)
        : Promise.resolve();
    },
    previous() {
      return state.phase === "ready" && state.offset > 0
        ? this.load(Math.max(0, state.offset - OWNER_TICKET_PAGE_SIZE))
        : Promise.resolve();
    },
    dispose() {
      invalidate();
      token = null;
      disposed = true;
      state = INITIAL_RECOVERY;
    },
  };
}

export function ticketStatusLabel(ticket: OwnerTicket): string {
  if (ticket.status === "refunded") return "Refunded — not valid for entry";
  if (ticket.status === "void") return "Voided — not valid for entry";
  if (ticket.status === "unknown") return "Status unavailable — contact support before attending";
  return ticket.checkedInAt ? "Already checked in" : "Issued — admission pass not shown here";
}

export interface RecoveryAuth {
  onAuthStateChange: (
    callback: (event: string, session: { access_token: string } | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } };
  getSession: () => Promise<{ data: { session: { access_token: string } | null }; error: unknown }>;
}

/** The initial lookup is subordinate to every subsequent auth event. */
export function observeRecoverySession(
  auth: RecoveryAuth,
  controller: ReturnType<typeof createRecoveryController>,
  deadlineMs = 12000,
): () => void {
  let observed = false;
  let closed = false;
  let subscription: { unsubscribe: () => void } | undefined;
  const timer = setTimeout(() => {
    if (!closed && !observed) {
      observed = true;
      controller.unavailable();
    }
  }, deadlineMs);
  try {
    subscription = auth.onAuthStateChange((_event, session) => {
      if (closed) return;
      observed = true;
      clearTimeout(timer);
      controller.session(session?.access_token ?? null);
    }).data.subscription;
    void auth
      .getSession()
      .then(({ data, error }) => {
        if (closed || observed) return;
        observed = true;
        clearTimeout(timer);
        if (error) controller.unavailable();
        else controller.session(data.session?.access_token ?? null);
      })
      .catch(() => {
        if (!closed && !observed) {
          observed = true;
          clearTimeout(timer);
          controller.unavailable();
        }
      });
  } catch {
    clearTimeout(timer);
    controller.unavailable();
  }
  return () => {
    closed = true;
    clearTimeout(timer);
    subscription?.unsubscribe();
    controller.dispose();
  };
}
