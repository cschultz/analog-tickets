import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, Calendar, MapPin, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import analogLogo from "@/assets/analog-logo-cream.webp";

export default function LodgingOfferSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const code = searchParams.get("code");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    lodgingZone?: string;
    lodgingQty?: number;
    ticketType?: string;
    ticketQty?: number;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("No session ID provided");
      setLoading(false);
      return;
    }

    verifyPayment();
  }, [sessionId]);

  const verifyPayment = async () => {
    try {
      // Use the existing verify-payment function
      const { data, error: verifyError } = await supabase.functions.invoke("verify-payment", {
        body: { sessionId },
      });

      if (verifyError) throw verifyError;

      // Extract order details from metadata if available
      if (data?.metadata) {
        setOrderDetails({
          lodgingZone: data.metadata.lodging_zone_key,
          lodgingQty: data.metadata.lodging_qty ? parseInt(data.metadata.lodging_qty) : undefined,
          ticketType: data.metadata.ticket_type,
          ticketQty: data.metadata.ticket_qty ? parseInt(data.metadata.ticket_qty) : undefined,
        });
      }
    } catch (err: any) {
      console.error("Verification error:", err);
      // Don't show error for already processed payments
      if (!err.message?.includes("already")) {
        setError(err.message || "Unable to verify payment");
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-preview-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-preview-accent mx-auto mb-4" />
          <p className="text-preview-muted">Confirming your order...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-preview-bg text-preview-text">
      <header className="fixed top-0 left-0 right-0 z-50 bg-preview-bg/90 backdrop-blur-sm border-b border-preview-border/20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={analogLogo} alt="Analog" className="h-8 opacity-80" />
          </Link>
        </div>
      </header>

      <main className="pt-24 pb-20 px-6">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-preview-surface border border-preview-border rounded-xl p-8">
            <div className="h-16 w-16 mx-auto mb-6 bg-green-500/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            
            <h1 className="font-display text-2xl text-preview-text mb-2">
              You're All Set!
            </h1>
            <p className="text-preview-muted mb-6">
              Your lodging has been confirmed. Check your email for details.
            </p>

            {orderDetails && (
              <div className="bg-preview-bg rounded-lg p-4 mb-6 text-left space-y-3">
                {orderDetails.ticketType && orderDetails.ticketQty && (
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-preview-accent" />
                    <span className="text-preview-text">
                      {orderDetails.ticketQty}x {orderDetails.ticketType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                )}
                {orderDetails.lodgingZone && orderDetails.lodgingQty && (
                  <div className="flex items-center gap-3 text-sm">
                    <Home className="h-4 w-4 text-preview-accent" />
                    <span className="text-preview-text">
                      {orderDetails.lodgingQty}x {orderDetails.lodgingZone.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-preview-accent" />
                  <span className="text-preview-muted">Example Meadow</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Link to="/my-tickets">
                <Button className="w-full bg-preview-accent hover:bg-preview-accent/90 text-white">
                  Manage Booking
                </Button>
              </Link>
              <Link to="/">
                <Button variant="outline" className="w-full border-preview-border text-preview-text hover:bg-preview-surface">
                  Return Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
