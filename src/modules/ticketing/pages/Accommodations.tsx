import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Check, Volume2, VolumeX, Volume1, Users, Home, ArrowLeft, Tent, House, BedDouble, ChevronDown, Map, Image, X, Droplets, Flame, Coffee, Waves, Wifi, Thermometer, Info, ChevronLeft, ChevronRight, ZoomIn, Clock, ArrowUp, ShieldCheck, Loader2, XCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { COLORS, typography } from "@/styles/may-theme";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import propertyMap from "@/assets/wildhaven-map.webp";
import { useLodgingVisualAssets, getAssetsByProductType } from "@/hooks/useLodgingVisualAssets";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { trackGA4ViewItem } from "@/components/AnalyticsTracking";
import { useCheckoutFees } from "@/hooks/useCheckoutFees";
import { FeeBreakdown } from "@/components/checkout/FeeBreakdown";
import { LodgingEmailLookup } from "@/components/may/LodgingEmailLookup";
import { LodgingSelector } from "@/components/may/LodgingSelector";
import { usePaymentPlan } from "@/hooks/usePaymentPlan";
import { formatCentsToDollars } from "@/hooks/usePaymentPlan";
import { CHECKOUT_TICKET_STORAGE_KEY, type CheckoutTicketSelection, parseCheckoutTicketSelection } from "@/lib/checkoutTicket";
import { isQualifyingLodgingTicketType, MY_TICKETS_SELF_SERVICE_LODGING_KEY } from "@/lib/bookingRouteGuard";
import ManageBookingPanel from "@/components/may/ManageBookingPanel";
import {
  type AccommodationUnit,
  type AccommodationZone,
  type LodgingPreferences,
  ACCOMMODATION_FAMILY_UNIT_SELECT,
  ACCOMMODATION_ZONE_SELECT,
  DEFAULT_LODGING_PREFERENCES,
  getLodgingEligibility,
  getLodgingSelectionState,
} from "@/lib/lodging";
import { redirectToExternal } from "@/lib/safeRedirect";

interface InviteData {
  valid: boolean;
  email: string;
  name: string;
  ticketType: string;
  quantity: number;
  registrationId: string;
  tokenId: string;
}

// Zone copy helper data
const zoneHelperText: Record<string, { tagline: string; bestFor: string; siteNumbers?: string }> = {
  front_row_tents: {
    tagline: "Front-row access to the action",
    bestFor: "Guests who want premium positioning with views of the festival grounds.",
    siteNumbers: "Sites 1–4, 31–37",
  },
  front_row_cabins: {
    tagline: "Solid-wall comfort, front-row positioning",
    bestFor: "Guests looking for added comfort with prime festival access.",
    siteNumbers: "Sites 5–10, 30",
  },
  grove_tents: {
    tagline: "Cozy retreat for couples",
    bestFor: "Couples who love a cozy queen-bed home base nestled among the trees.",
    siteNumbers: "Sites 11–29, 39",
  },
  grove_tents_2q: {
    tagline: "Room to spread out",
    bestFor: "Friends or small groups who want two queen beds and more space.",
    siteNumbers: "Sites 40–47, 49–55",
  },
};

const getSoundIcon = (level: string) => {
  switch (level) {
    case "High":
      return <Volume2 className="w-4 h-4" />;
    case "Moderate":
      return <Volume1 className="w-4 h-4" />;
    case "Low":
      return <VolumeX className="w-4 h-4" />;
    default:
      return <Volume1 className="w-4 h-4" />;
  }
};

const getSoundLabel = (level: string) => {
  switch (level) {
    case "High":
      return "High energy";
    case "Moderate":
      return "Balanced energy";
    case "Low":
      return "Relaxed energy";
    default:
      return level;
  }
};

