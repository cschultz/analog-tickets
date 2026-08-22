import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Check, Volume2, VolumeX, Volume1, Users, 
  Loader2, XCircle, Mail, ShieldCheck, ArrowRight,
  Home, Tent, TreePine, ChevronLeft, ChevronRight
} from "lucide-react";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { motion, AnimatePresence } from "framer-motion";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import { useLodgingVisualAssets, getAssetsByProductType } from "@/hooks/useLodgingVisualAssets";
import { useCheckoutErrorReporting } from "@/hooks/useCheckoutErrorReporting";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";
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

const getZoneIcon = (zoneKey: string) => {
  if (zoneKey.includes("cabin")) return <Home className="w-5 h-5" />;
  if (zoneKey.includes("premium")) return <Tent className="w-5 h-5" />;
  return <TreePine className="w-5 h-5" />;
};

const getZoneProductType = (zoneKey: string): "tent" | "cabin" => {
  if (zoneKey.includes("cabin")) return "cabin";
  return "tent";
};

// Image carousel for zone cards
function ZoneImageCarousel({ images }: { images: { image_url: string; alt_text: string | null }[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  if (!images || images.length === 0) return null;
  
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };
  
  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };
  
  return (
    <div className="relative w-full h-40 overflow-hidden mb-4">
      <AnimatePresence mode="wait">
        <motion.img
          key={currentIndex}
          src={images[currentIndex].image_url}
          alt={images[currentIndex].alt_text || "Accommodation"}
          className="w-full h-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      </AnimatePresence>
      
      {images.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          
          {/* Dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentIndex ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Lodging() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_lodging",
      item_name: "Cosmico – Lodging Checkout",
      item_category: "Lodging",
      price: 215,
    });
  }, []);
  const canceled = searchParams.get("canceled");
  const { reportError } = useCheckoutErrorReporting();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Email verification state
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [existingTicket, setExistingTicket] = useState<ExistingTicket | null>(null);
  
  // Lodging selection state
  const [zones, setZones] = useState<AccommodationZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [lodgingQuantity, setLodgingQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  
  // Preferences
  const [preferences, setPreferences] = useState<LodgingPreferences>({
    travelingWithKids: false,
    sensitiveToSound: false,
    bookingWithFriends: "",
  });
  
  // Visual assets
  const { data: visualAssets } = useLodgingVisualAssets();
  const assetsByType = getAssetsByProductType(visualAssets);
  // Check if lodging is enabled
  useEffect(() => {
    const checkSettings = async () => {
      try {
        const { data } = await supabase
          .from("lodging_settings")
          .select("lodging_invite_enabled")
          .limit(1)
          .single();
        
        if (!data?.lodging_invite_enabled) {
          setError("Lodging is not currently available");
        }
        setLoading(false);
      } catch (err) {
        console.error("Error checking lodging settings:", err);
        setError("Unable to load lodging options");
        setLoading(false);
      }
    };
    
    checkSettings();
  }, []);

  // Fetch available zones
  useEffect(() => {
    const fetchZones = async () => {
      const { data, error } = await supabase
        .from("accommodation_zones")
        .select("*")
        .eq("is_publicly_available", true)
        .gt("inventory_available", 0)
        .order("night_price");
      
      if (error) {
        console.error("Error fetching zones:", error);
        return;
      }
      
      setZones(data || []);
    };
    
    fetchZones();
  }, []);

  // Show canceled toast
  useEffect(() => {
    if (canceled) {
      toast.error("Checkout was canceled. Your selection has been saved.");
    }
  }, [canceled]);

  const handleEmailVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setVerifying(true);
    
    try {
      // Check for existing VIP/Crew ticket
      const { data: registration, error: regError } = await supabase
        .from("registrations")
        .select("id, ticket_type, quantity, email, name")
        .eq("email", email.toLowerCase())
        .eq("payment_status", "paid")
        .in("ticket_type", ["tier_1_krewe_3day", "tier_1_vip_3day", "krewe_3day", "vip_3day"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (regError) {
        toast.error("Unable to verify your email. Please try again.");
        setVerifying(false);
        return;
      }
      
      if (!registration) {
        toast.error("No VIP or Crew ticket found for this email. Lodging is only available for VIP and Crew ticket holders.");
        setVerifying(false);
        return;
      }
      
      // Check if they already have lodging
      const { data: existingLodging } = await supabase
        .from("lodging_bookings")
        .select("id")
        .eq("registration_id", registration.id)
        .eq("payment_status", "paid")
        .maybeSingle();
      
      if (existingLodging) {
        toast.error("You already have lodging booked for this event.");
        setVerifying(false);
        return;
      }
      
      setExistingTicket(registration);
      setVerified(true);
      toast.success(`Welcome back, ${registration.name.split(" ")[0]}!`);
    } catch (err) {
      console.error("Verification error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedZone || !existingTicket) return;
    
    setSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("create-self-service-lodging", {
        body: {
          email: existingTicket.email,
          lodgingZoneKey: selectedZone,
          lodgingQuantity,
          preferences: preferences.travelingWithKids || preferences.sensitiveToSound || preferences.bookingWithFriends
            ? preferences
            : null,
        },
      });
      
      if (error) throw error;
      
      if (data?.error) {
        toast.error(data.message || data.error);
        setSubmitting(false);
        return;
      }
      
      if (data?.url) {
        redirectToExternal(data.url);
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      reportError({
        error_type: 'lodging',
        error_message: err.message || 'Lodging checkout failed',
        ticket_type: selectedZone || undefined,
        user_email: existingTicket?.email,
      });
      toast.error(err.message || "Unable to start checkout. Please try again.");
      setSubmitting(false);
    }
  };

  const selectedZoneData = zones.find(z => z.zone_key === selectedZone);
  const maxLodging = existingTicket ? Math.max(1, Math.floor(existingTicket.quantity / 2)) : 1;

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

  if (error) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <div className="text-center max-w-md">
          <XCircle className="w-16 h-16 mx-auto mb-4" style={{ color: COLORS.clay }} />
          <h1 
            className="text-2xl mb-2"
            style={{ ...typography.headline, color: COLORS.charcoal }}
          >
            Lodging Unavailable
          </h1>
          <p style={{ ...typography.body, color: COLORS.charcoal }}>
            {error}
          </p>
        </div>
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
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <img src={analogLogo} alt="Analog" className="h-8" />
          {verified && existingTicket && (
            <div className="flex items-center gap-2 text-sm" style={{ color: COLORS.forest }}>
              <ShieldCheck className="w-4 h-4" />
              <span style={typography.body}>Verified: {existingTicket.email}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {!verified ? (
          /* Email Verification Step */
          <motion.div 
            className="max-w-md mx-auto text-center"
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
          >
            <Mail className="w-12 h-12 mx-auto mb-6" style={{ color: COLORS.denim }} />
            <h1 
              className="text-3xl md:text-4xl mb-4"
              style={{ ...typography.headline, color: COLORS.charcoal }}
            >
              Book Your Lodging
            </h1>
            <p 
              className="mb-8"
              style={{ ...typography.body, color: COLORS.charcoal }}
            >
              Enter the email address associated with your VIP or Crew ticket to access lodging options.
            </p>
            
            <form onSubmit={handleEmailVerify} className="space-y-4">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                name="email"
                className="h-12 text-center text-lg"
                style={{ 
                  backgroundColor: COLORS.white,
                  borderColor: COLORS.boulder,
                  borderRadius: 0,
                }}
                disabled={verifying}
              />
              <Button
                type="submit"
                className="w-full h-12"
                style={{ 
                  ...typography.button,
                  backgroundColor: COLORS.clay,
                  color: COLORS.white,
                  borderRadius: 0,
                }}
                disabled={verifying || !email.trim()}
              >
                {verifying ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>Verify Email</>
                )}
              </Button>
            </form>
            
            <p 
              className="mt-6 text-sm"
              style={{ ...typography.body, color: COLORS.boulder }}
            >
              Lodging is available exclusively for VIP and Crew ticket holders.
            </p>
          </motion.div>
        ) : (
          /* Lodging Selection */
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
          >
            <div className="text-center mb-10">
              <h1 
                className="text-3xl md:text-4xl mb-2"
                style={{ ...typography.headline, color: COLORS.charcoal }}
              >
                Choose Your Lodging
              </h1>
              <p style={{ ...typography.body, color: COLORS.charcoal }}>
                Your {formatTicketType(existingTicket!.ticket_type)} ticket ({existingTicket!.quantity} {existingTicket!.quantity > 1 ? "passes" : "pass"}) 
                allows up to {maxLodging} {maxLodging > 1 ? "accommodations" : "accommodation"}.
              </p>
            </div>

            {/* Zone Cards */}
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {zones.map((zone) => {
                const isSelected = selectedZone === zone.zone_key;
                const isSoldOut = zone.inventory_available <= 0;
                const productType = getZoneProductType(zone.zone_key);
                const zoneImages = assetsByType[productType] || [];
                
                return (
                  <button
                    key={zone.zone_key}
                    onClick={() => !isSoldOut && setSelectedZone(zone.zone_key)}
                    disabled={isSoldOut}
                    className={`text-left transition-all border-2 overflow-hidden ${
                      isSoldOut ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:shadow-lg"
                    }`}
                    style={{
                      backgroundColor: isSelected ? COLORS.white : "transparent",
                      borderColor: isSelected ? COLORS.denim : COLORS.boulder,
                      borderRadius: 0,
                    }}
                  >
                    {/* Image Carousel */}
                    <ZoneImageCarousel images={zoneImages} />
                    
                    <div className="p-6 pt-0">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span style={{ color: COLORS.denim }}>{getZoneIcon(zone.zone_key)}</span>
                          <h3 
                            className="text-lg"
                            style={{ ...typography.subhead, color: COLORS.charcoal }}
                          >
                            {zone.zone_name}
                          </h3>
                        </div>
                        {isSelected && (
                          <div 
                            className="w-6 h-6 flex items-center justify-center"
                            style={{ backgroundColor: COLORS.forest }}
                          >
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      
                      <p 
                        className="text-sm mb-4"
                        style={{ ...typography.body, color: COLORS.charcoal }}
                      >
                        {zone.description}
                      </p>
                      
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1" style={{ color: COLORS.boulder }}>
                            {getSoundIcon(zone.sound_level)}
                            {getSoundLabel(zone.sound_level)}
                          </span>
                          <span className="flex items-center gap-1" style={{ color: COLORS.boulder }}>
                            <Users className="w-4 h-4" />
                            Sleeps {zone.sleeps_min}-{zone.sleeps_max}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: COLORS.boulder }}>
                        <span 
                          className="text-xl"
                          style={{ ...typography.subhead, color: COLORS.charcoal }}
                        >
                          ${(zone.night_price / 100).toLocaleString()}/night
                        </span>
                        {isSoldOut ? (
                          <span 
                            className="text-sm px-2 py-1"
                            style={{ backgroundColor: COLORS.boulder, color: COLORS.white }}
                          >
                            Sold Out
                          </span>
                        ) : (
                          <span className="text-sm" style={{ color: COLORS.boulder }}>
                            {zone.inventory_available} available
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quantity selector */}
            {selectedZone && maxLodging > 1 && (
              <div 
                className="p-4 mb-6 border"
                style={{ 
                  backgroundColor: COLORS.white,
                  borderColor: COLORS.boulder,
                  borderRadius: 0,
                }}
              >
                <label 
                  className="block text-sm mb-2"
                  style={{ ...typography.caption, color: COLORS.charcoal }}
                >
                  Number of Accommodations
                </label>
                <select
                  value={lodgingQuantity}
                  onChange={(e) => setLodgingQuantity(Number(e.target.value))}
                  className="w-full h-10 px-3 border"
                  style={{ 
                    borderColor: COLORS.boulder,
                    borderRadius: 0,
                  }}
                >
                  {Array.from({ length: Math.min(maxLodging, selectedZoneData?.inventory_available || 1) }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Preferences */}
            {selectedZone && (
              <div 
                className="p-6 mb-6 border"
                style={{ 
                  backgroundColor: COLORS.white,
                  borderColor: COLORS.boulder,
                  borderRadius: 0,
                }}
              >
                <h3 
                  className="text-lg mb-4"
                  style={{ ...typography.subhead, color: COLORS.charcoal }}
                >
                  Help Us Place You
                </h3>
                <p 
                  className="text-sm mb-4"
                  style={{ ...typography.body, color: COLORS.boulder }}
                >
                  Share any preferences to help us assign the best spot for you.
                </p>
                
                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={preferences.travelingWithKids}
                      onCheckedChange={(checked) => 
                        setPreferences(p => ({ ...p, travelingWithKids: checked as boolean }))
                      }
                    />
                    <span style={{ ...typography.body, color: COLORS.charcoal }}>
                      I'm traveling with kids
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={preferences.sensitiveToSound}
                      onCheckedChange={(checked) => 
                        setPreferences(p => ({ ...p, sensitiveToSound: checked as boolean }))
                      }
                    />
                    <span style={{ ...typography.body, color: COLORS.charcoal }}>
                      I'm sensitive to sound at night
                    </span>
                  </label>
                  
                  <div>
                    <label 
                      className="block text-sm mb-2"
                      style={{ ...typography.body, color: COLORS.charcoal }}
                    >
                      Booking with friends? (optional)
                    </label>
                    <Textarea
                      placeholder="List names of friends you'd like to camp near..."
                      value={preferences.bookingWithFriends}
                      onChange={(e) => 
                        setPreferences(p => ({ ...p, bookingWithFriends: e.target.value }))
                      }
                      className="resize-none"
                      style={{ 
                        borderColor: COLORS.boulder,
                        borderRadius: 0,
                      }}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Checkout */}
            {selectedZone && selectedZoneData && (
              <div 
                className="p-6 border sticky bottom-4"
                style={{ 
                  backgroundColor: COLORS.charcoal,
                  borderRadius: 0,
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p style={{ ...typography.body, color: COLORS.boulder }}>
                      {lodgingQuantity}x {selectedZoneData.zone_name}
                    </p>
                    <p 
                      className="text-2xl"
                      style={{ ...typography.headline, color: COLORS.white }}
                    >
                      ${((selectedZoneData.night_price * 2 * lodgingQuantity) / 100).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    onClick={handleCheckout}
                    disabled={submitting}
                    className="h-12 px-8"
                    style={{ 
                      ...typography.button,
                      backgroundColor: COLORS.clay,
                      color: COLORS.white,
                      borderRadius: 0,
                    }}
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Continue to Payment
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
