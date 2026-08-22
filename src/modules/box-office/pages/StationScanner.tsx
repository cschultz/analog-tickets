import { useCallback, useEffect, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, XCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { chimeOk, chimeWarning, chimeError, unlockAudio, vibrate } from "@/lib/boxOfficeFeedback";

const ADDON_RE = /^addon:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(\d+)$/i;

type ScanStatus = "ok" | "already" | "wrong_addon" | "unpaid" | "not_found" | "invalid_pin" | "error" | null;

interface FlashState {
  status: ScanStatus;
  holderName?: string | null;
  addonName?: string | null;
  unitIndex?: number;
  totalUnits?: number;
  previousAt?: string;
  previousStation?: string | null;
  message?: string;
}

interface LookupRow {
  addon_purchase_id: string;
  registration_id: string;
  order_number: string | null;
  holder_name: string | null;
  holder_email: string | null;
  addon_display_name: string | null;
  addon_type: string | null;
  total_units: number;
  redeemed_units: number;
}

const SS_PIN = "station_pin";
const SS_LABEL = "station_label";
const SS_SESSION = "station_session_label";

function parsePayload(raw: string): { id: string; index: number } | null {
  const s = decodeURIComponent(String(raw).trim());
  const m = s.match(ADDON_RE);
  if (!m) return null;
  return { id: m[1], index: parseInt(m[2], 10) };
}

export default function StationScanner() {
  const [pin, setPin] = useState<string>(() => sessionStorage.getItem(SS_PIN) || "");
  const [stationLabel, setStationLabel] = useState<string>(() => sessionStorage.getItem(SS_LABEL) || "");
  const [unlocked, setUnlocked] = useState(false);
  const [sessionLabel, setSessionLabel] = useState<string>(() => sessionStorage.getItem(SS_SESSION) || "");
  const [pinError, setPinError] = useState<string | null>(null);

  const [flash, setFlash] = useState<FlashState | null>(null);
  const [busy, setBusy] = useState(false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<LookupRow[]>([]);

  const recentRef = useRef<Map<string, number>>(new Map());

  const validatePin = async () => {
    setPinError(null);
    if (!pin || pin.length < 4) { setPinError("Enter the PIN"); return; }
    if (!stationLabel.trim()) { setPinError("Add a station label (e.g. 'Dinner Tent')"); return; }
    // Try a no-op lookup to validate the PIN belongs to an addon-scope session
    const { data, error } = await supabase.rpc("addon_lookup", { p_pin: pin, p_query: "__validate__" });
    if (error) { setPinError(error.message); return; }
    // RPC returns no rows when query doesn't match — but it returns nothing if PIN is invalid too.
    // Use a probe: if scope='addon' the RPC runs; if not, it returns nothing either way.
    // To validate the PIN itself, call validate_pin and require explicit scope check via redeem dry-run:
    const probe = await supabase.rpc("box_office_validate_pin", { p_pin: pin });
    const row = Array.isArray(probe.data) ? probe.data[0] : probe.data;
    if (!row?.session_id) { setPinError("Invalid PIN or shift expired"); return; }
    // Confirm addon scope by attempting a dummy lookup that always returns nothing — we need a true scope check.
    // Easiest: call addon_redeem with a bogus uuid; we expect 'not_found' (scope OK) or 'invalid_pin' (wrong scope).
    const dummy = await supabase.rpc("addon_redeem", {
      p_pin: pin,
      p_addon_purchase_id: "00000000-0000-4000-8000-000000000000",
      p_unit_index: 1,
      p_station_label: stationLabel,
      p_client_event_id: null,
    });
    const dummyRow = Array.isArray(dummy.data) ? dummy.data[0] : dummy.data;
    if (dummyRow?.status === "invalid_pin") { setPinError(dummyRow.message || "This PIN is not for add-on stations"); return; }

    sessionStorage.setItem(SS_PIN, pin);
    sessionStorage.setItem(SS_LABEL, stationLabel);
    sessionStorage.setItem(SS_SESSION, row.label);
    setSessionLabel(row.label);
    unlockAudio();
    setUnlocked(true);
    toast.success(`"${row.label}" unlocked`);
  };

  const renderFlash = (state: FlashState) => {
    setFlash(state);
    const dwell = state.status === "ok" ? 1200 : 2000;
    setTimeout(() => setFlash((cur) => (cur === state ? null : cur)), dwell);
  };

  const redeem = useCallback(async (addonPurchaseId: string, unitIndex: number) => {
    setBusy(true);
    const clientEventId = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    try {
      const { data, error } = await supabase.rpc("addon_redeem", {
        p_pin: pin,
        p_addon_purchase_id: addonPurchaseId,
        p_unit_index: unitIndex,
        p_station_label: stationLabel,
        p_client_event_id: clientEventId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const state: FlashState = {
        status: (row?.status || "error") as ScanStatus,
        holderName: row?.holder_name,
        addonName: row?.addon_display_name,
        unitIndex: row?.unit_index,
        totalUnits: row?.total_units,
        previousAt: row?.previous_redeemed_at,
        previousStation: row?.previous_station,
        message: row?.message,
      };
      if (state.status === "ok") { chimeOk(); vibrate(80); }
      else if (state.status === "already") { chimeWarning(); vibrate([100, 80, 100]); }
      else { chimeError(); vibrate(300); }
      renderFlash(state);
    } catch (e: any) {
      chimeError(); vibrate(300);
      renderFlash({ status: "error", message: e.message || "Failed" });
    } finally {
      setBusy(false);
    }
  }, [pin, stationLabel]);

  const handleScan = useCallback(async (raw: string) => {
    if (busy) return;
    const parsed = parsePayload(raw);
    if (!parsed) {
      chimeError(); vibrate(200);
      renderFlash({ status: "not_found", message: "Not an add-on QR (this looks like a ticket — scan at the gate)" });
      return;
    }
    const dedupeKey = `${parsed.id}:${parsed.index}`;
    const now = Date.now();
    const last = recentRef.current.get(dedupeKey) || 0;
    if (now - last < 3000) return;
    recentRef.current.set(dedupeKey, now);
    await redeem(parsed.id, parsed.index);
  }, [busy, redeem]);

  const runSearch = async () => {
    if (!searchTerm.trim()) return;
    const { data, error } = await supabase.rpc("addon_lookup", { p_pin: pin, p_query: searchTerm.trim() });
    if (error) { toast.error(error.message); return; }
    setSearchResults((data as LookupRow[]) || []);
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-4">
            <div>
              <h1 className="text-2xl font-semibold">Station Scanner</h1>
              <p className="text-sm text-muted-foreground mt-1">For dinner, Kids Camp, and other add-on stations.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">PIN</label>
              <Input
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="••••"
                className="text-2xl tracking-[0.4em] font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Station label</label>
              <Input
                value={stationLabel}
                onChange={(e) => setStationLabel(e.target.value)}
                placeholder="e.g. Dinner Tent A"
              />
            </div>
            {pinError && <div className="text-sm text-destructive">{pinError}</div>}
            <Button className="w-full" onClick={validatePin}>Unlock</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Station</div>
            <div className="font-medium">{stationLabel}</div>
            <div className="text-xs text-muted-foreground">{sessionLabel}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowSearch(true)}>
            <Search className="w-4 h-4 mr-1" /> Lookup
          </Button>
        </div>

        <Card>
          <CardContent className="p-0 overflow-hidden rounded-lg">
            <Scanner
              onScan={(r) => r[0] && handleScan(r[0].rawValue)}
              components={{ finder: true }}
              styles={{ container: { width: "100%" } }}
            />
          </CardContent>
        </Card>

        {flash && (
          <Card className={
            flash.status === "ok" ? "border-green-500 bg-green-50 dark:bg-green-950/30" :
            flash.status === "already" || flash.status === "wrong_addon" ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30" :
            "border-destructive bg-destructive/10"
          }>
            <CardContent className="p-4 flex items-start gap-3">
              {flash.status === "ok" ? <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" /> :
               flash.status === "already" || flash.status === "wrong_addon" ? <AlertTriangle className="w-6 h-6 text-yellow-600 shrink-0" /> :
               <XCircle className="w-6 h-6 text-destructive shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {flash.holderName || flash.message || flash.status}
                </div>
                {flash.addonName && (
                  <div className="text-sm">
                    {flash.addonName}
                    {flash.unitIndex && flash.totalUnits ? ` — ${flash.unitIndex} of ${flash.totalUnits}` : ""}
                  </div>
                )}
                {flash.status === "already" && flash.previousAt && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Already redeemed {new Date(flash.previousAt).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" })} at {flash.previousStation || "another station"}
                  </div>
                )}
                {flash.status !== "ok" && flash.message && flash.holderName && (
                  <div className="text-xs text-muted-foreground mt-1">{flash.message}</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Tip: each add-on QR redeems once. If a guest lost their email, tap Lookup.
        </p>
      </div>

      {showSearch && (
        <div className="fixed inset-0 bg-background/95 z-50 p-4 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Manual lookup</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchTerm(""); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Name, email, or order number"
                autoFocus
              />
              <Button onClick={runSearch}>Search</Button>
            </div>
            <div className="space-y-2">
              {searchResults.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No results yet.</div>
              )}
              {searchResults.map((r) => {
                const remaining = r.total_units - r.redeemed_units;
                const nextIndex = r.redeemed_units + 1;
                return (
                  <Card key={r.addon_purchase_id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.holder_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.holder_email} · {r.order_number}</div>
                        <div className="text-sm mt-1">
                          {r.addon_display_name} — <span className={remaining > 0 ? "text-green-600" : "text-muted-foreground"}>{remaining} of {r.total_units} left</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={remaining <= 0 || busy}
                        onClick={async () => {
                          await redeem(r.addon_purchase_id, nextIndex);
                          // refresh count
                          await runSearch();
                        }}
                      >
                        Redeem
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
