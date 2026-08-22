import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeCheckout, showCheckoutErrorToast } from "@/lib/checkoutInvoke";
import { 
  Check, Volume2, VolumeX, Volume1, Users, Home, 
  Loader2, XCircle, Mail, ShieldCheck, ArrowLeft 
} from "lucide-react";
import analogLogo from "@/assets/analog-logo-cream.webp";
import { format, formatDistanceToNow } from "date-fns";
import { useCheckoutErrorReporting } from "@/hooks/useCheckoutErrorReporting";
import { redirectToExternal } from "@/lib/safeRedirect";

interface AccommodationZone {
  id: string;
  zone_key: string;
  zone_name: string;
  description: string;
  sound_level: string;
  sleeps_min: number;
  sleeps_max: number;
  inventory_available: number;
  inventory_total: number;
  night_price: number;
  is_publicly_available: boolean;
}

interface ExistingTicket {
  id: string;
  ticket_type: string;
  quantity: number;
  email: string;
  name: string;
}

interface OfferData {
  id: string;
  offer_type: string;
  recipient_email: string;
  recipient_name: string | null;
  custom_message: string | null;
  discount_type: string;
  discount_value: number;
  expires_at: string;
  event: {
    id: string;
    title: string;
    event_date: string;
    venue_name: string;
  };
}

interface LodgingPreferences {
  travelingWithKids: boolean;
  sensitiveToSound: boolean;
  bookingWithFriends: string;
}

const getSoundIcon = (level: string) => {
  switch (level) {
    case "High": return <Volume2 className="w-4 h-4" />;
    case "Moderate": return <Volume1 className="w-4 h-4" />;
    case "Low": return <VolumeX className="w-4 h-4" />;
    default: return <Volume1 className="w-4 h-4" />;
  }
};

const getSoundLabel = (level: string) => {
  switch (level) {
    case "High": return "High energy • Late-night sound";
    case "Moderate": return "Balanced energy";
    case "Low": return "Relaxed vibe";
    default: return level;
  }
};

