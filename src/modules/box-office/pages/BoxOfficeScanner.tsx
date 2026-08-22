import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, XCircle, Wifi, WifiOff, Search, Undo2, RefreshCw, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  enqueueScan,
  listQueue,
  removeFromQueue,
  bumpAttempts,
  type QueuedScan,
} from "@/lib/boxOfficeQueue";
import { chimeOk, chimeWarning, chimeError, unlockAudio, vibrate } from "@/lib/boxOfficeFeedback";
import { getTicketMeta } from "@/lib/boxOfficeTicketMeta";
import { useAuth } from "@/hooks/useAuth";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

type ScanStatus = "ok" | "already" | "wrong_day" | "unpaid" | "not_found" | "invalid_pin" | "queued" | "error" | null;

const NETWORK_ERROR_MARKERS = [
  "failed to fetch",
  "load failed",
  "networkerror",
  "network request failed",
  "the internet connection appears to be offline",
  "fetch failed",
];

function getErrorMessage(error: unknown) {
  if (!error) return "Unknown scanner error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const maybeError = error as { message?: string; details?: string; hint?: string; code?: string };
  return maybeError.message || maybeError.details || maybeError.hint || maybeError.code || "Unknown scanner error";
}

function isNetworkFailure(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return NETWORK_ERROR_MARKERS.some((marker) => message.includes(marker));
}

interface FlashState {
  status: ScanStatus;
  name?: string;
  ticketType?: string;
  message?: string;
  previousAt?: string;
  previousStation?: string;
  ticketId?: string;
  registrationId?: string;
}

interface OrderTicket {
  ticket_id: string;
  holder_name: string | null;
  ticket_type: string | null;
  checked_in_at: string | null;
  status: string | null;
}
interface OrderPanelState {
  registrationId: string;
  orderNumber: string | null;
  paymentStatus: string | null;
  tickets: OrderTicket[];
  busyTicketId?: string | null;
}

const SS_PIN = "bo_pin";
const SS_LABEL = "bo_label";
const SS_SESSION = "bo_session_label";

function todayKey() {
  // Canonical full lowercase day name in PT ("friday" | "saturday" | "sunday").
  // ticket_types.valid_days is stored as full names; sending the short "fri"
  // form previously caused every scan to be denied as wrong_day.
  return new Date()
    .toLocaleString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" })
    .toLowerCase();
}


function extractScannedId(raw: string): string | null {
  const s = decodeURIComponent(String(raw).trim());
  if (s.startsWith("CHECKIN:")) {
    const m = s.replace("CHECKIN:", "").match(UUID_RE);
    return m ? m[0] : null;
  }
  if (UUID_RE.test(s)) return s.match(UUID_RE)![0];
  try {
    const url = new URL(s);
    const q = url.searchParams.get("id") || url.searchParams.get("ticket") || url.searchParams.get("registration_id");
    if (q && UUID_RE.test(q)) return q.match(UUID_RE)![0];
    const last = url.pathname.split("/").filter(Boolean).pop() || "";
    if (UUID_RE.test(last)) return last.match(UUID_RE)![0];
  } catch {}
  return null;
}

