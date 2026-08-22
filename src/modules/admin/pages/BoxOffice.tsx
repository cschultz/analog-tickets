import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminButton, AdminInput } from "@/components/admin/AdminUI";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { toast } from "sonner";
import { ExternalLink, Printer, Send, Trash2, QrCode, Download, Activity, Search } from "lucide-react";

interface AddonType {
  addon_type: string;
  display_name: string;
}

interface AuditEvent {
  id: string;
  occurred_at: string;
  station_label: string | null;
  action: string;
  result_code: string | null;
  holder_name: string | null;
  ticket_type: string | null;
}

export default function AdminBoxOffice() {
  const [stationCounts, setStationCounts] = useState<Array<{ addon_type: string; display_name: string; redeemed: number }>>([]);
  const [todayStats, setTodayStats] = useState<{ scans: number; checked_in: number }>({ scans: 0, checked_in: 0 });
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [exportBusy, setExportBusy] = useState(false);

  // Test ticket generator
  const [testEmail, setTestEmail] = useState("");
  const [testName, setTestName] = useState("");
  const [testBusy, setTestBusy] = useState(false);

  const sendTestTickets = async () => {
    if (!testEmail.trim() || !testName.trim()) {
      toast.error("Email and name required");
      return;
    }
    setTestBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-test-tickets", {
        body: { action: "create", email: testEmail.trim(), name: testName.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Sent ${data.count} test tickets to ${testEmail}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to send test tickets");
    } finally {
      setTestBusy(false);
    }
  };

  const cleanupTestTickets = async () => {
    if (!confirm("Delete ALL test tickets from the database? This cannot be undone.")) return;
    setTestBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-test-tickets", {
        body: { action: "cleanup" },
      });
      if (error) throw error;
      toast.success(`Deleted ${data.deleted} test registrations`);
    } catch (e: any) {
      toast.error(e.message || "Cleanup failed");
    } finally {
      setTestBusy(false);
    }
  };

  const load = async () => {
    const start = new Date(); start.setHours(0,0,0,0);
    const [{ count: scans }, { count: checkedIn }, addonInv, redemptions] = await Promise.all([
      supabase.from("check_in_events").select("id", { count: "exact", head: true }).gte("occurred_at", start.toISOString()),
      supabase.from("tickets").select("id", { count: "exact", head: true }).gte("checked_in_at", start.toISOString()),
      supabase.from("addon_inventory").select("addon_type, display_name").eq("is_active", true),
      supabase.from("addon_redemptions").select("addon_type").gte("redeemed_at", start.toISOString()),
    ]);
    setTodayStats({ scans: scans || 0, checked_in: checkedIn || 0 });
    const types = (addonInv.data as AddonType[]) || [];
    const counts: Record<string, number> = {};
    ((redemptions.data as { addon_type: string }[]) || []).forEach((r) => {
      counts[r.addon_type] = (counts[r.addon_type] || 0) + 1;
    });
    setStationCounts(types.map((t) => ({ addon_type: t.addon_type, display_name: t.display_name, redeemed: counts[t.addon_type] || 0 })));
  };

  const loadAudit = async () => {
    const { data } = await supabase
      .from("check_in_events")
      .select("id, occurred_at, station_label, action, result_code, holder_name, ticket_type")
      .order("occurred_at", { ascending: false })
      .limit(20);
    setAuditEvents((data as AuditEvent[]) || []);
  };

  useEffect(() => {
    load();
    loadAudit();
    const t = setInterval(loadAudit, 10000);
    return () => clearInterval(t);
  }, []);

  const exportNoShows = async () => {
    setExportBusy(true);
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, holder_name, holder_email, ticket_type, status, registration_id, registrations:registration_id(order_number, payment_status, name, email)")
        .is("checked_in_at", null)
        .eq("status", "active");
      if (error) throw error;
      const rows = ((data as any[]) || []).filter((t) => t.registrations?.payment_status === "paid");
      if (rows.length === 0) { toast.info("No no-shows found"); return; }
      const headers = ["order_number","ticket_type","holder_name","holder_email","buyer_name","buyer_email","ticket_id"];
      const csv = [
        headers.join(","),
        ...rows.map((r) => [
          r.registrations?.order_number || "",
          r.ticket_type || "",
          r.holder_name || "",
          r.holder_email || "",
          r.registrations?.name || "",
          r.registrations?.email || "",
          r.id,
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `no-shows-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} no-show tickets`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        title="Box Office"
        subtitle="Door check-in and live attendance"
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            <AdminButton variant="adminOutline" onClick={() => window.open("/box-office/door-list", "_blank")}>
              <Printer className="w-4 h-4 mr-1" /> Print door list
            </AdminButton>
            <AdminButton variant="adminOutline" onClick={() => window.open("/box-office/manifest", "_blank")}>
              <Printer className="w-4 h-4 mr-1" /> Today's check-ins
            </AdminButton>
            <AdminButton variant="adminOutline" onClick={exportNoShows} disabled={exportBusy}>
              <Download className="w-4 h-4 mr-1" /> {exportBusy ? "Exporting…" : "Export no-shows"}
            </AdminButton>
          </div>
        }
      />

      {/* Primary check-in actions — laptop-optimized two-up hero */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <button
          onClick={() => window.open("/box-office", "_blank")}
          className="group text-left rounded-lg border border-border bg-[hsl(var(--admin-surface))] hover:border-[hsl(var(--admin-accent))] hover:shadow-lg transition-all p-6 flex items-center gap-5"
        >
          <div className="w-14 h-14 rounded-md bg-[hsl(var(--admin-accent))]/10 text-[hsl(var(--admin-accent))] flex items-center justify-center shrink-0 group-hover:bg-[hsl(var(--admin-accent))] group-hover:text-white transition-colors">
            <QrCode className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">Open QR Scanner</div>
              <ExternalLink className="w-4 h-4 opacity-50" />
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Camera-based scan for QR codes on phones or printed tickets. Best for the front gate.
            </div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mt-2 font-mono">
              /box-office
            </div>
          </div>
        </button>

        <button
          onClick={() => window.open("/box-office?search=1", "_blank")}
          className="group text-left rounded-lg border border-border bg-[hsl(var(--admin-surface))] hover:border-[hsl(var(--admin-accent))] hover:shadow-lg transition-all p-6 flex items-center gap-5"
        >
          <div className="w-14 h-14 rounded-md bg-[hsl(var(--admin-accent))]/10 text-[hsl(var(--admin-accent))] flex items-center justify-center shrink-0 group-hover:bg-[hsl(var(--admin-accent))] group-hover:text-white transition-colors">
            <Search className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">Search & check in by name</div>
              <ExternalLink className="w-4 h-4 opacity-50" />
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Look up any attendee by name, email, or order number — covers paid tickets, comps, guest list, and crew.
            </div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground/70 mt-2 font-mono">
              /box-office?search=1
            </div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdminCard className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Checked in today</div>
          <div className="text-3xl font-semibold mt-1">{todayStats.checked_in} <span className="text-base text-muted-foreground">/ 700</span></div>
        </AdminCard>
        <AdminCard className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total scans today</div>
          <div className="text-3xl font-semibold mt-1">{todayStats.scans}</div>
        </AdminCard>
        <AdminCard className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Scanner URLs</div>
            <div className="text-sm mt-1 font-mono">/box-office · /station</div>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <a href="/box-office" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
              Door <ExternalLink className="w-3 h-3" />
            </a>
            <a href="/station" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
              Station <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </AdminCard>
      </div>

      {stationCounts.length > 0 && (
        <AdminCard className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Add-on redemptions today</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {stationCounts.map((s) => (
              <div key={s.addon_type} className="flex items-baseline justify-between">
                <span className="text-sm">{s.display_name}</span>
                <span className="text-xl font-semibold">{s.redeemed}</span>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      <AdminCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[hsl(var(--admin-success))]" />
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Live audit feed</div>
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--admin-success))] animate-pulse" />
          </div>
          <div className="text-[11px] text-muted-foreground">Last 20 scans · refreshes every 10s</div>
        </div>
        {auditEvents.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No scans yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {auditEvents.map((e) => {
              const isOk = e.action === "check_in" && e.result_code === "ok";
              const isUndo = e.action === "undo";
              const dotClass = isOk
                ? "bg-[hsl(var(--admin-success))]"
                : isUndo
                  ? "bg-[hsl(var(--admin-warning))]"
                  : "bg-[hsl(var(--admin-error))]";
              const label = isOk ? "checked in" : isUndo ? "undone" : (e.result_code || "denied");
              return (
                <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                  <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                    {new Date(e.occurred_at).toLocaleTimeString([], { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="font-medium truncate flex-1 min-w-0">{e.holder_name || "—"}</span>
                  <span className="text-xs text-muted-foreground truncate hidden md:inline">{e.ticket_type || ""}</span>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground w-20 text-right shrink-0">{label}</span>
                  <span className="text-[11px] text-muted-foreground/80 w-24 text-right truncate hidden sm:inline shrink-0">{e.station_label || ""}</span>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      <AdminCard className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Scanner Rehearsal</div>
            <div className="text-sm font-medium mt-1">Generate test tickets — one per ticket type</div>
            <div className="text-xs text-muted-foreground mt-1">
              Creates a flagged comp ticket for every active ticket type and emails QR codes. Day-of-week scanning enforces America/Los_Angeles — Friday-only tickets fail with <code>wrong_day</code> on a Saturday in PT. Test tickets are excluded from sales reports.
            </div>
          </div>
          <AdminButton variant="outline" size="sm" onClick={cleanupTestTickets} disabled={testBusy}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete all test tickets
          </AdminButton>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <AdminInput placeholder="Your name" value={testName} onChange={(e) => setTestName(e.target.value)} disabled={testBusy} />
          <AdminInput type="email" placeholder="email@example.org" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} disabled={testBusy} />
          <AdminButton onClick={sendTestTickets} disabled={testBusy}>
            <Send className="w-4 h-4 mr-1" /> {testBusy ? "Working…" : "Send test tickets"}
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard className="p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Scanner message guide</div>
        <div className="text-xs text-muted-foreground mb-3">
          When a QR is scanned, the screen flashes a full-color overlay with an icon and message. Train staff on what each color means before the gate opens.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { color: "bg-emerald-600", icon: "✓", title: "Checked in", desc: "Valid ticket, scanned for the first time today. Show ticket type chip (e.g. VIP, GA, Comp). 'Check ID' badge appears for tickets that require it.", chime: "Success chime + short vibrate" },
            { color: "bg-red-600", icon: "✕", title: "Already checked in", desc: "QR was already scanned earlier. Shows guest name and original check-in time. Do NOT let them re-enter without admin override.", chime: "Warning chime + long vibrate" },
            { color: "bg-amber-600", icon: "!", title: "Wrong day", desc: "Ticket is valid but not for today (e.g. Friday-only ticket scanned on Saturday in PT). Direct guest to upgrade or come back the correct day.", chime: "Warning chime + long vibrate" },
            { color: "bg-red-600", icon: "✕", title: "Unpaid / refunded", desc: "Ticket exists but order is unpaid, refunded, or canceled. Send guest to box office desk.", chime: "Error chime" },
            { color: "bg-red-600", icon: "✕", title: "Not found", desc: "QR doesn't match any ticket in the system. Could be a fake, expired test ticket, or wrong event.", chime: "Error chime" },
            { color: "bg-red-600", icon: "✕", title: "Invalid QR", desc: "Code scanned isn't a Cosmico ticket QR at all (random barcode, URL, etc.).", chime: "Error chime" },
            { color: "bg-sky-600", icon: "!", title: "Queued (offline)", desc: "Phone is offline. Scan was saved locally and will sync when connection returns. Let guest through if you trust the ticket.", chime: "Soft tone" },
            { color: "bg-red-600", icon: "✕", title: "Error", desc: "Network or server problem. Try again; if it persists, fall back to the printed manifest.", chime: "Error chime" },
          ].map((m) => (
            <div key={m.title} className="flex items-start gap-3 p-3 rounded-md border border-border">
              <div className={`${m.color} text-white w-10 h-10 rounded flex items-center justify-center text-xl font-bold shrink-0`}>{m.icon}</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{m.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                <div className="text-[11px] text-muted-foreground/80 mt-1 italic">{m.chime}</div>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}
