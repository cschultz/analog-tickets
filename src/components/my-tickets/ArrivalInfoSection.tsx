import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Calendar, Clock, Car, CheckCircle2, Backpack, ChevronUp, ChevronDown } from "lucide-react";
import { COLORS, typography } from "@/styles/may-theme";
import { getTicketDateRange } from "@/config/ticketTypes";

export function ArrivalInfoSection({ eventDetails, userTicketTypes = [] }: { eventDetails: any; userTicketTypes?: string[] }) {
  // Sunday secret location is restricted to VIP and Crew ticket holders only.
  // GA (even multi-day) does NOT include Sunday access.
  const SUNDAY_ELIGIBLE_TYPES = new Set([
    "tier_1_vip_3day",
    "tier_1_krewe_3day",
    "vip_3day",
    "vip_3_day",
    "krewe_3day",
    "krewe_3_day",
    "patrons_premier",
    "patrons_ultimate",
  ]);
  const hasSundayAccess = userTicketTypes.some((t) => SUNDAY_ELIGIBLE_TYPES.has(t));
  const formatDate = (dateStr: string) => {
    // Parse YYYY-MM-DD as local to avoid UTC shifting it back a day
    const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  };

  const formatGateTime = (timeStr?: string | null) => {
    if (!timeStr) return null;
    const [hh, mm] = timeStr.split(":").map(Number);
    if (isNaN(hh)) return null;
    const period = hh >= 12 ? "PM" : "AM";
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    const minute = mm ? `:${String(mm).padStart(2, "0")}` : "";
    return `${hour12}${minute} ${period}`;
  };

  const gateTimeFormatted = formatGateTime(eventDetails.event_time);
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between text-left transition-colors hover:opacity-90"
        style={{ backgroundColor: `${COLORS.denim}06` }}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.clay}15` }}>
            <MapPin className="h-4 w-4" style={{ color: COLORS.clay }} />
          </div>
          <div>
            <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px' }}>Arrival Information</h3>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
              {eventDetails.event_date ? formatDate(eventDetails.event_date) : "Event details"}
              {gateTimeFormatted && ` · Gates open ${gateTimeFormatted}`}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5" style={{ color: COLORS.boulder }} /> : <ChevronDown className="h-5 w-5" style={{ color: COLORS.boulder }} />}
      </button>

      {expanded && (
      <div className="px-6 py-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 mt-0.5" style={{ color: COLORS.boulder }} />
              <div>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Event Date</p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  {eventDetails.event_date ? formatDate(eventDetails.event_date) : "TBA"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 mt-0.5" style={{ color: COLORS.boulder }} />
              <div>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Gate Times</p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  {gateTimeFormatted ? `Gates open at ${gateTimeFormatted} Friday` : "Gate times TBA"}
                </p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>Check-in closes at 9:30 PM</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 mt-0.5" style={{ color: COLORS.boulder }} />
              <div>
                <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>FRIDAY & SATURDAY</p>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>{eventDetails.venue_name || "Venue"}</p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>{eventDetails.venue_address || "Address TBA"}</p>
                <Link to="/almost-here#venue-map" style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.08em', display: 'inline-block', marginTop: '8px' }} className="hover:opacity-70 transition-opacity">
                  View venue map →
                </Link>
              </div>
            </div>
            {hasSundayAccess && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 mt-0.5" style={{ color: COLORS.clay }} />
                <div>
                  <p style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', letterSpacing: '0.08em' }}>SUNDAY · VIP & KREWE ONLY</p>
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Secret location · shuttle from Bloodroot Tasting Room</p>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>118 North St, Example Valley, CA 95448</p>
                  <a
                    href="https://www.google.com/maps/dir/?api=1&destination=Bloodroot+Tasting+Room%2C+118+North+St%2C+Example Valley%2C+CA+95448"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.08em', display: 'inline-block', marginTop: '8px' }}
                    className="hover:opacity-70 transition-opacity"
                  >
                    Get directions →
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Car className="h-5 w-5 mt-0.5" style={{ color: COLORS.boulder }} />
              <div>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Parking</p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  {eventDetails.parking_info || "No parking available on site. Shuttle service and off-site parking options will be communicated prior to the event."}
                </p>
                <Link to="/almost-here#venue-map" style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.08em', display: 'inline-block', marginTop: '8px' }} className="hover:opacity-70 transition-opacity">
                  Open the Almost Here map →
                </Link>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 mt-0.5" style={{ color: COLORS.boulder }} />
              <div>
                <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>Wristband Pickup</p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  {eventDetails.check_in_instructions || "Gates open at 4:00 PM on Friday, May 15th. Check your email for detailed arrival instructions 7 days before the event."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4" style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}>
          <div className="flex items-center gap-2 mb-3">
            <Backpack className="h-5 w-5" style={{ color: COLORS.clay }} />
            <h4 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px', fontStyle: 'italic' }}>What to Bring</h4>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {[
              "Valid ID matching ticket name",
              "Comfortable shoes for dancing",
              "Layers (it gets cool at night)",
              "Reusable water bottle",
              "Sunscreen & hat for daytime",
              "Camera for memories",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.forest }} />
                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', fontStyle: 'italic' }}>
          This is a family-friendly event. Kids are welcome and children under 12 attend free. Detailed arrival and parking information are available on the <Link to="/almost-here#venue-map" style={{ color: COLORS.clay, textDecoration: 'underline' }} className="hover:opacity-70 transition-opacity">Almost Here map</Link>.
        </p>
      </div>
      )}
    </div>
  );
}
