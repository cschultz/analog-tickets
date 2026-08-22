import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useUTMCapture } from "@/hooks/useUTMTracking";
import { Link, useSearchParams, useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { invokeCheckout, showCheckoutErrorToast } from "@/lib/checkoutInvoke";
import { supabase } from "@/integrations/supabase/client";
import { Check, Star, Users, Loader2, ChevronDown, AlertCircle } from "lucide-react";
import { CheckoutProgress } from "@/components/checkout/CheckoutProgress";
import { COLORS, typography } from "@/styles/may-theme";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import pressKCRW from "@/assets/may/press-kcrw.webp";
import pressPD from "@/assets/may/press-pd.webp";
import pressSonomaMag from "@/assets/may/press-sonoma-mag.webp";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { useCheckoutFees } from "@/hooks/useCheckoutFees";
import { FeeBreakdown } from "@/components/checkout/FeeBreakdown";
import { usePaymentPlan } from "@/hooks/usePaymentPlan";
import { formatCentsToDollars } from "@/hooks/usePaymentPlan";
import EmailCapture from "@/components/may/EmailCapture";
import { trackGA4ViewItem, trackGA4AddToCart, trackGA4BeginCheckout, trackGA4ViewItemList, trackGA4SelectItem, setGoogleUserData, initScrollDepthTracking, getFbCookies, getClientIp } from "@/components/AnalyticsTracking";
import { Funnel } from "@/lib/analytics";
import { CHECKOUT_TICKET_STORAGE_KEY, createCheckoutTicketSelection } from "@/lib/checkoutTicket";
import { useCheckoutErrorReporting } from "@/hooks/useCheckoutErrorReporting";
import { useCartIntentTracking } from "@/hooks/useCartIntentTracking";
import { useExitIntent } from "@/hooks/useExitIntent";

import { useHighIntentDetection } from "@/hooks/useHighIntentDetection";
import { useIdleHesitation } from "@/hooks/useIdleHesitation";
import { useScrollDepthTrigger } from "@/hooks/useScrollDepthTrigger";
import { useRealtimeFieldCapture } from "@/hooks/useRealtimeFieldCapture";
import ManageBookingPanel from "@/components/may/ManageBookingPanel";
import { redirectToExternal } from "@/lib/safeRedirect";
import { PRODUCER } from "@/platform/externalLinks";
const ExitIntentPopup = lazy(() => import("@/components/may/ExitIntentPopup").then((module) => ({ default: module.ExitIntentPopup })));
const SocialProofTicker = lazy(() => import("@/components/may/SocialProofTicker").then((module) => ({ default: module.SocialProofTicker })));

type TicketType = "tier_1_krewe_3day" | "tier_1_vip_3day" | "tier_1_ga_2day" | "tier_1_ga_friday" | "tier_1_ga_saturday";
type PatronsPackageType = "ultimate" | "premier";
type YouthTicketType = "youth_2day" | "youth_saturday" | null;

// Youth ticket pricing (in dollars)
const YOUTH_PRICES = {
  youth_2day: 100,
  youth_saturday: 60,
} as const;

interface TicketOption {
  id: TicketType;
  name: string;
  duration: string;
  price: number;
  description: string;
  features: string[];
  icon: React.ReactNode;
  highlight?: boolean;
  limited?: boolean;
}

// Tier 2 prices for anchoring (next price tier)
const TIER_2_PRICES: Record<TicketType, number> = {
  tier_1_krewe_3day: 799,
  tier_1_vip_3day: 549,
  tier_1_ga_2day: 299,
  tier_1_ga_friday: 139,
  tier_1_ga_saturday: 219,
};

// Main public ticket options - ordered for conversion: Weekend GA → VIP → Saturday → Friday
const ticketOptions: TicketOption[] = [
  {
    id: "tier_1_ga_2day",
    name: "WEEKEND PASS",
    duration: "Full access Friday + Saturday",
    price: 239,
    description: "Most Popular",
    features: [
      "2-day Fri/Sat access",
      "All main performances",
      "WineCamp access",
      "White Sage Market",
    ],
    icon: <Users className="w-5 h-5" />,
    highlight: true,
  },
  {
    id: "tier_1_vip_3day",
    name: "VIP WEEKEND PASS",
    duration: "The Full Analog Experience",
    price: 449,
    description: "",
    features: [
      "Full 3-day access",
      "Hosted drinks + VIP viewing area",
      "Sunday creek gathering at the founders' home",
      "Optional lodging access",
    ],
    icon: <Star className="w-5 h-5" />,
  },
  {
    id: "tier_1_ga_saturday",
    name: "SATURDAY PASS",
    duration: "One full day of music and community.",
    price: 169,
    description: "",
    features: [
      "Saturday access",
      "Main performances",
      "White Sage Market",
    ],
    icon: <Users className="w-5 h-5" />,
  },
  {
    id: "tier_1_ga_friday",
    name: "FRIDAY PASS",
    duration: "Opening night of the gathering.",
    price: 109,
    description: "",
    features: [
      "Friday access",
      "Main performances",
      "Food & beverage vendors",
    ],
    icon: <Users className="w-5 h-5" />,
  },
];

const STORAGE_KEY = "cosmico_ticket_form";
const PATRONS_STORAGE_KEY = "cosmico_patrons_form";

interface FormData {
  selectedTicket: TicketType | null;
  quantity: number;
  name: string;
  email: string;
  phone: string;
  
  agreedToPolicy: boolean;
  accommodationWaitlist: boolean;
  childCount: number;
  youthTicketType: YouthTicketType;
  youthCount: number;
}

interface PatronsFormData {
  patronsName: string;
  patronsEmail: string;
}

interface TicketInventory {
  ticket_type: string;
  total_quantity: number;
  sold_quantity: number;
  reserved_for_offers: number;
}

const loadFormData = (): Partial<FormData> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

const loadPatronsFormData = (): Partial<PatronsFormData> => {
  try {
    const saved = localStorage.getItem(PATRONS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

const MayTickets = () => {
  useCanonicalUrl('/tickets');
  useUTMCapture();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const savedData = loadFormData();
  const savedPatronsData = loadPatronsFormData();
  const { reportError } = useCheckoutErrorReporting();
  const { trackPageView, trackTicketSelect, trackQuantityChange, trackDetailsExpanded, trackEmailCapture, trackCheckoutSubmit } = useCartIntentTracking();
  const lastTrackedResolvedTicketRef = useRef<string | null>(null);
  
  const urlTicket = searchParams.get("ticket") as TicketType | null;
  const urlQuantity = searchParams.get("qty");
  const upgradeSource = searchParams.get("source") === "my-tickets";
  const upgradeIntent = searchParams.get("upgrade") === "1";
  
  const validTicketTypes: TicketType[] = ["tier_1_krewe_3day", "tier_1_vip_3day", "tier_1_ga_2day", "tier_1_ga_friday", "tier_1_ga_saturday"];
  const initialTicket = urlTicket && validTicketTypes.includes(urlTicket) 
    ? urlTicket 
    : savedData.selectedTicket ?? null;
  const initialQuantity = urlQuantity && !isNaN(parseInt(urlQuantity)) 
    ? Math.min(Math.max(parseInt(urlQuantity), 1), 8) 
    : savedData.quantity ?? 1;
  
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(initialTicket);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [name, setName] = useState(savedData.name ?? "");
  const [email, setEmail] = useState(savedData.email ?? "");
  const [phone, setPhone] = useState(savedData.phone ?? "");
  
  const [agreedToPolicy, setAgreedToPolicy] = useState(savedData.agreedToPolicy ?? false);
  const [accommodationWaitlist, setAccommodationWaitlist] = useState(savedData.accommodationWaitlist ?? false);
  const [childCount, setChildCount] = useState(savedData.childCount ?? 0);
  const [youthTicketType, setYouthTicketType] = useState<YouthTicketType>(savedData.youthTicketType ?? null);
  const [youthCount, setYouthCount] = useState(savedData.youthCount ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inventory, setInventory] = useState<TicketInventory[]>([]);
  const [lodgingEnabled, setLodgingEnabled] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [showKidsTickets, setShowKidsTickets] = useState(false);
  const [showHesitationMessage, setShowHesitationMessage] = useState(false);
  const [deferNonCriticalUi, setDeferNonCriticalUi] = useState(false);

  // Unified promo popup state — all triggers funnel into this
  const [showExitIntent, setShowExitIntent] = useState(false);
  const [mobilePromoDismissed, setMobilePromoDismissed] = useState(false);

  useEffect(() => {
    if (!upgradeSource || !upgradeIntent || !urlTicket) return;

    toast.success(`Upgrade path ready: ${ticketOptions.find((ticket) => ticket.id === urlTicket)?.name || "selected ticket"}`);
  }, [upgradeIntent, upgradeSource, urlTicket]);
  
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const isCheckoutActive = Boolean(selectedTicket);
  
  // Helper: should we show the promo popup?
  // - Suppress if they already CLAIMED a code (permanent for session)
  // - Suppress if shown <90s ago (cooldown to avoid spamming)
  // - But allow re-show after 90s if they only opened-then-dismissed without claiming.
  //   This rescues users whose form was accidentally closed mid-typing.
  const shouldShowPromo = useCallback(() => {
    if (mobilePromoDismissed) return false;
    if (isMobile && isCheckoutActive) return false;
    if (email) return false;
    if (showExitIntent) return false;
    if (sessionStorage.getItem("cosmico_hi_promo_claimed")) return false;
    const lastShown = Number(sessionStorage.getItem("cosmico_hi_promo_last_shown") || 0);
    if (lastShown && Date.now() - lastShown < 90_000) return false;
    return true;
  }, [email, showExitIntent, mobilePromoDismissed, isMobile, isCheckoutActive]);

  const showPromoPopup = useCallback(() => {
    if (shouldShowPromo()) {
      sessionStorage.setItem("cosmico_hi_promo_last_shown", String(Date.now()));
      setShowExitIntent(true);
    }
  }, [shouldShowPromo]);

  const handlePromoClose = useCallback(() => {
    setShowExitIntent(false);
    if (isMobile) {
      setMobilePromoDismissed(true);
      sessionStorage.setItem("cosmico_mobile_promo_dismissed", "1");
    }

    // Support chat remains available passively in the corner — no auto pop-up.
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    if (sessionStorage.getItem("cosmico_mobile_promo_dismissed")) {
      setMobilePromoDismissed(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !showExitIntent || !isCheckoutActive) return;
    setShowExitIntent(false);
    setMobilePromoDismissed(true);
    sessionStorage.setItem("cosmico_mobile_promo_dismissed", "1");
  }, [isMobile, showExitIntent, isCheckoutActive]);

  // Desktop: exit-intent (mouse leaves top)
  useHighIntentDetection(showPromoPopup, { enabled: true });
  useExitIntent(showPromoPopup, { enabled: true, sessionKey: "exit_intent_tickets" });

  // Idle hesitation: 45s mobile, 90s desktop
  useIdleHesitation(showPromoPopup, { enabled: true, idleMs: isMobile ? 45_000 : 90_000 });

  // Scroll depth trigger: scrolled past 65% then scrolled back up
  useScrollDepthTrigger(showPromoPopup, { enabled: true, depthPercent: 65 });

  // Mobile: visibility change (tab switch / app switch = leaving)
  useEffect(() => {
    if (!isMobile) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // User is leaving — mark intent. Show popup when they come back.
        const shouldShow = !email && !sessionStorage.getItem("cosmico_hi_promo_shown");
        if (shouldShow) {
          sessionStorage.setItem("cosmico_mobile_intent", "1");
        }
      } else if (document.visibilityState === "visible") {
        // User came back — show popup if they had intent
        if (sessionStorage.getItem("cosmico_mobile_intent")) {
          sessionStorage.removeItem("cosmico_mobile_intent");
          showPromoPopup();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isMobile, email, showPromoPopup]);

  // Mobile: timed popup after 30s on page (no exit signal needed)
  useEffect(() => {
    if (!isMobile) return;
    if (sessionStorage.getItem("cosmico_hi_promo_shown")) return;
    const timer = setTimeout(() => {
      showPromoPopup();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isMobile, showPromoPopup]);

  // Real-time checkout field capture (saves as user types, even before clicking Continue)
  useRealtimeFieldCapture({ name, email, phone, ticketType: selectedTicket, enabled: true });

  // Notify-me waitlist state
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState<Record<string, boolean>>({});

  const handleWaitlistSignup = async (ticketType: string, ticketName: string) => {
    const trimmed = waitlistEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email");
      return;
    }
    setWaitlistSubmitting(true);
    try {
      await supabase.from("ticket_waitlist").insert({
        email: trimmed,
        name: name || trimmed.split("@")[0],
        ticket_type: ticketType,
      });

      const sessionId = sessionStorage.getItem("cart_session_id") || crypto.randomUUID();
      await supabase.from("cart_intent_signals").insert({
        session_id: sessionId,
        signal_type: "waitlist_signup",
        email: trimmed,
        ticket_type: ticketType,
      });

      setWaitlistSubmitted(prev => ({ ...prev, [ticketType]: true }));
      toast.success(`We'll notify you when ${ticketName} becomes available!`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setWaitlistSubmitting(false);
    }
  };


  // Patrons checkout state
  const [patronsCheckoutPackage, setPatronsCheckoutPackage] = useState<PatronsPackageType | null>(null);
  const [patronsName, setPatronsName] = useState(savedPatronsData.patronsName ?? "");
  const [patronsEmail, setPatronsEmail] = useState(savedPatronsData.patronsEmail ?? "");
  const [isPatronsSubmitting, setIsPatronsSubmitting] = useState(false);
  
  const checkoutFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedTicket) return;

    const fetchLodgingSettings = async () => {
      const { data } = await supabase
        .from("lodging_settings")
        .select("lodging_enabled")
        .limit(1)
        .single();
      
      if (data) {
        setLodgingEnabled(data.lodging_enabled);
      }
    };
    
    fetchLodgingSettings();
  }, [selectedTicket]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const enableDeferredUi = () => {
      if (!cancelled) {
        setDeferNonCriticalUi(true);
      }
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(enableDeferredUi, { timeout: 1800 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timer = setTimeout(enableDeferredUi, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const { data, error } = await supabase
          .from("ticket_inventory")
          .select("ticket_type, total_quantity, sold_quantity, reserved_for_offers")
          .in("ticket_type", ["tier_1_krewe_3day", "tier_1_vip_3day", "tier_1_ga_2day", "tier_1_ga_friday", "tier_1_ga_saturday"]);
        
        if (error) {
          console.error("Error fetching inventory:", error);
          return;
        }
        
        setInventory(data || []);
        
        if (data) {
          const selectedInventory = data.find(inv => inv.ticket_type === savedData.selectedTicket);
          if (selectedInventory) {
            const publicAvailable = selectedInventory.total_quantity - selectedInventory.sold_quantity - selectedInventory.reserved_for_offers;
            if (publicAvailable <= 0) {
              setSelectedTicket(null);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching inventory:", err);
      }
    };
    
    fetchInventory();
  }, []);

  // Track view_item on tickets page load (fires once)
  useEffect(() => {
    trackGA4ViewItem({
      item_id: "analog_reunion_ticket",
      item_name: "Cosmico Ticket",
      item_category: "Festival Ticket",
      price: 215, // Default GA price
    });

    // Track view_item_list — user sees all ticket options
    trackGA4ViewItemList({
      item_list_id: "ticket_options",
      item_list_name: "Cosmico Ticket Options",
      items: ticketOptions.map(t => ({
        item_id: t.id,
        item_name: t.name + " — " + t.duration,
        item_category: "Festival Ticket",
        price: t.price,
        quantity: 1,
      })),
    });

    // Scroll depth tracking
    const cleanup = initScrollDepthTracking();
    trackPageView("/tickets");
    Funnel.tickets();
    return cleanup;
  }, []);

  const matchedSelectedOption = selectedTicket
    ? ticketOptions.find((ticket) => ticket.id === selectedTicket)
    : undefined;

  const normalizedCheckoutEmail = email.trim().toLowerCase();
  const isCheckoutEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedCheckoutEmail);

  let resolvedSelection: ReturnType<typeof createCheckoutTicketSelection> | null = null;
  if (selectedTicket && matchedSelectedOption) {
    try {
      resolvedSelection = createCheckoutTicketSelection({
        selectedTicket,
        selectedOption: matchedSelectedOption,
        quantity: quantity > 0 ? quantity : 1,
        name: name.trim() || "Guest",
        email: isCheckoutEmailValid ? normalizedCheckoutEmail : "placeholder@example.com",
        phone: phone.trim() || undefined,
        donation: 0,
        childCount,
        youthTicketType,
        youthCount,
        accommodationWaitlist,
      });
    } catch (err) {
      console.warn("[tickets] resolvedSelection build failed (non-fatal):", err);
      resolvedSelection = null;
    }
  }
  const selectedOption = resolvedSelection?.selectedOption;
  const isTicketSelectionReady = Boolean(resolvedSelection);
  const ticketSelectionError = selectedTicket && !selectedOption
    ? "We’re refreshing your ticket selection. Please reselect your pass before continuing."
    : null;
  const isLodgingEligible = resolvedSelection && !["tier_1_ga_2day", "tier_1_ga_friday", "tier_1_ga_saturday"].includes(resolvedSelection.selectedTicket);

  useEffect(() => {
    if (!selectedTicket || !selectedOption) return;

    Funnel.checkoutStart({
      ticket_type: selectedTicket,
      quantity,
      ticket_price: selectedOption.price,
    });
  }, [selectedTicket, selectedOption, quantity]);

  useEffect(() => {
    if (!resolvedSelection) {
      lastTrackedResolvedTicketRef.current = null;
      return;
    }

    if (lastTrackedResolvedTicketRef.current === resolvedSelection.selectedTicket) return;

    lastTrackedResolvedTicketRef.current = resolvedSelection.selectedTicket;
    trackTicketSelect(resolvedSelection.selectedTicket, 1);
    trackGA4SelectItem({
      item_list_id: "ticket_options",
      item_list_name: "Cosmico Ticket Options",
      item: {
        item_id: resolvedSelection.selectedTicket,
        item_name: resolvedSelection.ticketName,
        item_category: "Festival Ticket",
        price: resolvedSelection.ticketPrice,
        quantity: 1,
      },
    });
    trackGA4AddToCart({
      value: resolvedSelection.ticketPrice,
      currency: "USD",
      items: [{
        item_id: resolvedSelection.selectedTicket,
        item_name: resolvedSelection.ticketName,
        item_category: "Festival Ticket",
        price: resolvedSelection.ticketPrice,
        quantity: 1,
      }],
    });
  }, [resolvedSelection, trackTicketSelect]);

  const getTicketsRemaining = (ticketType: TicketType): number | null => {
    const inv = inventory.find(i => i.ticket_type === ticketType);
    if (!inv) return null;
    return Math.max(0, inv.total_quantity - inv.sold_quantity - inv.reserved_for_offers);
  };

  const isTicketSoldOut = (ticketType: TicketType): boolean => {
    const inv = inventory.find(i => i.ticket_type === ticketType);
    if (!inv) return false;
    const publicAvailable = inv.total_quantity - inv.sold_quantity - inv.reserved_for_offers;
    return publicAvailable <= 0;
  };

  useEffect(() => {
    const formData: FormData = {
      selectedTicket,
      quantity,
      name,
      email,
      phone,
      agreedToPolicy,
      accommodationWaitlist,
      childCount,
      youthTicketType,
      youthCount,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [selectedTicket, quantity, name, email, phone, agreedToPolicy, accommodationWaitlist, childCount, youthTicketType, youthCount]);

  // Reset youth ticket when adult ticket changes
  useEffect(() => {
    if (!selectedTicket) {
      setChildCount(0);
      setYouthCount(0);
      setYouthTicketType(null);
      return;
    }
    // If ticket is Saturday-only, youth must be Saturday-only
    if (selectedTicket === "tier_1_ga_saturday") {
      if (youthTicketType === "youth_2day") {
        setYouthTicketType("youth_saturday");
      }
    }
    // If ticket is Friday-only, no youth tickets (Saturday only for youth)
    if (selectedTicket === "tier_1_ga_friday") {
      setYouthCount(0);
      setYouthTicketType(null);
    }
  }, [selectedTicket]);

  // Persist patrons form data
  useEffect(() => {
    const patronsFormData: PatronsFormData = {
      patronsName,
      patronsEmail,
    };
    localStorage.setItem(PATRONS_STORAGE_KEY, JSON.stringify(patronsFormData));
  }, [patronsName, patronsEmail]);

  useEffect(() => {
    if (selectedTicket && checkoutFormRef.current) {
      setTimeout(() => {
        checkoutFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [selectedTicket]);

  const handlePatronsCheckout = async (packageType: PatronsPackageType) => {
    if (!patronsName || !patronsEmail) {
      toast.error("Please enter your name and email");
      return;
    }

    setIsPatronsSubmitting(true);

    const { data, error } = await invokeCheckout<{ url?: string; icEventId?: string }>(
      "create-patrons-checkout",
      { packageType, name: patronsName, email: patronsEmail }
    );

    if (error) {
      console.error("Patrons checkout error:", error.rawMessage);
      showCheckoutErrorToast(error, () => void handlePatronsCheckout(packageType));
      setIsPatronsSubmitting(false);
      return;
    }

    if (data?.url) {
      const patronsValue = packageType === "ultimate" ? 10000 : 5000;
      trackGA4BeginCheckout({
        value: patronsValue,
        currency: "USD",
        icEventId: data.icEventId,
        items: [{
          item_id: packageType,
          item_name: packageType === "ultimate" ? "Ultimate Patron Package" : "Premier Patron Package",
          item_category: "Festival Ticket",
          price: patronsValue,
          quantity: 1,
        }],
      });
      redirectToExternal(data.url);
    } else {
      toast.error("Unable to start checkout. Please try again.");
      setIsPatronsSubmitting(false);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resolvedSelection || !name || !email) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!isCheckoutEmailValid) {
      toast.error("Please enter a valid email");
      return;
    }

    // Track checkout intent signal
    trackCheckoutSubmit(resolvedSelection.selectedTicket, normalizedCheckoutEmail, name);

    // Ensure checkout_abandonment record exists for recovery automation
    // (mobile users may skip onBlur and debounce may not fire before navigation)
    supabase.functions.invoke('upsert-checkout-abandonment', {
      body: {
        email: normalizedCheckoutEmail,
        name: name || null,
        ticket_type: resolvedSelection.selectedTicket || null,
        phone: phone.trim() || null,
      },
    }).then(
      () => console.log('[checkout] Abandonment record ensured on submit'),
      () => { /* Silent fail - best-effort */ }
    );

    // Set enhanced conversions user data for Google Ads attribution
    setGoogleUserData({ email, firstName: name.split(" ")[0], lastName: name.split(" ").slice(1).join(" ") });

    if (!agreedToPolicy) {
      toast.error("Please agree to the purchase policy");
      return;
    }

    if (isLodgingEligible && lodgingEnabled) {
      sessionStorage.setItem(CHECKOUT_TICKET_STORAGE_KEY, JSON.stringify(resolvedSelection));
      Funnel.ticketSelected({
        ticket_type: resolvedSelection.selectedTicket,
        quantity,
        next_step: "lodging",
      });
      navigate("/checkout/lodging");
      return;
    }

    // Save ticket data and go to cart review
    sessionStorage.setItem(CHECKOUT_TICKET_STORAGE_KEY, JSON.stringify({
      ...resolvedSelection,
      accommodationWaitlist: !["tier_1_ga_2day", "tier_1_ga_friday", "tier_1_ga_saturday"].includes(resolvedSelection.selectedTicket) ? accommodationWaitlist : false,
    }));
    Funnel.ticketSelected({
      ticket_type: resolvedSelection.selectedTicket,
      quantity,
      next_step: "addons",
    });
    navigate("/checkout/addons");
  };




  const subtotal = selectedOption ? selectedOption.price * quantity : 0;
  const youthSubtotal = youthTicketType && youthCount > 0 ? YOUTH_PRICES[youthTicketType] * youthCount : 0;
  const donationAmount = 0;
  
  // Calculate fees (only show if NOT going to accommodations flow)
  const { fees: calculatedFees, totalFees } = useCheckoutFees({
    ticketSubtotal: subtotal * 100,
    lodgingSubtotal: 0,  // Will be added in accommodations page if applicable
    donationAmount: 0,
  });
  
  // If lodging is enabled, fees will be calculated on accommodations page
  const showFeesPreview = !lodgingEnabled;
  const total = subtotal + youthSubtotal + (showFeesPreview ? totalFees / 100 : 0);
  
  // Payment plan hook — total in cents
  const cartTotalCents = Math.round(total * 100);
  const { breakdown: paymentPlanBreakdown } = usePaymentPlan(cartTotalCents);

  // Determine which youth options are available based on adult ticket
  const getYouthOptions = (): { value: YouthTicketType; label: string; price: number }[] => {
    if (!selectedTicket) return [];
    // Friday only - no youth tickets
    if (selectedTicket === "tier_1_ga_friday") return [];
    // Saturday only - only Saturday youth
    if (selectedTicket === "tier_1_ga_saturday") {
      return [{ value: "youth_saturday", label: "Saturday Only", price: 60 }];
    }
    // 2-day or 3-day passes - both options
    return [
      { value: "youth_2day", label: "2-Day (Fri + Sat)", price: 100 },
      { value: "youth_saturday", label: "Saturday Only", price: 60 },
    ];
  };
  const youthOptions = getYouthOptions();

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
          <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px' }}>
            MAY 14–16, 2027
          </span>
        </div>
      </header>

      <main className="pt-24 pb-20 md:pb-20 pb-32 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header - Event Context */}
          <div className="text-center mb-6">
            <h1 
              style={{ 
                ...typography.headline, 
                color: COLORS.charcoal,
                fontSize: 'clamp(28px, 5vw, 40px)',
                marginBottom: '12px'
              }}
            >
              Cosmico 2026
            </h1>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '16px', lineHeight: 1.6 }}>
              Three days of music, river swims, and real-world connection in Example County.
            </p>
            <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '12px', letterSpacing: '0.1em', marginTop: '12px' }}>
              MAY 14–16, 2027 · EXAMPLE VALLEY, CA
            </p>
            <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '11px', opacity: 0.6, letterSpacing: '0.08em', marginTop: '4px' }}>
              LIMITED TO 700 ATTENDEES
            </p>
          </div>

          {/* Existing Ticket Holder Access Panel */}
          <ManageBookingPanel
            defaultEmail={savedData.email ?? ""}
            helperText="Bought tickets already? Use the same email to view tickets, add lodging, or purchase add-ons."
            mode="linkOnly"
            className="max-w-3xl mx-auto mt-5 mb-4"
          />




          {/* Weekend Details - Collapsible */}
          <div className="max-w-3xl mx-auto mb-10">
            <div 
              className="rounded-xl border overflow-hidden"
              style={{ 
                backgroundColor: COLORS.white,
                borderColor: `${COLORS.charcoal}15`
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const nextExpanded = !detailsExpanded;
                  setDetailsExpanded(nextExpanded);
                  if (nextExpanded) {
                    trackDetailsExpanded(selectedTicket || undefined);
                  }
                }}
                className="w-full p-5 flex items-center justify-between text-left"
              >
                <p 
                  style={{ 
                    ...typography.subhead, 
                    color: COLORS.charcoal,
                    fontSize: '16px',
                  }}
                >
                  Weekend Details
                </p>
                <span className="flex items-center gap-1.5" style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                  {detailsExpanded ? 'Hide' : 'View details'}
                  <ChevronDown 
                    className="w-4 h-4 transition-transform duration-200" 
                    style={{ 
                      color: COLORS.boulder,
                      transform: detailsExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                    }} 
                  />
                </span>
              </button>
              {detailsExpanded && (
                <div className="px-5 pb-5 pt-0">
                  <ul className="space-y-2" style={{ ...typography.body, fontSize: '13px' }}>
                    <li className="flex items-start gap-2">
                      <span style={{ color: COLORS.clay, marginTop: '2px' }}>—</span>
                      <span style={{ color: COLORS.boulder }}>
                        <strong style={{ color: COLORS.charcoal }}>Cosmico Weekend</strong>
                      </span>
                    </li>
                    <ul className="ml-5 space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span style={{ color: COLORS.boulder }}>•</span>
                        <span style={{ color: COLORS.boulder }}>
                          <strong style={{ color: COLORS.charcoal }}>Fri May 15 & Sat May 16</strong> — Example Meadow
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span style={{ color: COLORS.boulder }}>•</span>
                        <span style={{ color: COLORS.boulder }}>
                          <strong style={{ color: COLORS.charcoal }}>Sun May 17</strong> — Crew & VIP creek gathering
                        </span>
                      </li>
                    </ul>
                    <li className="flex items-start gap-2">
                      <span style={{ color: COLORS.clay, marginTop: '2px' }}>—</span>
                      <span style={{ color: COLORS.boulder }}>
                        <strong style={{ color: COLORS.charcoal }}>Tier 2 Pricing:</strong> Current pricing — limited availability.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span style={{ color: COLORS.clay, marginTop: '2px' }}>—</span>
                      <span style={{ color: COLORS.boulder }}>
                        <strong style={{ color: COLORS.charcoal }}>Accommodations:</strong> On-site glamping at Example Meadow opens this week. VIP ticket required.
                      </span>
                    </li>
                  </ul>
                  <p 
                    className="mt-3 pt-3 border-t"
                    style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', borderColor: `${COLORS.charcoal}10` }}
                  >
                    Early Bird tickets sold out in the first release.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Progress Indicator */}
          <CheckoutProgress currentStep={selectedTicket ? 2 : 1} />

          {/* Social Proof Ticker */}
          {deferNonCriticalUi && (
            <Suspense fallback={null}>
              <SocialProofTicker />
            </Suspense>
          )}

          {(upgradeSource || upgradeIntent) && selectedTicket && (
            <div
              className="max-w-2xl mx-auto mb-6 rounded-xl border p-4"
              style={{ backgroundColor: `${COLORS.clay}08`, borderColor: `${COLORS.clay}25` }}
            >
              <p style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', letterSpacing: '0.08em' }}>
                UPGRADE IN PROGRESS
              </p>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', marginTop: '6px', lineHeight: 1.55 }}>
                We preselected <strong>{ticketOptions.find((ticket) => ticket.id === selectedTicket)?.name || "your upgrade"}</strong> so you can review the new tier and continue through checkout faster.
              </p>
            </div>
          )}

          {/* Ticket Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-16 max-w-2xl mx-auto">
            {ticketOptions.map((ticket) => {
              const soldOut = isTicketSoldOut(ticket.id);
              const isSelected = selectedTicket === ticket.id;
              const remaining = getTicketsRemaining(ticket.id);
              const isLowStock = remaining !== null && remaining > 0 && remaining <= 40;
              
              return (
                <button
                  key={ticket.id}
                  onClick={() => {
                    if (!soldOut) {
                      setSelectedTicket(ticket.id);
                    }
                  }}
                  disabled={soldOut}
                  className="group relative text-left p-6 rounded-xl border-2 transition-all duration-200"
                  style={{
                    backgroundColor: isSelected ? `${COLORS.clay}08` : COLORS.white,
                    borderColor: soldOut 
                      ? `${COLORS.boulder}30` 
                      : isSelected 
                        ? COLORS.clay 
                        : ticket.highlight 
                          ? `${COLORS.clay}50`
                          : `${COLORS.charcoal}15`,
                    opacity: soldOut ? 0.6 : 1,
                    cursor: soldOut ? 'not-allowed' : 'pointer',
                  }}
                >
                  {/* Badge */}
                  {soldOut ? (
                    <span 
                      className="absolute -top-3 left-4 px-2.5 py-0.5 text-xs rounded-full"
                      style={{ backgroundColor: COLORS.boulder, color: COLORS.white }}
                    >
                      Sold Out
                    </span>
                  ) : ticket.highlight ? (
                    <span 
                      className="absolute -top-3 left-4 px-2.5 py-0.5 text-xs rounded-full"
                      style={{ backgroundColor: COLORS.clay, color: COLORS.white }}
                    >
                      {upgradeIntent && selectedTicket === ticket.id ? 'Recommended Upgrade' : 'Most Popular'}
                    </span>
                  ) : null}

                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div 
                      className="p-2 rounded-lg"
                      style={{ 
                        backgroundColor: soldOut ? `${COLORS.boulder}20` : `${COLORS.clay}15`,
                        color: soldOut ? COLORS.boulder : COLORS.clay
                      }}
                    >
                      {ticket.icon}
                    </div>
                    {isSelected && !soldOut && (
                      <div 
                        className="p-1 rounded-full"
                        style={{ backgroundColor: COLORS.clay }}
                      >
                        <Check className="w-4 h-4" style={{ color: COLORS.white }} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <h3 
                    style={{ 
                      ...typography.subhead, 
                      color: soldOut ? COLORS.boulder : COLORS.charcoal,
                      fontSize: '20px',
                      marginBottom: '2px',
                      letterSpacing: '0.02em'
                    }}
                  >
                    {ticket.name}
                  </h3>
                  {ticket.description && (
                    <p 
                      style={{ 
                        ...typography.caption, 
                        color: COLORS.clay,
                        fontSize: '11px',
                        marginBottom: '4px'
                      }}
                    >
                      {ticket.description}
                    </p>
                  )}
                  <p 
                    style={{ 
                      ...typography.body, 
                      color: COLORS.boulder,
                      fontSize: '13px',
                      marginBottom: '16px'
                    }}
                  >
                    {ticket.duration}
            </p>

                  {/* Price */}
                  <div className="flex items-baseline gap-2 mb-1">
                    <p 
                      style={{ 
                        ...typography.subhead, 
                        color: soldOut ? COLORS.boulder : COLORS.charcoal,
                        fontSize: '28px',
                      }}
                    >
                      ${ticket.price}
                    </p>
                    <p 
                      style={{ 
                        ...typography.body, 
                        color: COLORS.boulder,
                        fontSize: '14px',
                        textDecoration: 'line-through',
                        opacity: 0.5,
                      }}
                    >
                      ${TIER_2_PRICES[ticket.id]}
                    </p>
                  </div>
                  <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.05em' }}>
                    TIER 2 — LIMITED AVAILABILITY
                  </p>
                  {isLowStock && !soldOut && (
                    <p style={{ ...typography.caption, color: '#b45309', fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>
                      Only {remaining} left at this price
                    </p>
                  )}



                  {/* Features */}
                  <ul className="space-y-2">
                    {ticket.features.map((feature, idx) => (
                      <li 
                        key={idx}
                        className="flex items-center gap-2"
                        style={{ 
                          ...typography.body, 
                          color: soldOut ? COLORS.boulder : COLORS.charcoal,
                          fontSize: '13px',
                          opacity: soldOut ? 0.7 : 0.85
                        }}
                      >
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: soldOut ? COLORS.boulder : COLORS.clay }} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* Bottom select prompt / Notify Me */}
                  <div 
                    className="mt-6 pt-4 border-t text-center transition-opacity"
                    style={{ 
                      borderColor: `${COLORS.charcoal}10`,
                      opacity: soldOut ? 1 : isSelected ? 1 : 0.6
                    }}
                  >
                    {soldOut ? (
                      waitlistSubmitted[ticket.id] ? (
                        <span style={{ ...typography.body, fontSize: '13px', fontWeight: 500, color: COLORS.clay }}>
                          ✓ We'll notify you
                        </span>
                      ) : (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <p style={{ ...typography.body, fontSize: '12px', color: COLORS.boulder }}>
                            Get notified if spots open up
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              placeholder="your@email.com"
                              value={waitlistEmail}
                              onChange={(e) => setWaitlistEmail(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 px-3 py-1.5 rounded-md border text-sm"
                              style={{
                                backgroundColor: COLORS.dustySky,
                                borderColor: `${COLORS.charcoal}15`,
                                color: COLORS.charcoal,
                                fontSize: '12px',
                              }}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleWaitlistSignup(ticket.id, ticket.name);
                              }}
                              disabled={waitlistSubmitting}
                              className="px-3 py-1.5 rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                              style={{
                                backgroundColor: COLORS.clay,
                                color: COLORS.white,
                                border: 'none',
                              }}
                            >
                              {waitlistSubmitting ? "..." : "Notify"}
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <span 
                        style={{ 
                          ...typography.body,
                          fontSize: '13px',
                          fontWeight: 500,
                          color: isSelected ? COLORS.clay : COLORS.boulder
                        }}
                      >
                        {isSelected ? "✓ Selected" : "Select this ticket →"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Emotional reinforcement — subtle quote */}
          {isTicketSelectionReady && (
            <div className="max-w-md mx-auto mb-10 mt-2 text-center">
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px', lineHeight: 1.8, fontStyle: 'italic' }}>
                By Monday morning, people are saying it:
              </p>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', lineHeight: 1.8, fontStyle: 'italic', marginTop: '4px' }}>
                "Wow… I needed that. That was my favorite weekend of the year."
              </p>
            </div>
          )}

          {/* Checkout Form */}
          {selectedTicket && (
            <div 
              ref={checkoutFormRef}
              className="max-w-md mx-auto p-6 rounded-xl border"
              style={{ 
                backgroundColor: COLORS.white,
                borderColor: `${COLORS.charcoal}15`
              }}
            >
              <h2 
                style={{ 
                  ...typography.subhead, 
                  color: COLORS.charcoal,
                  fontSize: '20px',
                  marginBottom: '20px',
                  textAlign: 'center'
                }}
              >
                Complete Your Order
              </h2>

              {ticketSelectionError && (
                <div
                  className="mb-6 flex items-start gap-3 rounded-lg border p-4"
                  style={{
                    backgroundColor: `${COLORS.clay}08`,
                    borderColor: `${COLORS.clay}25`,
                  }}
                  role="alert"
                  aria-live="polite"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: COLORS.clay }} />
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', lineHeight: 1.5 }}>
                    {ticketSelectionError}
                  </p>
                </div>
              )}

              {/* Selected ticket summary */}
              <div 
                className="p-4 rounded-lg mb-6"
                style={{ backgroundColor: COLORS.dustySky }}
              >
                {selectedOption ? (
                  <div className="flex justify-between items-center">
                    <div>
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontWeight: 500 }}>
                        {selectedOption.name} — {selectedOption.duration}
                      </p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                        Current Price
                      </p>
                    </div>
                    <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '20px' }}>
                      ${selectedOption.price}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: COLORS.clay }} />
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                      Resolving selected ticket details…
                    </p>
                  </div>
                )}
              </div>

              <form id="checkout-form" onSubmit={handleCheckout} className="space-y-4">
                {/* Bringing Kids - Collapsible */}
                {selectedTicket !== "tier_1_ga_friday" && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowKidsTickets(!showKidsTickets)}
                      className="text-left"
                      style={{ ...typography.body, color: COLORS.clay, fontSize: '13px', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    >
                      Bringing kids?
                    </button>
                    {showKidsTickets && (
                      <div 
                        className="mt-3 p-4 rounded-lg border"
                        style={{ 
                          backgroundColor: COLORS.white,
                          borderColor: `${COLORS.charcoal}15`
                        }}
                      >
                        {/* Child tickets */}
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>
                              Child (0–12)
                            </span>
                            <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}> — Free</span>
                          </div>
                          <select
                            value={childCount}
                            onChange={(e) => setChildCount(Number(e.target.value))}
                            className="w-20 h-8 px-2 rounded-md border text-sm"
                            style={{ 
                              backgroundColor: COLORS.dustySky,
                              borderColor: `${COLORS.charcoal}15`,
                              color: COLORS.charcoal
                            }}
                          >
                            {[0, 1, 2, 3].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>

                        {/* Youth tickets */}
                        {youthOptions.length > 0 && (
                          <div className="pt-3 border-t" style={{ borderColor: `${COLORS.charcoal}10` }}>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px' }}>
                                  Youth (13–17)
                                </span>
                              </div>
                              <select
                                value={youthCount}
                                onChange={(e) => {
                                  const count = Number(e.target.value);
                                  setYouthCount(count);
                                  if (count > 0 && !youthTicketType && youthOptions.length > 0) {
                                    setYouthTicketType(youthOptions[0].value);
                                  }
                                  if (count === 0) {
                                    setYouthTicketType(null);
                                  }
                                }}
                                className="w-20 h-8 px-2 rounded-md border text-sm"
                                style={{ 
                                  backgroundColor: COLORS.dustySky,
                                  borderColor: `${COLORS.charcoal}15`,
                                  color: COLORS.charcoal
                                }}
                              >
                                {[0, 1, 2, 3, 4].map((n) => (
                                  <option key={n} value={n}>{n}</option>
                                ))}
                              </select>
                            </div>
                            {youthCount > 0 && (
                              <div className="flex gap-2 mt-2">
                                {youthOptions.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setYouthTicketType(opt.value)}
                                    className="flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all"
                                    style={{
                                      backgroundColor: youthTicketType === opt.value ? COLORS.clay : COLORS.dustySky,
                                      color: youthTicketType === opt.value ? COLORS.white : COLORS.charcoal,
                                      border: `1px solid ${youthTicketType === opt.value ? COLORS.clay : `${COLORS.charcoal}15`}`
                                    }}
                                  >
                                    {opt.label} — ${opt.price}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <p 
                          className="mt-3 pt-3 border-t"
                          style={{ 
                            ...typography.body, 
                            color: COLORS.boulder, 
                            fontSize: '11px',
                            borderColor: `${COLORS.charcoal}10`
                          }}
                        >
                          All attendees, including children, must be ticketed. Family tickets are GA. Anyone under 18 must attend with an adult.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Name */}
                <div>
                  <Label htmlFor="checkout-name" style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    Full Name
                  </Label>
                  <Input
                    id="checkout-name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    className="mt-1 h-12 text-base"
                    style={{ 
                      backgroundColor: COLORS.dustySky,
                      borderColor: `${COLORS.charcoal}15`,
                      color: COLORS.charcoal,
                      fontSize: '16px', // 16px prevents iOS auto-zoom on focus
                    }}
                  />
                </div>

                {/* Email */}
                <div>
                  <Label htmlFor="checkout-email" style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    Email
                  </Label>
                  <Input
                    id="checkout-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => {
                      if (email && email.includes('@') && email.includes('.')) {
                        // Track email capture for intent-based lead recovery
                        trackEmailCapture(email.toLowerCase().trim(), name || undefined, selectedTicket || undefined);
                        supabase.functions.invoke('upsert-checkout-abandonment', {
                          body: {
                            email: email.toLowerCase().trim(),
                            name: name || null,
                            ticket_type: selectedTicket || null,
                          },
                        }).then(
                          () => console.log('[checkout] Email captured for follow-up'),
                          () => { /* Silent fail - best-effort capture */ }
                        );
                      }
                    }}
                    required
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    className="mt-1 h-12 text-base"
                    style={{ 
                      backgroundColor: COLORS.dustySky,
                      borderColor: `${COLORS.charcoal}15`,
                      color: COLORS.charcoal,
                      fontSize: '16px', // 16px prevents iOS auto-zoom on focus
                    }}
                  />
                </div>

                {/* Phone */}
                <div>
                  <Label htmlFor="checkout-phone" style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    Phone
                  </Label>
                  <Input
                    id="checkout-phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    required
                    className="mt-1 h-12 text-base"
                    style={{ 
                      backgroundColor: COLORS.dustySky,
                      borderColor: `${COLORS.charcoal}15`,
                      color: COLORS.charcoal,
                      fontSize: '16px', // 16px prevents iOS auto-zoom on focus
                    }}
                  />
                  <p className="text-xs mt-1" style={{ color: COLORS.boulder, fontSize: '10px' }}>
                    For order confirmation & updates
                  </p>
                </div>

                {/* Quantity */}
                <div>
                  <Label style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    Quantity
                  </Label>
                  <select
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full mt-1 h-10 px-3 rounded-md border"
                    style={{ 
                      backgroundColor: COLORS.dustySky,
                      borderColor: `${COLORS.charcoal}15`,
                      color: COLORS.charcoal
                    }}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n} {n === 1 ? "ticket" : "tickets"}</option>
                    ))}
                  </select>
                </div>





                {/* Order Summary */}
                <div 
                  className="py-4 border-t space-y-2"
                  style={{ borderColor: `${COLORS.charcoal}10` }}
                >
                  <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '11px', letterSpacing: '0.1em', marginBottom: '12px' }}>
                    ORDER SUMMARY
                  </p>
                  <div className="flex justify-between">
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                      {selectedOption?.name ?? "Selected ticket"}
                    </span>
                    <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                      ${subtotal}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                      {selectedOption ? `${quantity}x $${selectedOption.price}` : "Waiting for ticket pricing"}
                    </span>
                  </div>
                  {childCount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                        Child Tickets ({childCount}x $0)
                      </span>
                      <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                        $0
                      </span>
                    </div>
                  )}
                  {youthCount > 0 && youthTicketType && (
                    <div className="flex justify-between">
                      <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                        Youth Tickets ({youthCount}x ${YOUTH_PRICES[youthTicketType]})
                      </span>
                      <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                        ${youthSubtotal}
                      </span>
                    </div>
                  )}
                  {/* Fees - only show if NOT going to accommodations */}
                  {showFeesPreview && calculatedFees.length > 0 && (
                    <FeeBreakdown fees={calculatedFees} className="pt-2" />
                  )}
                  {/* Note about fees if going to accommodations */}
                  {lodgingEnabled && (
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', fontStyle: 'italic', paddingTop: '8px' }}>
                      Fees calculated at checkout
                    </p>
                  )}
                  <div className="flex justify-between pt-2 border-t" style={{ borderColor: `${COLORS.charcoal}10` }}>
                    <span style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '12px', letterSpacing: '0.08em' }}>
                      TOTAL
                    </span>
                    <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '22px' }}>
                      ${showFeesPreview ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (subtotal + youthSubtotal)}
                    </span>
                  </div>
                </div>








                {/* Accommodations callout */}
                {lodgingEnabled ? (
                  isLodgingEligible ? (
                    <div 
                      className="p-4 rounded-lg border"
                      style={{ 
                        backgroundColor: `${COLORS.clay}05`,
                        borderColor: `${COLORS.clay}20`
                      }}
                    >
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
                        On-site glamping available
                      </p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.5 }}>
                        Your {selectedOption?.name ?? "selected"} ticket qualifies for on-site accommodations at Example Meadow. You can browse and add glamping after selecting your tickets.{" "}
                        <a href="/stay#pricing" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70" style={{ color: COLORS.clay }}>View lodging details →</a>
                      </p>
                    </div>
                  ) : (
                    <div 
                      className="p-4 rounded-lg border"
                      style={{ 
                        backgroundColor: `${COLORS.boulder}08`,
                        borderColor: `${COLORS.charcoal}10`
                      }}
                    >
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
                        On-site glamping at Example Meadow
                      </p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.5, marginBottom: '8px' }}>
                        Glamping is available exclusively to VIP 3-day ticket holders.
                      </p>
                      <a
                        href="#tickets"
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedTicket("tier_1_vip_3day");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-sm"
                        style={{ ...typography.body, color: COLORS.clay, fontSize: '12px', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                      >
                        Upgrade to VIP to stay on-site →
                      </a>
                    </div>
                  )
                ) : null}

                {/* Policy Agreement */}
                <div 
                  className="p-4 rounded-lg"
                  style={{ backgroundColor: COLORS.dustySky }}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="policy"
                      checked={agreedToPolicy}
                      onCheckedChange={(checked) => setAgreedToPolicy(checked as boolean)}
                      className="mt-0.5"
                    />
                    <label 
                      htmlFor="policy"
                      className="cursor-pointer"
                      style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.5 }}
                    >
                      I understand that all ticket sales are final. Tickets are transferable. I agree to the{" "}
                      <Link 
                        to="/terms" 
                        className="underline hover:opacity-70"
                        style={{ color: COLORS.clay }}
                      >
                        Terms & Conditions
                      </Link>{" "}
                      and{" "}
                      <Link 
                        to="/privacy" 
                        className="underline hover:opacity-70"
                        style={{ color: COLORS.clay }}
                      >
                        Privacy Policy
                      </Link>.
                    </label>
                  </div>
                </div>

                {/* Submit Buttons */}
                {isLodgingEligible && lodgingEnabled ? (
                  <div className="space-y-3">
                    <button
                      type="submit"
                      disabled={isSubmitting || !agreedToPolicy || !isTicketSelectionReady}
                      className="w-full h-14 flex items-center justify-center gap-2 uppercase hover:opacity-80 transition-opacity"
                      style={{
                        ...typography.button,
                        backgroundColor: COLORS.clay,
                        color: COLORS.white,
                        borderRadius: '0',
                        border: 'none',
                        letterSpacing: '0.05em',
                        fontSize: '14px',
                        opacity: (isSubmitting || !agreedToPolicy || !isTicketSelectionReady) ? 0.5 : 1,
                        cursor: (isSubmitting || !agreedToPolicy || !isTicketSelectionReady) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Continue to Lodging
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedTicket || !selectedOption || !name || !email || !agreedToPolicy) {
                          toast.error("Please fill in all required fields");
                          return;
                        }
                        if (!resolvedSelection) {
                          toast.error("Please reselect your ticket before continuing");
                          return;
                        }
                        sessionStorage.setItem(CHECKOUT_TICKET_STORAGE_KEY, JSON.stringify({
                          ...resolvedSelection,
                          accommodationWaitlist,
                        }));
                        Funnel.ticketSelected({
                          ticket_type: resolvedSelection.selectedTicket,
                          quantity,
                          next_step: "addons",
                        });
                        navigate("/checkout/addons");
                      }}
                      disabled={isSubmitting || !agreedToPolicy || !isTicketSelectionReady}
                      className="w-full text-center py-2 hover:opacity-70 transition-opacity"
                      style={{
                        ...typography.body,
                        color: COLORS.boulder,
                        fontSize: '13px',
                        background: 'none',
                        border: 'none',
                        cursor: (isSubmitting || !agreedToPolicy || !isTicketSelectionReady) ? 'not-allowed' : 'pointer',
                        opacity: (isSubmitting || !agreedToPolicy || !isTicketSelectionReady) ? 0.5 : 1,
                      }}
                    >
                      Skip lodging, review order →
                    </button>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting || !agreedToPolicy || !isTicketSelectionReady}
                    className="w-full h-12 uppercase hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
                    style={{
                      ...typography.button,
                      backgroundColor: COLORS.clay,
                      color: COLORS.white,
                      borderRadius: '0',
                      border: 'none',
                      letterSpacing: '0.05em',
                      fontSize: '14px',
                      opacity: (isSubmitting || !agreedToPolicy || !isTicketSelectionReady) ? 0.5 : 1,
                      cursor: (isSubmitting || !agreedToPolicy || !isTicketSelectionReady) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Review & Pay
                  </button>
                )}

                {/* Logistical reassurance */}
                <div className="pt-3 space-y-1">
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', textAlign: 'center' }}>
                    Parking, arrival details & a welcome guide are sent after purchase.
                  </p>
                  <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', textAlign: 'center' }}>
                    Questions? Our team is here to help —{' '}
                    <Link to="/contact" className="underline hover:opacity-70" style={{ color: COLORS.clay }}>
                      reach out anytime
                    </Link>.
                  </p>
                </div>
              </form>

              {/* Trust signals + Stripe */}
              <div className="mt-4 space-y-3 text-center">
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                  Secure checkout powered by Stripe
                </p>
                <div>
                  <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '9px', letterSpacing: '0.1em', marginBottom: '10px', opacity: 0.5 }}>
                    AS SEEN IN
                  </p>
                  <div className="flex items-center justify-center gap-6">
                    <img src={pressKCRW} alt="KCRW" loading="lazy" className="h-6 w-auto" style={{ opacity: 0.35, filter: 'grayscale(100%)' }} />
                    <img src={pressSonomaMag} alt="Example Valley Magazine" loading="lazy" className="h-5 w-auto" style={{ opacity: 0.35, filter: 'grayscale(100%)' }} />
                    <img src={pressPD} alt="The Press Democrat" loading="lazy" className="h-4 w-auto" style={{ opacity: 0.35, filter: 'grayscale(100%)' }} />
                  </div>
                </div>
              </div>

              {/* Secondary links below CTA */}
              <div className="mt-5 space-y-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowHesitationMessage(!showHesitationMessage)}
                  className="inline-flex items-center gap-1 mx-auto hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer"
                  style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                >
                  Not sure yet?
                  <ChevronDown 
                    className="w-3 h-3 transition-transform duration-200" 
                    style={{ 
                      color: COLORS.boulder,
                      transform: showHesitationMessage ? 'rotate(180deg)' : 'rotate(0deg)'
                    }} 
                  />
                </button>

                {showHesitationMessage && (
                  <div 
                    className="p-4 rounded-lg mt-3 text-left space-y-3"
                    style={{ backgroundColor: COLORS.dustySky }}
                  >
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', lineHeight: 1.6 }}>
                      If you're on the fence, you're not alone.
                      We'll send you what you need to decide if this is right for you.
                    </p>
                    <div className="pt-1">
                      <EmailCapture
                        variant="stacked"
                        headline=""
                        subheadline=""
                        buttonText="Keep Me in the Loop"
                      />
                    </div>
                  </div>
                )}

                <Link
                  to="/get-involved"
                  className="block mx-auto hover:opacity-70 transition-opacity"
                  style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}
                >
                  Join the crew →
                </Link>
              </div>
            </div>
          )}

          {/* Back Link */}
          <div className="text-center mt-12">
            <Link 
              to="/"
              className="hover:opacity-70 transition-opacity"
              style={{ ...typography.body, color: COLORS.clay, fontSize: '14px' }}
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>

      {/* Sticky mobile CTA bar - only shows when a ticket is selected but form is not in view */}
      {selectedTicket && selectedOption && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t backdrop-blur-md"
          style={{ 
            backgroundColor: `${COLORS.white}f5`,
            borderColor: `${COLORS.charcoal}15`,
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
                {selectedOption.name}
              </p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                ${selectedOption.price} × {quantity}
              </p>
            </div>
            <button
              type="submit"
              form="checkout-form"
              onClick={(e) => {
                // If required fields aren't filled, scroll to the form instead of letting
                // native validation fire on an offscreen input (which silently does nothing).
                if (!name || !email || !agreedToPolicy) {
                  e.preventDefault();
                  checkoutFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  if (!agreedToPolicy) {
                    toast.error("Please agree to the purchase policy");
                  } else {
                    toast.error("Please fill in your name and email");
                  }
                }
                // Otherwise let the native form submit fire handleCheckout
              }}
              className="px-5 py-2.5 uppercase hover:opacity-80 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                border: 'none',
                fontSize: '12px',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}
            >
              Review & Pay
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer 
        className="py-8 px-6 border-t"
        style={{ borderColor: `${COLORS.charcoal}10` }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
            {PRODUCER.name ? (
              <>
                Cosmico is produced by{" "}
                {PRODUCER.url ? (
                  <a
                    href={PRODUCER.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-70"
                    style={{ color: COLORS.charcoal }}
                  >
                    {PRODUCER.name}
                  </a>
                ) : (
                  PRODUCER.name
                )}
                {PRODUCER.description ? `, ${PRODUCER.description}` : "."}
              </>
            ) : null}
          </p>
        </div>
      </footer>

      {/* Promo Popup — unified for all triggers */}
      {deferNonCriticalUi && (
        <Suspense fallback={null}>
          <ExitIntentPopup
            open={showExitIntent}
            onClose={handlePromoClose}
            mode={isMobile ? "sheet" : "modal"}
            autoCloseMs={isMobile ? 12000 : undefined}
          />
        </Suspense>
      )}
    </div>
  );
};

export default MayTickets;
