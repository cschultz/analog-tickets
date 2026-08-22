import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Check, Volume2, VolumeX, Volume1, Users, 
  Loader2, XCircle, ShieldCheck, ArrowRight,
  Home, Tent, TreePine, AlertCircle
} from "lucide-react";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { motion } from "framer-motion";
import analogLogo from "@/assets/analog-wordmark-black.webp";
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

interface FamilyUnit {
  id: string;
  unit_name: string;
  product_type: string;
  zone_key: string;
  bed_configuration: string;
  sleeps_max: number;
  has_loft: boolean;
  night_price: number;
}

interface InviteData {
  valid: boolean;
  email: string;
  name: string;
  ticketType: string;
  quantity: number;
  registrationId: string;
  tokenId: string;
  error?: string;
  message?: string;
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

export default function AccommodationsInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const canceled = searchParams.get("canceled");
  const { reportError } = useCheckoutErrorReporting();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  
  // Lodging selection state
  const [zones, setZones] = useState<AccommodationZone[]>([]);
  const [familyUnits, setFamilyUnits] = useState<FamilyUnit[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedFamilyUnit, setSelectedFamilyUnit] = useState<string | null>(null);
  const [lodgingQuantity, setLodgingQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"zone" | "family">("zone");

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError("Missing invite token");
        setErrorMessage("Please use the link from your email invitation.");
        setLoading(false);
        return;
      }