const formatTicketType = (type: string) => {
  return type
    .replace(/tier_1_/i, "")
    .replace(/early_bird_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
};

export default function LodgingOffer() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const { reportError } = useCheckoutErrorReporting();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  
  // Email verification state
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  
  // Offer data
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [existingTicket, setExistingTicket] = useState<ExistingTicket | null>(null);
  const [zones, setZones] = useState<AccommodationZone[]>([]);
  const [maxLodgingQty, setMaxLodgingQty] = useState(0);
  
  // Selection state
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [lodgingQty, setLodgingQty] = useState(1);
  const [name, setName] = useState("");
  const [preferences, setPreferences] = useState<LodgingPreferences>({
    travelingWithKids: false,
    sensitiveToSound: false,
    bookingWithFriends: "",
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initial validation without email
  useEffect(() => {
    if (!code) {
      setError("No offer code provided");
      setErrorCode("NO_CODE");
      setLoading(false);
      return;
    }
    
    validateOffer();
  }, [code]);

  const validateOffer = async (verifyEmail?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase.functions.invoke("validate-lodging-offer", {
        body: { code, email: verifyEmail },
      });

      if (fetchError) throw fetchError;
      
      if (!data.valid) {
        setError(data.error);
        setErrorCode(data.error_code);
        setLoading(false);
        return;
      }

      // Check that this is a lodging_only offer
      if (data.offer.offer_type !== "lodging_only") {
        setError("This offer is not valid for lodging-only purchases");
        setErrorCode("WRONG_OFFER_TYPE");
        setLoading(false);
        return;
      }

      setOffer(data.offer);
      setZones(data.zones || []);
      
      if (data.existing_ticket) {
        setExistingTicket(data.existing_ticket);
        setMaxLodgingQty(data.max_lodging_qty);
        setName(data.existing_ticket.name);
        setVerified(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load offer");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    
    setVerifying(true);
    
    try {
      await validateOffer(email.trim());
    } finally {
      setVerifying(false);
    }
  };

  const selectedZoneData = zones.find(z => z.zone_key === selectedZone);
  // night_price is per-unit per-night in cents; festival is 2 nights (matches PackageOfferAccommodations)
  const lodgingTotal = selectedZoneData ? ((selectedZoneData.night_price * 2) / 100) * lodgingQty : 0;

  // Calculate discount
  let discountAmount = 0;
  if (offer && selectedZoneData) {
    const subtotalCents = selectedZoneData.night_price * 2 * lodgingQty;
    if (offer.discount_type === "percentage" && offer.discount_value > 0) {
      discountAmount = Math.round(subtotalCents * (offer.discount_value / 100)) / 100;
    } else if (offer.discount_type === "fixed" && offer.discount_value > 0) {
      discountAmount = Math.min(offer.discount_value, subtotalCents) / 100;
    }
  }
  
  const orderTotal = lodgingTotal - discountAmount;

  const handleCheckout = async () => {
    if (!selectedZone || !selectedZoneData || !existingTicket) {
      toast.error("Please select an accommodation zone");
      return;
    }
    
    if (selectedZoneData.inventory_available < lodgingQty) {
      toast.error(`Only ${selectedZoneData.inventory_available} units available`);
      return;
    }
    
    setIsSubmitting(true);

    const { data, error } = await invokeCheckout<{ url?: string; error?: string }>("create-lodging-offer-checkout", {
      offerCode: code,
      email: existingTicket.email,
      name: name || existingTicket.name,
      lodgingZoneKey: selectedZone,
      lodgingQuantity: lodgingQty,
      preferences,
    });

    if (error) {
      console.error("Lodging offer checkout error:", error.rawMessage);
      reportError({
        error_type: 'lodging_offer',
        error_message: error.rawMessage,
        ticket_type: selectedZone || undefined,
        user_email: existingTicket?.email,
      });
      showCheckoutErrorToast(error, () => void handleCheckout());
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
          
          {errorCode === "NO_ELIGIBLE_TICKET" && (
            <div className="bg-preview-accent/10 border border-preview-accent/30 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-preview-text mb-2">
                <strong>Don't have a ticket yet?</strong>
              </p>
              <p className="text-sm text-preview-muted">
                This offer is for existing VIP or Crew ticket holders. Purchase your ticket first, then use this offer to add lodging.
              </p>
            </div>
          )}
          
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

  // Email verification step
  if (offer && !verified) {
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
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <div className="h-16 w-16 mx-auto mb-4 bg-preview-accent/10 rounded-full flex items-center justify-center">
                <Mail className="h-8 w-8 text-preview-accent" />
              </div>
              <h1 className="font-display text-2xl text-preview-text mb-2">
                Verify Your Email
              </h1>
              <p className="text-preview-muted">
                Enter the email address associated with your VIP or Crew ticket to access this lodging offer.
              </p>
            </div>

            {offer.custom_message && (
              <div className="bg-preview-accent/5 border border-preview-accent/20 rounded-xl p-4 mb-6 text-center">
                <p className="text-preview-text italic">"{offer.custom_message}"</p>
              </div>
            )}

            <form onSubmit={handleVerifyEmail} className="bg-preview-surface border border-preview-border rounded-xl p-6">
              <div className="mb-4">
                <Label htmlFor="email" className="text-preview-muted">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 bg-preview-bg border-preview-border text-preview-text"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={verifying}
                className="w-full bg-preview-accent hover:bg-preview-accent/90 text-white"
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>

              <p className="text-xs text-preview-muted text-center mt-4">
                Expires {formatDistanceToNow(new Date(offer.expires_at), { addSuffix: true })}
              </p>
            </form>
          </div>
        </main>
      </div>
    );
  }
  // Main lodging selection UI
  return (
    <div className="min-h-screen bg-preview-bg text-preview-text">
      <header className="fixed top-0 left-0 right-0 z-50 bg-preview-bg/90 backdrop-blur-sm border-b border-preview-border/20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={analogLogo} alt="Analog" className="h-8 opacity-80" />
          </Link>
          <div className="text-sm text-preview-muted">
            Invite-Only Lodging
          </div>
        </div>
      </header>

      <main className="pt-24 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-10">
            <p className="font-sans text-sm uppercase tracking-[0.3em] text-preview-accent mb-4">
              Exclusive Lodging Offer
            </p>
            <h1 className="font-display text-3xl md:text-4xl text-preview-text mb-4">
              Choose Your Zone
            </h1>
            {offer?.custom_message && (
              <p className="font-sans text-preview-muted max-w-lg mx-auto italic">
                "{offer.custom_message}"
              </p>
            )}
          </div>

          {/* Verified ticket badge */}
          {existingTicket && (
            <div className="max-w-2xl mx-auto mb-8">
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-4">
                <div className="h-10 w-10 bg-green-500/20 rounded-full flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-preview-text font-medium">Ticket Verified</p>
                  <p className="text-sm text-preview-muted">
                    {formatTicketType(existingTicket.ticket_type)} • {existingTicket.quantity} tickets
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left: Zone Selection */}
            <div className="lg:col-span-2 space-y-6">
              {zones.length === 0 ? (
                <div className="text-center py-12 text-preview-muted bg-preview-surface border border-preview-border rounded-xl">
                  <Home className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No accommodations currently available.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4">
                    {zones.map((zone) => {
                      const isSoldOut = zone.inventory_available <= 0;
                      return (
                      <button
                        key={zone.zone_key}
                        onClick={() => !isSoldOut && setSelectedZone(zone.zone_key)}
                        disabled={isSoldOut}
                        className={`w-full text-left p-6 rounded-xl border-2 transition-all duration-300 ${
                          isSoldOut
                            ? "border-preview-border bg-preview-surface/40 opacity-60 cursor-not-allowed"
                            : selectedZone === zone.zone_key
                            ? "border-preview-accent bg-preview-accent/10 scale-[1.01] shadow-lg shadow-preview-accent/20"
                            : "border-preview-border bg-preview-surface hover:border-preview-accent/50 hover:scale-[1.01]"
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-display text-xl text-preview-text">{zone.zone_name}</h3>
                              {selectedZone === zone.zone_key && !isSoldOut && (
                                <div className="p-1 rounded-full bg-preview-accent text-white">
                                  <Check className="w-4 h-4" />
                                </div>
                              )}
                              {isSoldOut && (
                                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-preview-border/40 text-preview-muted">
                                  Sold out
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-preview-muted mb-3">{zone.description}</p>
                            <div className="flex flex-wrap items-center gap-4 text-xs">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${
                                zone.sound_level === "Low" 
                                  ? "bg-green-500/10 text-green-400"
                                  : zone.sound_level === "High"
                                  ? "bg-orange-500/10 text-orange-400"
                                  : "bg-blue-500/10 text-blue-400"
                              }`}>
                                {getSoundIcon(zone.sound_level)}
                                {getSoundLabel(zone.sound_level)}
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-preview-muted">
                                <Users className="w-3.5 h-3.5" />
                                Sleeps {zone.sleeps_min}–{zone.sleeps_max}
                              </span>
                              <span className="text-preview-muted">
                                {isSoldOut ? "0 available" : `${zone.inventory_available} available`}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-2xl text-preview-text">
                              ${((zone.night_price * 2) / 100).toLocaleString()}
                            </p>
                            <p className="text-xs text-preview-muted">per unit / 2 nights</p>
                          </div>
                        </div>
                      </button>
                      );
                    })}
                  </div>

                  {/* Lodging Quantity */}
                  {selectedZone && maxLodgingQty > 1 && (
                    <div className="p-6 bg-preview-surface border border-preview-border rounded-xl">
                      <Label className="text-preview-muted mb-2 block">Number of Accommodations</Label>
                      <select
                        value={lodgingQty}
                        onChange={(e) => setLodgingQty(Number(e.target.value))}
                        className="w-full h-10 px-3 rounded-md bg-preview-bg border border-preview-border text-preview-text"
                      >
                        {Array.from({ length: maxLodgingQty }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{n} {n === 1 ? "accommodation" : "accommodations"}</option>
                        ))}
                      </select>
                      <p className="text-xs text-preview-muted mt-2">
                        Based on your {existingTicket?.quantity} tickets, you can book up to {maxLodgingQty} accommodations
                      </p>
                    </div>
                  )}

                  {/* Preferences */}
                  {selectedZone && (
                    <div className="p-6 bg-preview-surface border border-preview-border rounded-xl space-y-4">
                      <h3 className="font-display text-lg text-preview-text mb-4">Preferences</h3>
                      
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="kids"
                          checked={preferences.travelingWithKids}
                          onCheckedChange={(checked) => 
                            setPreferences(prev => ({ ...prev, travelingWithKids: checked === true }))
                          }
                          className="mt-0.5 border-preview-border data-[state=checked]:bg-preview-accent data-[state=checked]:border-preview-accent"
                        />
                        <label htmlFor="kids" className="text-sm text-preview-text cursor-pointer">
                          Traveling with kids
                        </label>
                      </div>

                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="sound"
                          checked={preferences.sensitiveToSound}
                          onCheckedChange={(checked) => 
                            setPreferences(prev => ({ ...prev, sensitiveToSound: checked === true }))
                          }
                          className="mt-0.5 border-preview-border data-[state=checked]:bg-preview-accent data-[state=checked]:border-preview-accent"
                        />
                        <label htmlFor="sound" className="text-sm text-preview-text cursor-pointer">
                          Sensitive to nighttime sound
                        </label>
                      </div>

                      <div>
                        <Label htmlFor="friends" className="text-preview-muted text-sm">
                          Booking with friends? (optional)
                        </Label>
                        <Textarea
                          id="friends"
                          value={preferences.bookingWithFriends}
                          onChange={(e) => 
                            setPreferences(prev => ({ ...prev, bookingWithFriends: e.target.value }))
                          }
                          className="mt-1 bg-preview-bg border-preview-border text-preview-text min-h-[80px]"
                          placeholder="Let us know if you'd like to be near friends' tents"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right: Sticky Cart Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-28">
                <div className="bg-preview-surface border border-preview-border rounded-xl p-6">
                  <h3 className="font-display text-lg text-preview-text mb-4">Order Summary</h3>
                  
                  {/* Ticket - Verified */}
                  <div className="space-y-3 pb-4 border-b border-preview-border/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-preview-text flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-500" />
                          Ticket Verified
                        </p>
                        <p className="text-xs text-preview-muted">
                          {existingTicket ? formatTicketType(existingTicket.ticket_type) : "—"}
                        </p>
                      </div>
                      <p className="text-sm text-green-500">✓</p>
                    </div>
                  </div>

                  {/* Lodging */}
                  {selectedZoneData && (
                    <div className="space-y-3 py-4 border-b border-preview-border/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-preview-text">{selectedZoneData.zone_name}</p>
                          <p className="text-xs text-preview-muted">
                            {lodgingQty}x ${((selectedZoneData.night_price * 2) / 100).toLocaleString()} / 2 nights
                          </p>
                        </div>
                        <p className="text-sm text-preview-text">${lodgingTotal.toLocaleString()}</p>
                      </div>
                    </div>
                  )}

                  {/* Discount */}
                  {discountAmount > 0 && (
                    <div className="space-y-3 py-4 border-b border-preview-border/50">
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-green-500">
                          Discount {offer?.discount_type === "percentage" ? `(${offer.discount_value}%)` : ""}
                        </p>
                        <p className="text-sm text-green-500">-${discountAmount.toFixed(0)}</p>
                      </div>
                    </div>
                  )}

                  {/* Total */}
                  <div className="pt-4">
                    <div className="flex justify-between items-center">
                      <p className="text-preview-muted font-medium">Total</p>
                      <p className="font-display text-2xl text-preview-text">
                        ${Math.max(0, orderTotal).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Continue Button */}
                  {zones.length > 0 && (
                    <Button
                      onClick={handleCheckout}
                      disabled={isSubmitting || !selectedZone}
                      className="w-full mt-6 h-12 bg-preview-accent hover:bg-preview-accent/90 text-white font-sans text-lg disabled:opacity-50"
                    >
                      {isSubmitting ? "Processing..." : "Continue to Payment"}
                    </Button>
                  )}

                  <p className="text-xs text-preview-muted text-center mt-4">
                    Secure checkout powered by Stripe
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
