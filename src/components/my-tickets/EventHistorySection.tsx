import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Ticket, ChevronDown } from "lucide-react";
import { COLORS, typography } from "@/styles/may-theme";

export function EventHistorySection({ userEmail, currentRegistrations }: { userEmail: string; currentRegistrations: any[] }) {
  const [pastEvents, setPastEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPastEvents(); }, [userEmail]);

  const fetchPastEvents = async () => {
    try {
      const { data: allRegs, error } = await supabase
        .from("registrations").select("*, event_details(*)").ilike("email", userEmail.trim()).eq("payment_status", "paid").order("created_at", { ascending: false });
      if (error) throw error;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const past = (allRegs || []).filter((reg) => {
        if (!reg.event_details?.event_date) return false;
        return new Date(reg.event_details.event_date) < today;
      });
      setPastEvents(past);
    } catch (error) { console.error("Error fetching past events:", error); }
    finally { setLoading(false); }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });

  if (loading || pastEvents.length === 0) return null;

  return (
    <details className="group" style={{ borderTop: `1px solid ${COLORS.charcoal}10`, paddingTop: '12px' }}>
      <summary
        className="cursor-pointer list-none flex items-center justify-between gap-3 px-1 py-2 hover:opacity-70 transition-opacity"
      >
        <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
          View past events ({pastEvents.length} attended) →
        </span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" style={{ color: COLORS.boulder }} />
      </summary>
      <div className="pt-4 space-y-4">
        <div className="p-4 rounded-lg" style={{ backgroundColor: `${COLORS.charcoal}04`, border: `1px solid ${COLORS.charcoal}08` }}>
          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px', lineHeight: 1.6 }}>
            You've been with us for{" "}
            <span style={{ color: COLORS.charcoal, fontWeight: 600 }}>
              {pastEvents.length} {pastEvents.length === 1 ? "event" : "events"}
            </span>
            . We're so grateful for your continued support and presence at our gatherings.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="flex items-center gap-2" style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px' }}>
            <Calendar className="h-4 w-4" />EVENTS ATTENDED
          </h4>
          <div className="grid gap-2">
            {pastEvents.map((reg) => (
              <div key={reg.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.charcoal}10` }}>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.denim}10` }}>
                    <Ticket className="h-4 w-4" style={{ color: COLORS.denim }} />
                  </div>
                  <div>
                    <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>{reg.event_details?.title || "Event"}</p>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>{reg.event_details?.event_date && formatDate(reg.event_details.event_date)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center pt-2">
          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', fontStyle: 'italic' }}>
            "Thank you for being part of something beautiful." ✨
          </p>
        </div>
      </div>
    </details>
  );
}
