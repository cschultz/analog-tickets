import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { COLORS, typography } from "@/styles/may-theme";
import { Tent, Mail, Loader2, CheckCircle, XCircle, ArrowRight, HelpCircle } from "lucide-react";
import { z } from "zod";

interface LodgingEmailLookupProps {
  onEligibleTicketFound: (data: {
    registrationId: string;
    email: string;
    name: string;
    ticketType: string;
    quantity: number;
  }) => void;
}

// Eligible ticket types for lodging
const ELIGIBLE_TICKET_TYPES = [
  "tier_1_krewe_3day",
  "tier_1_vip_3day",
  "krewe_3day",
  "vip_3day",
  "krewe",
  "vip",
  "early_bird_vip_3day",
  "early_bird_krewe_3day",
  "vip_3_day",
  "krewe_3_day",
];

export const LodgingEmailLookup = ({ onEligibleTicketFound }: LodgingEmailLookupProps) => {
  const [email, setEmail] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<"idle" | "eligible" | "not_found" | "not_eligible" | "already_booked">("idle");
  const [foundData, setFoundData] = useState<{
    registrationId: string;
    name: string;
    ticketType: string;
    quantity: number;
  } | null>(null);

  const emailSchema = z.string().trim().email("Please enter a valid email").max(255);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      toast.error(parsedEmail.error.issues[0]?.message || "Please enter a valid email address");
      return;
    }

    setIsChecking(true);
    setResult("idle");
    setFoundData(null);

    try {
      // Fetch active event first
      const { data: event } = await supabase
        .from("event_details")
        .select("id")
        .eq("is_active", true)
        .single();

      if (!event) {
        toast.error("Unable to verify tickets at this time");
        setIsChecking(false);
        return;
      }

      // Look for a paid registration with an eligible ticket type
      const { data: registration, error } = await supabase
        .from("registrations")
        .select("id, name, ticket_type, quantity, email")
        .eq("email", parsedEmail.data.toLowerCase())
        .eq("event_id", event.id)
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Lookup error:", error);
        toast.error("Unable to verify tickets. Please try again.");
        setIsChecking(false);
        return;
      }

      if (!registration) {
        setResult("not_found");
        setIsChecking(false);
        return;
      }

      // Check if ticket type is eligible
      const ticketType = registration.ticket_type.toLowerCase();
      const isEligible = ELIGIBLE_TICKET_TYPES.some(t => ticketType.includes(t.replace(/_/g, "")) || ticketType.includes(t));
      
      if (!isEligible) {
        setResult("not_eligible");
        setIsChecking(false);
        return;
      }

      // Check if they already have lodging booked
      const { data: existingLodging } = await supabase
        .from("lodging_bookings")
        .select("id")
        .eq("registration_id", registration.id)
        .eq("payment_status", "paid")
        .maybeSingle();

      if (existingLodging) {
        setResult("already_booked");
        setIsChecking(false);
        return;
      }

      // Eligible and no existing booking
      setFoundData({
        registrationId: registration.id,
        name: registration.name,
        ticketType: registration.ticket_type,
        quantity: registration.quantity,
      });
      setResult("eligible");
      setIsChecking(false);
    } catch (err) {
      console.error("Lookup error:", err);
      toast.error("Unable to verify tickets. Please try again.");
      setIsChecking(false);
    }
  };

  const handleContinue = () => {
    if (foundData) {
      onEligibleTicketFound({
        registrationId: foundData.registrationId,
        email: emailSchema.parse(email).toLowerCase(),
        name: foundData.name,
        ticketType: foundData.ticketType,
        quantity: foundData.quantity,
      });
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-8">
        <div 
          className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
          style={{ backgroundColor: `${COLORS.clay}20` }}
        >
          <Tent className="w-8 h-8" style={{ color: COLORS.clay }} />
        </div>
        <h1 
          style={{ 
            ...typography.headline, 
            color: COLORS.charcoal,
            fontSize: 'clamp(24px, 4vw, 32px)',
            marginBottom: '12px'
          }}
        >
          Add Lodging to Your Order
        </h1>
        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '15px', lineHeight: 1.6 }}>
          On-site glamping is available exclusively for VIP and Crew 3-day ticket holders.
        </p>
      </div>

      {/* Email Lookup Form */}
      <div 
        className="p-6 rounded-xl border mb-6"
        style={{ 
          backgroundColor: COLORS.white,
          borderColor: `${COLORS.charcoal}15`
        }}
      >
        <h2 
          className="mb-4"
          style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px' }}
        >
          Already booked? Add lodging to your existing order.
        </h2>
        <p 
          className="mb-4"
          style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}
        >
          Enter the email used for your order and we&apos;ll check whether your booking qualifies for lodging.
        </p>

        <form onSubmit={handleLookup} className="space-y-4">
          <div className="relative">
            <Mail 
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" 
              style={{ color: COLORS.boulder }} 
            />
            <Input
              type="email"
              placeholder="Email used for your order"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (result !== "idle") setResult("idle");
              }}
              className="pl-11 h-12"
              style={{ 
                backgroundColor: COLORS.white,
                borderColor: `${COLORS.charcoal}20`,
                borderRadius: '8px'
              }}
              disabled={isChecking}
            />
          </div>

          {result === "idle" && (
            <Button
              type="submit"
              disabled={isChecking || !email.trim()}
              className="w-full h-12"
              style={{ 
                backgroundColor: COLORS.clay,
                color: COLORS.charcoal,
                borderRadius: '8px'
              }}
            >
              {isChecking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                "Check my booking"
              )}
            </Button>
          )}
        </form>

        {/* Result States */}
        {result === "eligible" && foundData && (
          <div 
            className="mt-4 p-4 rounded-lg border"
            style={{ 
              backgroundColor: `${COLORS.forest}10`,
              borderColor: `${COLORS.forest}30`
            }}
          >
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.forest }} />
              <div className="flex-1">
                <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '15px', marginBottom: '4px' }}>
                  You're eligible for lodging!
                </p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', marginBottom: '12px' }}>
                  Found: {foundData.name} — {foundData.ticketType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} ({foundData.quantity} {foundData.quantity > 1 ? "tickets" : "ticket"})
                </p>
                <Button
                  onClick={handleContinue}
                  className="w-full h-10"
                  style={{ 
                    backgroundColor: COLORS.forest,
                    color: COLORS.white,
                    borderRadius: '8px'
                  }}
                >
                  Continue to Select Lodging
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {result === "not_found" && (
          <div 
            className="mt-4 p-4 rounded-lg border"
            style={{ 
              backgroundColor: `${COLORS.clay}10`,
              borderColor: `${COLORS.clay}30`
            }}
          >
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.clay }} />
              <div>
                <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '15px', marginBottom: '4px' }}>
                  No tickets found
                </p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  We couldn't find any paid tickets with this email. Try a different email or get tickets below.
                </p>
              </div>
            </div>
          </div>
        )}

        {result === "not_eligible" && (
          <div 
            className="mt-4 p-4 rounded-lg border"
            style={{ 
              backgroundColor: `${COLORS.mustard}10`,
              borderColor: `${COLORS.mustard}30`
            }}
          >
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.mustard }} />
              <div>
                <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '15px', marginBottom: '4px' }}>
                  Ticket not eligible
                </p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  Lodging is only available for VIP and Crew 3-day ticket holders. Your ticket type doesn't include lodging access.
                </p>
              </div>
            </div>
          </div>
        )}

        {result === "already_booked" && (
          <div 
            className="mt-4 p-4 rounded-lg border"
            style={{ 
              backgroundColor: `${COLORS.forest}10`,
              borderColor: `${COLORS.forest}30`
            }}
          >
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.forest }} />
              <div>
                <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '15px', marginBottom: '4px' }}>
                  You already have lodging!
                </p>
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  Looks like you&apos;ve already booked lodging for this event. Use Manage booking to review your order or contact us if you need help.
                </p>
                <Link to="/my-tickets" className="inline-flex items-center gap-2 mt-3" style={{ ...typography.button, color: COLORS.charcoal }}>
                  Manage booking
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alternative: New Purchase */}
      <div 
        className="p-6 rounded-xl border"
        style={{ 
          backgroundColor: COLORS.white,
          borderColor: `${COLORS.charcoal}15`
        }}
      >
        <h2 
          className="mb-3"
          style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px' }}
        >
          Don't have tickets yet?
        </h2>
        <p 
          className="mb-4"
          style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}
        >
          Get VIP or Crew 3-day tickets and add lodging during checkout.
        </p>
        <Button
          asChild
          variant="outline"
          className="w-full h-12"
          style={{ 
            borderColor: COLORS.charcoal,
            color: COLORS.charcoal,
            borderRadius: '8px'
          }}
        >
          <Link to="/tickets">
            Get Tickets
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </div>

      {/* Contact Support */}
      <div className="text-center mt-8">
        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
          Need help or have questions?{" "}
          <Link to="/contact" className="underline hover:opacity-80" style={{ color: COLORS.clay }}>
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LodgingEmailLookup;