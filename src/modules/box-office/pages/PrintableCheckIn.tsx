import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatTicketType } from "@/lib/utils";

interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  plus_one_name: string | null;
  payment_status: string;
  quantity?: number;
}

export default function PrintableCheckIn() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/auth');
      return;
    }
    fetchRegistrations();
  }, [isAdmin, navigate]);

  const fetchRegistrations = async () => {
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('payment_status', 'paid')
      .order('name');

    if (!error && data) {
      setRegistrations(data);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="print:hidden p-6 space-y-4" style={{ background: '#F3EEE6' }}>
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <Button
            variant="outline"
            onClick={() => navigate('/admin')}
            className="gap-2"
            style={{ borderColor: '#D1C2AE' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button
            onClick={handlePrint}
            className="gap-2"
            style={{ background: '#C7A97A', color: '#F3EEE6' }}
          >
            <Printer className="w-4 h-4" />
            Print Check-In Sheet
          </Button>
        </div>
      </div>

      <div className="p-8 max-w-6xl mx-auto print:p-0">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#322821' }}>
            Event Check-In Sheet
          </h1>
          <p className="text-sm" style={{ color: '#7B6E61' }}>
            Total Attendees: {registrations.length} | Date: {new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}
          </p>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2" style={{ borderColor: '#322821' }}>
              <th className="text-left p-3 font-semibold" style={{ color: '#322821' }}>
                #
              </th>
              <th className="text-left p-3 font-semibold" style={{ color: '#322821' }}>
                Name
              </th>
              <th className="text-left p-3 font-semibold" style={{ color: '#322821' }}>
                Guest Name(s)
              </th>
              <th className="text-left p-3 font-semibold" style={{ color: '#322821' }}>
                Ticket Type
              </th>
              <th className="text-center p-3 font-semibold" style={{ color: '#322821' }}>
                ✓ Check-In
              </th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((reg, index) => (
              <tr key={reg.id} className="border-b" style={{ borderColor: '#D1C2AE' }}>
                <td className="p-3" style={{ color: '#7B6E61' }}>
                  {index + 1}
                </td>
                <td className="p-3 font-medium" style={{ color: '#322821' }}>
                  {reg.name}
                </td>
                <td className="p-3" style={{ color: '#7B6E61' }}>
                  {reg.plus_one_name || '—'}
                </td>
                <td className="p-3" style={{ color: '#7B6E61' }}>
                  {formatTicketType(reg.ticket_type)}
                </td>
                <td className="p-3">
                  <div className="w-6 h-6 border-2 mx-auto" style={{ borderColor: '#322821' }}></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 text-xs print:text-xs" style={{ color: '#7B6E61' }}>
          <p>Printed on: {new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</p>
        </div>
      </div>

      <style>{`
        @media print {
          body {
            background: white !important;
          }
          @page {
            margin: 0.5in;
          }
        }
      `}</style>
    </>
  );
}
