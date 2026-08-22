import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type DayKey,
  dayLabel,
  dayShortLabel,
  dayOrder,
  festivalTimezone,
  normalizeDayKey,
  normalizeValidDays,
  getEventDayKey,
  dayBadge as sharedDayBadge,
} from "@/lib/festivalDays";

// Day identity comes from the active EventConfig, not a hardcoded weekday list.
const DAY_ORDER: DayKey[] = dayOrder();
const EVENT_TZ = festivalTimezone();

interface TicketRow {
  id: string;
  registration_id: string;
  holder_name: string | null;
  ticket_type: string;
  status: string;
  checked_in_at: string | null;
  registrations: {
    id: string;
    name: string | null;
    email: string | null;
    order_number: string | null;
    payment_status: string;
  } | null;
}

interface AddonRow {
  registration_id: string;
  quantity: number;
  payment_status: string;
  addon_inventory: { display_name: string; addon_type: string } | null;
}

interface LodgingRow {
  registration_id: string;
  zone_key: string | null;
  payment_status: string;
  assigned_unit_id: string | null;
  accommodation_units: { unit_name: string } | null;
  accommodation_zones: { zone_name: string } | null;
}

interface TicketTypeMeta {
  key: string;
  label: string;
  short_label: string | null;
  valid_days: string[] | null;
}

interface OrderGroup {
  registration_id: string;
  buyer_name: string;
  buyer_last: string;
  buyer_email: string;
  order_number: string;
  category: "PAID" | "COMP" | "GUEST" | "ARTIST" | "PAYMENT PLAN";
  ticketBreakdown: { label: string; count: number; days: string[] }[];
  totalTickets: number;
  plusN: number; // tickets beyond primary
  addons: string[];
  lodging: string[];
  validForDay: (d: DayKey) => boolean;
  checkedInCount: number;
  checkedInByDay: Record<DayKey, { count: number; firstAt: string | null; station: string | null }>;
}

function lastNameFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "";
  return parts[parts.length - 1];
}


function dayBadge(days: string[]): string {
  return sharedDayBadge(days);
}

function deriveDayKey(occurredAtIso: string, explicit: string | null): DayKey | null {
  const fromExplicit = normalizeDayKey(explicit);
  if (fromExplicit) return fromExplicit;
  return getEventDayKey(occurredAtIso);
}

