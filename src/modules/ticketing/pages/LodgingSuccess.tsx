import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, Home, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { motion } from "framer-motion";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/platform/config/env";

interface BookingDetails {
  zone_name: string;
  quantity: number;
  total_amount: number;
  email: string;
}

export default function LodgingSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingDetails | null>(null);

  useEffect(() => {
    const fetchBookingDetails = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        // Fetch the booking by stripe session ID via raw fetch with x-lookup-session header
        const supabaseUrl = getSupabaseUrl();
        const supabaseKey = getSupabaseAnonKey();
        const url = new URL(`${supabaseUrl}/rest/v1/lodging_bookings`);
        url.searchParams.set("select", "quantity,total_amount,email,zone_key,accommodation_zones!inner(zone_name)");
        url.searchParams.set("stripe_session_id", `eq.${sessionId}`);
        const res = await fetch(url.toString(), {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "x-lookup-session": sessionId,
          },
        });
        const rows = res.ok ? await res.json() : [];
        const bookingData = rows && rows[0];

        if (bookingData) {
          setBooking({
            zone_name: (bookingData.accommodation_zones as any)?.zone_name || bookingData.zone_key,
            quantity: bookingData.quantity,
            total_amount: bookingData.total_amount,
            email: bookingData.email,
          });
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBookingDetails();
  }, [sessionId]);

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.denim }} />
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen"
      style={{ backgroundColor: COLORS.dustySky }}
    >
      {/* Header */}
      <header className="py-6 px-4 border-b" style={{ borderColor: COLORS.boulder }}>
        <div className="max-w-4xl mx-auto">
          <Link to="/">
            <img src={analogLogo} alt="Analog" className="h-8" />
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-16">
        <motion.div 
          className="text-center"
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
        >
          <div 
            className="w-20 h-20 mx-auto mb-8 flex items-center justify-center"
            style={{ backgroundColor: COLORS.forest }}
          >
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          
          <h1 
            className="text-3xl md:text-4xl mb-4"
            style={{ ...typography.headline, color: COLORS.charcoal }}
          >
            You're All Set!
          </h1>
          
          <p 
            className="text-lg mb-8"
            style={{ ...typography.body, color: COLORS.charcoal }}
          >
            Your lodging reservation is confirmed.
          </p>

          {booking && (
            <div 
              className="p-6 mb-8 text-left border"
              style={{ 
                backgroundColor: COLORS.white,
                borderColor: COLORS.boulder,
                borderRadius: 0,
              }}
            >
              <h2 
                className="text-lg mb-4 pb-4 border-b"
                style={{ 
                  ...typography.subhead, 
                  color: COLORS.charcoal,
                  borderColor: COLORS.boulder,
                }}
              >
                Reservation Details
              </h2>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span style={{ color: COLORS.boulder }}>Accommodation</span>
                  <span style={{ ...typography.body, color: COLORS.charcoal }}>
                    {booking.quantity}x {booking.zone_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.boulder }}>Total Paid</span>
                  <span style={{ ...typography.body, color: COLORS.charcoal }}>
                    ${(booking.total_amount / 100).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div 
            className="p-4 mb-8 flex items-center gap-3"
            style={{ 
              backgroundColor: `${COLORS.denim}15`,
              borderRadius: 0,
            }}
          >
            <Mail className="w-5 h-5 flex-shrink-0" style={{ color: COLORS.denim }} />
            <p 
              className="text-sm text-left"
              style={{ ...typography.body, color: COLORS.charcoal }}
            >
              A confirmation email has been sent to {booking?.email || "your email"}. 
              We'll be in touch closer to the event with exact tent assignments and arrival details.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              className="h-12 px-8"
              style={{ 
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                borderRadius: 0,
              }}
            >
              <Link to="/">
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
