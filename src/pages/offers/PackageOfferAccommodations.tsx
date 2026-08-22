import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeCheckout, showCheckoutErrorToast } from "@/lib/checkoutInvoke";
import { Check, Volume2, VolumeX, Volume1, Users, Home, Loader2, XCircle, ArrowLeft } from "lucide-react";
import analogLogo from "@/assets/analog-logo-cream.webp";
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
}

interface PackageData {
  offerCode: string;
  ticketType: string;
  ticketName: string;
  ticketPrice: number;
  quantity: number;
  name: string;
  email: string;
  offer: {
    discount_type: string;
    discount_value: number;
  };
}

interface LodgingPreferences {
  travelingWithKids: boolean;
  sensitiveToSound: boolean;
  bookingWithFriends: string;
}

const PACKAGE_STORAGE_KEY = "analog_package_offer_data";

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

export default function PackageOfferAccommodations() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get("code");
  const { reportError } = useCheckoutErrorReporting();
  
  const [loading, setLoading] = useState(true);
  const [packageData, setPackageData] = useState<PackageData | null>(null);
  const [zones, setZones] = useState<AccommodationZone[]>([]);
  
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [lodgingQty, setLodgingQty] = useState(1);
  const [donation, setDonation] = useState<number | "">(0);
  const [preferences, setPreferences] = useState<LodgingPreferences>({
    travelingWithKids: false,
    sensitiveToSound: false,
    bookingWithFriends: "",
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Load package data from session storage
    const stored = sessionStorage.getItem(PACKAGE_STORAGE_KEY);
    if (!stored) {
      toast.error("Please start from the beginning");
      navigate(`/offer/package?code=${code}`);
      return;
    }
    
    try {
      const data = JSON.parse(stored) as PackageData;
      if (data.offerCode !== code) {
        throw new Error("Mismatched offer code");
      }
      setPackageData(data);
    } catch {
      toast.error("Invalid session data");
      navigate(`/offer/package?code=${code}`);
      return;
    }

    // Fetch zones
    fetchZones();
  }, [code, navigate]);

  const fetchZones = async () => {
    try {
      const { data, error } = await supabase
        .from("accommodation_zones")
        .select("*")
        .eq("is_publicly_available", true)
        .gt("inventory_available", 0)
        .order("night_price", { ascending: true });
      
      if (error) throw error;
      setZones(data || []);
    } catch (err) {
      console.error("Error fetching zones:", err);
      toast.error("Unable to load accommodations");
    } finally {
      setLoading(false);
    }
  };

  if (!packageData || loading) {
    return (
      <div className="min-h-screen bg-preview-bg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-preview-accent" />
      </div>
    );
  }

  const maxLodgingQty = Math.floor(packageData.quantity / 2);
  const selectedZoneData = zones.find(z => z.zone_key === selectedZone);

  const ticketTotal = packageData.ticketPrice * packageData.quantity;
  const lodgingTotal = selectedZoneData ? (selectedZoneData.night_price * 2 / 100) * lodgingQty : 0;
  const donationTotal = donation ? Number(donation) : 0;
  const subtotal = ticketTotal + lodgingTotal;

  // Calculate discount
  let discountAmount = 0;
  if (packageData.offer && selectedZoneData) {
    const subtotalCents = (packageData.ticketPrice * 100 * packageData.quantity) + (selectedZoneData.night_price * 2 * lodgingQty);
    if (packageData.offer.discount_type === "percentage" && packageData.offer.discount_value > 0) {
      discountAmount = Math.round(subtotalCents * (packageData.offer.discount_value / 100)) / 100;
    } else if (packageData.offer.discount_type === "fixed" && packageData.offer.discount_value > 0) {
      discountAmount = Math.min(packageData.offer.discount_value, subtotalCents) / 100;
    }
  }

  const orderTotal = subtotal - discountAmount + donationTotal;

  const handleCheckout = async () => {
    if (!selectedZone || !selectedZoneData) {
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
      email: packageData.email,
      name: packageData.name,
      ticketType: packageData.ticketType,
      ticketQuantity: packageData.quantity,
      lodgingZoneKey: selectedZone,
      lodgingQuantity: lodgingQty,
      donationAmount: donationTotal * 100,
      preferences,
    });

    if (error) {
      console.error("Checkout error:", error.rawMessage);
      reportError({
        error_type: 'lodging_offer',
        error_message: error.rawMessage,
        ticket_type: selectedZone || undefined,
        user_email: packageData?.email,
      });
      showCheckoutErrorToast(error, () => void handleCheckout());
      setIsSubmitting(false);
      return;
    }

    if (data?.url) {
      sessionStorage.removeItem(PACKAGE_STORAGE_KEY);
      redirectToExternal(data.url);
    } else {
      toast.error(data?.error || "Unable to start checkout. Please try again.");
      setIsSubmitting(false);
    }
  };

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
        <div className="max-w-6xl mx-auto">
          {/* Back Link */}
          <Link 
            to={`/offer/package?code=${code}`}
            className="inline-flex items-center gap-2 text-sm text-preview-muted hover:text-preview-accent mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tickets
          </Link>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-4 mb-10">
            <div className="flex items-center gap-2 opacity-50">
              <div className="h-8 w-8 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center">
                <Check className="w-4 h-4" />
              </div>
              <span className="text-sm text-preview-muted">Select Tickets</span>
            </div>
            <div className="h-px w-12 bg-preview-border" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-preview-accent text-white flex items-center justify-center text-sm font-medium">
                2
              </div>
              <span className="text-sm text-preview-text font-medium">Choose Lodging</span>
            </div>
          </div>

          {/* Hero */}
          <div className="text-center mb-10">
            <p className="font-sans text-sm uppercase tracking-[0.3em] text-preview-accent mb-4">
              Step 2 of 2
            </p>
            <h1 className="font-display text-3xl md:text-4xl text-preview-text mb-4">
              Choose Your Zone
            </h1>
          </div>

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
                    {zones.map((zone) => (
                      <button
                        key={zone.zone_key}
                        onClick={() => setSelectedZone(zone.zone_key)}
                        className={`w-full text-left p-6 rounded-xl border-2 transition-all duration-300 ${
                          selectedZone === zone.zone_key
                            ? "border-preview-accent bg-preview-accent/10 scale-[1.01] shadow-lg shadow-preview-accent/20"
                            : "border-preview-border bg-preview-surface hover:border-preview-accent/50 hover:scale-[1.01]"
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-display text-xl text-preview-text">{zone.zone_name}</h3>
                              {selectedZone === zone.zone_key && (
                                <div className="p-1 rounded-full bg-preview-accent text-white">
                                  <Check className="w-4 h-4" />
                                </div>
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
                              <span className="text-preview-muted">One queen bed</span>
                              <span className="text-preview-muted">{zone.inventory_available} available</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-2xl text-preview-text">
                              ${(zone.night_price / 100).toLocaleString()}
                            </p>
                            <p className="text-xs text-preview-muted">per night</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  {/* Family-style note */}
                  <p className="text-xs text-preview-muted italic">
                    Looking for additional bedding options? <a href="/may/stay" className="text-preview-accent hover:underline">Family-style accommodations</a> are available with varied bed configurations.
                  </p>

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
                        Based on {packageData.quantity} tickets, you can book up to {maxLodgingQty} accommodations
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
                  
                  {/* Tickets */}
                  <div className="space-y-3 pb-4 border-b border-preview-border/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-preview-text">{packageData.ticketName}</p>
                        <p className="text-xs text-preview-muted">{packageData.quantity}x ${packageData.ticketPrice}</p>
                      </div>
                      <p className="text-sm text-preview-text">${ticketTotal.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Lodging */}
                  {selectedZoneData && (
                    <div className="space-y-3 py-4 border-b border-preview-border/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-preview-text">{selectedZoneData.zone_name}</p>
                          <p className="text-xs text-preview-muted">
                            {lodgingQty}x ${(selectedZoneData.night_price / 100).toLocaleString()}/night × 2 nights
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
                          Discount {packageData.offer?.discount_type === "percentage" ? `(${packageData.offer.discount_value}%)` : ""}
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
