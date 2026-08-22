import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeCheckout, showCheckoutErrorToast } from "@/lib/checkoutInvoke";
import { Check, Star, Crown, Loader2, XCircle, Calendar, MapPin } from "lucide-react";
import analogLogo from "@/assets/analog-logo-cream.webp";
import { format, formatDistanceToNow } from "date-fns";
import { redirectToExternal } from "@/lib/safeRedirect";

type TicketType = "tier_1_krewe_3day" | "tier_1_vip_3day";

interface TicketOption {
  id: TicketType;
  name: string;
  duration: string;
  price: number;
  description: string;
  features: string[];
  icon: React.ReactNode;
  highlight?: boolean;
}

const ticketOptions: TicketOption[] = [
  {
    id: "tier_1_vip_3day",
    name: "VIP",
    duration: "3-Day Pass",
    price: 425,
    description: "The complete Cosmico experience",
    features: [
      "Full 3-day access",
      "VIP lounge access",
      "Premium viewing areas",
      "Exclusive experiences",
    ],
    icon: <Star className="w-6 h-6" />,
    highlight: true,
  },
  {
    id: "tier_1_krewe_3day",
    name: "Crew",
    duration: "3-Day Pass",
    price: 99,
    description: "Join the Analog family",
    features: [
      "Full 3-day access",
      "Crew perks",
      "Sunday intimate show",
      "Community events",
    ],
    icon: <Crown className="w-6 h-6" />,
  },
];

interface OfferData {
  id: string;
  offer_type: string;
  recipient_email: string;
  recipient_name: string | null;
  custom_message: string | null;
  discount_type: string;
  discount_value: number;
  expires_at: string;
  allowed_ticket_types: string[] | null;
  event: {
    id: string;
    title: string;
    event_date: string;
    venue_name: string;
  };
}

const PACKAGE_STORAGE_KEY = "analog_package_offer_data";

