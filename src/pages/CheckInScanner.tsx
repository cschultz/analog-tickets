import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Scanner } from "@yudiel/react-qr-scanner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function CheckInScanner() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const [scanning, setScanning] = useState(true);
  const [lastScanned, setLastScanned] = useState<{ name: string; status: "success" | "error"; message: string } | null>(null);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F3EEE6] to-[#E8DED0]">
        <div className="text-center">
          <div className="text-lg font-medium text-[#322821]">Loading...</div>
        </div>
      </div>
    );
  }

  // Redirect if not admin
  if (!isAdmin) {
    navigate('/auth');
    return null;
  }

  const handleScan = async (result: string) => {
    if (!result || !scanning) return;
    
    setScanning(false);

    // Accept legacy formats:
    // - "CHECKIN:<registration_id>"
    // - raw UUID "<registration_id>"
    // - URLs containing the UUID (e.g., ...?id=<registration_id> or path segment)
    const raw = decodeURIComponent(String(result).trim());

    // Helper: UUID matcher (v1-v5)
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

    let registrationId: string | null = null;

    if (raw.startsWith('CHECKIN:')) {
      registrationId = raw.replace('CHECKIN:', '').trim();
    } else if (uuidRegex.test(raw)) {
      registrationId = (raw.match(uuidRegex) || [])[0] || null;
    } else {
      // Try parse URL and extract id from query or last path segment
      try {
        const url = new URL(raw);
        const possible = url.searchParams.get('id') || url.searchParams.get('registration_id') || url.searchParams.get('registrationId');
        if (possible && uuidRegex.test(possible)) {
          registrationId = possible.match(uuidRegex)?.[0] || null;
        } else {
          const parts = url.pathname.split('/').filter(Boolean);
          const last = parts[parts.length - 1];
          if (last && uuidRegex.test(last)) {
            registrationId = last.match(uuidRegex)?.[0] || null;
          }
        }
      } catch {
        // not a URL, keep as invalid
      }
    }

    if (!registrationId) {
      setLastScanned({
        name: "Invalid QR Code",
        status: "error",
        message: "This is not a valid ticket QR code"
      });
      toast.error("Invalid QR code format");
      setTimeout(() => setScanning(true), 2000);
      return;
    }

    try {
      // Get registration details
      const { data: reg, error: fetchError } = await supabase
        .from('registrations')
        .select('*')
        .eq('id', registrationId)
        .maybeSingle();

      if (fetchError || !reg) {
        setLastScanned({
          name: "Not Found",
          status: "error",
          message: "Registration not found"
        });
        toast.error("Registration not found");
        setTimeout(() => setScanning(true), 2000);
        return;
      }

      if (reg.payment_status !== 'paid') {
        setLastScanned({
          name: reg.name,
          status: "error",
          message: "Payment not completed"
        });
        toast.error(`${reg.name}: Payment not completed`);
        setTimeout(() => setScanning(true), 2000);
        return;
      }

      if (reg.checked_in) {
        setLastScanned({
          name: reg.name,
          status: "error",
          message: "Already checked in"
        });
        toast.warning(`${reg.name} is already checked in`);
        setTimeout(() => setScanning(true), 2000);
        return;
      }

      // Check in the attendee
      const { error: updateError } = await supabase
        .from('registrations')
        .update({
          checked_in: true,
          checked_in_at: new Date().toISOString()
        })
        .eq('id', registrationId);

      if (updateError) throw updateError;

      setLastScanned({
        name: reg.name,
        status: "success",
        message: "Successfully checked in!"
      });
      toast.success(`${reg.name} checked in successfully!`);
      
      setTimeout(() => {
        setLastScanned(null);
        setScanning(true);
      }, 3000);
    } catch (error) {
      console.error('Check-in error:', error);
      setLastScanned({
        name: "Error",
        status: "error",
        message: "Failed to check in"
      });
      toast.error("Failed to check in attendee");
      setTimeout(() => setScanning(true), 2000);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: 'linear-gradient(135deg, #F3EEE6 0%, #E8DED0 100%)' }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => navigate('/admin')}
            className="gap-2"
            style={{ borderColor: '#D1C2AE' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </div>

        <Card style={{ background: 'rgba(255, 255, 255, 0.9)', borderColor: '#D1C2AE' }}>
          <CardHeader>
            <CardTitle className="text-center" style={{ color: '#322821' }}>
              QR Code Check-In Scanner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {scanning ? (
              <div className="rounded-lg overflow-hidden">
                <Scanner
                  onScan={(result) => handleScan(result[0].rawValue)}
                  components={{
                    finder: true,
                  }}
                  styles={{
                    container: { width: '100%' },
                  }}
                />
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center bg-gray-100 rounded-lg">
                <div className="text-center">
                  <div className="text-lg font-medium mb-2" style={{ color: '#322821' }}>
                    Processing...
                  </div>
                </div>
              </div>
            )}

            {lastScanned && (
              <div
                className={`p-4 rounded-lg flex items-center gap-3 ${
                  lastScanned.status === "success" ? "bg-green-50" : "bg-red-50"
                }`}
              >
                {lastScanned.status === "success" ? (
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                )}
                <div>
                  <div className={`font-semibold ${lastScanned.status === "success" ? "text-green-900" : "text-red-900"}`}>
                    {lastScanned.name}
                  </div>
                  <div className={`text-sm ${lastScanned.status === "success" ? "text-green-700" : "text-red-700"}`}>
                    {lastScanned.message}
                  </div>
                </div>
              </div>
            )}

            <div className="text-center text-sm" style={{ color: '#7B6E61' }}>
              Position the QR code within the frame to scan
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