const MayAccommodations = () => {
  useCanonicalUrl('/checkout/lodging');

  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_lodging",
      item_name: "Cosmico – Accommodations",
      item_category: "Lodging",
      price: 215,
    });
  }, []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const canceled = searchParams.get("canceled");
  
  const [ticketData, setTicketData] = useState<CheckoutTicketSelection | null>(null);
  const [zones, setZones] = useState<AccommodationZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [lodgingQty, setLodgingQty] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preferences, setPreferences] = useState<LodgingPreferences>(DEFAULT_LODGING_PREFERENCES);
  const [familyUnits, setFamilyUnits] = useState<AccommodationUnit[]>([]);
  const [selectedFamilyUnit, setSelectedFamilyUnit] = useState<string | null>(null);
  
  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<{ url: string; label: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  // Back to top visibility
  const [showBackToTop, setShowBackToTop] = useState(false);
  
  // Preview mode
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  // Self-service mode (for existing ticket holders adding lodging)
  const [isSelfServiceMode, setIsSelfServiceMode] = useState(false);
  const [selfServiceRegistrationId, setSelfServiceRegistrationId] = useState<string | null>(null);
  
  // Invite mode state
  const [isInviteMode, setIsInviteMode] = useState(false);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteErrorMessage, setInviteErrorMessage] = useState<string | null>(null);
  
  // Handler for self-service email lookup
  const handleEligibleTicketFound = (data: {
    registrationId: string;
    email: string;
    name: string;
    ticketType: string;
    quantity: number;
  }) => {
    // Set ticket data from lookup
        setTicketData({
      ticketType: data.ticketType,
          selectedTicket: data.ticketType,
          selectedOption: {
            id: data.ticketType,
            name: data.ticketType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
            duration: "",
            price: 0,
          },
      ticketName: data.ticketType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
      ticketPrice: 0, // Not charging for tickets in self-service lodging
      quantity: data.quantity,
      name: data.name,
      email: data.email,
      donation: 0,
    });
    setSelfServiceRegistrationId(data.registrationId);
    setIsSelfServiceMode(true);
    setIsPreviewMode(false);
  };
  
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // Show canceled toast
  useEffect(() => {
    if (canceled) {
      toast.error("Checkout was canceled. Your selection has been saved.");
    }
  }, [canceled]);
  
  // Validate invite token if present
  useEffect(() => {
    const validateToken = async () => {
      if (!token) return;
      
      setIsInviteMode(true);
      setInviteLoading(true);
      
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("validate-lodging-invite", {
          body: { token },
        });

        if (invokeError) {
          console.error("Validation error:", invokeError);
          setInviteError("Unable to validate invite");
          setInviteErrorMessage("Please try again or contact support.");
          setInviteLoading(false);
          return;
        }

        if (!data?.valid) {
          setInviteError(data?.error || "Invalid invite");
          setInviteErrorMessage(data?.message || "This invite link is no longer valid.");
          setInviteLoading(false);
          return;
        }

        setInviteData(data);
        // Set ticket data from invite for UI consistency
        setTicketData({
          ticketType: data.ticketType,
          selectedTicket: data.ticketType,
          selectedOption: {
            id: data.ticketType,
            name: data.ticketType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
            duration: "",
            price: 0,
          },
          ticketName: data.ticketType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          ticketPrice: 0,
          quantity: data.quantity,
          name: data.name,
          email: data.email,
          donation: 0,
        });
        setInviteLoading(false);
      } catch (err) {
        console.error("Token validation error:", err);
        setInviteError("Something went wrong");
        setInviteErrorMessage("Please try again or contact support.");
        setInviteLoading(false);
      }
    };

    validateToken();
  }, [token]);

  // Load ticket data from sessionStorage (only if not invite mode)
  useEffect(() => {
    // Skip if token is present (invite mode) - ticket data comes from invite validation
    // Check the token directly to avoid race condition with isInviteMode state
    if (token) return;

    const myTicketsSelfServiceRaw = sessionStorage.getItem(MY_TICKETS_SELF_SERVICE_LODGING_KEY);
    if (myTicketsSelfServiceRaw) {
      try {
        const selfServiceData = JSON.parse(myTicketsSelfServiceRaw) as {
          registrationId: string;
          email: string;
          name: string;
          ticketType: string;
          quantity: number;
        };

        if (selfServiceData?.email && selfServiceData?.ticketType) {
          setTicketData({
            ticketType: selfServiceData.ticketType,
            selectedTicket: selfServiceData.ticketType,
            selectedOption: {
              id: selfServiceData.ticketType,
              name: selfServiceData.ticketType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
              duration: "",
              price: 0,
            },
            ticketName: selfServiceData.ticketType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
            ticketPrice: 0,
            quantity: selfServiceData.quantity,
            name: selfServiceData.name,
            email: selfServiceData.email,
            donation: 0,
          });
          setSelfServiceRegistrationId(selfServiceData.registrationId);
          setIsSelfServiceMode(true);
          setIsPreviewMode(false);
          sessionStorage.removeItem(MY_TICKETS_SELF_SERVICE_LODGING_KEY);
          return;
        }
      } catch (error) {
        console.error("Error parsing My Tickets lodging handoff:", error);
        sessionStorage.removeItem(MY_TICKETS_SELF_SERVICE_LODGING_KEY);
      }
    }
    
    const stored = parseCheckoutTicketSelection(sessionStorage.getItem(CHECKOUT_TICKET_STORAGE_KEY));
    if (!stored) {
      // If returning from canceled checkout, redirect to tickets instead of showing preview
      if (canceled) {
        navigate("/tickets");
        return;
      }
      setIsPreviewMode(true);
      setTicketData({
        selectedTicket: "tier_1_vip_3day",
        selectedOption: {
          id: "tier_1_vip_3day",
          name: "VIP Weekend Pass",
          duration: "",
          price: 450,
        },
        ticketType: "VIP",
        ticketName: "VIP Weekend Pass",
        ticketPrice: 450,
        quantity: 2,
        name: "Preview User",
        email: "preview@example.com",
        donation: 0,
      });
      return;
    }
    
    try {
      setTicketData(stored);
    } catch {
      toast.error("Invalid ticket data");
      navigate("/tickets");
    }
  }, [navigate, token, canceled]);

  // Fetch accommodation zones
  useEffect(() => {
    const fetchZones = async () => {
      const { data, error } = await supabase
        .from("accommodation_zones")
        .select(ACCOMMODATION_ZONE_SELECT)
        .eq("is_publicly_available", true)
        .order("night_price", { ascending: true });
      
      if (error) {
        console.error("Error fetching zones:", error);
        toast.error("Unable to load accommodations");
        return;
      }
      
      setZones(data || []);
    };
    
    fetchZones();
  }, []);

  // Fetch family-style units
  useEffect(() => {
    const fetchFamilyUnits = async () => {
      const { data, error } = await supabase
        .from("accommodation_units")
        .select(ACCOMMODATION_FAMILY_UNIT_SELECT)
        .eq("is_family_style", true)
        .eq("inventory_status", "available")
        .order("night_price", { ascending: true });
      
      if (!error && data) {
        setFamilyUnits(data as AccommodationUnit[]);
      }
    };
    
    fetchFamilyUnits();
  }, []);

  // Fetch lodging visual assets
  const { data: visualAssets } = useLodgingVisualAssets();
  const assetsByType = getAssetsByProductType(visualAssets);

  // Calculate max lodging quantity based on tickets (1 unit per ticket)
  const { maxLodgingQty, hasQualifyingTickets, canBookLodging } = getLodgingEligibility(ticketData?.ticketType, ticketData?.quantity);

  const { selectedZoneData, selectedFamilyUnitData, hasFamilyUnit, hasZone, lodgingTotal } = getLodgingSelectionState({
    zones,
    familyUnits,
    selectedZone,
    selectedFamilyUnit,
    lodgingQty,
  });
  
  const ticketTotal = ticketData ? ticketData.ticketPrice * ticketData.quantity : 0;
  
  // Calculate fees (convert dollars to cents for the hook)
  const { fees: calculatedFees, totalFees } = useCheckoutFees({
    ticketSubtotal: ticketTotal * 100,
    lodgingSubtotal: lodgingTotal * 100,
    donationAmount: 0,
  });
  
  const orderTotal = ticketTotal + lodgingTotal + (totalFees / 100);
  
  // Payment plan — based on full order total in cents
  const orderTotalCents = Math.round(orderTotal * 100);
  const { breakdown: paymentPlanBreakdown } = usePaymentPlan(orderTotalCents);

  const handleSkipLodging = async () => {
    if (!ticketData || isPreviewMode) return;
    if (isPreviewMode) {
      toast.info("This is preview mode. Start from the tickets page to complete a purchase.");
      return;
    }
    // No lodging — go straight to cart review
    sessionStorage.removeItem("cosmico_checkout_lodging");
    navigate("/checkout/addons");
  };

  const handleContinueToPayment = async () => {
    if (isPreviewMode) {
      toast.info("Please enter your email above to add lodging to your order.");
      return;
    }
    
    if (!ticketData || (!hasFamilyUnit && !hasZone)) {
      toast.error("Please select an accommodation");
      return;
    }
    
    if (hasZone && selectedZoneData.inventory_available < lodgingQty) {
      toast.error(`Only ${selectedZoneData.inventory_available} units available for ${selectedZoneData.zone_name}`);
      return;
    }
    
    // Skip ticket validation for invite mode and self-service mode (already validated)
    if (!isInviteMode && !isSelfServiceMode && (hasFamilyUnit || hasZone) && !canBookLodging) {
      if (!hasQualifyingTickets) {
        toast.error("Lodging requires VIP or Crew 3-day tickets");
        return;
      }
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Use different endpoints for invite vs self-service vs regular checkout
      if (isInviteMode && token) {
        const { data, error } = await supabase.functions.invoke("create-lodging-from-invite", {
          body: {
            token,
            lodgingZoneKey: hasFamilyUnit ? null : selectedZone,
            lodgingQuantity: hasFamilyUnit ? 1 : lodgingQty,
            familyUnitId: hasFamilyUnit ? selectedFamilyUnit : null,
          },
        });
        
        if (error) throw error;
        
        if (data?.error) {
          toast.error(data.message || data.error);
          setIsSubmitting(false);
          return;
        }
        
        if (data?.url) {
          redirectToExternal(data.url);
        } else {
          throw new Error("No checkout URL returned");
        }
      } else if (isSelfServiceMode) {
        // Self-service lodging for existing ticket holders
        const { data, error } = await supabase.functions.invoke("create-self-service-lodging", {
          body: {
            email: ticketData.email,
            lodgingZoneKey: hasFamilyUnit ? (selectedFamilyUnitData?.zone_key || selectedZone) : selectedZone,
            lodgingQuantity: hasFamilyUnit ? 1 : lodgingQty,
            preferences: preferences,
          },
        });
        
        if (error) throw error;
        
        if (data?.error) {
          toast.error(data.message || data.error);
          setIsSubmitting(false);
          return;
        }
        
        if (data?.url) {
          redirectToExternal(data.url);
        } else {
          throw new Error("No checkout URL returned");
        }
      } else {
        // Regular checkout — save lodging data and go to cart review
        const lodgingCheckoutData = {
          zoneKey: hasFamilyUnit ? null : selectedZone,
          zoneName: hasZone ? selectedZoneData.zone_name : null,
          zonePrice: hasZone ? (selectedZoneData.night_price * 2 / 100) : 0,
          lodgingQuantity: hasFamilyUnit ? 1 : lodgingQty,
          familyUnitId: hasFamilyUnit ? selectedFamilyUnit : null,
          familyUnitName: hasFamilyUnit ? selectedFamilyUnitData.unit_name : null,
          familyUnitPrice: hasFamilyUnit ? (selectedFamilyUnitData.night_price * 2 / 100) : 0,
          preferences: preferences,
        };
        sessionStorage.setItem("cosmico_checkout_lodging", JSON.stringify(lodgingCheckoutData));
        navigate("/checkout/addons");
        return;
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Unable to start checkout. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Lightbox helpers
  const openLightbox = (images: { url: string; label: string }[], startIndex: number = 0) => {
    setLightboxImages(images);
    setLightboxIndex(startIndex);
    setLightboxOpen(true);
  };

  const nextImage = () => {
    setLightboxIndex((prev) => (prev + 1) % lightboxImages.length);
  };

  const prevImage = () => {
    setLightboxIndex((prev) => (prev - 1 + lightboxImages.length) % lightboxImages.length);
  };

  const MAX_ACCORDION_PHOTOS = 3;
  
  const tentPhotos = assetsByType.tent.map(asset => ({
    url: asset.image_url,
    label: `Glamping Tent - ${asset.image_type || 'Photo'}`
  }));

  const cabinPhotos = assetsByType.cabin.map(asset => ({
    url: asset.image_url,
    label: `Glamping Cabin - ${asset.image_type || 'Photo'}`
  }));
  
  const accordionTentAssets = assetsByType.tent.slice(0, MAX_ACCORDION_PHOTOS);
  const accordionCabinAssets = assetsByType.cabin.slice(0, MAX_ACCORDION_PHOTOS);

  // Show loading state for invite mode
  if (isInviteMode && inviteLoading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: COLORS.dustySky }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.clay }} />
      </div>
    );
  }

  // Show error state for invite mode
  if (isInviteMode && inviteError) {
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
            {inviteError}
          </h1>
          <p className="mb-6" style={{ ...typography.body, color: COLORS.charcoal }}>
            {inviteErrorMessage}
          </p>
          <Button
            onClick={() => navigate("/contact")}
            style={{ 
              ...typography.button,
              backgroundColor: COLORS.clay,
              color: COLORS.white,
              borderRadius: '8px',
            }}
          >
            Contact Support
          </Button>
        </div>
      </div>
    );
  }

  if (!ticketData) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      {/* Header */}
      <header 
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b"
        style={{ 
          backgroundColor: `${COLORS.dustySky}f0`,
          borderColor: `${COLORS.charcoal}15`
        }}
      >
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/">
            <img 
              src={analogLogo} 
              alt="Analog" 
              className="h-8 md:h-10"
            />
          </Link>
          {isInviteMode && inviteData ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: COLORS.forest }}>
              <ShieldCheck className="w-4 h-4" />
              <span style={typography.body}>Verified: {inviteData.email}</span>
            </div>
          ) : (
            <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px' }}>
              MAY 14–16, 2027
            </span>
          )}
        </div>
      </header>

      <main className="pt-24 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Self-Service Email Lookup for direct visitors */}
          {isPreviewMode && !isInviteMode && (
            <div className="max-w-3xl mx-auto mb-8 space-y-4">
              <ManageBookingPanel
                defaultEmail={ticketData?.email ?? ""}
                helperText="Bought tickets already? Use the same email to view tickets, add lodging, or purchase add-ons."
              />
              <LodgingEmailLookup onEligibleTicketFound={handleEligibleTicketFound} />
            </div>
          )}

          {/* Self-Service Mode Banner */}
          {isSelfServiceMode && !isInviteMode && (
            <div 
              className="mb-6 p-4 rounded-xl border"
              style={{ 
                backgroundColor: `${COLORS.forest}10`,
                borderColor: `${COLORS.forest}30`
              }}
            >
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', textAlign: 'center' }}>
                <strong>Adding lodging for {ticketData?.name}</strong> — Your {ticketData?.ticketType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())} tickets are eligible for on-site glamping.
              </p>
            </div>
          )}

          {/* Back Link - only show for non-invite, non-preview mode */}
          {!isInviteMode && !isPreviewMode && (
            <Link 
              to={isSelfServiceMode ? "/my-tickets" : "/tickets"}
              onClick={isSelfServiceMode ? (e) => { e.preventDefault(); setIsSelfServiceMode(false); setIsPreviewMode(true); setTicketData(null); } : undefined}
              className="inline-flex items-center gap-2 mb-6 transition-colors hover:opacity-70"
              style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}
            >
              <ArrowLeft className="w-4 h-4" />
              {isSelfServiceMode ? "Back to Email Lookup" : "Back to Tickets"}
            </Link>
          )}

          {/* Step Indicator - different for invite/self-service vs checkout flow */}
          {!isPreviewMode && (
            <>
              {(isInviteMode || isSelfServiceMode) ? (
                <div className="flex items-center justify-center gap-2 mb-8">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                      style={{ backgroundColor: COLORS.clay, color: COLORS.white }}
                    >
                      1
                    </div>
                    <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '13px' }} className="hidden sm:inline">Select Lodging</span>
                  </div>
                  <div className="w-8 h-px" style={{ backgroundColor: `${COLORS.boulder}30` }} />
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                      style={{ backgroundColor: `${COLORS.boulder}30`, color: COLORS.boulder }}
                    >
                      2
                    </div>
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }} className="hidden sm:inline">Payment</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 mb-8">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                      style={{ backgroundColor: `${COLORS.clay}20`, color: COLORS.clay }}
                    >
                      <Check className="w-4 h-4" />
                    </div>
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }} className="hidden sm:inline">Tickets</span>
                  </div>
                  <div className="w-8 h-px" style={{ backgroundColor: `${COLORS.clay}50` }} />
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                      style={{ backgroundColor: COLORS.clay, color: COLORS.white }}
                    >
                      2
                    </div>
                    <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '13px' }} className="hidden sm:inline">Lodging</span>
                  </div>
                  <div className="w-8 h-px" style={{ backgroundColor: `${COLORS.boulder}30` }} />
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                      style={{ backgroundColor: `${COLORS.boulder}30`, color: COLORS.boulder }}
                    >
                      3
                    </div>
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }} className="hidden sm:inline">Payment</span>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="text-center mb-8">
                <p 
                  style={{ 
                    ...typography.caption, 
                    color: COLORS.clay,
                    marginBottom: '12px'
                  }}
                >
                  {(isInviteMode || isSelfServiceMode) ? 'STEP 1 OF 2' : 'STEP 2 OF 3'}
                </p>
            <h1 
              style={{ 
                ...typography.headline, 
                color: COLORS.charcoal,
                fontSize: 'clamp(28px, 5vw, 40px)',
                marginBottom: '8px'
              }}
            >
              Choose Your Zone
            </h1>
            {isInviteMode && inviteData ? (
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '15px' }}>
                Welcome, {inviteData.name.split(" ")[0]}! Your {inviteData.ticketType.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())} ticket 
                ({inviteData.quantity} {inviteData.quantity > 1 ? "passes" : "pass"}) 
                allows up to {Math.max(1, Math.floor(inviteData.quantity / 2))} accommodation{Math.max(1, Math.floor(inviteData.quantity / 2)) > 1 ? "s" : ""}.
              </p>
              ) : isSelfServiceMode && ticketData ? (
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '15px' }}>
                  Select from available glamping tents and cabins at Example Meadow.
                </p>
              ) : (
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '15px' }}>
                  Select from available glamping tents and cabins at Example Meadow.
                </p>
              )}
              </div>
            </>
          )}

          {/* Zone selection content - only show when not in preview mode */}
          {!isPreviewMode && (
            <>
          {/* Info Accordions */}
          <div className="max-w-4xl mx-auto mb-10 space-y-2">
            {/* What's Included */}
            <Collapsible>
              <CollapsibleTrigger className="w-full group">
                <div 
                  className="flex items-center justify-between gap-2 py-3 px-4 rounded-xl border transition-colors"
                  style={{ 
                    backgroundColor: COLORS.white,
                    borderColor: `${COLORS.charcoal}15`
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4" style={{ color: COLORS.clay }} />
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>What's included with all accommodations</span>
                  </div>
                  <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" style={{ color: COLORS.boulder }} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div 
                  className="mt-2 p-6 rounded-xl border"
                  style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[
                      { icon: Droplets, title: "Shared Bathrooms", desc: "Hot showers, ~1 min walk" },
                      { icon: Thermometer, title: "Heated Beds", desc: "Heated mattress pads" },
                      { icon: Flame, title: "Private Fire Pit", desc: "At each accommodation" },
                      { icon: Coffee, title: "Coffee & Tea", desc: "Daily 8–10am" },
                      { icon: Waves, title: "River Access", desc: "Private Example River beach" },
                      { icon: Wifi, title: "Free WiFi", desc: "Throughout property" },
                      { icon: Home, title: "Climate Control", desc: "Cabins: AC/heat · Tents: heaters" },
                      { icon: Clock, title: "Check-in / Check-out", desc: "Check-in: 3pm Fri · Check-out: 11am Sun" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div 
                          className="p-2 rounded-lg shrink-0"
                          style={{ backgroundColor: `${COLORS.clay}10` }}
                        >
                          <item.icon className="w-4 h-4" style={{ color: COLORS.clay }} />
                        </div>
                        <div>
                          <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>{item.title}</p>
                          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Property Map */}
            <Collapsible>
              <CollapsibleTrigger className="w-full group">
                <div 
                  className="flex items-center justify-between gap-2 py-3 px-4 rounded-xl border transition-colors"
                  style={{ 
                    backgroundColor: COLORS.white,
                    borderColor: `${COLORS.charcoal}15`
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Map className="w-4 h-4" style={{ color: COLORS.clay }} />
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>See site locations</span>
                  </div>
                  <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" style={{ color: COLORS.boulder }} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div 
                  className="mt-2 p-4 rounded-xl border"
                  style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
                >
                  <div 
                    className="relative rounded-lg overflow-hidden border cursor-pointer group"
                    style={{ borderColor: `${COLORS.charcoal}15` }}
                    onClick={() => openLightbox([{ url: propertyMap, label: 'Example Meadow Property Map' }], 0)}
                  >
                    <img 
                      src={propertyMap} 
                      alt="Example Meadow property map showing tent and cabin locations" 
                      className="w-full h-auto group-hover:scale-[1.02] transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-3">
                        <ZoomIn className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  </div>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
                    Click to view full size • Riverside units are closest to the Example River
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Accommodation Photos */}
            <Collapsible>
              <CollapsibleTrigger className="w-full group">
                <div 
                  className="flex items-center justify-between gap-2 py-3 px-4 rounded-xl border transition-colors"
                  style={{ 
                    backgroundColor: COLORS.white,
                    borderColor: `${COLORS.charcoal}15`
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4" style={{ color: COLORS.clay }} />
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                      View accommodation photos
                      <span style={{ opacity: 0.6, marginLeft: '6px' }}>
                        ({assetsByType.tent.length + assetsByType.cabin.length})
                      </span>
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" style={{ color: COLORS.boulder }} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div 
                  className="mt-2 p-4 rounded-xl border space-y-6"
                  style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
                >
                  {/* Tents */}
                  {accordionTentAssets.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tent className="w-4 h-4" style={{ color: COLORS.clay }} />
                          <h4 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>Glamping Tents</h4>
                        </div>
                        {assetsByType.tent.length > MAX_ACCORDION_PHOTOS && (
                          <button
                            onClick={() => openLightbox(tentPhotos, 0)}
                            style={{ ...typography.body, color: COLORS.clay, fontSize: '12px' }}
                            className="hover:underline"
                          >
                            View all {assetsByType.tent.length} photos →
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {accordionTentAssets.map((asset, idx) => (
                          <div 
                            key={asset.id} 
                            className="relative aspect-[4/3] rounded-lg overflow-hidden border group cursor-pointer"
                            style={{ borderColor: `${COLORS.charcoal}15` }}
                            onClick={() => openLightbox(tentPhotos, idx)}
                          >
                            <img
                              src={asset.image_url}
                              alt={asset.alt_text || `Glamping tent`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-2">
                                <ZoomIn className="w-4 h-4 text-white" />
                              </div>
                            </div>
                            {asset.image_type && (
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent py-2 px-3">
                                <span className="text-xs font-medium text-white capitalize">{asset.image_type}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Cabins */}
                  {accordionCabinAssets.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <House className="w-4 h-4" style={{ color: COLORS.mustard }} />
                          <h4 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>Glamping Cabins</h4>
                        </div>
                        {assetsByType.cabin.length > MAX_ACCORDION_PHOTOS && (
                          <button
                            onClick={() => openLightbox(cabinPhotos, 0)}
                            style={{ ...typography.body, color: COLORS.clay, fontSize: '12px' }}
                            className="hover:underline"
                          >
                            View all {assetsByType.cabin.length} photos →
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {accordionCabinAssets.map((asset, idx) => (
                          <div 
                            key={asset.id} 
                            className="relative aspect-[4/3] rounded-lg overflow-hidden border group cursor-pointer"
                            style={{ borderColor: `${COLORS.charcoal}15` }}
                            onClick={() => openLightbox(cabinPhotos, idx)}
                          >
                            <img
                              src={asset.image_url}
                              alt={asset.alt_text || `Glamping cabin`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-2">
                                <ZoomIn className="w-4 h-4 text-white" />
                              </div>
                            </div>
                            {asset.image_type && (
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent py-2 px-3">
                                <span className="text-xs font-medium text-white capitalize">{asset.image_type}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Two Column Layout */}
          <div className="grid lg:grid-cols-3 gap-8">
              {/* Left: Zone Selection */}
              <div className="lg:col-span-2 space-y-6">
                {zones.length === 0 ? (
                  <div className="text-center py-12">
                    <Home className="w-12 h-12 mx-auto mb-4" style={{ color: COLORS.boulder, opacity: 0.5 }} />
                    <p style={{ ...typography.body, color: COLORS.boulder }}>No accommodations currently available.</p>
                    <Button
                      onClick={handleSkipLodging}
                      disabled={isSubmitting}
                      className="mt-4 px-6 py-3"
                      style={{ 
                        ...typography.button,
                        backgroundColor: COLORS.clay, 
                        color: COLORS.charcoal,
                        borderRadius: '0'
                      }}
                    >
                      Continue Without Lodging
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Ticket Requirement Warning */}
                    {!canBookLodging && ticketData && (
                      <div 
                        className="p-4 rounded-xl border flex items-start gap-3"
                        style={{ 
                          backgroundColor: `${COLORS.mustard}15`,
                          borderColor: `${COLORS.mustard}30`
                        }}
                      >
                        <Info className="w-5 h-5 shrink-0 mt-0.5" style={{ color: COLORS.mustard }} />
                        <div>
                          <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
                            Lodging requires VIP or Crew 3-day tickets
                          </p>
                          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
                            Your {ticketData.ticketName} tickets don't include lodging eligibility. Only VIP and Crew 3-day passes qualify for on-site accommodations.
                          </p>
                          <Link 
                            to="/tickets" 
                            className="inline-block mt-2 underline"
                            style={{ ...typography.body, color: COLORS.clay, fontSize: '12px' }}
                          >
                            ← Change ticket selection
                          </Link>
                        </div>
                      </div>
                    )}

                    <LodgingSelector
                      zones={zones}
                      familyUnits={familyUnits}
                      selectedZone={selectedZone}
                      selectedFamilyUnit={selectedFamilyUnit}
                      lodgingQty={lodgingQty}
                      maxLodgingQty={maxLodgingQty}
                      canBookLodging={!!canBookLodging}
                      hasQualifyingTickets={hasQualifyingTickets}
                      ticketName={ticketData?.ticketName}
                      ticketQuantity={ticketData?.quantity}
                      assetsByType={assetsByType}
                      onBlockedSelection={() => toast.error(!hasQualifyingTickets ? "Lodging requires VIP or Crew 3-day tickets" : "This zone is sold out")}
                      onSelectZone={(zoneKey) => {
                        setSelectedZone(zoneKey);
                        setSelectedFamilyUnit(null);
                      }}
                      onSelectFamilyUnit={(unitId) => {
                        setSelectedFamilyUnit(unitId);
                        setSelectedZone(null);
                      }}
                      onChangeQuantity={setLodgingQty}
                      onContinueWithoutLodging={handleSkipLodging}
                      requirementCta={
                        <Link
                          to="/tickets"
                          className="inline-block mt-2 underline"
                          style={{ ...typography.body, color: COLORS.clay, fontSize: '12px' }}
                        >
                          ← Change ticket selection
                        </Link>
                      }
                    />

                    {/* Mobile Checkout Section - inline buttons instead of floating bar */}
                    <div className="lg:hidden mt-8 pt-6" style={{ borderTop: `1px solid ${COLORS.charcoal}15` }}>
                      {/* Order Summary for Mobile */}
                      <div 
                        className="rounded-xl p-5 mb-4"
                        style={{ backgroundColor: COLORS.white, border: `1px solid ${COLORS.charcoal}15` }}
                      >
                        <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '16px', marginBottom: '12px' }}>
                          Order Summary
                        </h3>
                        
                        {/* Tickets */}
                        <div className="flex justify-between items-center pb-3" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
                          <div>
                            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                              {ticketData?.ticketName || "Tickets"}
                            </p>
                            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                              {ticketData?.quantity || 0}x ${ticketData?.ticketPrice || 0}
                            </p>
                          </div>
                          <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                            ${ticketTotal.toLocaleString()}
                          </p>
                        </div>

                        {/* Selected Lodging */}
                        {(selectedZoneData || selectedFamilyUnitData) && (
                          <div className="flex justify-between items-center py-3" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
                            <div>
                              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                                {selectedFamilyUnitData 
                                  ? `Family-Style ${selectedFamilyUnitData.product_type === "tent" ? "Tent" : "Cabin"}`
                                  : selectedZoneData?.zone_name
                                }
                              </p>
                              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                                {selectedFamilyUnitData 
                                  ? "2 nights"
                                  : `${lodgingQty}x $${(selectedZoneData!.night_price / 100).toLocaleString()}/night × 2`
                                }
                              </p>
                            </div>
                            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                              ${lodgingTotal.toLocaleString()}
                            </p>
                          </div>
                        )}

                        {/* Fees */}
                        {calculatedFees.length > 0 && (
                          <div className="py-3" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
                            <FeeBreakdown fees={calculatedFees} />
                          </div>
                        )}

                        {/* Total */}
                        <div className="flex justify-between items-center pt-3">
                          <p style={{ ...typography.subhead, color: COLORS.boulder, fontSize: '14px' }}>Total</p>
                          <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '22px' }}>
                            ${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>

                      {/* Payment Plan Toggle - Mobile */}
                      {paymentPlanBreakdown.available && (
                        <p className="text-center mb-4">
                          <button
                            type="button"
                            onClick={() => {
                              // TODO: Wire up accommodations payment plan flow
                              toast.info("Payment plan will be available at final checkout");
                            }}
                            className="hover:opacity-70 transition-opacity"
                            style={{ ...typography.body, color: COLORS.clay, fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            Or pay only {formatCentsToDollars(paymentPlanBreakdown.firstPayment)} today {'→'}
                          </button>
                        </p>
                      )}

                      {/* Mobile Action Buttons */}
                      {(selectedZone || selectedFamilyUnit) ? (
                        <Button
                          onClick={handleContinueToPayment}
                          disabled={isSubmitting}
                          className="w-full h-12 text-lg disabled:opacity-50"
                          style={{ 
                            ...typography.button,
                            backgroundColor: COLORS.clay, 
                            color: COLORS.charcoal,
                            borderRadius: '0'
                          }}
                        >
                          {isSubmitting ? "Processing..." : "Continue to Payment"}
                        </Button>
                      ) : (
                        <>
                          <p 
                            className="text-center mb-4"
                            style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}
                          >
                            Select an accommodation above, or skip to pay for tickets only
                          </p>
                          {!isInviteMode && (
                            <Button
                              onClick={handleSkipLodging}
                              disabled={isSubmitting}
                              variant="outline"
                              className="w-full h-12 disabled:opacity-50"
                              style={{ 
                                ...typography.button,
                                borderColor: COLORS.clay,
                                color: COLORS.clay,
                                borderRadius: '0'
                              }}
                            >
                              {isSubmitting ? "Processing..." : "Skip Lodging → Pay Now"}
                            </Button>
                          )}
                        </>
                      )}

                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>
                        Secure checkout powered by Stripe
                      </p>
                    </div>

                    {/* Skip Lodging Option - Desktop only (below zone cards) */}
                    <div className="hidden lg:block text-center pt-4">
                      <button
                        onClick={handleSkipLodging}
                        disabled={isSubmitting}
                        className="transition-colors hover:opacity-70"
                        style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}
                      >
                        Skip lodging, continue to payment →
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Right: Sticky Cart Summary */}
              <div className="hidden lg:block lg:col-span-1">
                <div className="sticky top-28">
                  <div 
                    className="rounded-xl p-6 border"
                    style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}
                  >
                    <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px', marginBottom: '16px' }}>
                      Order Summary
                    </h3>
                    
                    {/* Tickets */}
                    <div className="space-y-3 pb-4" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
                            {ticketData.ticketName}
                          </p>
                          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                            {ticketData.quantity}x ${ticketData.ticketPrice}
                          </p>
                        </div>
                        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                          ${ticketTotal.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Lodging - Zone-based */}
                    {selectedZoneData && !selectedFamilyUnit && (
                      <div className="space-y-3 py-4" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
                              {selectedZoneData.zone_name}
                            </p>
                            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                              {lodgingQty}x ${(selectedZoneData.night_price / 100).toLocaleString()}/night × 2 nights
                            </p>
                          </div>
                          <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                            ${lodgingTotal.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Lodging - Family-style unit */}
                    {selectedFamilyUnitData && (
                      <div className="space-y-3 py-4" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
                              Family-Style {selectedFamilyUnitData.product_type === "tent" ? "Tent" : "Cabin"}
                            </p>
                            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                              {selectedFamilyUnitData.bed_configuration}
                            </p>
                          </div>
                          <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                            ${(selectedFamilyUnitData.night_price * 2 / 100).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}


                    {/* Fees & Taxes */}
                    {calculatedFees.length > 0 && (
                      <div className="py-4" style={{ borderBottom: `1px solid ${COLORS.charcoal}10` }}>
                        <FeeBreakdown fees={calculatedFees} />
                      </div>
                    )}

                    {/* Total */}
                    <div className="pt-4">
                      <div className="flex justify-between items-center">
                        <p style={{ ...typography.subhead, color: COLORS.boulder, fontSize: '14px' }}>Total</p>
                        <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '24px' }}>
                          ${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Payment Plan Toggle - Desktop */}
                    {paymentPlanBreakdown.available && (
                      <p className="text-center mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            toast.info("Payment plan will be available at final checkout");
                          }}
                          className="hover:opacity-70 transition-opacity"
                          style={{ ...typography.body, color: COLORS.clay, fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Or pay only {formatCentsToDollars(paymentPlanBreakdown.firstPayment)} today {'→'}
                        </button>
                      </p>
                    )}

                    {/* Continue Button */}
                    {(zones.length > 0 || familyUnits.length > 0) && (
                      <Button
                        onClick={handleContinueToPayment}
                        disabled={isSubmitting || (!selectedZone && !selectedFamilyUnit)}
                        className="w-full mt-6 h-12 text-lg disabled:opacity-50"
                        style={{ 
                          ...typography.button,
                          backgroundColor: COLORS.clay, 
                          color: COLORS.charcoal,
                          borderRadius: '0'
                        }}
                      >
                        {isSubmitting ? "Processing..." : "Continue to Payment"}
                      </Button>
                    )}

                    {/* Skip Lodging Option */}
                    {!selectedZone && !selectedFamilyUnit && !isInviteMode && (
                      <button
                        onClick={handleSkipLodging}
                        disabled={isSubmitting}
                        className="w-full mt-3 py-2 text-center transition-colors hover:underline disabled:opacity-50"
                        style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}
                      >
                        Skip lodging and continue to payment →
                      </button>
                    )}

                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>
                      Secure checkout powered by Stripe
                    </p>
                  </div>
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      </main>

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-4 p-3 rounded-full shadow-lg transition-all z-30"
          style={{ backgroundColor: COLORS.charcoal }}
        >
          <ArrowUp className="w-5 h-5" style={{ color: COLORS.white }} />
        </button>
      )}

      {/* Lightbox Modal */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          
          {lightboxImages.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                className="absolute left-4 p-3 rounded-full transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                className="absolute right-4 p-3 rounded-full transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </>
          )}
          
          <div className="max-w-5xl max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImages[lightboxIndex].url}
              alt={lightboxImages[lightboxIndex].label}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg">
              <p className="text-white text-center">{lightboxImages[lightboxIndex].label}</p>
              {lightboxImages.length > 1 && (
                <p className="text-white/60 text-center text-sm mt-1">
                  {lightboxIndex + 1} of {lightboxImages.length}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MayAccommodations;