      try {
        const { data, error: invokeError } = await supabase.functions.invoke("validate-lodging-invite", {
          body: { token },
        });

        if (invokeError) {
          console.error("Validation error:", invokeError);
          setError("Unable to validate invite");
          setErrorMessage("Please try again or contact support.");
          setLoading(false);
          return;
        }

        if (!data?.valid) {
          setError(data?.error || "Invalid invite");
          setErrorMessage(data?.message || "This invite link is no longer valid.");
          setLoading(false);
          return;
        }

        setInviteData(data);
        setLoading(false);
      } catch (err) {
        console.error("Token validation error:", err);
        setError("Something went wrong");
        setErrorMessage("Please try again or contact support.");
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  // Fetch available zones and family units
  useEffect(() => {
    const fetchOptions = async () => {
      // Fetch zones
      const { data: zoneData } = await supabase
        .from("accommodation_zones")
        .select("*")
        .eq("is_publicly_available", true)
        .gt("inventory_available", 0)
        .order("night_price");
      
      setZones(zoneData || []);

      // Fetch family-style units
      const { data: unitData } = await supabase
        .from("accommodation_units")
        .select("id, unit_name, product_type, zone_key, bed_configuration, sleeps_max, has_loft, night_price")
        .eq("is_family_style", true)
        .eq("inventory_status", "available")
        .order("night_price");
      
      setFamilyUnits(unitData || []);
    };

    fetchOptions();
  }, []);

  // Show canceled toast
  useEffect(() => {
    if (canceled) {
      toast.error("Checkout was canceled. Your selection has been saved.");
    }
  }, [canceled]);

  const handleCheckout = async () => {
    if (!inviteData) return;
    if (!selectedZone && !selectedFamilyUnit) {
      toast.error("Please select an accommodation option");
      return;
    }
    
    setSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("create-lodging-from-invite", {
        body: {
          token,
          lodgingZoneKey: selectedZone,
          lodgingQuantity: selectedFamilyUnit ? 1 : lodgingQuantity,
          familyUnitId: selectedFamilyUnit,
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
        error_message: err.message || 'Accommodations invite checkout failed',
        ticket_type: selectedZone || selectedFamilyUnit || undefined,
        user_email: inviteData?.email,
      });
      toast.error(err.message || "Unable to start checkout. Please try again.");
      setSubmitting(false);
    }
  };

  const selectedZoneData = zones.find(z => z.zone_key === selectedZone);
  const selectedUnitData = familyUnits.find(u => u.id === selectedFamilyUnit);
  const maxLodging = inviteData ? Math.max(1, Math.floor(inviteData.quantity / 2)) : 1;

  // Calculate total price
  const calculateTotal = () => {
    if (selectedFamilyUnit && selectedUnitData) {
      return selectedUnitData.night_price * 2; // Weekend = 2 nights
    }
    if (selectedZone && selectedZoneData) {
      return selectedZoneData.night_price * 2 * lodgingQuantity; // Weekend = 2 nights
    }
    return 0;
  };

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
            {error}
          </h1>
          <p className="mb-6" style={{ ...typography.body, color: COLORS.charcoal }}>
            {errorMessage}
          </p>
          <Button
            onClick={() => navigate("/contact")}
            style={{ 
              ...typography.button,
              backgroundColor: COLORS.clay,
              color: COLORS.white,
              borderRadius: 0,
            }}
          >
            Contact Support
          </Button>
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
          {inviteData && (
            <div className="flex items-center gap-2 text-sm" style={{ color: COLORS.forest }}>
              <ShieldCheck className="w-4 h-4" />
              <span style={typography.body}>Verified: {inviteData.email}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
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
              Welcome, {inviteData?.name.split(" ")[0]}! Your {formatTicketType(inviteData?.ticketType || "")} ticket 
              ({inviteData?.quantity} {inviteData?.quantity && inviteData.quantity > 1 ? "passes" : "pass"}) 
              allows up to {maxLodging} {maxLodging > 1 ? "accommodations" : "accommodation"}.
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-2 mb-8 justify-center">
            <button
              onClick={() => { setActiveTab("zone"); setSelectedFamilyUnit(null); }}
              className={`px-6 py-2 text-sm font-medium transition-all border-2`}
              style={{
                backgroundColor: activeTab === "zone" ? COLORS.white : "transparent",
                borderColor: activeTab === "zone" ? COLORS.denim : COLORS.boulder,
                color: COLORS.charcoal,
                borderRadius: 0,
              }}
            >
              Zone Selection
            </button>
            <button
              onClick={() => { setActiveTab("family"); setSelectedZone(null); }}
              className={`px-6 py-2 text-sm font-medium transition-all border-2`}
              style={{
                backgroundColor: activeTab === "family" ? COLORS.white : "transparent",
                borderColor: activeTab === "family" ? COLORS.denim : COLORS.boulder,
                color: COLORS.charcoal,
                borderRadius: 0,
              }}
            >
              Family-Style Units
            </button>
          </div>

          {activeTab === "zone" && (
            <>
              {/* Zone Cards */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {zones.map((zone) => {
                  const isSelected = selectedZone === zone.zone_key;
                  const isSoldOut = zone.inventory_available <= 0;
                  
                  return (
                    <button
                      key={zone.zone_key}
                      onClick={() => !isSoldOut && setSelectedZone(zone.zone_key)}
                      disabled={isSoldOut}
                      className={`p-6 text-left transition-all border-2 ${
                        isSoldOut ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:shadow-lg"
                      }`}
                      style={{
                        backgroundColor: isSelected ? COLORS.white : "transparent",
                        borderColor: isSelected ? COLORS.denim : COLORS.boulder,
                        borderRadius: 0,
                      }}
                    >
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

              {/* Pending assignment note */}
              {selectedZone && (
                <div 
                  className="p-4 mb-6 border flex items-start gap-3"
                  style={{ 
                    backgroundColor: "#FEF3C7",
                    borderColor: COLORS.mustard,
                    borderRadius: 0,
                  }}
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.mustard }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: COLORS.charcoal }}>
                      Unit Assignment
                    </p>
                    <p className="text-sm" style={{ color: COLORS.boulder }}>
                      Your specific tent or cabin number will be assigned and sent to you approximately 2 weeks before the event.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "family" && (
            <>
              {/* Family-style unit cards */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {familyUnits.map((unit) => {
                  const isSelected = selectedFamilyUnit === unit.id;
                  
                  return (
                    <button
                      key={unit.id}
                      onClick={() => setSelectedFamilyUnit(unit.id)}
                      className="p-6 text-left transition-all border-2 cursor-pointer hover:shadow-lg"
                      style={{
                        backgroundColor: isSelected ? COLORS.white : "transparent",
                        borderColor: isSelected ? COLORS.denim : COLORS.boulder,
                        borderRadius: 0,
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span style={{ color: COLORS.denim }}>
                            {unit.product_type === "cabin" ? <Home className="w-5 h-5" /> : <Tent className="w-5 h-5" />}
                          </span>
                          <h3 
                            className="text-lg"
                            style={{ ...typography.subhead, color: COLORS.charcoal }}
                          >
                            {unit.product_type === "cabin" ? "Cabin" : "Tent"} #{unit.unit_name}
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
                      
                      <div className="space-y-2 text-sm mb-4" style={{ color: COLORS.charcoal }}>
                        <p><strong>Beds:</strong> {unit.bed_configuration}</p>
                        <p><strong>Sleeps:</strong> Up to {unit.sleeps_max} guests</p>
                        {unit.has_loft && <p><strong>Features:</strong> Loft space</p>}
                      </div>
                      
                      <div className="flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: COLORS.boulder }}>
                        <span 
                          className="text-xl"
                          style={{ ...typography.subhead, color: COLORS.charcoal }}
                        >
                          ${((unit.night_price * 2) / 100).toLocaleString()} total
                        </span>
                        <span className="text-sm" style={{ color: COLORS.boulder }}>
                          ${(unit.night_price / 100).toLocaleString()}/night
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {familyUnits.length === 0 && (
                <div className="text-center py-12" style={{ color: COLORS.boulder }}>
                  <p>No family-style units available at this time.</p>
                </div>
              )}

              {/* Auto-assignment note for family units */}
              {selectedFamilyUnit && (
                <div 
                  className="p-4 mb-6 border flex items-start gap-3"
                  style={{ 
                    backgroundColor: "#D1FAE5",
                    borderColor: COLORS.forest,
                    borderRadius: 0,
                  }}
                >
                  <Check className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: COLORS.forest }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: COLORS.charcoal }}>
                      Specific Unit Selected
                    </p>
                    <p className="text-sm" style={{ color: COLORS.boulder }}>
                      You've selected a specific unit. This exact {selectedUnitData?.product_type} will be reserved for you immediately upon purchase.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Checkout summary */}
          {(selectedZone || selectedFamilyUnit) && (
            <div 
              className="p-6 border-2 mb-6"
              style={{ 
                backgroundColor: COLORS.white,
                borderColor: COLORS.denim,
                borderRadius: 0,
              }}
            >
              <h3 
                className="text-lg mb-4"
                style={{ ...typography.subhead, color: COLORS.charcoal }}
              >
                Order Summary
              </h3>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span style={{ color: COLORS.boulder }}>
                    {selectedFamilyUnit 
                      ? `${selectedUnitData?.product_type === "cabin" ? "Cabin" : "Tent"} #${selectedUnitData?.unit_name}`
                      : `${selectedZoneData?.zone_name} × ${lodgingQuantity}`
                    }
                  </span>
                  <span style={{ color: COLORS.charcoal }}>
                    2 nights
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t" style={{ borderColor: COLORS.boulder }}>
                  <span className="font-medium" style={{ color: COLORS.charcoal }}>Total</span>
                  <span className="font-medium" style={{ color: COLORS.charcoal }}>
                    ${(calculateTotal() / 100).toLocaleString()}
                  </span>
                </div>
              </div>
              
              <Button
                onClick={handleCheckout}
                disabled={submitting}
                className="w-full h-12"
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
                    Proceed to Checkout
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
