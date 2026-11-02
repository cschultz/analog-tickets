/** Order-bound presentation controller. All I/O is injected existing authenticated contracts. */
import { isUuid } from "./checkout-core";
import {
  MAX_REFUND_COMMAND_SELECTION,
  REFUND_COMMAND_CODES,
  type RefundCommandCode,
} from "./refund-command-core";
import { canRefundSelection, type ReconciliationCaseView } from "./refund-review-core";
import type { RefundEligibilityResult } from "./refund-eligibility-core";
import type { OrganizerOrderDetail } from "./organizer-order-detail-core";

export type SupportOutcome =
  "refunded" | "already_refunded" | "in_progress" | "denied" | "unconfirmed";
export interface SupportState {
  phase:
    | "idle"
    | "reviewing"
    | "review"
    | "confirming"
    | "submitting"
    | "done"
    | "unavailable"
    | "unauthorized";
  selected: string[];
  results: RefundEligibilityResult[];
  casesStatus: "unread" | "ready" | "unavailable";
  cases: ReconciliationCaseView[];
  outcome: SupportOutcome | null;
}
export interface SupportDependencies {
  session(): Promise<{ userId: string; token: string } | null>;
  eligibility(eventId: string, ticketIds: string[], token: string): Promise<unknown>;
  cases(eventId: string, token: string): Promise<unknown>;
  refund(eventId: string, ticketIds: string[], token: string): Promise<unknown>;
}
interface AttemptMemory {
  pending: boolean;
  unconfirmed: boolean;
  handled: Set<string>;
  listeners: Set<() => void>;
}
/** Workspace memory only, scoped by actual user/event/order. Never credentials, buyer data or balances. */
export class OrganizerSupportMemory {
  private entries = new Map<string, AttemptMemory>();
  forOrder(userId: string, eventId: string, orderId: string) {
    const key = `${userId}:${eventId}:${orderId}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { pending: false, unconfirmed: false, handled: new Set(), listeners: new Set() };
      this.entries.set(key, entry);
    }
    return entry;
  }
}
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function parseSupportEligibility(
  value: unknown,
  selected: string[],
): RefundEligibilityResult[] | null {
  const reply = record(value),
    rows = reply?.["results"];
  if (
    reply?.["ok"] !== true ||
    !Array.isArray(rows) ||
    rows.length !== selected.length ||
    !rows.length
  )
    return null;
  const byId = new Map<string, RefundEligibilityResult>();
  for (const item of rows) {
    const row = record(item),
      id = row?.["ticketId"],
      status = row?.["status"],
      reason = row?.["reason"];
    if (
      !row ||
      !isUuid(id) ||
      !selected.includes(id) ||
      byId.has(id) ||
      !["issued", "checked_in", "void", "unknown"].includes(String(status)) ||
      !["eligible", "not_issued", "checked_in", "nonrefundable", "not_found"].includes(
        String(reason),
      ) ||
      typeof row["eligible"] !== "boolean" ||
      typeof row["refundableAtIssue"] !== "boolean" ||
      row["eligible"] !== (reason === "eligible") ||
      (reason === "eligible" && (status !== "issued" || row["refundableAtIssue"] !== true))
    )
      return null;
    byId.set(id, {
      ticketId: id,
      status: status as string,
      reason: reason as RefundEligibilityResult["reason"],
      eligible: row["eligible"],
      refundableAtIssue: row["refundableAtIssue"],
    });
  }
  return selected.map((id) => byId.get(id)!);
}
export function parseOrderSupportCases(
  value: unknown,
  orderTicketIds: string[],
): ReconciliationCaseView[] | null {
  const reply = record(value),
    rows = reply?.["cases"];
  if (reply?.["ok"] !== true || !Array.isArray(rows) || rows.length > 1000) return null;
  const cases: ReconciliationCaseView[] = [],
    seen = new Set<string>();
  for (const item of rows) {
    const row = record(item),
      id = row?.["caseId"],
      ids = row?.["ticketIds"];
    if (
      !row ||
      !isUuid(id) ||
      seen.has(id) ||
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      !ids.every(isUuid) ||
      new Set(ids).size !== ids.length ||
      row["ticketCount"] !== ids.length ||
      !["pending", "provider_refunded", "reconciliation_needed"].includes(String(row["state"])) ||
      ![
        "refund_outcome_unconfirmed",
        "internal_completion_unconfirmed",
        "internal_reversal_unconfirmed",
        "unspecified",
      ].includes(String(row["reason"])) ||
      ![row["createdAt"], row["updatedAt"]].every(
        (date) =>
          typeof date === "string" && date.length <= 64 && Number.isFinite(Date.parse(date)),
      )
    )
      return null;
    seen.add(id);
    const tickets = (ids as string[]).filter((ticketId) => orderTicketIds.includes(ticketId));
    if (tickets.length)
      cases.push({
        caseId: id,
        state: row["state"] as ReconciliationCaseView["state"],
        reason: row["reason"] as ReconciliationCaseView["reason"],
        ticketCount: tickets.length,
        ticketIds: tickets,
        createdAt: row["createdAt"] as string,
        updatedAt: row["updatedAt"] as string,
      });
  }
  return cases;
}
export function supportOutcome(value: unknown, count: number): SupportOutcome {
  const response = record(value),
    code = response?.["code"];
  if (
    !response ||
    !REFUND_COMMAND_CODES.includes(code as RefundCommandCode) ||
    response["ok"] !== (code === "refunded") ||
    response["ticketsRefunded"] !== (code === "refunded" ? count : 0)
  )
    return "unconfirmed";
  if (code === "refunded" || code === "already_refunded" || code === "in_progress") return code;
  return code === "server_error" ? "unconfirmed" : "denied";
}

export class OrganizerSupportController {
  private state: SupportState = {
    phase: "idle",
    selected: [],
    results: [],
    casesStatus: "unread",
    cases: [],
    outcome: null,
  };
  private listeners = new Set<() => void>();
  private version = 0;
  private disposed = false;
  private busy = false;
  private entry: AttemptMemory;
  private readonly ticketIds: string[];
  private memoryChanged = () => {
    if (!this.disposed) this.update({});
  };
  private notifyMemory() {
    [...this.entry.listeners].forEach((listener) => listener());
  }
  constructor(
    readonly userId: string,
    readonly order: OrganizerOrderDetail,
    private deps: SupportDependencies,
    memory: OrganizerSupportMemory,
  ) {
    this.ticketIds = order.tickets.map((ticket) => ticket.id);
    this.entry = memory.forOrder(userId, order.eventId, order.id);
    if (
      ![userId, order.eventId, order.id].every(isUuid) ||
      this.ticketIds.length > 200 ||
      !this.ticketIds.every(isUuid) ||
      new Set(this.ticketIds).size !== this.ticketIds.length
    )
      this.disposed = true;
    if (!this.disposed) this.entry.listeners.add(this.memoryChanged);
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<SupportState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private current(version: number) {
    return !this.disposed && this.version === version;
  }
  invalidate() {
    this.disposed = true;
    ++this.version;
    this.entry.listeners.delete(this.memoryChanged);
    this.update({ phase: "unauthorized", results: [], cases: [], casesStatus: "unread" });
  }
  handled(ticketId: string) {
    return this.entry.handled.has(ticketId);
  }
  hasOutstandingRequest() {
    return this.entry.pending || this.entry.unconfirmed;
  }
  select(ids: string[]) {
    if (this.disposed || this.busy) return;
    ++this.version;
    if (
      ids.length > MAX_REFUND_COMMAND_SELECTION ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !this.ticketIds.includes(id))
    ) {
      this.update({
        phase: "unavailable",
        selected: [],
        results: [],
        cases: [],
        casesStatus: "unread",
        outcome: null,
      });
      return;
    }
    this.update({
      phase: "idle",
      selected: [...ids],
      results: [],
      cases: [],
      casesStatus: "unread",
      outcome: null,
    });
  }
  originalAmount(): number | null {
    if (!this.state.selected.length) return null;
    const shares = this.order.pricing?.paidShares;
    if (!shares || new Set(shares.map((share) => share.ticketId)).size !== shares.length)
      return null;
    let amount = 0;
    for (const id of this.state.selected) {
      const share = shares.find((share) => share.ticketId === id);
      if (!share || !Number.isSafeInteger(share.amountCents) || share.amountCents < 0) return null;
      amount += share.amountCents;
    }
    return Number.isSafeInteger(amount) && amount > 0 && amount <= this.order.originalTotalCents
      ? amount
      : null;
  }
  blockingMessage(): string | null {
    if (this.entry.pending)
      return "A refund request for this order is still in progress. Do not submit another request.";
    if (this.entry.unconfirmed)
      return "A previous refund outcome is unconfirmed. Do not retry; the installation owner must reconcile it first.";
    if (this.state.casesStatus !== "ready")
      return "Current support status must be available before a refund can be confirmed.";
    if (this.state.cases.length)
      return "This order has an unresolved refund case. Do not retry; ask the installation owner to reconcile it.";
    if (this.state.selected.some((id) => this.handled(id)))
      return "These tickets already had a refund request handled. Reload the order records before choosing other tickets.";
    if (this.originalAmount() === null)
      return "The original paid allocation is unavailable for this selection. No refund amount is guessed or submitted.";
    return null;
  }
  canConfirm() {
    return (
      !this.disposed &&
      !this.busy &&
      ["review", "confirming"].includes(this.state.phase) &&
      canRefundSelection(this.state.results) &&
      this.state.results.length === this.state.selected.length &&
      !this.blockingMessage()
    );
  }
  confirm() {
    if (this.state.phase === "review" && this.canConfirm()) this.update({ phase: "confirming" });
  }
  cancel() {
    if (this.state.phase === "confirming") this.update({ phase: "review" });
  }
  async checkCases() {
    if (this.disposed || this.busy) return;
    const version = ++this.version;
    this.busy = true;
    this.update({ phase: "reviewing", results: [], cases: [], casesStatus: "unread" });
    try {
      const session = await this.deps.session();
      if (!this.current(version)) return;
      if (!session || session.userId !== this.userId || !session.token) {
        this.update({ phase: "unauthorized" });
        return;
      }
      const response = await this.deps.cases(this.order.eventId, session.token);
      if (!this.current(version)) return;
      const cases = parseOrderSupportCases(response, this.ticketIds);
      this.update({
        phase: "review",
        cases: cases ?? [],
        casesStatus: cases === null ? "unavailable" : "ready",
      });
    } catch {
      if (this.current(version)) this.update({ phase: "review", casesStatus: "unavailable" });
    } finally {
      this.busy = false;
      if (this.current(version)) this.update({});
    }
  }
  async review() {
    if (this.disposed || this.busy || !this.state.selected.length) return;
    const version = ++this.version,
      ids = [...this.state.selected];
    this.busy = true;
    this.update({
      phase: "reviewing",
      results: [],
      cases: [],
      casesStatus: "unread",
      outcome: null,
    });
    try {
      const session = await this.deps.session();
      if (!this.current(version)) return;
      if (!session || session.userId !== this.userId || !session.token) {
        this.update({ phase: "unauthorized" });
        return;
      }
      const [eligibility, reconciliation] = await Promise.allSettled([
        this.deps.eligibility(this.order.eventId, ids, session.token),
        this.deps.cases(this.order.eventId, session.token),
      ]);
      if (!this.current(version)) return;
      const results =
        eligibility.status === "fulfilled" ? parseSupportEligibility(eligibility.value, ids) : null;
      const cases =
        reconciliation.status === "fulfilled"
          ? parseOrderSupportCases(reconciliation.value, this.ticketIds)
          : null;
      if (!results) {
        this.update({ phase: "unavailable" });
        return;
      }
      this.update({
        phase: "review",
        results,
        cases: cases ?? [],
        casesStatus: cases === null ? "unavailable" : "ready",
      });
    } catch {
      if (this.current(version)) this.update({ phase: "unavailable" });
    } finally {
      this.busy = false;
      if (this.current(version)) this.update({});
    }
  }
  async submit() {
    if (this.state.phase !== "confirming" || !this.canConfirm()) return;
    const version = ++this.version,
      ids = [...this.state.selected];
    this.busy = true;
    this.entry.pending = true;
    this.notifyMemory();
    this.update({ phase: "submitting" });
    let entered = false;
    const recordOutcome = (outcome: SupportOutcome) => {
      if (outcome === "unconfirmed" || outcome === "in_progress") this.entry.unconfirmed = true;
      if (outcome === "refunded" || outcome === "already_refunded")
        ids.forEach((id) => this.entry.handled.add(id));
      this.notifyMemory();
      if (this.current(version)) this.update({ phase: "done", outcome });
    };
    try {
      const session = await this.deps.session();
      if (!this.current(version)) return;
      if (!session || session.userId !== this.userId || !session.token) {
        this.update({ phase: "unauthorized" });
        return;
      }
      entered = true;
      const response = await this.deps.refund(this.order.eventId, ids, session.token);
      recordOutcome(supportOutcome(response, ids.length));
    } catch {
      if (entered) recordOutcome("unconfirmed");
      else if (this.current(version)) this.update({ phase: "unavailable" });
    } finally {
      this.entry.pending = false;
      this.notifyMemory();
      this.busy = false;
      if (this.current(version)) this.update({});
    }
  }
}
