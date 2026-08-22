import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  venue_name: string;
  venue_address: string;
}

export default function PrintableDinnerManifest() {
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/auth");
      return;
    }
    if (!authLoading && user && isAdmin) {
      fetchData();
    }
  }, [user, isAdmin, authLoading, navigate]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch Winter event
      const { data: eventData, error: eventError } = await supabase
        .from("event_details")
        .select("*")
        .ilike("title", "%Winter%")
        .maybeSingle();

      if (eventError) throw eventError;
      if (!eventData) {
        setIsLoading(false);
        return;
      }
      setEvent(eventData);

      // Fetch paid dinner registrations only
      const { data: regsData, error: regsError } = await supabase
        .from("registrations")
        .select("*")
        .eq("event_id", eventData.id)
        .eq("payment_status", "paid")
        .eq("ticket_type", "dinner_party")
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

  const totalDinnerGuests = registrations.reduce((sum, reg) => sum + reg.quantity, 0);
  const guestsWithDietary = registrations.filter(r => r.dietary_notes && r.dietary_notes.toLowerCase() !== 'none');
  const checkedInCount = registrations.filter(r => r.checked_in).length;

  // Build expanded guest list with individual names
  const expandedGuestList: Array<{
    name: string;
    isPlusOne: boolean;
    parentName?: string;
    email: string;
    dietaryNotes: string | null;
  }> = [];

  registrations.forEach(reg => {
    // Add primary registrant
    expandedGuestList.push({
      name: reg.name,
      isPlusOne: false,
      email: reg.email,
      dietaryNotes: reg.dietary_notes,
    });

    // Add plus ones if any
    if (reg.plus_one_name && reg.quantity > 1) {
      const plusOneNames = reg.plus_one_name.split(',').map(n => n.trim()).filter(n => n);
      plusOneNames.forEach(plusOneName => {
        // Skip if it's the same as the primary name
        if (plusOneName.toLowerCase() !== reg.name.toLowerCase()) {
          expandedGuestList.push({
            name: plusOneName,
            isPlusOne: true,
            parentName: reg.name,
            email: reg.email,
            dietaryNotes: reg.dietary_notes,
          });
        }
      });
    }
  });

  // Sort expanded list alphabetically
  expandedGuestList.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-background p-8">
      {/* Print Button - Hidden when printing */}
      <div className="no-print mb-6 flex justify-end gap-4">
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print Manifest
        </Button>
      </div>

      {/* Printable Content */}
      <div className="max-w-5xl mx-auto bg-white text-black p-8 rounded-lg shadow-lg print:shadow-none">
        {/* Header */}
        <div className="border-b-2 border-gray-800 pb-6 mb-6">
          <h1 className="text-3xl font-bold mb-1">{event.title}</h1>
          <h2 className="text-xl text-gray-600 mb-4">Dinner Guest Manifest</h2>
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
        <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-gray-100 rounded">
          <div>
            <p className="text-sm text-gray-600">Dinner Registrations</p>
            <p className="text-2xl font-bold">{registrations.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Dinner Guests</p>
            <p className="text-2xl font-bold">{totalDinnerGuests}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">With Dietary Notes</p>
            <p className="text-2xl font-bold">{guestsWithDietary.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Checked In</p>
            <p className="text-2xl font-bold">{checkedInCount}</p>
          </div>
        </div>

        {/* Dietary Restrictions Summary - Highlighted */}
        {guestsWithDietary.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded">
            <h3 className="font-bold text-lg mb-3 text-amber-800">⚠️ Dietary Restrictions</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b border-amber-300">
                  <th className="text-left py-2 text-sm font-semibold">Guest Name</th>
                  <th className="text-left py-2 text-sm font-semibold">Party Size</th>
                  <th className="text-left py-2 text-sm font-semibold">Dietary Notes</th>
                </tr>
              </thead>
              <tbody>
                {guestsWithDietary.map((reg) => (
                  <tr key={reg.id} className="border-b border-amber-200">
                    <td className="py-2 text-sm font-medium">{reg.name}</td>
                    <td className="py-2 text-sm">{reg.quantity}</td>
                    <td className="py-2 text-sm font-medium text-amber-900">{reg.dietary_notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Full Dinner Guest List */}
        <div>
          <h2 className="text-xl font-bold mb-4">Complete Dinner Guest List</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="text-left py-2 px-2 text-sm font-semibold w-8">#</th>
                <th className="text-left py-2 px-2 text-sm font-semibold">Guest Name</th>
                <th className="text-left py-2 px-2 text-sm font-semibold">Email</th>
                <th className="text-left py-2 px-2 text-sm font-semibold">Dietary Notes</th>
                <th className="text-center py-2 px-2 text-sm font-semibold w-24">Check-In</th>
              </tr>
            </thead>
            <tbody>
              {expandedGuestList.map((guest, index) => (
                <tr
                  key={`${guest.name}-${index}`}
                  className={`border-b border-gray-300 ${
                    index % 2 === 0 ? "bg-gray-50" : "bg-white"
                  }`}
                >
                  <td className="py-3 px-2 text-sm text-gray-500">{index + 1}</td>
                  <td className="py-3 px-2 text-sm">
                    <div className="font-medium">{guest.name}</div>
                    {guest.isPlusOne && (
                      <div className="text-xs text-gray-500">guest of {guest.parentName}</div>
                    )}
                  </td>
                  <td className="py-3 px-2 text-xs text-gray-600">{guest.email}</td>
                  <td className="py-3 px-2 text-sm">
                    {guest.dietaryNotes && guest.dietaryNotes.toLowerCase() !== 'none' && (
                      <span className="inline-block px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs">
                        {guest.dietaryNotes}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className="inline-block w-5 h-5 border-2 border-gray-400 rounded"></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-300 text-sm text-gray-600 flex justify-between">
          <p>
            Total: {registrations.length} registrations | {totalDinnerGuests} dinner guests
          </p>
          <p>
            {guestsWithDietary.length} with dietary restrictions
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
            size: landscape;
          }
        }
      `}</style>
    </div>
  );
}