export default function BoxOfficeScanner() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [pin, setPin] = useState<string>(() => sessionStorage.getItem(SS_PIN) || "");
  const [stationLabel, setStationLabel] = useState<string>(() => sessionStorage.getItem(SS_LABEL) || "");
  const [unlocked, setUnlocked] = useState(false);
  const [sessionLabel, setSessionLabel] = useState<string>(() => sessionStorage.getItem(SS_SESSION) || "");
  const [pinError, setPinError] = useState<string | null>(null);
  const [autoUnlocking, setAutoUnlocking] = useState(false);

  const [flash, setFlash] = useState<FlashState | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [count, setCount] = useState<number>(0);
  const [lastPingAt, setLastPingAt] = useState<number>(() => Date.now());
  const [, setPingTick] = useState(0); // re-render every 5s for staleness UI

  const [showSearch, setShowSearch] = useState(() => {
    try { return new URL(window.location.href).searchParams.get("search") === "1"; } catch { return false; }
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [orderPanel, setOrderPanel] = useState<OrderPanelState | null>(null);
  const [confirmAgain, setConfirmAgain] = useState<FlashState | null>(null);
  const pendingDoubleScanRef = useRef<string | null>(null);

  const [lastTicketId, setLastTicketId] = useState<string | null>(null);
  const recentRef = useRef<Map<string, number>>(new Map()); // dedupe rapid duplicate scans
  const lastScanCleared = useRef<number>(0);

  // Online/offline tracking
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Refresh queue count
  const refreshQueue = useCallback(async () => {
    try { setQueueCount((await listQueue()).length); } catch {}
  }, []);

  // Live count of today's check-ins (PIN-gated RPC; realtime requires admin)
  const refreshCount = useCallback(async () => {
    if (!pin) return;
    const { data, error } = await supabase.rpc("box_office_today_count", { p_pin: pin });
    if (!error && typeof data === "number") {
      setCount(data);
      setLastPingAt(Date.now());
    }
  }, [pin]);

  useEffect(() => {
    if (!unlocked) return;
    refreshCount();
    refreshQueue();
    // Poll every 15s to stay close to the shared total across stations
    const t = setInterval(refreshCount, 15000);
    // Tick every 5s so the heartbeat dot can flip stale
    const tick = setInterval(() => setPingTick((n) => n + 1), 5000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, [unlocked, refreshCount, refreshQueue]);

  const validatePin = async () => {
    setPinError(null);
    if (!pin || pin.length < 4) { setPinError("Enter the 4-digit PIN"); return; }
    const effectiveLabel = stationLabel.trim() || `Station ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: "America/Los_Angeles" })}`;
    setPinError(null);
    const { data: valid, error } = await supabase.rpc("box_office_pin_valid", { p_pin: pin });
    if (error || !valid) { setPinError("Invalid PIN or shift expired"); return; }
    const shiftLabel = "Shift";
    sessionStorage.setItem(SS_PIN, pin);
    sessionStorage.setItem(SS_LABEL, effectiveLabel);
    sessionStorage.setItem(SS_SESSION, shiftLabel);
    setStationLabel(effectiveLabel);
    setSessionLabel(shiftLabel);

    setUnlocked(true);
    toast.success("Scanner unlocked");
  };

  // Auto-unlock for logged-in admins — no PIN required
  useEffect(() => {
    if (unlocked || authLoading || autoUnlocking) return;
    if (!user || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setAutoUnlocking(true);
      try {
        const label = (user.email?.split("@")[0] || "Admin").slice(0, 32);
        const { data, error } = await supabase.rpc("box_office_admin_auto_unlock", { p_label: label });
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row?.pin) {
          console.warn("Admin auto-unlock failed", error);
          return;
        }
        const effectiveLabel = stationLabel.trim() || row.station_label || label;
        sessionStorage.setItem(SS_PIN, row.pin);
        sessionStorage.setItem(SS_LABEL, effectiveLabel);
        sessionStorage.setItem(SS_SESSION, "Admin");
        setPin(row.pin);
        setStationLabel(effectiveLabel);
        setSessionLabel("Admin");
        setUnlocked(true);
      } finally {
        if (!cancelled) setAutoUnlocking(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, authLoading, unlocked]);

  const flushQueue = useCallback(async () => {
    // Don't trust navigator.onLine — in-app browsers (Zoom, some iOS) report
    // offline when actually connected. Just try; failures bump attempts.
    const items = await listQueue();
    for (const item of items) {
      try {
        const { error } = await supabase.rpc("box_office_check_in", {
          p_pin: item.pin,
          p_scanned_id: item.scannedId,
          p_station_label: item.stationLabel,
          p_client_event_id: item.id,
          p_day_key: item.dayKey,
        });
        if (error) throw error;
        await removeFromQueue(item.id);
      } catch {
        await bumpAttempts(item.id);
      }
    }
    refreshQueue();
    refreshCount();
  }, [refreshQueue, refreshCount]);

  useEffect(() => {
    if (online && unlocked) flushQueue();
  }, [online, unlocked, flushQueue]);

  useEffect(() => {
    if (!unlocked) return;
    const interval = window.setInterval(() => {
      flushQueue();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [unlocked, flushQueue]);

  const renderFlash = (state: FlashState) => {
    setFlash(state);
    lastScanCleared.current = Date.now();
    // Successful check-ins stay on screen until staff dismiss them — they
    // are the staff's confirmation that the wristband can be given out.
    // Other transient states (queued, invalid QR, errors) auto-dismiss.
    if (state.status === "ok") return;
    const dwell = state.status === "queued" ? 1400 : 2200;
    setTimeout(() => {
      if (Date.now() - lastScanCleared.current >= dwell - 50) setFlash(null);
    }, dwell);
  };

  const handleScan = useCallback(async (raw: string) => {
    if (busy) return;
    const ticketOrReg = extractScannedId(raw);
    if (!ticketOrReg) {
      chimeError(); vibrate(200);
      renderFlash({ status: "invalid_pin", message: "Not a valid ticket QR" });
      return;
    }

    // Dedupe identical scans within 3s
    const now = Date.now();
    const last = recentRef.current.get(ticketOrReg) || 0;
    if (now - last < 3000) return;
    recentRef.current.set(ticketOrReg, now);

    setBusy(true);
    const clientEventId = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const dayKey = todayKey();

    // Note: we intentionally do NOT pre-check `navigator.onLine` here.
    // In-app browsers (Zoom, some iOS Safari conditions) report onLine=false
    // even when the device has connectivity, which would force every scan
    // into the offline queue. Always try the RPC first; the catch block
    // below queues the scan only if the network actually fails.

    try {
      const { data, error } = await supabase.rpc("box_office_check_in", {
        p_pin: pin,
        p_scanned_id: ticketOrReg,
        p_station_label: stationLabel,
        p_client_event_id: clientEventId,
        p_day_key: dayKey,
      });
      if (error) throw error;
      setLastPingAt(Date.now());
      const row = Array.isArray(data) ? data[0] : data;
      const status = (row?.status || "error") as ScanStatus;
      const state: FlashState = {
        status,
        name: row?.holder_name,
        ticketType: row?.ticket_type,
        message: row?.message,
        previousAt: row?.previous_check_in,
        previousStation: row?.previous_station,
        ticketId: row?.ticket_id,
        registrationId: row?.registration_id,
      };
      if (status === "ok") {
        chimeOk(); vibrate([60, 50, 120]);
        setLastTicketId(row?.ticket_id || null);
        setCount((c) => c + 1);
        renderFlash(state);
      } else if (status === "already") {
        // Confirm step instead of dismissing — staff sees when/where the
        // ticket was used and can open the order to manage exceptions.
        chimeWarning(); vibrate([250, 100, 250, 100, 400]);
        const isDoubleTap = pendingDoubleScanRef.current === row?.ticket_id;
        pendingDoubleScanRef.current = row?.ticket_id || null;
        if (isDoubleTap && row?.registration_id) {
          openOrder(row.registration_id);
          pendingDoubleScanRef.current = null;
        } else {
          setConfirmAgain(state);
        }
      } else if (status === "wrong_day") {
        chimeWarning(); vibrate([250, 100, 250, 100, 400]);
        renderFlash(state);
      } else {
        chimeError(); vibrate([400, 120, 400, 120, 600]);
        renderFlash(state);
      }
    } catch (e: any) {
      if (isNetworkFailure(e)) {
        // Network failed mid-flight — queue it
        await enqueueScan({ id: clientEventId, scannedId: ticketOrReg, stationLabel, pin, dayKey, queuedAt: now, attempts: 0 });
        chimeWarning(); vibrate([60, 60, 60]);
        renderFlash({ status: "queued", message: "Saved offline — will sync" });
        refreshQueue();
      } else {
        chimeError(); vibrate([400, 120, 400, 120, 600]);
        renderFlash({ status: "error", message: getErrorMessage(e) });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, pin, stationLabel, refreshQueue]);

  // Open the full order panel for a registration_id so staff can tap
  // each ticket individually (group / family / crew check-in).
  const openOrder = useCallback(async (registrationId: string) => {
    const { data, error } = await supabase.rpc("box_office_lookup_order", {
      p_pin: pin, p_query: registrationId,
    });
    if (error) { toast.error(error.message); return; }
    const rows = (data as any[]) || [];
    if (rows.length === 0) { toast.error("Order not found"); return; }
    setOrderPanel({
      registrationId,
      orderNumber: rows[0].order_number,
      paymentStatus: rows[0].payment_status,
      tickets: rows.map((r) => ({
        ticket_id: r.ticket_id, holder_name: r.holder_name,
        ticket_type: r.ticket_type, checked_in_at: r.checked_in_at, status: r.status,
      })),
    });
    setShowSearch(false);
    setFlash(null);
    setConfirmAgain(null);
  }, [pin]);

  const checkInFromPanel = async (ticketId: string) => {
    if (!orderPanel) return;
    setOrderPanel({ ...orderPanel, busyTicketId: ticketId });
    const clientEventId = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const { data } = await supabase.rpc("box_office_check_in", {
      p_pin: pin, p_scanned_id: ticketId, p_station_label: stationLabel,
      p_client_event_id: clientEventId, p_day_key: todayKey(),
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.status === "ok") { chimeOk(); vibrate(80); setLastTicketId(ticketId); }
    else if (row?.status === "already" || row?.status === "wrong_day") { chimeWarning(); vibrate(120); toast.warning(row?.message || row?.status); }
    else { chimeError(); vibrate(200); toast.error(row?.message || row?.status || "Failed"); }
    const fresh = await supabase.rpc("box_office_lookup_order", { p_pin: pin, p_query: orderPanel.registrationId });
    const freshRows = (fresh.data as any[]) || [];
    setOrderPanel({
      registrationId: orderPanel.registrationId,
      orderNumber: orderPanel.orderNumber,
      paymentStatus: orderPanel.paymentStatus,
      tickets: freshRows.map((r) => ({
        ticket_id: r.ticket_id, holder_name: r.holder_name, ticket_type: r.ticket_type,
        checked_in_at: r.checked_in_at, status: r.status,
      })),
      busyTicketId: null,
    });
  };

  const handleUndo = async () => {
    if (!lastTicketId) return;
    const { data, error } = await supabase.rpc("box_office_undo_check_in", {
      p_pin: pin, p_ticket_id: lastTicketId, p_station_label: stationLabel,
    });
    if (error) { toast.error(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.status === "ok") {
      toast.success(`Reversed: ${row.holder_name}`);
      setLastTicketId(null);
      setCount((c) => Math.max(0, c - 1));
    } else {
      toast.error(row?.status || "Undo failed");
    }
  };

  const runSearch = async () => {
    const q = searchTerm.trim();
    if (q.length < 2) return;

    // If looks like an order number (COS-... or 4+ alphanumerics with a dash),
    // route to the order-lookup RPC and open the order panel directly.
    if (/^cos-/i.test(q) || /^[a-z0-9]{2,4}-/i.test(q)) {
      const { data, error } = await supabase.rpc("box_office_lookup_order", {
        p_pin: pin, p_query: q,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        const regId = (data[0] as any).registration_id as string;
        await openOrder(regId);
        setSearchTerm("");
        setSearchResults([]);
        return;
      }
    }

    const { data } = await supabase.rpc("box_office_search", { p_pin: pin, p_query: q });
    const rows = (data as any[]) || [];
    setSearchResults(rows.map((r) => ({
      id: r.ticket_id,
      holder_name: r.holder_name,
      holder_email: r.holder_email,
      ticket_type: r.ticket_type,
      checked_in_at: r.checked_in_at,
      registration_id: r.registration_id,
      registrations: { order_number: r.order_number, payment_status: r.payment_status },
    })));
  };

  // ---------- PIN GATE ----------
  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 p-6">
        <Card className="w-full max-w-sm bg-neutral-900 border-neutral-800">
          <CardContent className="p-6 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-500">Box Office</div>
              <div className="text-2xl font-semibold">Door Scanner</div>
            </div>
            {/* Station label auto-assigned; PIN is the only required input */}
            <div className="space-y-2">
              <label className="text-sm text-neutral-400">Shift PIN</label>
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
                autoFocus
                placeholder="••••"
                className="bg-neutral-800 border-neutral-700 text-neutral-100 text-2xl tracking-[0.5em] text-center"
                onKeyDown={(e) => { if (e.key === "Enter") validatePin(); }}
              />
            </div>
            {pinError && <div className="text-sm text-red-400">{pinError}</div>}
            <Button onClick={validatePin} className="w-full">Unlock Scanner</Button>
            <div className="text-xs text-neutral-500 text-center">
              An admin can create shifts in the dashboard under Box Office.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Use ticket-type accent for OK flashes (VIP=amber, Patron=violet, Comp=pink, etc.)
  const okMeta = flash?.status === "ok" ? getTicketMeta(flash.ticketType) : null;
  const flashClass =
    flash?.status === "ok" ? okMeta!.flashClass :
    flash?.status === "wrong_day" ? "bg-amber-600" :
    flash?.status === "queued" ? "bg-sky-600" :
    flash ? "bg-red-600" : "";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-800">
        <div className="text-sm">
          <div className="text-neutral-500 text-xs uppercase tracking-widest">{sessionLabel}</div>
          <div className="font-medium">{stationLabel}</div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {(() => {
            const sinceMs = Date.now() - lastPingAt;
            const stale = sinceMs > 45000;
            const dotClass = !online
              ? "bg-amber-400 animate-pulse"
              : stale
                ? "bg-red-500 animate-pulse"
                : "bg-emerald-400";
            const label = !online
              ? "Offline — scans will queue"
              : stale
                ? `No server response in ${Math.round(sinceMs / 1000)}s`
                : `Live · last ping ${Math.round(sinceMs / 1000)}s ago`;
            return (
              <span className="flex items-center gap-1.5" title={label}>
                <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                {online ? <Wifi className="w-3.5 h-3.5 text-neutral-400" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
              </span>
            );
          })()}
          {queueCount > 0 && (
            <button onClick={flushQueue} className="flex items-center gap-1 text-amber-300">
              <RefreshCw className="w-3 h-3" />{queueCount} queued
            </button>
          )}
          <div className="text-neutral-300"><span className="font-semibold text-neutral-100">{count}</span> / 700</div>
        </div>
      </div>

      {/* Camera */}
      <div className="relative flex-1 min-h-[300px] bg-black overflow-hidden">
        <Scanner
          onScan={(r) => r?.[0]?.rawValue && handleScan(r[0].rawValue)}
          components={{ finder: true }}
          styles={{ container: { width: "100%", height: "100%" }, video: { width: "100%", height: "100%", objectFit: "cover" } }}
          constraints={{ facingMode: "environment" }}
        />
        {/* Color flash overlay */}
        {flash && (
          <div className={`absolute inset-0 ${flashClass} bg-opacity-95 flex items-center justify-center px-6 animate-in fade-in`}>
            <div className="text-center text-white max-w-md">
              {flash.status === "ok" && <CheckCircle2 className="w-24 h-24 mx-auto mb-3" />}
              {(flash.status === "wrong_day" || flash.status === "queued") && <AlertTriangle className="w-20 h-20 mx-auto mb-2" />}
              {flash.status && !["ok","wrong_day","queued"].includes(flash.status) && <XCircle className="w-20 h-20 mx-auto mb-2" />}
              {flash.status === "ok" && (
                <div className="text-2xl font-extrabold uppercase tracking-widest mb-2">✓ Checked In</div>
              )}
              <div className="text-3xl font-bold leading-tight">{flash.name || flash.message}</div>
              {okMeta && (
                <div className="mt-3 inline-flex items-center gap-2 flex-wrap justify-center">
                  <span className="px-3 py-1 rounded-full bg-white/25 text-white text-sm font-semibold uppercase tracking-wider">
                    {okMeta.shortLabel}
                  </span>
                  {okMeta.requiresId && (
                    <span className="px-3 py-1 rounded-full bg-black/40 text-white text-sm font-semibold uppercase tracking-wider">
                      ✋ Check ID
                    </span>
                  )}
                </div>
              )}
              {flash.ticketType && !okMeta && <div className="text-lg opacity-90 mt-1">{flash.ticketType}</div>}
              {flash.status !== "ok" && flash.message && flash.name && (
                <div className="text-base opacity-90 mt-2">{flash.message}</div>
              )}
              {flash.status && flash.status !== "ok" && (
                <details className="mt-3 text-left bg-black/30 rounded px-3 py-2 inline-block max-w-sm">
                  <summary className="cursor-pointer text-xs uppercase tracking-widest opacity-80">Why did this fail?</summary>
                  <div className="text-xs mt-2 opacity-95 leading-relaxed">
                    {flash.status === "already" && "This QR was already scanned earlier today. Do NOT re-admit without an admin override — could be a duplicate, screenshot share, or attempted re-entry."}
                    {flash.status === "wrong_day" && "Ticket is valid but for a different day in PT (e.g. Friday-only ticket scanned on Saturday). Direct guest to upgrade or come back the correct day."}
                    {flash.status === "unpaid" && "Order is unpaid, refunded, or canceled. Send guest to box office desk to resolve before admitting."}
                    {flash.status === "not_found" && "QR doesn't match any ticket in the system. Possible fake, expired test ticket, or wrong event. Verify name on the manifest."}
                    {flash.status === "invalid_pin" && "QR scanned isn't a Cosmico ticket QR (random barcode, URL, etc.). Ask guest to open their My Tickets page."}
                    {flash.status === "queued" && "Phone is offline. Scan saved locally — will sync when connection returns. Let guest through if you trust the ticket."}
                    {flash.status === "error" && "Network or server problem. Try again; if it persists, fall back to the printed manifest."}
                  </div>
                </details>
              )}
              {flash.status === "ok" && (
                <>
                  <div className="mt-5 inline-block px-5 py-2 rounded-full bg-white text-emerald-700 text-base font-extrabold uppercase tracking-wider shadow-lg">
                    Give wristband
                  </div>
                  <div className="mt-6 flex gap-2 justify-center items-center">
                    <Button
                      onClick={() => { setFlash(null); }}
                      className="bg-white text-emerald-700 hover:bg-white/90 font-bold px-8"
                      size="lg"
                    >
                      Close
                    </Button>
                    {flash.registrationId && (
                      <Button
                        variant="secondary"
                        onClick={() => { const id = flash.registrationId!; setFlash(null); openOrder(id); }}
                        className="bg-white/15 hover:bg-white/25 text-white border-white/30"
                      >
                        <Users className="w-4 h-4 mr-1" /> Open order
                      </Button>
                    )}
                    <button
                      onClick={() => { handleUndo(); setFlash(null); }}
                      className="text-white/60 hover:text-white/90 text-xs underline underline-offset-2 ml-2"
                    >
                      Undo
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-neutral-800 p-3 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setShowSearch((v) => !v)}>
          <Search className="w-4 h-4 mr-1" /> Search
        </Button>
        <Button variant="secondary" size="sm" onClick={handleUndo} disabled={!lastTicketId}>
          <Undo2 className="w-4 h-4 mr-1" /> Undo
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost" size="sm"
          onClick={() => { sessionStorage.removeItem(SS_PIN); sessionStorage.removeItem(SS_LABEL); sessionStorage.removeItem(SS_SESSION); setUnlocked(false); }}
        >
          End shift
        </Button>
      </div>

      {/* Manual search drawer */}
      {showSearch && (
        <div className="border-t border-neutral-800 p-3 space-y-2 bg-neutral-900 max-h-[40vh] overflow-y-auto">
          <div className="flex gap-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Name, email, or order # (COS-…)"
              className="bg-neutral-800 border-neutral-700"
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            />
            <Button onClick={runSearch}>Find</Button>
          </div>
          <div className="space-y-1">
            {searchResults.map((t: any) => {
              const meta = getTicketMeta(t.ticket_type);
              return (
                <div key={t.id} className="flex items-center gap-2">
                  <button
                    onClick={() => handleScan(t.id)}
                    className="flex-1 text-left p-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${meta.chipClass}`}>{meta.shortLabel}</span>
                      <span className="font-medium">{t.holder_name}</span>
                      <span className="text-neutral-400">{t.registrations?.order_number || ""}</span>
                    </span>
                    <span className={t.checked_in_at ? "text-amber-400" : "text-emerald-400"}>
                      {t.checked_in_at ? "in" : "available"}
                    </span>
                  </button>
                  {t.registration_id && (
                    <Button size="sm" variant="secondary" onClick={() => openOrder(t.registration_id)}>
                      <Users className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })}
            {searchTerm && searchResults.length === 0 && (
              <div className="text-sm text-neutral-500 text-center py-4">No matches</div>
            )}
          </div>
        </div>
      )}

      {/* Already-checked-in STOP prompt */}
      {confirmAgain && (
        <div className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center p-6">
          <div className="bg-red-600 text-white rounded-xl max-w-md w-full p-6 text-center border-4 border-white shadow-2xl">
            <XCircle className="w-20 h-20 mx-auto mb-2" />
            <div className="text-xs uppercase tracking-[0.3em] font-bold opacity-90">Stop</div>
            <div className="text-2xl font-extrabold uppercase tracking-wider mt-1">Already Checked In</div>
            <div className="mt-4 inline-block px-4 py-2 rounded-full bg-white text-red-700 text-sm font-extrabold uppercase tracking-wider">
              Do not give wristband
            </div>
            <div className="text-xl font-bold mt-5">{confirmAgain.name || "—"}</div>
            {confirmAgain.ticketType && <div className="text-sm mt-1 opacity-90">{confirmAgain.ticketType}</div>}
            {confirmAgain.previousAt && (
              <div className="text-sm mt-3 opacity-95 bg-black/25 rounded px-3 py-1.5 inline-block">
                In at {new Date(confirmAgain.previousAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}
                {confirmAgain.previousStation ? ` · ${confirmAgain.previousStation}` : ""}
              </div>
            )}
            <div className="flex gap-2 mt-5">
              <Button
                className="flex-1 bg-white text-red-700 hover:bg-white/90 font-bold"
                onClick={() => { setConfirmAgain(null); pendingDoubleScanRef.current = null; }}
              >
                Dismiss
              </Button>
              {confirmAgain.registrationId && (
                <Button
                  className="flex-1 bg-black/30 hover:bg-black/40 text-white border border-white/40"
                  onClick={() => openOrder(confirmAgain.registrationId!)}
                >
                  <Users className="w-4 h-4 mr-1" /> Open order
                </Button>
              )}
            </div>
            <div className="text-xs mt-3 opacity-80">Tip: scan twice in a row to jump straight into the order.</div>
          </div>
        </div>
      )}

      {/* Order panel — group/family/crew check-in */}
      {orderPanel && (
        <div className="absolute inset-0 z-40 bg-neutral-950 text-neutral-100 flex flex-col">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-500">Order</div>
              <div className="font-mono text-lg">{orderPanel.orderNumber || orderPanel.registrationId.slice(0, 8)}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOrderPanel(null)}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {orderPanel.tickets.map((t) => {
              const meta = getTicketMeta(t.ticket_type);
              const isIn = !!t.checked_in_at;
              return (
                <button
                  key={t.ticket_id}
                  onClick={() => !isIn && checkInFromPanel(t.ticket_id)}
                  disabled={isIn || orderPanel.busyTicketId === t.ticket_id}
                  className={`w-full text-left p-4 rounded-lg border ${
                    isIn ? "bg-neutral-900 border-neutral-800 opacity-60" : "bg-neutral-800 border-neutral-700 active:scale-[0.99]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${meta.chipClass}`}>{meta.shortLabel}</span>
                      <div>
                        <div className="font-semibold text-base">{t.holder_name || "—"}</div>
                        <div className="text-xs text-neutral-400">{t.ticket_type}</div>
                      </div>
                    </div>
                    {isIn ? (
                      <span className="text-amber-400 text-xs">
                        In {new Date(t.checked_in_at!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}
                      </span>
                    ) : (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-neutral-800 p-3 flex items-center justify-between text-xs text-neutral-400">
            <span>{orderPanel.tickets.filter((t) => t.checked_in_at).length} / {orderPanel.tickets.length} checked in</span>
            <Button size="sm" onClick={() => setOrderPanel(null)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}
