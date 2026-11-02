import { useState } from "react";
import type { AdminWorkspace } from "@/lib/admin-workspace-core";
import {
  buildOrganizerReport,
  organizerReportCsv,
  reportPreset,
  type ReportWindow,
} from "@/lib/organizer-report-core";
import { organizerMoney } from "@/lib/organizer-order-detail-core";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminStatCard } from "./AdminCard";

const errors = {
  invalid_window: "Choose valid start and end dates, with the start no later than the end.",
  range_too_large: "Choose up to 90 calendar days. No partial report or export was produced.",
  history_not_loaded:
    "This window reaches older history that was not loaded. Choose a window on or after the coverage date shown; no partial total or export was produced.",
  unavailable:
    "The workspace snapshot is incomplete or inconsistent. Reload workspace before using this report.",
};
export function OrganizerSalesReport({
  workspace: w,
  initialWindow,
  onWindow,
}: {
  workspace: AdminWorkspace;
  initialWindow?: ReportWindow | undefined;
  onWindow?: ((window: ReportWindow) => void) | undefined;
}) {
  const [window, setWindow] = useState(() => initialWindow ?? reportPreset(w.event.timezone, 30));
  const [draft, setDraft] = useState(window),
    [exported, setExported] = useState("");
  const report = buildOrganizerReport(w, window);
  const snapshotAvailable = report.ok || report.code !== "unavailable";
  const edited = draft.from !== window.from || draft.through !== window.through;
  const coverageFrom = w.dailyDateCount > w.daily.length ? w.daily.at(-1)?.day : null;
  function apply(next: ReportWindow) {
    setDraft(next);
    setWindow(next);
    setExported("");
    if (buildOrganizerReport(w, next).ok) onWindow?.(next);
  }
  function download() {
    if (!report.ok || edited) return;
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", organizerReportCsv(report)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `analog-test-sales-${report.eventId}-${window.from}-${window.through}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExported(
      `Exported ${report.days.length} daily rows for ${window.from} through ${window.through}.`,
    );
  }
  return (
    <>
      <AdminPageHeader title="Sales Report" subtitle={w.event.name} />
      <p>
        Original paid or refunded orders by creation date in <strong>{w.event.timezone}</strong>.
        Inclusive dates, up to 90 calendar days. This is TEST application data, not net revenue,
        payment-settlement timing or a financial reconciliation report.
      </p>
      <form
        className="admin-report-window"
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
      >
        <label>
          Created from ({w.event.timezone})
          <input
            type="date"
            required
            value={draft.from}
            onChange={(e) => {
              setDraft({ ...draft, from: e.target.value });
              setExported("");
            }}
          />
        </label>
        <label>
          Created through ({w.event.timezone})
          <input
            type="date"
            required
            value={draft.through}
            onChange={(e) => {
              setDraft({ ...draft, through: e.target.value });
              setExported("");
            }}
          />
        </label>
        <button className="admin-primary-button" type="submit">
          Apply date window
        </button>
        <div className="admin-record-actions" aria-label="Report presets">
          {([7, 30, 90] as const).map((days) => (
            <button
              type="button"
              className="admin-secondary-button"
              key={days}
              onClick={() => apply(reportPreset(w.event.timezone, days))}
            >
              Last {days} days
            </button>
          ))}
        </div>
      </form>
      <p className="checkout-note">
        This is the current workspace snapshot. Reload workspace to refresh it; that does not
        contact payment providers.
      </p>
      <p className="checkout-note">
        {!report.ok && report.code === "unavailable"
          ? "Complete history coverage cannot be verified from this snapshot."
          : coverageFrom
            ? `Complete report coverage begins ${coverageFrom}. Older purchase dates exist but are not loaded; windows crossing that boundary are refused.`
            : "All recorded purchase dates are loaded. Days without matching paid/refunded orders are shown as zero."}{" "}
        {snapshotAvailable ? (
          <>
            The source read includes the latest {w.daily.length} of {w.dailyDateCount} nonempty
            purchase dates, not a sample of orders.
          </>
        ) : null}
      </p>
      {edited ? (
        <p role="status">Dates changed. Apply the window to update the report and enable export.</p>
      ) : null}
      {!report.ok ? (
        <p role="alert">{errors[report.code]}</p>
      ) : (
        <section aria-label="Date-window results">
          <h2>
            {window.from} through {window.through} · {w.event.timezone}
          </h2>
          <div className="admin-metrics admin-report-metrics">
            <AdminStatCard
              label="Original paid totals in window"
              value={organizerMoney(report.originalPaidCents)}
            />
            <AdminStatCard label="Paid or refunded orders in window" value={report.orders} />
          </div>
          <p>
            Includes orders currently recorded as paid or refunded. Original prices are unchanged by
            later refunds. Pending/cancelled orders, refund dates, fees and provider balances are
            not summed here.
          </p>
          <button
            type="button"
            className="admin-secondary-button"
            disabled={edited}
            onClick={download}
          >
            Export this date window (CSV)
          </button>
          {exported ? <p role="status">{exported}</p> : null}
          {!report.orders ? <p>No paid or refunded orders in this complete window.</p> : null}
          <div
            className="admin-table-scroll admin-report-table"
            role="region"
            tabIndex={0}
            aria-label="Daily sales report"
          >
            <table>
              <caption>Original paid totals by order creation date · {w.event.timezone}</caption>
              <thead>
                <tr>
                  <th scope="col">Creation date</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Original paid totals</th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => (
                  <tr key={day.day}>
                    <th scope="row">{day.day}</th>
                    <td>{day.orders}</td>
                    <td>{organizerMoney(day.originalPaidCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {snapshotAvailable ? (
        <details className="admin-data-definitions">
          <summary>All-time attendance and refund context — not date-filtered</summary>
          <p>
            {w.summary.paidOrders} paid/refunded orders with original totals{" "}
            {organizerMoney(w.summary.originalPaidCents)}. {w.attendance.checkedIn} /{" "}
            {w.attendance.validTickets} valid tickets checked in; {w.attendance.voidTickets} void
            tickets. {w.summary.pendingOrders} pending and {w.summary.cancelledOrders} cancelled
            orders.
          </p>
          <p>
            Recorded refund reversals: {organizerMoney(w.refunds.knownCents)} across{" "}
            {w.refunds.records} records. {w.refunds.unknownAmounts} records have an unknown
            amount/currency. Pending or failed attempts are not included. Refund totals use all
            history, not this purchase-date window. No net total is inferred.
          </p>
        </details>
      ) : null}
    </>
  );
}
