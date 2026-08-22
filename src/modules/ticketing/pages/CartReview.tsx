import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, typography } from "@/styles/may-theme";
import { usePaymentPlan, formatPaymentDate, formatCentsToDollars } from "@/hooks/usePaymentPlan";
import { useCheckoutFees } from "@/hooks/useCheckoutFees";
import { FeeBreakdown } from "@/components/checkout/FeeBreakdown";
import { CheckoutProgress } from "@/components/checkout/CheckoutProgress";
import { CalendarDays, ArrowLeft, Loader2, ShieldCheck, Lock, CreditCard, Tag, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import { trackGA4BeginCheckout, getFbCookies, getClientIp } from "@/components/AnalyticsTracking";
import { getStoredUTMParams } from "@/hooks/useUTMTracking";
import { Funnel } from "@/lib/analytics";
import { usePromoCode } from "@/hooks/usePromoCode";
import { reportCheckoutError } from "@/hooks/useCheckoutErrorReporting";
import { categorizeStripeFailure } from "@/lib/stripeFailureCategory";
import { getPaymentRetryMetadata } from "@/lib/analytics";
import { invokeCheckoutOrThrow, CheckoutHttpError, showCheckoutErrorToast } from "@/lib/checkoutInvoke";
import { redirectToExternal } from "@/lib/safeRedirect";

const TICKET_STORAGE_KEY = "cosmico_checkout_ticket";
const CART_PERSIST_KEY = "cosmico_cart_persist";
const ADDON_STORAGE_KEY = "cosmico_checkout_addons";
const CART_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

const YOUTH_PRICES: Record<string, number> = {
  youth_2day: 100,
  youth_saturday: 60,
};

interface TicketData {
  ticketType: string;
  ticketName: string;
  ticketPrice: number;
  quantity: number;
  name: string;
  email: string;
  phone?: string;
  donation?: number;
  childCount: number;
  youthTicketType: string | null;
  youthCount: number;
  accommodationWaitlist?: boolean;
}

interface LodgingData {
  zoneKey: string | null;
  zoneName: string | null;
  zonePrice: number;
  lodgingQuantity: number;
  familyUnitId: string | null;
  familyUnitName: string | null;
  familyUnitPrice: number;
  preferences: string | null;
}

interface AddonData {
  inventoryId: string;
  addonType: string;
  displayName: string;
  unitPrice: number; // cents
  quantity: number;
  hasDietaryRestrictions?: boolean;
  dietaryRestrictions?: string;
}

export default function CartReview() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [lodgingData, setLodgingData] = useState<LodgingData | null>(null);
  const [addonData, setAddonData] = useState<AddonData[]>([]);
  const [usePaymentPlanCheckout, setUsePaymentPlanCheckout] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promoExpanded, setPromoExpanded] = useState(false);
  const { promoCode, setPromoCode, appliedPromo, isValidating, error: promoError, validatePromo, calculateDiscount, removePromo } = usePromoCode();

  useEffect(() => {
    Funnel.reviewView();
    // Try sessionStorage first, fall back to localStorage for returning users
    let raw = sessionStorage.getItem(TICKET_STORAGE_KEY);
    if (!raw) {
      const persisted = localStorage.getItem(CART_PERSIST_KEY);
      if (persisted) {
        try {
          const { data, timestamp } = JSON.parse(persisted);
          if (Date.now() - timestamp < CART_TTL_MS) {
            raw = JSON.stringify(data);
            sessionStorage.setItem(TICKET_STORAGE_KEY, raw);
          } else {
            localStorage.removeItem(CART_PERSIST_KEY);
          }
        } catch { /* expired or corrupt */ }
      }
    }
    if (!raw) {
      navigate("/tickets", { replace: true });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setTicketData(parsed);
      // Persist to localStorage for abandonment recovery
      localStorage.setItem(CART_PERSIST_KEY, JSON.stringify({ data: parsed, timestamp: Date.now() }));
    } catch {
      navigate("/tickets", { replace: true });
    }

    // Check for lodging data
    const lodgingRaw = sessionStorage.getItem("cosmico_checkout_lodging");
    if (lodgingRaw) {
      try {
        setLodgingData(JSON.parse(lodgingRaw));
      } catch { /* no lodging */ }
    }

    // Check for addon data
    const addonRaw = sessionStorage.getItem(ADDON_STORAGE_KEY);
    if (addonRaw) {
      try {
        setAddonData(JSON.parse(addonRaw));
      } catch { /* no addons */ }
    }
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") !== "true") return;

    const failureCategory = categorizeStripeFailure({
      error_message: "Customer returned from Stripe without completing payment",
      request_payload: {
        canceled: params.get("canceled"),
        return_path: window.location.pathname,
        search: window.location.search,
      },
    });

    Funnel.paymentFailed({
      flow: lodgingData && (lodgingData.zoneKey || lodgingData.familyUnitId) ? "lodging" : "full_pay",
      stage: "post_redirect_return",
      failure_category: failureCategory,
      ticket_type: ticketData?.ticketType || "unknown",
    });

    reportCheckoutError({
      error_type: "redirect",
      error_message: "Customer returned from Stripe without completing payment",
      failure_category: failureCategory,
      ticket_type: ticketData?.ticketType,
      user_email: ticketData?.email,
      request_payload: {
        flow: lodgingData && (lodgingData.zoneKey || lodgingData.familyUnitId) ? "lodging" : "full_pay",
        return_path: window.location.pathname,
        search: window.location.search,
      },
    });
  }, [ticketData?.ticketType, ticketData?.email, lodgingData]);

  // Auto-apply promo code from high-intent popup
  useEffect(() => {
    const autoPromo = sessionStorage.getItem("cosmico_auto_promo");
    if (autoPromo && ticketData && !appliedPromo) {
      setPromoCode(autoPromo);
      validatePromo(autoPromo, ticketData.email, ticketData.ticketType, ticketData.ticketPrice * ticketData.quantity)
        .then((result) => {
          if (result) {
            toast.success("Your exclusive 20% off tickets has been applied!");
          }
          sessionStorage.removeItem("cosmico_auto_promo");
        });
    }
  }, [ticketData, appliedPromo, validatePromo, setPromoCode]);

  // Calculate totals
  const ticketSubtotal = ticketData ? ticketData.ticketPrice * ticketData.quantity : 0;
  const youthSubtotal = ticketData?.youthTicketType && ticketData.youthCount > 0
    ? YOUTH_PRICES[ticketData.youthTicketType] * ticketData.youthCount
    : 0;
  
  const lodgingSubtotal = lodgingData
    ? lodgingData.familyUnitId
      ? lodgingData.familyUnitPrice
      : lodgingData.zonePrice * lodgingData.lodgingQuantity
    : 0;

  const addonSubtotal = addonData.reduce((sum, a) => sum + (a.unitPrice / 100) * a.quantity, 0);

  const { fees, totalFees } = useCheckoutFees({
    ticketSubtotal: Math.round(ticketSubtotal * 100),
    lodgingSubtotal: Math.round(lodgingSubtotal * 100),
    donationAmount: 0,
  });

  const ticketBaseForPromo = ticketSubtotal + youthSubtotal;
  const discountAmount = calculateDiscount(ticketBaseForPromo);
  // Waive service fees when promo fully covers ticket cost (e.g. 100% off comp)
  const feesWaived = ticketBaseForPromo > 0 && discountAmount >= ticketBaseForPromo;
  const effectiveFees = feesWaived ? fees.map(f => ({ ...f, amount: 0 })) : fees;
  const effectiveTotalFeesCents = feesWaived ? 0 : totalFees;
  const subtotalBeforeDiscount = ticketSubtotal + youthSubtotal + lodgingSubtotal + addonSubtotal + effectiveTotalFeesCents / 100;
  const orderTotal = subtotalBeforeDiscount - discountAmount;
  const cartTotalCents = Math.round(orderTotal * 100);
  const { breakdown } = usePaymentPlan(cartTotalCents);
  const primaryCtaLabel = usePaymentPlanCheckout && breakdown.available
    ? `Reserve for ${formatCentsToDollars(breakdown.firstPayment)} today`
    : "Continue to Secure Payment";
  const mobileSummaryLabel = usePaymentPlanCheckout && breakdown.available
    ? `${breakdown.paymentCount} payments · ${formatCentsToDollars(breakdown.firstPayment)} today`
    : "One-time payment";

  if (!ticketData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dustySky }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: COLORS.boulder }} />
      </div>
    );
  }

  const handleCheckout = async () => {
    if (!ticketData) return;

    const retryMetadata = getPaymentRetryMetadata();

    Funnel.checkoutSubmit({
      ticket_type: ticketData.ticketType,
      cart_total_cents: cartTotalCents,
      payment_plan: usePaymentPlanCheckout && breakdown.available,
      promo_applied: !!appliedPromo,
    });

    // Payment plan checkout — call edge function directly
    if (usePaymentPlanCheckout && breakdown.available) {
      setIsSubmitting(true);
      try {
        const { fbp, fbc } = getFbCookies();
        const ticketName = ticketData.ticketName?.split(" — ")[0] || ticketData.ticketType;
        const ticketDuration = ticketData.ticketName?.split(" — ")[1] || "";

        const cartLineItems: { name: string; amount: number; quantity: number }[] = [];
        cartLineItems.push({
          name: `${ticketName} — ${ticketDuration}`,
          amount: Math.round(ticketData.ticketPrice * 100),
          quantity: ticketData.quantity,
        });
        if (ticketData.youthTicketType && ticketData.youthCount > 0) {
          const youthLabel = ticketData.youthTicketType === "youth_2day" ? "Youth — 2 Day" : "Youth — Saturday";
          cartLineItems.push({
            name: youthLabel,
            amount: Math.round(YOUTH_PRICES[ticketData.youthTicketType] * 100),
            quantity: ticketData.youthCount,
          });
        }

        const cartDescription = `${ticketName} — ${ticketDuration}${ticketData.youthCount > 0 ? ` + ${ticketData.youthCount} Youth` : ""}`;

        const data = await invokeCheckoutOrThrow<{ url?: string }>("create-payment-plan-checkout", {
          cartTotal: cartTotalCents,
          cartDescription,
          cartLineItems,
          name: ticketData.name,
          email: ticketData.email,
          phone: ticketData.phone || undefined,
          ticketType: ticketData.ticketType,
          fbp,
          fbc,
        });

        if (data?.url) {
          trackGA4BeginCheckout({
            value: cartTotalCents / 100,
            currency: "USD",
            items: [{
              item_id: ticketData.ticketType,
              item_name: ticketData.ticketName,
              item_category: "Festival Ticket",
              price: ticketData.ticketPrice,
              quantity: ticketData.quantity,
            }],
          });
          Funnel.checkoutComplete({
            ticket_type: ticketData.ticketType,
            cart_total_cents: cartTotalCents,
            payment_plan: true,
            ...(retryMetadata || {}),
          });
          Funnel.paymentRedirect({ flow: "payment_plan" });
          sessionStorage.removeItem(TICKET_STORAGE_KEY);
          sessionStorage.removeItem("cosmico_checkout_lodging");
          sessionStorage.removeItem(ADDON_STORAGE_KEY);
          localStorage.removeItem(CART_PERSIST_KEY);
          redirectToExternal(data.url);
        } else {
          throw new Error("No checkout URL returned");
        }
      } catch (error: any) {
        console.error("Payment plan checkout error:", error);
        const rawMessage = error instanceof CheckoutHttpError ? error.rawMessage : (error?.message || String(error));
        const failureCategory = categorizeStripeFailure({
          error_code: error?.code,
          error_message: rawMessage,
          request_payload: { flow: "payment_plan", stage: "checkout_session_creation" },
        });
        Funnel.paymentSessionFailed({
          flow: "payment_plan",
          stage: "checkout_session_creation",
          failure_category: failureCategory,
          error: rawMessage.slice(0, 200),
          ...(retryMetadata || {}),
        });
        if (error instanceof CheckoutHttpError) {
          showCheckoutErrorToast({ message: error.message, rawMessage: error.rawMessage, status: error.status, retryable: error.retryable }, () => void handleCheckout());
        } else {
          toast.error(error?.message || "Unable to start checkout. Please try again.");
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Full pay checkout
    setIsSubmitting(true);

    try {
      const { fbp, fbc } = getFbCookies();
      const clientIp = await getClientIp();

      const hasLodging = lodgingData && (lodgingData.zoneKey || lodgingData.familyUnitId);

      let checkoutResponse;

      if (hasLodging) {
        // Lodging checkout
        checkoutResponse = await invokeCheckoutOrThrow<{ url?: string; icEventId?: string }>("create-lodging-checkout", {
          ticketType: ticketData.ticketType,
          ticketQuantity: ticketData.quantity,
          name: ticketData.name,
          email: ticketData.email,
          donationAmount: 0,
          lodgingZoneKey: lodgingData.familyUnitId ? null : lodgingData.zoneKey,
          lodgingQuantity: lodgingData.familyUnitId ? 0 : lodgingData.lodgingQuantity,
          familyUnitId: lodgingData.familyUnitId || null,
          preferences: lodgingData.preferences,
          childCount: ticketData.childCount,
          youthTicketType: ticketData.youthTicketType,
          youthCount: ticketData.youthCount,
          fbp,
          fbc,
          client_ip: clientIp || undefined,
          client_user_agent: navigator.userAgent,
        });
      } else {
        // Ticket-only checkout (may include add-ons)
        checkoutResponse = await invokeCheckoutOrThrow<{ url?: string; icEventId?: string }>("create-cosmico-checkout", {
          ticketType: ticketData.ticketType,
          quantity: ticketData.quantity,
          name: ticketData.name,
          email: ticketData.email,
          phone: ticketData.phone || undefined,
          donationAmount: 0,
          accommodationWaitlist: ticketData.accommodationWaitlist || false,
          childCount: ticketData.childCount,
          youthTicketType: ticketData.youthTicketType,
          youthCount: ticketData.youthCount,
          promoCode: appliedPromo?.code || undefined,
          addons: addonData.length > 0 ? addonData.map(a => ({
            inventoryId: a.inventoryId,
            addonType: a.addonType,
            displayName: a.displayName,
            unitPrice: a.unitPrice,
            quantity: a.quantity,
            hasDietaryRestrictions: !!a.hasDietaryRestrictions,
            dietaryRestrictions: a.hasDietaryRestrictions ? (a.dietaryRestrictions ?? "") : undefined,
          })) : undefined,
          fbp,
          fbc,
          client_ip: clientIp || undefined,
          client_user_agent: navigator.userAgent,
          event_source_url: window.location.href.startsWith("https://example.org")
            ? window.location.href
            : `https://example.org${window.location.pathname}`,
          attribution: getStoredUTMParams(),
        });
      }

      if (checkoutResponse?.url) {
        // NOTE: Successful Stripe redirect is no longer logged to checkout_errors —
        // it was polluting the error report. Funnel.paymentRedirect captures this transition.

        trackGA4BeginCheckout({
          value: orderTotal,
          currency: "USD",
          icEventId: checkoutResponse.icEventId,
          items: [{
            item_id: ticketData.ticketType,
            item_name: ticketData.ticketName,
            item_category: "Festival Ticket",
            price: ticketData.ticketPrice,
            quantity: ticketData.quantity,
          }],
        });
        Funnel.checkoutComplete({
          ticket_type: ticketData.ticketType,
          cart_total_cents: cartTotalCents,
          payment_plan: false,
          has_lodging: !!hasLodging,
          ...(retryMetadata || {}),
        });
        Funnel.paymentRedirect({ flow: hasLodging ? "lodging" : "full_pay" });
        sessionStorage.removeItem(TICKET_STORAGE_KEY);
        sessionStorage.removeItem("cosmico_checkout_lodging");
        sessionStorage.removeItem(ADDON_STORAGE_KEY);
        localStorage.removeItem(CART_PERSIST_KEY);
        redirectToExternal(checkoutResponse.url);
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      const rawMessage = error instanceof CheckoutHttpError ? error.rawMessage : (error?.message || "Unable to start Stripe checkout");
      const failureCategory = categorizeStripeFailure({
        error_code: error?.code,
        error_message: rawMessage,
        request_payload: {
          flow: lodgingData && (lodgingData.zoneKey || lodgingData.familyUnitId) ? "lodging" : "full_pay",
          has_lodging: !!(lodgingData && (lodgingData.zoneKey || lodgingData.familyUnitId)),
          addon_count: addonData.length,
          promo_code: appliedPromo?.code || null,
        },
      });
      reportCheckoutError({
        error_type: "stripe",
        error_message: rawMessage,
        error_code: error?.code,
        failure_category: failureCategory,
        ticket_type: ticketData?.ticketType,
        user_email: ticketData?.email,
        request_payload: {
          flow: lodgingData && (lodgingData.zoneKey || lodgingData.familyUnitId) ? "lodging" : "full_pay",
          has_lodging: !!(lodgingData && (lodgingData.zoneKey || lodgingData.familyUnitId)),
          addon_count: addonData.length,
          promo_code: appliedPromo?.code || null,
        },
        stack_trace: error?.stack,
      });
      Funnel.paymentSessionFailed({
        flow: "full_pay",
        stage: "checkout_session_creation",
        failure_category: failureCategory,
        error: rawMessage.slice(0, 200),
        ...(retryMetadata || {}),
      });
      if (error instanceof CheckoutHttpError) {
        showCheckoutErrorToast({ message: error.message, rawMessage: error.rawMessage, status: error.status, retryable: error.retryable }, () => void handleCheckout());
      } else {
        toast.error(error?.message || "Unable to start checkout. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const ticketLabel = ticketData.ticketName || ticketData.ticketType;

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      {/* Header */}
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b"
        style={{
          backgroundColor: `${COLORS.dustySky}f0`,
          borderColor: `${COLORS.charcoal}15`,
        }}
      >
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/">
            <img src={analogLogo} alt="Analog" className="h-8 md:h-10" />
          </Link>
          <span style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px' }}>
            MAY 14–16, 2027
          </span>
        </div>
      </header>

      <main className={`pt-24 px-6 ${isMobile ? 'pb-36' : 'pb-20'}`}>
        <div className="max-w-lg mx-auto">
          {/* Back link */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 mb-6 hover:opacity-70 transition-opacity"
            style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {/* Progress Indicator */}
          <CheckoutProgress currentStep={4} />

          {/* Card */}
          <div
            className="rounded-xl border p-6 md:p-8 space-y-6"
            style={{
              backgroundColor: COLORS.white,
              borderColor: `${COLORS.charcoal}10`,
            }}
          >
            {/* Title */}
            <div className="text-center space-y-1">
              <h1 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '22px' }}>
                Review Your Order
              </h1>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                {ticketData.name} · {ticketData.email}
              </p>
            </div>

            {/* Applied Promo Banner — prominent confirmation that discount is locked in */}
            {appliedPromo && (
              <div
                className="flex items-center justify-between rounded-lg px-4 py-3"
                style={{
                  backgroundColor: `${COLORS.clay}10`,
                  border: `1px solid ${COLORS.clay}40`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4" style={{ color: COLORS.clay }} />
                  <div className="flex flex-col">
                    <span style={{ ...typography.caption, color: COLORS.clay, fontSize: '10px', letterSpacing: '0.08em' }}>
                      DISCOUNT APPLIED
                    </span>
                    <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>
                      {appliedPromo.code} · {appliedPromo.discount_type === 'percentage' ? `${appliedPromo.discount_value}% off tickets` : `$${appliedPromo.discount_value} off`}
                    </span>
                  </div>
                </div>
                <span style={{ ...typography.subhead, color: COLORS.clay, fontSize: '16px', fontWeight: 600 }}>
                  −${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Order Items */}
            <div
              className="rounded-lg p-4 space-y-2"
              style={{ backgroundColor: `${COLORS.charcoal}04` }}
            >
              {/* Ticket line */}
              <div className="flex justify-between">
                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                  {ticketData.quantity}x {ticketLabel}
                </span>
                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
                  ${ticketSubtotal.toLocaleString()}
                </span>
              </div>

              {/* Youth tickets */}
              {ticketData.youthTicketType && ticketData.youthCount > 0 && (
                <div className="flex justify-between">
                  <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    {ticketData.youthCount}x Youth
                  </span>
                  <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    ${youthSubtotal.toLocaleString()}
                  </span>
                </div>
              )}

              {/* Child tickets */}
              {ticketData.childCount > 0 && (
                <div className="flex justify-between">
                  <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    {ticketData.childCount}x Child (Free)
                  </span>
                  <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    $0
                  </span>
                </div>
              )}

              {/* Lodging */}
              {lodgingData && (lodgingData.zoneKey || lodgingData.familyUnitId) && (
                <div className="flex justify-between pt-1">
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                    {lodgingData.familyUnitId
                      ? lodgingData.familyUnitName || "Glamping Unit"
                      : `${lodgingData.lodgingQuantity}x ${lodgingData.zoneName || "Lodging"}`}
                  </span>
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
                    ${lodgingSubtotal.toLocaleString()}
                  </span>
                </div>
              )}

              {/* Add-ons */}
              {addonData.map((addon) => (
                <div key={addon.inventoryId} className="flex justify-between pt-1">
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                    {addon.quantity}x {addon.displayName}
                  </span>
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
                    ${((addon.unitPrice / 100) * addon.quantity).toLocaleString()}
                  </span>
                </div>
              ))}

              {/* Fees */}
              {fees.length > 0 && (
                <FeeBreakdown fees={effectiveFees} className="pt-2" />
              )}

              {/* Promo Code */}
              <div className="pt-2" style={{ borderTop: `1px solid ${COLORS.charcoal}08` }}>
                {appliedPromo ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5" style={{ color: COLORS.clay }} />
                      <span style={{ ...typography.body, color: COLORS.clay, fontSize: '13px', fontWeight: 600 }}>
                        {appliedPromo.code}
                      </span>
                      <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
                        ({appliedPromo.discount_type === 'percentage' ? `${appliedPromo.discount_value}% off` : `$${appliedPromo.discount_value} off`})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ ...typography.body, color: COLORS.clay, fontSize: '13px', fontWeight: 600 }}>
                        -${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        onClick={removePromo}
                        className="p-1 rounded hover:opacity-70 transition-opacity"
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <X className="w-3.5 h-3.5" style={{ color: COLORS.boulder }} />
                      </button>
                    </div>
                  </div>
                ) : !isMobile || promoExpanded ? (
                  <div className="space-y-1.5">
                    {isMobile && (
                      <div className="flex items-center justify-between">
                        <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '13px', fontWeight: 600 }}>
                          Promo code
                        </span>
                        <button
                          type="button"
                          onClick={() => setPromoExpanded(false)}
                          className="hover:opacity-70 transition-opacity"
                          style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Hide
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Promo code"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        className="flex-1 px-3 py-2 text-sm rounded border outline-none"
                        style={{
                          borderColor: promoError ? (promoError.severity === 'error' ? '#c44' : '#c89456') : `${COLORS.charcoal}15`,
                          backgroundColor: COLORS.white,
                          fontFamily: 'monospace',
                          fontSize: '13px',
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && ticketData) {
                            validatePromo(promoCode, ticketData.email, ticketData.ticketType, ticketSubtotal + youthSubtotal);
                          }
                        }}
                      />
                      <button
                        onClick={() => ticketData && validatePromo(promoCode, ticketData.email, ticketData.ticketType, ticketSubtotal + youthSubtotal)}
                        disabled={isValidating || !promoCode.trim()}
                        className="px-4 py-2 text-sm transition-opacity hover:opacity-80"
                        style={{
                          ...typography.button,
                          backgroundColor: `${COLORS.charcoal}08`,
                          color: COLORS.charcoal,
                          border: `1px solid ${COLORS.charcoal}15`,
                          fontSize: '12px',
                          cursor: isValidating ? 'not-allowed' : 'pointer',
                          opacity: isValidating || !promoCode.trim() ? 0.5 : 1,
                        }}
                      >
                        {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                      </button>
                    </div>
                    {promoError && (
                      <div
                        role="alert"
                        style={{
                          marginTop: '4px',
                          padding: '8px 10px',
                          borderRadius: '4px',
                          backgroundColor: promoError.severity === 'error' ? '#c4441a14' : promoError.severity === 'warning' ? '#c8945614' : `${COLORS.charcoal}08`,
                          borderLeft: `2px solid ${promoError.severity === 'error' ? '#c44' : promoError.severity === 'warning' ? '#c89456' : COLORS.boulder}`,
                        }}
                      >
                        <p style={{ ...typography.body, color: promoError.severity === 'error' ? '#c44' : COLORS.charcoal, fontSize: '12px', fontWeight: 500, margin: 0 }}>
                          {promoError.title}
                        </p>
                        {promoError.detail && (
                          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', margin: '2px 0 0', lineHeight: 1.4 }}>
                            {promoError.detail}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPromoExpanded(true)}
                    className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <span className="flex items-center gap-2" style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                      <Tag className="w-3.5 h-3.5" style={{ color: COLORS.boulder }} />
                      Have a promo code?
                    </span>
                    <span style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.06em' }}>
                      ADD
                    </span>
                  </button>
                )}
              </div>

              {/* Total */}
              <div className="flex justify-between pt-2" style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}>
                <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>Total</span>
                <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '20px' }}>
                  ${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Payment Method — only show if payment plan is available */}
            {breakdown.available && (
              <div className="space-y-2">
                <p style={{ ...typography.caption, color: COLORS.charcoal, fontSize: '11px', letterSpacing: '0.1em' }}>
                  HOW WOULD YOU LIKE TO PAY?
                </p>

                {/* Pay in full */}
                <button
                  type="button"
                  onClick={() => setUsePaymentPlanCheckout(false)}
                  className="w-full flex justify-between items-center p-3.5 rounded-lg border-2 transition-all text-left"
                  style={{
                    borderColor: !usePaymentPlanCheckout ? COLORS.clay : `${COLORS.charcoal}15`,
                    backgroundColor: !usePaymentPlanCheckout ? `${COLORS.clay}06` : COLORS.white,
                  }}
                >
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: !usePaymentPlanCheckout ? 600 : 400 }}>
                    Pay in full
                  </span>
                  <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '15px' }}>
                    ${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </button>

                {/* Split payments */}
                <button
                  type="button"
                  onClick={() => setUsePaymentPlanCheckout(true)}
                  className="w-full text-left p-3.5 rounded-lg border-2 transition-all"
                  style={{
                    borderColor: usePaymentPlanCheckout ? COLORS.clay : `${COLORS.charcoal}15`,
                    backgroundColor: usePaymentPlanCheckout ? `${COLORS.clay}06` : COLORS.white,
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2" style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: usePaymentPlanCheckout ? 600 : 400 }}>
                      <CalendarDays className="w-4 h-4" style={{ color: COLORS.clay }} />
                      {breakdown.paymentCount} easy payments
                    </span>
                    <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '15px' }}>
                      {formatCentsToDollars(breakdown.firstPayment)} today
                    </span>
                  </div>

                  {/* Expanded schedule */}
                  {usePaymentPlanCheckout && (
                    <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}>
                      {breakdown.amounts.map((amount, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                              style={{
                                backgroundColor: i === 0 ? COLORS.clay : `${COLORS.charcoal}10`,
                                color: i === 0 ? COLORS.white : COLORS.boulder,
                                fontWeight: 600,
                              }}
                            >
                              {i + 1}
                            </div>
                            <span style={{ ...typography.body, color: i === 0 ? COLORS.charcoal : COLORS.boulder, fontSize: '12px' }}>
                              {formatPaymentDate(breakdown.dates[i])}
                              {i === 0 && " (today)"}
                            </span>
                          </div>
                          <span style={{ ...typography.body, color: i === 0 ? COLORS.charcoal : COLORS.boulder, fontSize: '12px', fontWeight: 500 }}>
                            {formatCentsToDollars(amount)}
                          </span>
                        </div>
                      ))}
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '10px', marginTop: '8px' }}>
                        Same total · No interest · No fees · Card saved securely
                      </p>
                    </div>
                  )}
                </button>
              </div>
            )}

            {/* Terms note for payment plan */}
            {usePaymentPlanCheckout && breakdown.available && (
              <div
                className="rounded-lg p-4 flex items-start gap-3"
                style={{ backgroundColor: `${COLORS.charcoal}04` }}
              >
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: COLORS.boulder }} />
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.5 }}>
                  Your card is saved securely and charged automatically on the dates above.
                  If any scheduled payment fails after 5 retry attempts over 14 days,
                  the remaining balance becomes due in full.
                  All ticket sales are final and non-refundable.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="text-center">
                <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                  {usePaymentPlanCheckout && breakdown.available
                    ? 'No interest or fees. Your total stays the same.'
                    : 'Secure checkout with instant confirmation.'}
                </p>
              </div>

              {/* CTA */}
              <button
                onClick={handleCheckout}
                disabled={isSubmitting}
                className="hidden md:flex w-full h-14 uppercase hover:opacity-80 transition-opacity items-center justify-center gap-2"
                style={{
                  ...typography.button,
                  backgroundColor: COLORS.clay,
                  color: COLORS.white,
                  borderRadius: '0',
                  border: 'none',
                  letterSpacing: '0.05em',
                  fontSize: '14px',
                  opacity: isSubmitting ? 0.5 : 1,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  primaryCtaLabel
                )}
              </button>

              {/* Trust signals */}
              <div className="flex flex-col items-center gap-2 pt-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                  <Lock className="w-3 h-3" />
                  256-bit SSL
                </span>
                <span className="flex items-center gap-1.5" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                  <ShieldCheck className="w-3 h-3" />
                  PCI Compliant
                </span>
                <span className="flex items-center gap-1.5" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
                  <CreditCard className="w-3 h-3" />
                  Stripe
                </span>
              </div>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '10px' }}>
                Trusted by 500+ attendees · Instant confirmation
              </p>
            </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky checkout bar */}
      {isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 border-t"
          style={{
            backgroundColor: `${COLORS.white}f5`,
            borderColor: `${COLORS.charcoal}12`,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>
                  {usePaymentPlanCheckout && breakdown.available ? 'DUE TODAY' : 'ORDER TOTAL'}
                </p>
                <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>
                  {usePaymentPlanCheckout && breakdown.available
                    ? formatCentsToDollars(breakdown.firstPayment)
                    : `$${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
              <p className="text-right" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', lineHeight: 1.3 }}>
                {mobileSummaryLabel}
              </p>
            </div>
            <button
              onClick={handleCheckout}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 uppercase hover:opacity-80 transition-opacity"
              style={{
                ...typography.button,
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                border: 'none',
                fontSize: '13px',
                letterSpacing: '0.05em',
                opacity: isSubmitting ? 0.5 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  {usePaymentPlanCheckout ? 'Reserve Spot' : 'Pay Securely'}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
