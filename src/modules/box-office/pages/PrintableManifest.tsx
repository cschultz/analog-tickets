import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { format } from "date-fns";

interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  quantity: number;
  checked_in: boolean;
  checked_in_at: string | null;
  dietary_notes: string | null;
  plus_one_name: string | null;
}

interface EventDetails {
  title: string;
  event_date: string;
  event_time: string;
  venue_name: string;
  venue_address: string;
}

export default function PrintableManifest() {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("event_id");
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch event details
      const { data: eventData, error: eventError } = await supabase
        .from("event_details")
        .select("*")
        .eq("id", eventId)
        .single();

      if (eventError) throw eventError;
      setEvent(eventData);

      // Fetch paid registrations
      const { data: regsData, error: regsError } = await supabase
        .from("registrations")
        .select("*")
        .eq("event_id", eventId)
        .eq("payment_status", "paid")
        .order("name");

      if (regsError) throw regsError;
      setRegistrations(regsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Event not found</p>
      </div>
    );
  }

  const totalAttendees = registrations.reduce((sum, reg) => sum + reg.quantity, 0);
  const checkedInCount = registrations.filter(r => r.checked_in).length;
  const ticketTypeCounts: Record<string, number> = {};
  
  registrations.forEach(reg => {
    ticketTypeCounts[reg.ticket_type] = (ticketTypeCounts[reg.ticket_type] || 0) + reg.quantity;
  });

  return (
    <div className="min-h-screen bg-background p-8">
      {/* Print Button - Hidden when printing */}
      <div className="no-print mb-6 flex justify-end">
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print Manifest
        </Button>
      </div>

      {/* Printable Content */}
      <div className="max-w-6xl mx-auto bg-white text-black p-8 rounded-lg shadow-lg print:shadow-none">
        {/* Header */}
        <div className="border-b-2 border-gray-800 pb-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">{event.title}</h1>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold">Date:</p>
              <p>{format(new Date(event.event_date), "EEEE, MMMM d, yyyy")}</p>
            </div>
            <div>
              <p className="font-semibold">Time:</p>
              <p>{event.event_time}</p>
            </div>
            <div>
              <p className="font-semibold">Venue:</p>
              <p>{event.venue_name}</p>
              <p className="text-gray-600">{event.venue_address}</p>
            </div>
            <div>
              <p className="font-semibold">Generated:</p>
              <p>{format(new Date(), "MMM d, yyyy 'at' h:mm a")}</p>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-100 rounded">
          <div>
            <p className="text-sm text-gray-600">Total Registrations</p>
            <p className="text-2xl font-bold">{registrations.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Attendees</p>
            <p className="text-2xl font-bold">{totalAttendees}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Checked In</p>
            <p className="text-2xl font-bold">{checkedInCount}</p>
          </div>
        </div>

        {/* Ticket Type Breakdown */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">Ticket Types</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {Object.entries(ticketTypeCounts).map(([type, count]) => (
              <div key={type}>
                <span className="font-medium">{type}:</span> {count}
              </div>
            ))}
          </div>
        </div>

        {/* Attendee List */}
        <div>
          <h2 className="text-xl font-bold mb-4">Attendee List</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="text-left py-2 px-2 text-sm font-semibold">Name</th>
                <th className="text-left py-2 px-2 text-sm font-semibold">Email</th>
                <th className="text-left py-2 px-2 text-sm font-semibold">Ticket Type</th>
                <th className="text-center py-2 px-2 text-sm font-semibold">Qty</th>
                <th className="text-center py-2 px-2 text-sm font-semibold">Status</th>
                <th className="text-left py-2 px-2 text-sm font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((reg, index) => (
                <tr
                  key={reg.id}
                  className={`border-b border-gray-300 ${
                    index % 2 === 0 ? "bg-gray-50" : "bg-white"
                  }`}
                >
                  <td className="py-3 px-2 text-sm">
                    <div className="font-medium">{reg.name}</div>
                    {reg.plus_one_name && (
                      <div className="text-xs text-gray-600">+1: {reg.plus_one_name}</div>
                    )}
                  </td>
                  <td className="py-3 px-2 text-xs break-all">{reg.email}</td>
                  <td className="py-3 px-2 text-sm">{reg.ticket_type}</td>
                  <td className="py-3 px-2 text-sm text-center">{reg.quantity}</td>
                  <td className="py-3 px-2 text-sm text-center">
                    {reg.checked_in ? (
                      <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                        ✓ Checked In
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                        Not Yet
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-xs text-gray-600">
                    {reg.dietary_notes && (
                      <div className="italic">Dietary: {reg.dietary_notes}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-300 text-sm text-gray-600">
          <p>
            Total: {registrations.length} registrations | {totalAttendees} attendees
          </p>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            background: white !important;
            margin: 0;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          @page {
            margin: 1cm;
          }
        }
      `}</style>
    </div>
  );
}