export default function PackageOffer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get("code");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<OfferData | null>(null);
  
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [quantity, setQuantity] = useState(2); // Default to 2 for lodging eligibility
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!code) {
      setError("No offer code provided");
      setLoading(false);
      return;
    }
    
    validateOffer();
  }, [code]);

  const validateOffer = async () => {
    try {
      const { data, error: fetchError } = await supabase.functions.invoke("validate-lodging-offer", {
        body: { code },
      });

      if (fetchError) throw fetchError;
      
      if (!data.valid) {
        setError(data.error);
        setLoading(false);
        return;
      }

      // Check that this is a ticket_plus_lodging offer
      if (data.offer.offer_type !== "ticket_plus_lodging") {
        setError("This offer is not valid for package purchases");
        setLoading(false);
        return;
      }

      setOffer(data.offer);
      if (data.offer.recipient_name) setName(data.offer.recipient_name);
      if (data.offer.recipient_email) setEmail(data.offer.recipient_email);
    } catch (err: any) {
      setError(err.message || "Failed to load offer");
    } finally {
      setLoading(false);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = () => {
    if (!selectedTicket || !name || !email) {
      toast.error("Please fill in all fields");
      return false;
    }
    if (quantity < 1) {
      toast.error("Please select at least 1 ticket");
      return false;
    }
    return true;
  };

  const handleContinueToLodging = () => {
    if (!validateForm()) return;

    const selectedOption = ticketOptions.find(t => t.id === selectedTicket);

    // Store data for the accommodations step
    const packageData = {
      offerCode: code,
      ticketType: selectedTicket,
      ticketName: selectedOption?.name + " — " + selectedOption?.duration,
      ticketPrice: selectedOption?.price || 0,
      quantity,
      name,
      email,
      offer,
    };
    
    sessionStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(packageData));
    navigate(`/offer/package/accommodations?code=${code}`);
  };

  const handleSkipToPayment = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);

    const { data, error } = await invokeCheckout<{ url?: string; error?: string }>("create-lodging-offer-checkout", {
      offerCode: code,
      email,
      name,
      ticketType: selectedTicket,
      ticketQuantity: quantity,
      lodgingZoneKey: null,
      lodgingQuantity: 0,
      donationAmount: 0,
      preferences: {},
    });

    if (error) {
      console.error("Checkout error:", error.rawMessage);
      showCheckoutErrorToast(error, () => void handleSkipToPayment());
      setIsSubmitting(false);
      return;
    }

    if (data?.url) {
      redirectToExternal(data.url);
    } else {
      toast.error(data?.error || "Unable to start checkout. Please try again.");
      setIsSubmitting(false);
    }
  };

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-preview-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-preview-surface border border-preview-border rounded-xl p-8 text-center">
          <div className="h-16 w-16 mx-auto mb-6 bg-red-500/10 rounded-full flex items-center justify-center">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="font-display text-2xl text-preview-text mb-2">Offer Not Available</h1>
          <p className="text-preview-muted mb-6">{error}</p>
          <Link to="/tickets">
            <Button className="bg-preview-accent hover:bg-preview-accent/90 text-white">
              Browse Tickets
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-preview-bg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-preview-accent" />
      </div>
    );
  }

  const selectedOption = ticketOptions.find(t => t.id === selectedTicket);
  const ticketTotal = selectedOption ? selectedOption.price * quantity : 0;

  return (
    <div className="min-h-screen bg-preview-bg text-preview-text">
      <header className="fixed top-0 left-0 right-0 z-50 bg-preview-bg/90 backdrop-blur-sm border-b border-preview-border/20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={analogLogo} alt="Analog" className="h-8 opacity-80" />
          </Link>
          <div className="text-sm text-preview-muted">
            Exclusive Package Offer
          </div>
        </div>
      </header>

      <main className="pt-24 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-8">
            <p className="font-sans text-sm uppercase tracking-[0.3em] text-preview-accent mb-4">
              Invitation
            </p>
            <h1 className="font-display text-3xl md:text-4xl text-preview-text mb-4">
              Ticket + Lodging Package
            </h1>
            {offer?.custom_message && (
              <p className="font-sans text-preview-muted max-w-lg mx-auto italic mb-4">
                "{offer.custom_message}"
              </p>
            )}
            
            {/* Event info */}
            {offer?.event && (
              <div className="flex items-center justify-center gap-6 text-sm text-preview-muted">
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(offer.event.event_date), "MMMM d, yyyy")}
                </span>
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {offer.event.venue_name}
                </span>
              </div>
            )}
          </div>

          {/* Expiration warning */}
          {offer && (
            <div className="max-w-md mx-auto mb-8">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg py-2 px-4 text-center">
                <span className="text-sm text-amber-400">
                  Offer expires {formatDistanceToNow(new Date(offer.expires_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          )}

          {/* Discount badge */}
          {offer && offer.discount_value > 0 && (
            <div className="max-w-md mx-auto mb-8">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg py-2 px-4 text-center">
                <span className="text-sm text-green-400">
                  {offer.discount_type === "percentage" 
                    ? `${offer.discount_value}% off your order`
                    : `$${(offer.discount_value / 100).toFixed(0)} off your order`
                  }
                </span>
              </div>
            </div>
          )}

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-4 mb-10">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-preview-accent text-white flex items-center justify-center text-sm font-medium">
                1
              </div>
              <span className="text-sm text-preview-text font-medium">Select Tickets</span>
            </div>
            <div className="h-px w-12 bg-preview-border" />
            <div className="flex items-center gap-2 opacity-50">
              <div className="h-8 w-8 rounded-full bg-preview-surface border border-preview-border text-preview-muted flex items-center justify-center text-sm font-medium">
                2
              </div>
              <span className="text-sm text-preview-muted">Choose Lodging</span>
            </div>
          </div>

          {/* Ticket Selection */}
          <div className="grid md:grid-cols-2 gap-6 mb-10 max-w-3xl mx-auto">
            {ticketOptions.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket.id)}
                className={`group relative text-left p-6 rounded-xl border-2 transition-all duration-300 ${
                  selectedTicket === ticket.id
                    ? "border-preview-accent bg-preview-accent/10 scale-[1.02] shadow-lg shadow-preview-accent/20 cursor-pointer"
                    : ticket.highlight
                    ? "border-preview-accent/50 bg-preview-surface hover:border-preview-accent hover:scale-[1.02] hover:shadow-lg cursor-pointer"
                    : "border-preview-border bg-preview-surface hover:border-preview-accent/50 hover:scale-[1.02] hover:shadow-lg cursor-pointer"
                }`}
              >
                {ticket.highlight && (
                  <span className="absolute -top-3 left-4 px-3 py-1 bg-preview-accent text-white text-xs font-medium rounded-full">
                    Popular
                  </span>
                )}

                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-lg bg-preview-accent/20 text-preview-accent">
                    {ticket.icon}
                  </div>
                  {selectedTicket === ticket.id && (
                    <div className="p-1 rounded-full bg-preview-accent text-white">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <h3 className="font-display text-2xl text-preview-text mb-1">{ticket.name}</h3>
                <p className="text-sm font-medium text-preview-accent mb-2">{ticket.duration}</p>
                <p className="text-sm text-preview-muted mb-4">{ticket.description}</p>

                <div className="mb-6">
                  <span className="font-display text-3xl text-preview-text">${ticket.price}</span>
                </div>

                <ul className="space-y-2">
                  {ticket.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-preview-muted">
                      <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-preview-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          {/* Checkout Form */}
          {selectedTicket && (
            <div className="max-w-md mx-auto">
              <div className="bg-preview-surface border border-preview-border rounded-xl p-8">
                <h2 className="font-display text-xl text-preview-text mb-6 text-center">
                  Your Details
                </h2>

                <div className="space-y-5">
                  <div className="p-4 bg-preview-bg rounded-lg border border-preview-border/50">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-preview-text">
                          {selectedOption?.name} — {selectedOption?.duration}
                        </p>
                        <p className="text-sm text-preview-muted">Ticket + Lodging Package</p>
                      </div>
                      <p className="font-display text-xl text-preview-text">
                        ${selectedOption?.price}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="name" className="text-preview-muted">Full Name</Label>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="mt-1 bg-preview-bg border-preview-border text-preview-text"
                      placeholder="Your name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-preview-muted">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="mt-1 bg-preview-bg border-preview-border text-preview-text"
                      placeholder="you@example.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="quantity" className="text-preview-muted">Number of Tickets</Label>
                    <select
                      id="quantity"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full mt-1 h-10 px-3 rounded-md bg-preview-bg border border-preview-border text-preview-text"
                    >
                      {[1, 2, 3, 4, 6, 8].map((n) => (
                        <option key={n} value={n}>{n} {n === 1 ? 'ticket' : 'tickets'}</option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-4 border-t border-preview-border">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-preview-muted">Tickets ({quantity}x ${selectedOption?.price})</span>
                      <span className="font-display text-xl text-preview-text">
                        ${ticketTotal}
                      </span>
                    </div>
                    <p className="text-xs text-preview-muted text-center mb-4">
                      Add on-site lodging or skip to checkout
                    </p>

                    <div className="space-y-3">
                      <Button
                        onClick={handleContinueToLodging}
                        disabled={isSubmitting}
                        className="w-full h-12 bg-preview-accent hover:bg-preview-accent/90 text-white font-sans text-lg"
                      >
                        Continue to Accommodations
                      </Button>
                      
                      <Button
                        onClick={handleSkipToPayment}
                        disabled={isSubmitting}
                        variant="outline"
                        className="w-full h-11 border-preview-border text-preview-text hover:bg-preview-surface font-sans"
                      >
                        {isSubmitting ? "Processing..." : "Skip & Continue to Payment"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
