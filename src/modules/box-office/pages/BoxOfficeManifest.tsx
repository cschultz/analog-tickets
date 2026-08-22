import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CheckInRow {
  id: string;
  ticket_id: string | null;
  registration_id: string | null;
  occurred_at: string;
  station_label: string | null;
  action: string;
  result_code: string | null;
  holder_name: string | null;
  ticket_type: string | null;
}

function startOfDayPT(d = new Date()) {
  const pt = new Date(d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  pt.setHours(0, 0, 0, 0);
  // convert back to UTC ISO
  const offsetMs = d.getTime() - new Date(d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })).getTime();
  return new Date(pt.getTime() + offsetMs);
}

export default function BoxOfficeManifest() {
  const [rows, setRows] = useState<CheckInRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt] = useState(new Date());

  const [cachedAt, setCachedAt] = useState<Date | null>(null);

  useEffect(() => {
    // Hydrate from localStorage cache first so the manifest is usable offline.
    try {
      const cached = localStorage.getItem("box_office_manifest_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.rows) {
          setRows(parsed.rows);
          setCachedAt(parsed.savedAt ? new Date(parsed.savedAt) : null);
          setLoading(false);
        }
      }
    } catch {}

    (async () => {
      try {
        const start = startOfDayPT();
        const { data, error } = await supabase
          .from("check_in_events")
          .select("id, ticket_id, registration_id, occurred_at, station_label, action, result_code, holder_name, ticket_type")
          .gte("occurred_at", start.toISOString())
          .order("occurred_at", { ascending: true });
        if (error) throw error;
        const fresh = (data as CheckInRow[]) || [];
        setRows(fresh);
        setCachedAt(new Date());
        try {
          localStorage.setItem(
            "box_office_manifest_cache",
            JSON.stringify({ rows: fresh, savedAt: new Date().toISOString() })
          );
        } catch {}
      } catch {
        // Offline / RLS — keep cached rows visible
      } finally {
        setLoading(false);
        setTimeout(() => window.print(), 600);
      }
    })();
  }, []);

  const checkedIn = useMemo(() => {
    // Latest event per ticket; only those that ended in a successful check_in (not undone)
    const byTicket = new Map<string, CheckInRow>();
    rows.forEach((r) => {
      if (!r.ticket_id) return;
      const prev = byTicket.get(r.ticket_id);
      if (!prev || new Date(r.occurred_at) > new Date(prev.occurred_at)) byTicket.set(r.ticket_id, r);
    });
    return Array.from(byTicket.values())
      .filter((r) => r.action === "check_in" && r.result_code === "ok")
      .sort((a, b) => (a.holder_name || "").localeCompare(b.holder_name || ""));
  }, [rows]);

  const exceptions = useMemo(
    () => rows.filter((r) => r.action === "denied"),
    [rows]
  );

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    checkedIn.forEach((r) => m.set(r.ticket_type || "—", (m.get(r.ticket_type || "—") || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [checkedIn]);

  const fmtTime = (s: string) =>
    new Date(s).toLocaleString([], { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

  return (
    <div className="manifest min-h-screen bg-white text-black p-8 font-sans">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .manifest table { border-collapse: collapse; width: 100%; }
        .manifest th, .manifest td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 11px; text-align: left; vertical-align: top; }
        .manifest th { background: #f3f4f6; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; }
        .manifest h1 { font-size: 22px; font-weight: 700; }
        .manifest h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 24px; margin-bottom: 8px; border-bottom: 2px solid #111; padding-bottom: 4px; }
        .badge-amber { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 3px; font-weight: 600; font-size: 10px; }
        .badge-red { background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 3px; font-weight: 600; font-size: 10px; }
      `}</style>

      <div className="no-print mb-6 flex items-center gap-3">
        <button onClick={() => window.print()} className="px-4 py-2 bg-black text-white rounded">Print</button>
        <button onClick={() => window.close()} className="px-4 py-2 border rounded">Close</button>
        <span className="text-sm text-gray-500">
          Tip: choose "Save as PDF" to archive. Cached locally for offline use
          {cachedAt ? ` · last sync ${cachedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}` : ""}.
        </span>
      </div>

      <header className="flex items-end justify-between border-b-2 border-black pb-3">
        <div>
          <h1>Door Manifest</h1>
          <div className="text-sm">
            {generatedAt.toLocaleString([], {
              timeZone: "America/Los_Angeles",
              dateStyle: "full",
              timeStyle: "short",
            })}{" "}
            PT
          </div>
        </div>
        <div className="text-right text-sm">
          <div><strong>{checkedIn.length}</strong> checked in</div>
          <div><strong>{exceptions.length}</strong> exceptions</div>
        </div>
      </header>

      <section>
        <h2>Summary by Ticket Type</h2>
        <table>
          <thead>
            <tr><th>Ticket type</th><th style={{ width: 80 }}>Count</th></tr>
          </thead>
          <tbody>
            {byType.length === 0 && (
              <tr><td colSpan={2} className="text-center text-gray-500">No check-ins yet today</td></tr>
            )}
            {byType.map(([t, n]) => (
              <tr key={t}><td>{t}</td><td>{n}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Checked In ({checkedIn.length})</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Name</th>
              <th>Ticket type</th>
              <th style={{ width: 80 }}>Time</th>
              <th>Station</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center">Loading…</td></tr>}
            {!loading && checkedIn.length === 0 && <tr><td colSpan={5} className="text-center text-gray-500">Nobody checked in yet today</td></tr>}
            {checkedIn.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td><strong>{r.holder_name || "—"}</strong></td>
                <td>{r.ticket_type || "—"}</td>
                <td>{fmtTime(r.occurred_at)}</td>
                <td>{r.station_label || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {exceptions.length > 0 && (
        <section className="page-break">
          <h2>Exceptions ({exceptions.length})</h2>
          <p className="text-xs text-gray-600 mb-2">
            Denied scans: duplicate, wrong day, unpaid, or unknown ticket. Investigate before re-admitting.
          </p>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Name</th>
                <th>Ticket type</th>
                <th style={{ width: 90 }}>Reason</th>
                <th style={{ width: 80 }}>Time</th>
                <th>Station</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((r, i) => {
                const code = r.result_code || "error";
                const bad = code === "not_found" || code === "unpaid" || code === "invalid_pin";
                return (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td>{r.holder_name || "—"}</td>
                    <td>{r.ticket_type || "—"}</td>
                    <td><span className={bad ? "badge-red" : "badge-amber"}>{code}</span></td>
                    <td>{fmtTime(r.occurred_at)}</td>
                    <td>{r.station_label || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-8 pt-3 border-t text-xs text-gray-500 flex justify-between">
        <span>Cosmico · Cosmico · Door Manifest</span>
        <span>Generated {generatedAt.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</span>
      </footer>
    </div>
  );
}
