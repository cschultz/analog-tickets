import { parseAdminWorkspace, type AdminWorkspace } from "./admin-workspace-core";
import { organizerDay } from "./organizer-browse-core";
import { organizerCsvCell } from "./organizer-records-core";

export interface ReportWindow {
  from: string;
  through: string;
}
export type OrganizerDateReport =
  | {
      ok: true;
      window: ReportWindow;
      eventId: string;
      timeZone: string;
      days: AdminWorkspace["daily"];
      orders: number;
      originalPaidCents: number;
      coverage: { completeHistory: boolean; from: string | null };
    }
  | {
      ok: false;
      code: "invalid_window" | "range_too_large" | "history_not_loaded" | "unavailable";
    };
const DAY = 86400000;
const dayAt = (value: number) => new Date(value).toISOString().slice(0, 10);

/** Calendar days in the event's timezone, not browser-local midnight arithmetic. */
export function reportPreset(timeZone: string, days: 7 | 30 | 90, now = new Date()): ReportWindow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const through = `${part("year")}-${part("month")}-${part("day")}`;
  return { from: dayAt(Date.parse(through) - (days - 1) * DAY), through };
}

/** The existing aggregate read returns the latest 90 nonempty purchase dates.
 * Their oldest date is an inclusive completeness frontier, NOT a sample.
 * Older windows are refused when the read explicitly reports omitted history.
 */
export function buildOrganizerReport(
  workspace: AdminWorkspace,
  window: ReportWindow,
): OrganizerDateReport {
  const w = parseAdminWorkspace(workspace, workspace.event.id);
  if (!w) return { ok: false, code: "unavailable" };
  if (!organizerDay(window.from) || !organizerDay(window.through) || window.from > window.through)
    return { ok: false, code: "invalid_window" };
  const start = Date.parse(window.from),
    end = Date.parse(window.through);
  if ((end - start) / DAY + 1 > 90) return { ok: false, code: "range_too_large" };
  const completeHistory = w.dailyDateCount === w.daily.length;
  const coveredFrom = completeHistory ? null : w.daily.at(-1)!.day;
  if (coveredFrom && window.from < coveredFrom) return { ok: false, code: "history_not_loaded" };
  const saved = new Map(w.daily.map((row) => [row.day, row]));
  const days: AdminWorkspace["daily"] = [];
  let orders = 0,
    originalPaidCents = 0;
  for (let instant = start; instant <= end; instant += DAY) {
    const day = dayAt(instant),
      row = saved.get(day);
    const next = { day, orders: row?.orders ?? 0, originalPaidCents: row?.originalPaidCents ?? 0 };
    days.push(next);
    orders += next.orders;
    originalPaidCents += next.originalPaidCents;
  }
  if (!Number.isSafeInteger(orders) || !Number.isSafeInteger(originalPaidCents))
    return { ok: false, code: "unavailable" };
  return {
    ok: true,
    window: { ...window },
    eventId: w.event.id,
    timeZone: w.event.timezone,
    days,
    orders,
    originalPaidCents,
    coverage: { completeHistory, from: coveredFrom },
  };
}

/** Exact displayed window; aggregates only, no buyer fields or inferred refund/net amounts. */
export function organizerReportCsv(report: OrganizerDateReport): string {
  if (!report.ok) throw Error("No complete report to export");
  return [
    [
      "event_id",
      "event_timezone",
      "window_from",
      "window_through",
      "order_creation_day",
      "paid_or_refunded_orders",
      "original_paid_total_cents",
      "currency",
    ],
    ...report.days.map((day) => [
      report.eventId,
      report.timeZone,
      report.window.from,
      report.window.through,
      day.day,
      day.orders,
      day.originalPaidCents,
      "USD",
    ]),
  ]
    .map((row) => row.map(organizerCsvCell).join(","))
    .join("\r\n");
}
