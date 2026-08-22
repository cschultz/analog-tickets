import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Calendar, MapPin, Ticket, Mail, PartyPopper } from "lucide-react";
import { format } from "date-fns";
import analogLogo from "@/assets/analog-logo-cream.webp";

interface OfferDetails {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  total_amount: number;
  registration_id: string | null;
  event: {
    title: string;
    event_date: string;
    venue_name: string;
  } | null;
}

export default function CustomOfferSuccess() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<OfferDetails | null>(null);
  const [ticketCount, setTicketCount] = useState(0);

  useEffect(() => {
    if (token) {
      fetchOfferDetails();
    }
  }, [token]);

  const fetchOfferDetails = async () => {
    try {
      // Fetch the accepted offer details
      const { data: offerData, error: offerError } = await supabase
        .from("custom_offers")
        .select(`
          id,
          recipient_email,
          recipient_name,
          total_amount,
          registration_id,
          event_details (
            title,
            event_date,
            venue_name
          )
        `)
        .eq("offer_token", token)
        .eq("status", "accepted")
        .maybeSingle();

      if (offerError) throw offerError;

      if (offerData) {
        setOffer({
          ...offerData,
          event: offerData.event_details,
        });

        // Fetch ticket count if registration exists
        if (offerData.registration_id) {
          const { count } = await supabase
            .from("tickets")
            .select("*", { count: "exact", head: true })
            .eq("registration_id", offerData.registration_id);
          
          setTicketCount(count || 0);
        }
      }
    } catch (err) {
      console.error("Error fetching offer:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-background">
      <div className="max-w-lg mx-auto p-4 py-12">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={analogLogo} alt="Analog" className="h-12 mx-auto mb-6" />
        </div>

        {/* Success Card */}
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="bg-green-500 p-6 text-center text-white">
            <div className="h-20 w-20 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-bold mb-1">Payment Successful!</h1>
            <p className="text-green-100">Your tickets have been confirmed</p>
          </div>

          <CardContent className="p-6 space-y-6">
            {/* Confirmation Message */}
            <div className="text-center">
              <PartyPopper className="h-8 w-8 mx-auto mb-3 text-amber-500" />
              <p className="text-lg font-medium">
                {offer?.recipient_name ? `See you there, ${offer.recipient_name}!` : "See you there!"}
              </p>
            </div>

            {/* Order Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              {offer?.event && (
                <>
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">{offer.event.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(offer.event.event_date), "EEEE, MMMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm">{offer.event.venue_name}</p>
                  </div>
                </>
              )}

              {ticketCount > 0 && (
                <div className="flex items-center gap-3">
                  <Ticket className="h-5 w-5 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <p className="text-sm">{ticketCount} ticket{ticketCount !== 1 ? "s" : ""}</p>
                    <Badge variant="secondary" className="text-xs">Confirmed</Badge>
                  </div>
                </div>
              )}

              {offer && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm">{offer.recipient_email}</p>
                </div>
              )}

              {offer && (
                <div className="pt-3 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Paid</span>
                    <span className="text-lg font-bold">${(offer.total_amount / 100).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Email Notice */}
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <Mail className="h-5 w-5 mx-auto mb-2 text-blue-500" />
              <p className="text-sm text-blue-700">
                A confirmation email with your ticket details has been sent to{" "}
                <span className="font-medium">{offer?.recipient_email}</span>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button 
                className="w-full" 
                size="lg"
                onClick={() => navigate("/my-tickets")}
              >
                <Ticket className="mr-2 h-4 w-4" />
                Manage Booking
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate("/")}
              >
                Return Home
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-xs text-center text-muted-foreground mt-8">
          Questions? Contact us at hello@example.org
        </p>
      </div>
    </div>
  );
}