export default function DoorList() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [lodging, setLodging] = useState<LodgingRow[]>([]);
  const [ticketTypes, setTicketTypes] = useState<Record<string, TicketTypeMeta>>({});
  const [eventTitle, setEventTitle] = useState("");
  const [mode, setMode] = useState<"all" | DayKey>("all");
  const [generatedAt] = useState(new Date());
  const [checkIns, setCheckIns] = useState<
    { ticket_id: string | null; registration_id: string | null; day_key: string | null; occurred_at: string; station_label: string | null }[]
  >([]);

  useEffect(() => {
    (async () => {
      try {
        const { data: ev } = await supabase
          .from("event_details")
          .select("id, title")
          .eq("is_active", true)
          .maybeSingle();
        const eventId = ev?.id;
        setEventTitle(ev?.title || "");

        const [{ data: tt }, { data: tk }, { data: ad }, { data: lg }, { data: ci }] = await Promise.all([
          supabase.from("ticket_types").select("key, label, short_label, valid_days").eq("event_id", eventId),
          supabase
            .from("tickets")
            .select(
              "id, registration_id, holder_name, ticket_type, status, checked_in_at, registrations:registration_id(id, name, email, order_number, payment_status)"
            )
            .eq("event_id", eventId)
            .eq("status", "active"),
          supabase
            .from("addon_purchases")
            .select("registration_id, quantity, payment_status, addon_inventory:inventory_id(display_name, addon_type)")
            .eq("payment_status", "paid"),
          supabase
            .from("lodging_bookings")
            .select(
              "registration_id, zone_key, payment_status, assigned_unit_id, accommodation_units:assigned_unit_id(unit_name), accommodation_zones:zone_key(zone_name)"
            )
            .eq("event_id", eventId)
            .eq("payment_status", "paid"),
          supabase
            .from("check_in_events")
            .select("ticket_id, registration_id, day_key, occurred_at, station_label, action")
            .eq("action", "check_in")
            .order("occurred_at", { ascending: true }),
        ]);

        const ttMap: Record<string, TicketTypeMeta> = {};
        ((tt as TicketTypeMeta[]) || []).forEach((t) => (ttMap[t.key] = t));
        setTicketTypes(ttMap);
        setTickets(((tk as unknown) as TicketRow[]) || []);
        setAddons(((ad as unknown) as AddonRow[]) || []);
        setLodging(((lg as unknown) as LodgingRow[]) || []);
        setCheckIns(((ci as unknown) as typeof checkIns) || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const orders = useMemo<OrderGroup[]>(() => {
    // Group tickets by registration_id, filter to authorized to attend
    const byReg = new Map<string, TicketRow[]>();
    tickets.forEach((t) => {
      const ps = t.registrations?.payment_status;
      if (!ps) return;
      if (!["paid", "payment_plan", "comp"].includes(ps)) return;
      const arr = byReg.get(t.registration_id) || [];
      arr.push(t);
      byReg.set(t.registration_id, arr);
    });

    const addonByReg = new Map<string, string[]>();
    addons.forEach((a) => {
      const name = a.addon_inventory?.display_name || a.addon_inventory?.addon_type || "Add-on";
      const tag = a.quantity > 1 ? `${name} ×${a.quantity}` : name;
      const arr = addonByReg.get(a.registration_id) || [];
      arr.push(tag);
      addonByReg.set(a.registration_id, arr);
    });

    const lodgingByReg = new Map<string, string[]>();
    lodging.forEach((l) => {
      const unit = l.accommodation_units?.unit_name;
      const zone = l.accommodation_zones?.zone_name || l.zone_key || "Lodging";
      const tag = unit ? `${zone}: ${unit}` : zone;
      const arr = lodgingByReg.get(l.registration_id) || [];
      arr.push(tag);
      lodgingByReg.set(l.registration_id, arr);
    });

    // Build a per-registration, per-day check-in map from check_in_events.
    // We track distinct ticket_ids per day so a wristband handed out yesterday
    // shows up as already checked in for that day.
    const ciByReg = new Map<string, Record<DayKey, { ticketIds: Set<string>; firstAt: string | null; station: string | null }>>();
    checkIns.forEach((e) => {
      if (!e.registration_id) return;
      const day = deriveDayKey(e.occurred_at, e.day_key);
      if (!day) return;
      const rec =
        ciByReg.get(e.registration_id) ||
        Object.fromEntries(
          DAY_ORDER.map((d) => [d, { ticketIds: new Set<string>(), firstAt: null, station: null }]),
        );
      // `day` can be a key outside the configured schedule (legacy data); skip it
      // rather than writing an off-schedule slot the UI never renders.
      const slot = rec[day];
      if (!slot) return;
      if (e.ticket_id) slot.ticketIds.add(e.ticket_id);
      if (!slot.firstAt || e.occurred_at < slot.firstAt) {
        slot.firstAt = e.occurred_at;
        slot.station = e.station_label;
      }
      ciByReg.set(e.registration_id, rec);
    });

    const groups: OrderGroup[] = [];
    byReg.forEach((arr, regId) => {
      const reg = arr[0].registrations!;
      const buyer = reg.name?.trim() || arr[0].holder_name?.trim() || reg.email || "Unknown";

      // Categorize
      let category: OrderGroup["category"] = "PAID";
      if (reg.payment_status === "comp") {
        category = arr.some((t) => t.ticket_type === "artist_guest") ? "ARTIST" : "COMP";
      } else if (reg.payment_status === "payment_plan") {
        category = "PAYMENT PLAN";
      }

      // Breakdown by ticket type
      const tbMap = new Map<string, { label: string; count: number; days: string[] }>();
      arr.forEach((t) => {
        const meta = ticketTypes[t.ticket_type];
        const label = meta?.short_label || meta?.label || t.ticket_type;
        const days = (meta?.valid_days as string[] | null) || DAY_ORDER;
        const existing = tbMap.get(label);
        if (existing) existing.count += 1;
        else tbMap.set(label, { label, count: 1, days });
      });

      const checkedInCount = arr.filter((t) => t.checked_in_at).length;

      const ciRec = ciByReg.get(regId);
      const checkedInByDay: OrderGroup["checkedInByDay"] = Object.fromEntries(
        DAY_ORDER.map((d) => [
          d,
          {
            count: ciRec?.[d]?.ticketIds.size || 0,
            firstAt: ciRec?.[d]?.firstAt || null,
            station: ciRec?.[d]?.station || null,
          },
        ]),
      );

      const group: OrderGroup = {
        registration_id: regId,
        buyer_name: buyer,
        buyer_last: lastNameFrom(buyer),
        buyer_email: reg.email || "",
        order_number: reg.order_number || "",
        category,
        ticketBreakdown: Array.from(tbMap.values()),
        totalTickets: arr.length,
        plusN: Math.max(0, arr.length - 1),
        addons: addonByReg.get(regId) || [],
        lodging: lodgingByReg.get(regId) || [],
        validForDay: (d: DayKey) =>
          arr.some((t) => {
            const raw = ticketTypes[t.ticket_type]?.valid_days as string[] | null;
            const days = raw && raw.length ? normalizeValidDays(raw) : DAY_ORDER;
            return days.includes(d);
          }),
        checkedInCount,
        checkedInByDay,
      };
      groups.push(group);
    });

    return groups.sort((a, b) =>
      a.buyer_last.toLowerCase().localeCompare(b.buyer_last.toLowerCase()) ||
      a.buyer_name.toLowerCase().localeCompare(b.buyer_name.toLowerCase())
    );
  }, [tickets, addons, lodging, ticketTypes, checkIns]);

  const filteredOrders = useMemo(() => {
    if (mode === "all") return orders;
    return orders.filter((o) => o.validForDay(mode));
  }, [orders, mode]);

  const sectionsToRender: { day: DayKey | "all"; label: string; orders: OrderGroup[] }[] = useMemo(() => {
    if (mode === "all") {
      return DAY_ORDER.map((d) => ({
        day: d,
        label: dayLabel(d),
        orders: orders.filter((o) => o.validForDay(d)),
      }));
    }
    return [{ day: mode, label: dayLabel(mode), orders: filteredOrders }];
  }, [mode, orders, filteredOrders]);

  return (
    <div className="door-list min-h-screen bg-white text-black p-8 font-sans">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.4in; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tr { page-break-inside: avoid; }
        }
        .door-list table { border-collapse: collapse; width: 100%; }
        .door-list th, .door-list td {
          border: 1px solid #d1d5db; padding: 5px 7px; font-size: 11px;
          text-align: left; vertical-align: top;
        }
        .door-list th {
          background: #f3f4f6; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; font-size: 10px;
        }
        .door-list h1 { font-size: 22px; font-weight: 700; }
        .door-list h2 {
          font-size: 14px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; margin-top: 24px; margin-bottom: 8px;
          border-bottom: 2px solid #111; padding-bottom: 4px;
        }
        .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; }
        .badge-paid { background: #dcfce7; color: #166534; }
        .badge-comp { background: #fef3c7; color: #92400e; }
        .badge-guest { background: #ede9fe; color: #5b21b6; }
        .badge-artist { background: #fce7f3; color: #9d174d; }
        .badge-pp { background: #dbeafe; color: #1e40af; }
        .tag { display: inline-block; padding: 1px 6px; margin: 1px 2px 1px 0; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 9.5px; background: #f8fafc; }
        .tag-lodging { border-color: #93c5fd; background: #eff6ff; color: #1e3a8a; }
        .check-box { display: inline-block; width: 11px; height: 11px; border: 1px solid #111; vertical-align: middle; margin-right: 4px; }
        .day-badge { display: inline-block; padding: 0 4px; background: #111; color: #fff; font-size: 9px; border-radius: 2px; margin-left: 4px; vertical-align: middle; }
        .ci-row { display: flex; align-items: baseline; gap: 4px; padding: 1px 4px; border-radius: 3px; }
        .ci-row + .ci-row { margin-top: 2px; }
        .ci-day { font-weight: 700; min-width: 16px; }
        .ci-mark { font-weight: 700; }
        .ci-meta { color: #6b7280; }
        .ci-done-all { background: #dcfce7; color: #14532d; }
        .ci-done-partial { background: #fef3c7; color: #78350f; }
        .ci-pending { color: #6b7280; }
        .ci-today { outline: 1.5px solid #111; }
      `}</style>

      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <button onClick={() => window.print()} className="px-4 py-2 bg-black text-white rounded">Print</button>
        <button onClick={() => window.close()} className="px-4 py-2 border rounded">Close</button>
        <div className="flex items-center gap-2 ml-2 border rounded p-1">
          {(["all", ...DAY_ORDER] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-sm ${mode === m ? "bg-black text-white" : "text-black"}`}
            >
              {m === "all" ? "Full booklet (all days)" : dayLabel(m as DayKey)}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">Tip: choose "Save as PDF" in the print dialog to archive.</span>
      </div>

      <header className="flex items-end justify-between border-b-2 border-black pb-3">
        <div>
          <h1>Door List — Expected Attendees</h1>
          <div className="text-sm">
            {eventTitle ? `${eventTitle} · ` : ""}
            {mode === "all" ? `All days ()` : dayLabel(mode)}
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            Generated {generatedAt.toLocaleString([], { timeZone: EVENT_TZ, dateStyle: "medium", timeStyle: "short" })} PT · Sorted by last name
          </div>
        </div>
        <div className="text-right text-sm">
          <div><strong>{filteredOrders.length}</strong> orders</div>
          <div><strong>{filteredOrders.reduce((s, o) => s + o.totalTickets, 0)}</strong> tickets</div>
        </div>
      </header>

      {loading && <div className="py-8 text-center text-gray-500">Loading attendees…</div>}

      {!loading && sectionsToRender.map((section, idx) => {
        const totalTickets = section.orders.reduce((s, o) => s + o.totalTickets, 0);
        const compCount = section.orders.filter((o) => o.category === "COMP" || o.category === "GUEST" || o.category === "ARTIST").length;
        return (
          <section key={section.day} className={idx > 0 ? "page-break" : ""}>
            <h2>
              {section.label} — {section.orders.length} orders · {totalTickets} tickets
              {compCount > 0 && <span className="text-xs font-normal normal-case tracking-normal text-gray-600"> · includes {compCount} comp/guest/artist</span>}
            </h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 22 }}>✓</th>
                  <th style={{ width: "24%" }}>Last, First (party size)</th>
                  <th>Ticket type</th>
                  <th style={{ width: 110 }}>Checked in</th>
                  <th style={{ width: 86 }}>Order #</th>
                  <th>Add-ons / Lodging</th>
                </tr>
              </thead>
              <tbody>
                {section.orders.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-500">No expected attendees for this day.</td></tr>
                )}
                {section.orders.map((o, i) => {
                  const partyLabel = o.totalTickets > 1 ? ` (party of ${o.totalTickets})` : "";
                  const fmtTime = (iso: string | null) =>
                    iso ? new Date(iso).toLocaleTimeString([], { timeZone: EVENT_TZ, hour: "numeric", minute: "2-digit" }) : "";
                  // Days this order is valid for (intersection of any ticket's valid_days)
                  const validDays = DAY_ORDER.filter((d) => o.validForDay(d));
                  const todayKey: DayKey | "all" = section.day === "all" ? "all" : section.day;
                  const todayInfo = todayKey !== "all" ? o.checkedInByDay[todayKey] : null;
                  return (
                    <tr key={`${o.registration_id}-${i}`}>
                      <td><span className="check-box" /></td>
                      <td>
                        <div>
                          <strong>{o.buyer_last || "—"}, {o.buyer_name.replace(o.buyer_last, "").trim() || "—"}</strong>
                          <span className="text-gray-600">{partyLabel}</span>
                        </div>
                        {o.plusN > 0 && (
                          <div className="text-[10px] text-gray-600">+{o.plusN} guest{o.plusN > 1 ? "s" : ""} on this order</div>
                        )}
                        {o.buyer_email && <div className="text-[10px] text-gray-500">{o.buyer_email}</div>}
                      </td>
                      <td>
                        <span className={
                          o.category === "COMP" ? "badge badge-comp" :
                          o.category === "GUEST" ? "badge badge-guest" :
                          o.category === "ARTIST" ? "badge badge-artist" :
                          o.category === "PAYMENT PLAN" ? "badge badge-pp" :
                          "badge badge-paid"
                        }>{o.category}</span>
                        <div className="mt-1">
                          {o.ticketBreakdown.map((tb, j) => (
                            <div key={j} className="text-[10.5px]">
                              {tb.count > 1 ? `${tb.count}× ` : ""}{tb.label}
                              <span className="day-badge">{dayBadge(tb.days)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="text-[10px] leading-tight">
                        {validDays.map((d) => {
                          const info = o.checkedInByDay[d];
                          const isToday = d === todayKey;
                          const done = info.count > 0;
                          const all = done && info.count >= o.totalTickets;
                          const cls = done
                            ? (all ? "ci-done-all" : "ci-done-partial")
                            : "ci-pending";
                          return (
                            <div key={d} className={`ci-row ${cls} ${isToday ? "ci-today" : ""}`}>
                              <span className="ci-day">{dayShortLabel(d)}</span>
                              {done ? (
                                <>
                                  <span className="ci-mark">✓</span>
                                  <span>{info.count}/{o.totalTickets}</span>
                                  {info.firstAt && <span className="ci-meta"> · {fmtTime(info.firstAt)}</span>}
                                  {info.station && <span className="ci-meta"> · {info.station}</span>}
                                </>
                              ) : (
                                <span className="ci-meta">— not yet</span>
                              )}
                            </div>
                          );
                        })}
                        {todayInfo && todayInfo.count > 0 && todayInfo.count >= o.totalTickets && (
                          <div className="text-[9.5px] text-emerald-700 font-semibold mt-0.5">Wristband already issued</div>
                        )}
                      </td>
                      <td className="font-mono text-[10px]">{o.order_number || "—"}</td>
                      <td>
                        {o.addons.length === 0 && o.lodging.length === 0 && <span className="text-gray-400">—</span>}
                        {o.addons.map((a, j) => <span key={`a${j}`} className="tag">{a}</span>)}
                        {o.lodging.map((l, j) => <span key={`l${j}`} className="tag tag-lodging">⌂ {l}</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      <footer className="mt-8 pt-3 border-t text-xs text-gray-500 flex justify-between">
        <span>Cosmico · Cosmico · Door List (expected attendees)</span>
        <span>Fr = Friday · Sa = Saturday · Su = Sunday (PT)</span>
      </footer>
    </div>
  );
}
