import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Calendar, MapPin, Mail, ArrowRight, CalendarPlus } from "lucide-react";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import { supabase } from "@/integrations/supabase/client";
import { trackGA4Purchase } from "@/components/AnalyticsTracking";
import { clearPaymentRetryContext, Funnel, getPaymentRetryMetadata, recordPaymentRetryContext } from "@/lib/analytics";
import { COLORS, typography, fadeInUp } from "@/styles/may-theme";
import { reportCheckoutError } from "@/hooks/useCheckoutErrorReporting";
import { categorizeStripeFailure } from "@/lib/stripeFailureCategory";
import { toast } from "sonner";
import { AddToAppleWalletButton } from "@/components/AddToAppleWalletButton";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/platform/config/env";

// Calendar event details
const EVENT_DETAILS = {
  title: "Cosmico",
  description: "Three days of music, wine, and community at Example Meadow near Example Valley, CA.\\n\\nMore info: https://example.org",
  location: "Example Meadow, Near Example Valley, CA",
  startDate: new Date("2026-05-15T14:00:00"),
  endDate: new Date("2026-05-17T22:00:00"),
};

// Generate Google Calendar URL
const generateGoogleCalendarUrl = () => {
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d{3}/g, "").slice(0, 15) + "Z";
  };
  
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: EVENT_DETAILS.title,
    dates: `${formatDate(EVENT_DETAILS.startDate)}/${formatDate(EVENT_DETAILS.endDate)}`,
    details: EVENT_DETAILS.description.replace("\\n", "\n"),
    location: EVENT_DETAILS.location,
  });
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// Generate ICS file content for Apple/Outlook
const generateIcsContent = () => {
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d{3}/g, "").slice(0, 15) + "Z";
  };
  
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Analog//Cosmico//EN
BEGIN:VEVENT
UID:analogcommons@example.org
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(EVENT_DETAILS.startDate)}
DTEND:${formatDate(EVENT_DETAILS.endDate)}
SUMMARY:${EVENT_DETAILS.title}
DESCRIPTION:${EVENT_DETAILS.description.replace("\\n", "\\n")}
LOCATION:${EVENT_DETAILS.location}
END:VEVENT
END:VCALENDAR`;
};

// Download ICS file
const downloadIcsFile = () => {
  const icsContent = generateIcsContent();
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "analog-commons.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Generate Outlook Web URL
const generateOutlookUrl = () => {
  const formatDate = (date: Date) => date.toISOString();
  
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: EVENT_DETAILS.title,
    startdt: formatDate(EVENT_DETAILS.startDate),
    enddt: formatDate(EVENT_DETAILS.endDate),
    body: EVENT_DETAILS.description.replace("\\n", "\n"),
    location: EVENT_DETAILS.location,
  });
  
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
};

interface OrderDetails {
  name: string;
  email: string;
  ticketType: string;
  quantity: number;
  totalAmount: number;
  registrationId?: string;
}

interface TicketRow {
  id: string;
  holder_name: string | null;
  holder_email: string | null;
  ticket_type: string;
}

interface PaymentFailureState {
  errorCode: string;
  failureCategory: string;
  message: string;
  ticketType?: string;
  customerEmail?: string;
}

const TICKET_NAMES: Record<string, string> = {
  tier_1_krewe_3day: "Crew — 3 Day Pass",
  tier_1_vip_3day: "VIP — 3 Day Pass",
  tier_1_ga_2day: "GA — 2 Day Pass",
  tier_1_ga_friday: "GA — Friday",
  tier_1_ga_saturday: "GA — Saturday",
};

const PATRONS_PACKAGES: Record<string, { name: string; amount: number }> = {
  ultimate: { name: "Ultimate Patrons Package", amount: 10000 },
  premier: { name: "Premier Patrons Package", amount: 5000 },
};

const PAYMENT_SYNC_MAX_ATTEMPTS = 8;
const PAYMENT_SYNC_INTERVAL_MS = 2000;
const AUTO_RECHECK_MAX_ATTEMPTS = 6;
const AUTO_RECHECK_INTERVAL_MS = 4000;
const VERIFICATION_DELAY_ERROR_CODES = new Set([
  "verify_payment_failed",
  "payment_not_completed",
  "ticket_success_verification_exception",
]);

const FAILURE_NEXT_STEPS: Record<string, { title: string; description: string; retryLabel: string }> = {
  incorrect_cvc: {
    title: "Security code didn’t match",
    description: "Double-check the CVC on your card and try payment again with the same billing details.",
    retryLabel: "Retry with updated CVC",
  },
  expired_card: {
    title: "Card appears to be expired",
    description: "Use a card with a current expiration date, then restart checkout.",
    retryLabel: "Retry with a different card",
  },
  insufficient_funds: {
    title: "Insufficient funds",
    description: "Try another payment method or check with your bank, then come back and complete checkout.",
    retryLabel: "Retry payment",
  },
  card_declined: {
    title: "Card was declined",
    description: "Your bank declined the charge. Try another card or contact your bank before retrying.",
    retryLabel: "Try another card",
  },
  verify_payment_failed: {
    title: "We couldn’t confirm payment yet",
    description: "Your bank may still be processing the charge. Retry once first — if you were charged, send the support note below and we’ll reconcile it fast.",
    retryLabel: "Retry checkout",
  },
  payment_not_completed: {
    title: "Payment wasn’t completed",
    description: "Stripe returned you before the payment fully completed. Start checkout again when you’re ready.",
    retryLabel: "Retry checkout",
  },
  ticket_success_verification_exception: {
    title: "We hit a confirmation issue",
    description: "Your payment may still be valid, but we couldn’t finish syncing it here. Copy the support note below if retrying doesn’t help.",
    retryLabel: "Retry checkout",
  },
};

const FAILURE_CATEGORY_FALLBACK: Record<string, { title: string; description: string; retryLabel: string }> = {
  incorrect_cvc: FAILURE_NEXT_STEPS.incorrect_cvc,
  expired_card: FAILURE_NEXT_STEPS.expired_card,
  insufficient_funds: FAILURE_NEXT_STEPS.insufficient_funds,
  card_declined: FAILURE_NEXT_STEPS.card_declined,
  network_error: {
    title: "Connection issue during payment",
    description: "A network error interrupted the confirmation step. Retry checkout on a stable connection.",
    retryLabel: "Retry checkout",
  },
  canceled: {
    title: "Checkout was canceled",
    description: "No problem — you can head back and complete checkout whenever you’re ready.",
    retryLabel: "Return to tickets",
  },
  unknown: {
    title: "We need one more step to confirm your order",
    description: "Retry checkout first. If this keeps happening, copy the note below so support can look up your Stripe session quickly.",
    retryLabel: "Retry checkout",
  },
};

const FAILURE_CHANGE_INSTRUCTIONS: Record<string, string[]> = {
  incorrect_cvc: [
    "Update the CVC/security code to the 3- or 4-digit code printed on the card you’re using.",
    "Keep the same card number, expiration date, and billing ZIP only if those details are already correct.",
  ],
  expired_card: [
    "Use a different card with a current expiration date.",
    "If you’re retrying with the same saved card, replace the expiration month and year before submitting.",
  ],
  insufficient_funds: [
    "Switch to another card or payment method with enough available balance.",
    "If you want to try the same card again, contact your bank first or move funds before retrying.",
  ],
};

const SUPPORT_EMAIL = "support@example.org";

const MayTicketSuccess = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const packageType = searchParams.get("package");
  const isPaymentPlan = searchParams.get("payment_plan") === "true";
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentFailure, setPaymentFailure] = useState<PaymentFailureState | null>(null);
  const [isAutoRechecking, setIsAutoRechecking] = useState(false);
  const [autoRecheckAttempt, setAutoRecheckAttempt] = useState(0);
  const [isManualChecking, setIsManualChecking] = useState(false);
  const [manualStatusMessage, setManualStatusMessage] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  // Fetch tickets once we have a confirmed registration
  useEffect(() => {
    const regId = orderDetails?.registrationId;
    if (!regId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, holder_name, holder_email, ticket_type")
        .eq("registration_id", regId)
        .eq("status", "active");
      if (!cancelled && data) setTickets(data as TicketRow[]);
    })();
    return () => { cancelled = true; };
  }, [orderDetails?.registrationId]);

  const isPatronsPackage = packageType && PATRONS_PACKAGES[packageType];
  const patronsPackage = isPatronsPackage ? PATRONS_PACKAGES[packageType] : null;

  // Clear form data on successful checkout
  useEffect(() => {
    localStorage.removeItem("cosmico_ticket_form");
    localStorage.removeItem("cosmico_patrons_form");
  }, []);

  const verifyAndFetchOrder = useCallback(async ({
    maxAttempts = PAYMENT_SYNC_MAX_ATTEMPTS,
    logFailures = true,
  }: {
    maxAttempts?: number;
    logFailures?: boolean;
  } = {}) => {
    if (!sessionId) return false;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
          "verify-payment",
          { body: { sessionId } }
        );

        if (verifyError) {
          console.error(`Payment verification error (attempt ${attempt}/${maxAttempts}):`, verifyError);
          // Transient verify failures (network/5xx) — keep retrying silently
          // and only surface the failure UI if we exhaust all attempts.
          if (attempt === maxAttempts) {
            setPaymentFailure({
              errorCode: "verify_payment_failed",
              failureCategory: "network_error",
              message: "We couldn't reach Stripe to confirm your payment. If your card was charged, refresh in a moment — your ticket will appear automatically.",
            });

            if (logFailures) {
              reportCheckoutError({
                error_type: "payment_verification",
                error_message: verifyError.message || "Stripe payment verification failed",
                error_code: "verify_payment_failed",
                request_payload: {
                  stripe_session_id: sessionId,
                  attempt,
                },
              });
            }
          }
        } else if (verifyData?.success) {
          console.log("Payment verified:", verifyData.alreadyProcessed ? "already processed" : "newly verified");
        } else if (verifyData && !verifyData.success) {
          const failureCategory = categorizeStripeFailure({
            error_code: verifyData.error_code,
            error_message: verifyData.message || "Stripe reported incomplete payment",
            stripe_session_status: verifyData.stripe_session_status,
            stripe_payment_status: verifyData.stripe_payment_status,
            payment_intent_status: verifyData.payment_intent_status,
            payment_intent_last_error: verifyData.payment_intent_last_error,
            request_payload: {
              stripe_session_id: sessionId,
              payment_intent_id: verifyData.payment_intent_id,
              registration_payment_status: verifyData.registration_payment_status,
              registration_id: verifyData.registration_id,
              attempt,
            },
          });

          setPaymentFailure({
            errorCode: verifyData.error_code || "payment_not_completed",
            failureCategory,
            message: verifyData.message || "Stripe reported incomplete payment",
            ticketType: verifyData.ticket_type,
            customerEmail: verifyData.customer_email,
          });

          if (logFailures) {
            const retryMetadata = getPaymentRetryMetadata();
            Funnel.paymentFailed({
              ticket_type: verifyData.ticket_type || "unknown",
              stripe_session_status: verifyData.stripe_session_status || "unknown",
              stripe_payment_status: verifyData.stripe_payment_status || "unknown",
              payment_intent_status: verifyData.payment_intent_status || "unknown",
              failure_category: failureCategory,
              error_code: verifyData.error_code || "payment_not_completed",
              stage: "post_redirect_verification",
                ...(retryMetadata || {}),
            });
            reportCheckoutError({
              error_type: "stripe",
              error_message: verifyData.message || "Stripe reported incomplete payment",
              error_code: verifyData.error_code || "payment_not_completed",
              failure_category: failureCategory,
              user_email: verifyData.customer_email,
              ticket_type: verifyData.ticket_type,
              request_payload: {
                stripe_session_id: sessionId,
                stripe_payment_status: verifyData.stripe_payment_status,
                stripe_session_status: verifyData.stripe_session_status,
                payment_intent_status: verifyData.payment_intent_status,
                payment_intent_last_error: verifyData.payment_intent_last_error,
                payment_intent_id: verifyData.payment_intent_id,
                registration_payment_status: verifyData.registration_payment_status,
                registration_id: verifyData.registration_id,
                attempt,
              },
            });
          }
        }

        const supabaseUrl = getSupabaseUrl();
        const supabaseKey = getSupabaseAnonKey();
        const regUrl = new URL(`${supabaseUrl}/rest/v1/registrations`);
        regUrl.searchParams.set("select", "id,name,email,ticket_type,quantity,total_amount,payment_status,meta_event_id");
        regUrl.searchParams.set("stripe_session_id", `eq.${sessionId}`);
        const regRes = await fetch(regUrl.toString(), {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "x-lookup-session": sessionId,
          },
        });
        const regRows = regRes.ok ? await regRes.json() : [];
        const data = regRows && regRows[0];
        const error = regRes.ok ? null : new Error(`status ${regRes.status}`);

        if (data && !error && data.payment_status === "paid") {
          setOrderDetails({
            name: data.name,
            email: data.email,
            ticketType: data.ticket_type,
            quantity: data.quantity,
            totalAmount: data.total_amount,
            registrationId: data.id,
          });
          setPaymentFailure(null);
          setAutoRecheckAttempt(0);

          const purchaseValue = data.total_amount / 100;
          trackGA4Purchase({
            transaction_id: (data as any).meta_event_id || sessionId,
            value: purchaseValue,
            currency: "USD",
            items: [{
              item_id: data.ticket_type,
              item_name: "Cosmico Ticket",
              item_category: "Festival Ticket",
              price: purchaseValue / (data.quantity || 1),
              quantity: data.quantity || 1,
            }],
            user_email: data.email,
            user_phone: (data as any).phone || undefined,
            user_name: data.name || undefined,
          });
          const retryMetadata = getPaymentRetryMetadata();
          Funnel.paymentSuccess({
            ticket_type: data.ticket_type,
            quantity: data.quantity || 1,
            value_cents: data.total_amount,
            ...(retryMetadata || {}),
          });
          clearPaymentRetryContext();
          return true;
        }

        if (error) {
          console.error("Order lookup error:", error);
        } else if (data?.payment_status && data.payment_status !== "paid") {
          console.warn(`Payment still syncing for this session (attempt ${attempt}/${maxAttempts})`);
          if (logFailures && attempt === maxAttempts) {
            reportCheckoutError({
              error_type: "payment_verification",
              error_message: "Registration remained unpaid after Stripe redirect polling window",
              ticket_type: data.ticket_type,
              user_email: data.email,
              request_payload: {
                stripe_session_id: sessionId,
                registration_payment_status: data.payment_status,
                attempt,
              },
            });
          }
        }

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, PAYMENT_SYNC_INTERVAL_MS));
        }
      }
    } catch (err) {
      console.error("Error verifying/fetching order:", err);
      const failureCategory = categorizeStripeFailure({
        error_code: "ticket_success_verification_exception",
        error_message: err instanceof Error ? err.message : "Unexpected payment verification failure",
        request_payload: {
          stripe_session_id: sessionId,
        },
      });
      setPaymentFailure({
        errorCode: "ticket_success_verification_exception",
        failureCategory,
        message: err instanceof Error ? err.message : "Unexpected payment verification failure",
      });

      if (logFailures) {
        const retryMetadata = getPaymentRetryMetadata();
        Funnel.paymentFailed({
          error_code: "ticket_success_verification_exception",
          stage: "post_redirect_verification",
          failure_category: failureCategory,
          error: err instanceof Error ? err.message.slice(0, 200) : "Unexpected payment verification failure",
          ...(retryMetadata || {}),
        });
        reportCheckoutError({
          error_type: "payment_verification",
          error_message: err instanceof Error ? err.message : "Unexpected payment verification failure",
          error_code: "ticket_success_verification_exception",
          failure_category: failureCategory,
          request_payload: {
            stripe_session_id: sessionId,
          },
          stack_trace: err instanceof Error ? err.stack : undefined,
        });
      }
    }

    return false;
  }, [sessionId]);

  useEffect(() => {
    const runInitialVerification = async () => {
      if (!sessionId) {
        setPaymentFailure({
          errorCode: "missing_session_id",
          failureCategory: "unknown",
          message: "We couldn’t verify this return because the Stripe session ID is missing.",
        });
        reportCheckoutError({
          error_type: "payment_verification",
          error_message: "Stripe return page loaded without a session_id",
          request_payload: {
            path: window.location.pathname,
            search: window.location.search,
          },
        });
        setLoading(false);
        return;
      }

      if (isPatronsPackage) {
        setLoading(false);
        return;
      }

      setAutoRecheckAttempt(0);

      try {
        await verifyAndFetchOrder();
      } finally {
        setLoading(false);
      }
    };

    runInitialVerification();
  }, [sessionId, isPatronsPackage, verifyAndFetchOrder]);

  const shouldAutoRecheck = useMemo(() => {
    if (!paymentFailure) return false;
    return VERIFICATION_DELAY_ERROR_CODES.has(paymentFailure.errorCode);
  }, [paymentFailure]);

  useEffect(() => {
    if (!sessionId || isPatronsPackage || loading || orderDetails || !shouldAutoRecheck) return;
    if (autoRecheckAttempt >= AUTO_RECHECK_MAX_ATTEMPTS) return;

    const timeoutId = window.setTimeout(async () => {
      setIsAutoRechecking(true);
      try {
        const resolved = await verifyAndFetchOrder({ maxAttempts: 1, logFailures: false });
        if (!resolved) {
          setAutoRecheckAttempt((current) => current + 1);
        }
      } finally {
        setIsAutoRechecking(false);
      }
    }, AUTO_RECHECK_INTERVAL_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    autoRecheckAttempt,
    isPatronsPackage,
    loading,
    orderDetails,
    sessionId,
    shouldAutoRecheck,
    verifyAndFetchOrder,
  ]);

  const failureGuidance = useMemo(() => {
    if (!paymentFailure) return null;
    return FAILURE_NEXT_STEPS[paymentFailure.errorCode]
      || FAILURE_CATEGORY_FALLBACK[paymentFailure.failureCategory]
      || FAILURE_CATEGORY_FALLBACK.unknown;
  }, [paymentFailure]);

  const failureChangeInstructions = useMemo(() => {
    if (!paymentFailure) return [];
    return FAILURE_CHANGE_INSTRUCTIONS[paymentFailure.errorCode]
      || FAILURE_CHANGE_INSTRUCTIONS[paymentFailure.failureCategory]
      || [];
  }, [paymentFailure]);

  const supportMessage = useMemo(() => {
    if (!paymentFailure) return "";
    return [
      "Hi Analog support — my payment failed after Stripe redirected me back.",
      `Session ID: ${sessionId || "missing"}`,
      `Error code: ${paymentFailure.errorCode}`,
      `Failure category: ${paymentFailure.failureCategory}`,
      `Ticket type: ${paymentFailure.ticketType || "unknown"}`,
      `Email: ${paymentFailure.customerEmail || orderDetails?.email || "unknown"}`,
      `Message: ${paymentFailure.message}`,
      `Page: ${typeof window !== "undefined" ? window.location.href : "/checkout/success"}`,
    ].join("\n");
  }, [paymentFailure, sessionId, orderDetails?.email]);

  const handleCopySupportMessage = async () => {
    try {
      await navigator.clipboard.writeText(supportMessage);
      if (paymentFailure) {
        recordPaymentRetryContext({
          sourceErrorCode: paymentFailure.errorCode,
          sourceFailureCategory: paymentFailure.failureCategory,
          sourceSessionId: sessionId || undefined,
          originFunnelStep: "payment_support_copied",
        });
      }
      Funnel.paymentSupportCopied({
        error_code: paymentFailure?.errorCode || "unknown",
        failure_category: paymentFailure?.failureCategory || "unknown",
        session_id: sessionId || "missing",
      });
      toast.success("Support note copied");
    } catch {
      toast.error("Couldn’t copy the support note");
    }
  };

  const handleOpenSupportEmail = () => {
    const subject = `Payment follow-up for session ${sessionId || "missing"}`;
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(supportMessage)}`;
    window.location.href = mailtoUrl;
  };

  const handleManualRecheck = async () => {
    if (!sessionId || isManualChecking) return;

    setIsManualChecking(true);
    setManualStatusMessage("Checking Stripe again now…");

    try {
      const resolved = await verifyAndFetchOrder({ maxAttempts: 1, logFailures: false });
      if (!resolved) {
        setManualStatusMessage(paymentFailure?.message || "We checked again, but payment still hasn’t finished syncing yet.");
      } else {
        setManualStatusMessage("Payment confirmed — updating your tickets now.");
      }
    } catch {
      setManualStatusMessage("We couldn’t complete that check. Please try again in a moment.");
    } finally {
      setIsManualChecking(false);
    }
  };

  const statusMessage = manualStatusMessage
    ?? (isPatronsPackage
      ? "Thank you for your extraordinary support of Cosmico."
      : loading
        ? "Your payment went through — we’re syncing your tickets and confirmation details now."
        : orderDetails
          ? "Your tickets to Cosmico have been confirmed."
          : paymentFailure
            ? paymentFailure.message
            : "Your payment may still be processing behind the scenes. If this page doesn’t update shortly, your confirmation email should still arrive once syncing finishes.");

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.dustySky }}>
      {/* Header */}
      <header className="py-6 px-4 border-b" style={{ borderColor: COLORS.boulder }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/">
            <img src={analogLogo} alt="Cosmico" className="h-8" />
          </Link>
          <span style={{ ...typography.caption, color: COLORS.boulder }}>
            May 14–16, 2027
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-16">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
        >
          {/* Success Icon */}
          <div className="flex justify-center mb-8">
            <div
              className="w-20 h-20 flex items-center justify-center"
              style={{ backgroundColor: COLORS.forest }}
            >
              <Check className="w-10 h-10 text-white" />
            </div>
          </div>

          {/* Confirmation Message */}
          <div className="text-center mb-12">
            <h1
              className="text-3xl md:text-4xl mb-4"
              style={{ ...typography.headline, color: COLORS.charcoal }}
            >
              {isPatronsPackage
                ? "Welcome to the Analog Family"
                : loading
                  ? "Finalizing Your Order"
                  : orderDetails
                    ? "You're In"
                    : paymentFailure
                      ? "Payment Needs Attention"
                      : "We’re Confirming Your Payment"}
            </h1>
            <p
              className="text-lg"
              style={{ ...typography.body, color: COLORS.charcoal }}
            >
              {statusMessage}
            </p>
          </div>

          {loading && !isPatronsPackage && !orderDetails && (
            <div
              className="p-6 mb-8 border"
              style={{
                backgroundColor: `${COLORS.denim}08`,
                borderColor: `${COLORS.denim}25`,
                borderRadius: 0,
              }}
            >
              <p style={{ ...typography.subhead, color: COLORS.charcoal, marginBottom: "8px" }}>
                Syncing your purchase
              </p>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: "14px" }}>
                Stripe has already redirected you back here — we’re just waiting for your order record to finish updating.
              </p>
            </div>
          )}

          {!loading && !isPatronsPackage && !orderDetails && paymentFailure && failureGuidance && (
            <div
              className="mb-8 border p-4 sm:p-6"
              style={{
                backgroundColor: `${COLORS.clay}08`,
                borderColor: `${COLORS.clay}25`,
                borderRadius: 0,
              }}
            >
              <h2 className="mb-3 text-lg" style={{ ...typography.subhead, color: COLORS.charcoal }}>
                {failureGuidance.title}
              </h2>
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "14px", marginBottom: "16px" }}>
                {failureGuidance.description}
              </p>
              {shouldAutoRecheck && autoRecheckAttempt < AUTO_RECHECK_MAX_ATTEMPTS && (
                <div
                  className="mb-5 border p-4"
                  style={{
                    backgroundColor: `${COLORS.denim}08`,
                    borderColor: `${COLORS.denim}20`,
                    borderRadius: 0,
                  }}
                >
                  <p style={{ ...typography.caption, color: COLORS.boulder, marginBottom: "6px" }}>
                    We’re still checking your payment
                  </p>
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: "14px" }}>
                    {isAutoRechecking
                      ? "Re-checking Stripe now…"
                      : `We’ll automatically re-check a few more times in case confirmation is delayed (${autoRecheckAttempt + 1} of ${AUTO_RECHECK_MAX_ATTEMPTS}).`}
                  </p>
                  <div className="mt-4">
                    <Button
                      type="button"
                      onClick={handleManualRecheck}
                      disabled={isManualChecking || isAutoRechecking}
                      className="h-11 px-4"
                      style={{
                        ...typography.button,
                        backgroundColor: COLORS.denim,
                        color: COLORS.white,
                        borderRadius: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontSize: "13px",
                      }}
                    >
                      {isManualChecking ? "Checking…" : "Check again"}
                    </Button>
                  </div>
                </div>
              )}
              {failureChangeInstructions.length > 0 && (
                <div
                  className="mb-5 border p-4"
                  style={{
                    backgroundColor: COLORS.white,
                    borderColor: `${COLORS.charcoal}12`,
                    borderRadius: 0,
                  }}
                >
                  <p style={{ ...typography.caption, color: COLORS.boulder, marginBottom: "8px" }}>
                    Before you retry
                  </p>
                  <ul className="space-y-2 pl-5">
                    {failureChangeInstructions.map((instruction) => (
                      <li
                        key={instruction}
                        style={{
                          ...typography.body,
                          color: COLORS.charcoal,
                          fontSize: "14px",
                        }}
                      >
                        {instruction}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mb-5 space-y-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <span style={{ color: COLORS.boulder }}>Error code</span>
                  <span
                    className="sm:text-right"
                    style={{ ...typography.body, color: COLORS.charcoal, overflowWrap: "anywhere" }}
                  >
                    {paymentFailure.errorCode}
                  </span>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <span style={{ color: COLORS.boulder }}>Session</span>
                  <span
                    className="sm:max-w-[70%] sm:text-right"
                    style={{ ...typography.body, color: COLORS.charcoal, overflowWrap: "anywhere" }}
                  >
                    {sessionId || "missing"}
                  </span>
                </div>
              </div>
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Link
                  to={paymentFailure.failureCategory === "canceled" ? "/tickets" : "/checkout/review"}
                  className="block"
                  onClick={() => {
                    recordPaymentRetryContext({
                      sourceErrorCode: paymentFailure.errorCode,
                      sourceFailureCategory: paymentFailure.failureCategory,
                      sourceSessionId: sessionId || undefined,
                      originFunnelStep: "payment_retry_clicked",
                    });
                    Funnel.paymentRetryClicked({
                      error_code: paymentFailure.errorCode,
                      failure_category: paymentFailure.failureCategory,
                      session_id: sessionId || "missing",
                       retry_attempt: (getPaymentRetryMetadata()?.retry_attempt as number | undefined) ?? 1,
                    });
                  }}
                >
                  <button
                    className="h-auto min-h-12 w-full px-4 py-3 text-center transition-opacity hover:opacity-70"
                    style={{
                      ...typography.button,
                      backgroundColor: COLORS.clay,
                      color: COLORS.white,
                      borderRadius: 0,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontSize: "13px",
                      border: "none",
                      whiteSpace: "normal",
                    }}
                  >
                    {failureGuidance.retryLabel}
                  </button>
                </Link>
                <button
                  type="button"
                  onClick={handleCopySupportMessage}
                  className="h-auto min-h-12 w-full px-4 py-3 border text-center transition-opacity hover:opacity-70"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.white,
                    color: COLORS.charcoal,
                    borderColor: `${COLORS.charcoal}20`,
                    borderRadius: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: "13px",
                    whiteSpace: "normal",
                  }}
                >
                  Copy Support Message
                </button>
                <button
                  type="button"
                  onClick={handleOpenSupportEmail}
                  className="h-auto min-h-12 w-full px-4 py-3 border text-center transition-opacity hover:opacity-70"
                  style={{
                    ...typography.button,
                    backgroundColor: COLORS.white,
                    color: COLORS.charcoal,
                    borderColor: `${COLORS.charcoal}20`,
                    borderRadius: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: "13px",
                    whiteSpace: "normal",
                  }}
                >
                  Email Support
                </button>
              </div>
              <div
                className="border p-4"
                style={{
                  backgroundColor: COLORS.white,
                  borderColor: `${COLORS.charcoal}12`,
                  borderRadius: 0,
                }}
              >
                <p style={{ ...typography.caption, color: COLORS.boulder, marginBottom: "8px" }}>
                  Share this with support if retrying doesn’t work
                </p>
                <textarea
                  readOnly
                  value={supportMessage}
                  rows={8}
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full resize-y overflow-auto border-0 bg-transparent p-0"
                  style={{
                    ...typography.body,
                    color: COLORS.charcoal,
                    fontSize: "12px",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    minHeight: "180px",
                    outline: "none",
                    boxShadow: "none",
                  }}
                />
              </div>
            </div>
          )}

          {/* Patrons Package Details */}
          {isPatronsPackage && patronsPackage && (
            <div
              className="p-6 mb-8 border"
              style={{
                backgroundColor: `${COLORS.clay}10`,
                borderColor: `${COLORS.clay}30`,
                borderRadius: 0,
              }}
            >
              <h2
                className="text-lg mb-4"
                style={{ ...typography.subhead, color: COLORS.charcoal }}
              >
                Your Patron Package
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span style={{ ...typography.body, color: COLORS.boulder }}>Package</span>
                  <span style={{ ...typography.body, color: COLORS.charcoal, fontWeight: 600 }}>
                    {patronsPackage.name}
                  </span>
                </div>
                <div
                  className="flex justify-between pt-3 border-t"
                  style={{ borderColor: COLORS.boulder }}
                >
                  <span style={{ ...typography.body, color: COLORS.boulder }}>Total Contribution</span>
                  <span
                    className="text-lg"
                    style={{ ...typography.headline, color: COLORS.clay }}
                  >
                    ${patronsPackage.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Order Summary - Regular Tickets */}
          {orderDetails && !isPatronsPackage && (
            <div
              className="p-6 mb-8 border"
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
                Order Details
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: COLORS.boulder }}>Name</span>
                  <span style={{ ...typography.body, color: COLORS.charcoal }}>{orderDetails.name}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.boulder }}>Ticket</span>
                  <span style={{ ...typography.body, color: COLORS.charcoal }}>
                    {TICKET_NAMES[orderDetails.ticketType] || orderDetails.ticketType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.boulder }}>Quantity</span>
                  <span style={{ ...typography.body, color: COLORS.charcoal }}>{orderDetails.quantity}</span>
                </div>
                <div
                  className="flex justify-between pt-3 border-t"
                  style={{ borderColor: COLORS.boulder }}
                >
                  <span style={{ color: COLORS.boulder }}>
                    {isPaymentPlan ? "Total (Payment Plan)" : "Total Paid"}
                  </span>
                  <span
                    className="text-lg"
                    style={{ ...typography.headline, color: COLORS.charcoal }}
                  >
                    ${(orderDetails.totalAmount / 100).toFixed(0)}
                  </span>
                </div>
                {isPaymentPlan && (
                  <div
                    className="p-3 mt-3 rounded"
                    style={{ backgroundColor: `${COLORS.clay}08`, border: `1px solid ${COLORS.clay}20` }}
                  >
                    <p style={{ ...typography.body, color: COLORS.clay, fontSize: '13px', fontWeight: 500 }}>
                      Payment plan active
                    </p>
                    <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
                      Your first payment has been processed. Remaining payments will be charged automatically to your saved card on the scheduled dates. You'll receive an email reminder before each charge.
                    </p>
                    <Link
                      to={`/payment-plan-status?email=${encodeURIComponent(orderDetails?.email || '')}`}
                      className="inline-flex items-center gap-1.5 mt-3"
                      style={{ ...typography.body, color: COLORS.clay, fontSize: '12px', fontWeight: 600, textDecoration: 'underline' }}
                    >
                      View Payment Schedule
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Apple Wallet — one pass per ticket */}
          {tickets.length > 0 && !isPatronsPackage && (
            <div
              className="p-6 mb-8 border"
              style={{ backgroundColor: COLORS.white, borderColor: COLORS.boulder, borderRadius: 0 }}
            >
              <h2 className="text-lg mb-2" style={{ ...typography.subhead, color: COLORS.charcoal }}>
                Add to Apple Wallet
              </h2>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: 13, marginBottom: 16 }}>
                Save your pass{tickets.length > 1 ? "es" : ""} to your iPhone for fast check-in. QR codes activate 7 days before the event.
              </p>
              <div className="flex flex-col gap-3">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 p-3 border"
                    style={{ borderColor: `${COLORS.boulder}40`, borderRadius: 0 }}
                  >
                    <div className="min-w-0">
                      <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: 13, fontWeight: 600 }}>
                        {t.holder_name || orderDetails?.name || "Attendee"}
                      </p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: 11 }}>
                        {TICKET_NAMES[t.ticket_type] || t.ticket_type}
                      </p>
                    </div>
                    <AddToAppleWalletButton ticketId={t.id} holderName={t.holder_name || orderDetails?.name} variant="full" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Details Card */}
          <div
            className="p-6 mb-8 border"
            style={{
              backgroundColor: COLORS.white,
              borderColor: COLORS.boulder,
              borderRadius: 0,
            }}
          >
            <h2
              className="text-lg mb-6"
              style={{ ...typography.subhead, color: COLORS.charcoal }}
            >
              See You at the Reunion
            </h2>

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div
                  className="p-2 flex-shrink-0"
                  style={{ backgroundColor: `${COLORS.denim}15` }}
                >
                  <Calendar className="w-5 h-5" style={{ color: COLORS.denim }} />
                </div>
                <div>
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontWeight: 600 }}>
                    May 14–16, 2027
                  </p>
                  <p className="text-sm" style={{ ...typography.body, color: COLORS.boulder }}>
                    Friday through Sunday
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div
                  className="p-2 flex-shrink-0"
                  style={{ backgroundColor: `${COLORS.denim}15` }}
                >
                  <MapPin className="w-5 h-5" style={{ color: COLORS.denim }} />
                </div>
                <div>
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontWeight: 600 }}>
                    Example Meadow
                  </p>
                  <p className="text-sm" style={{ ...typography.body, color: COLORS.boulder }}>
                    Near Example Valley, California
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div
                  className="p-2 flex-shrink-0"
                  style={{ backgroundColor: `${COLORS.denim}15` }}
                >
                  <Mail className="w-5 h-5" style={{ color: COLORS.denim }} />
                </div>
                <div>
                  <p style={{ ...typography.body, color: COLORS.charcoal, fontWeight: 600 }}>
                    Check Your Email
                  </p>
                  <p className="text-sm" style={{ ...typography.body, color: COLORS.boulder }}>
                    Confirmation sent to {orderDetails?.email || "your email"}
                  </p>
                </div>
              </div>
            </div>

            {/* Add to Calendar Button */}
            <div className="mt-6 pt-6 border-t" style={{ borderColor: COLORS.boulder }}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="w-full h-11 flex items-center justify-center gap-2 border transition-opacity hover:opacity-70"
                    style={{
                      ...typography.button,
                      backgroundColor: `${COLORS.denim}10`,
                      borderColor: `${COLORS.denim}40`,
                      color: COLORS.denim,
                      borderRadius: 0,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontSize: '13px',
                    }}
                  >
                    <CalendarPlus className="w-4 h-4" />
                    Add to Calendar
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-48">
                  <DropdownMenuItem asChild>
                    <a
                      href={generateGoogleCalendarUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer"
                    >
                      Google Calendar
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadIcsFile} className="cursor-pointer">
                    Apple Calendar
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href={generateOutlookUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer"
                    >
                      Outlook
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadIcsFile} className="cursor-pointer">
                    Download .ics file
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Next Steps - Patrons */}
          {isPatronsPackage && (
            <div
              className="p-6 mb-12 border"
              style={{
                backgroundColor: `${COLORS.clay}08`,
                borderColor: `${COLORS.clay}25`,
                borderRadius: 0,
              }}
            >
              <h2
                className="text-lg mb-4"
                style={{ ...typography.subhead, color: COLORS.charcoal }}
              >
                What's Next
              </h2>
              <ul className="space-y-3 text-sm">
                {[
                  "A member of our team will reach out personally to welcome you and discuss your patron benefits.",
                  "Your exclusive VIP lodging will be arranged and confirmed in the coming weeks.",
                  "You'll receive priority invitations to patron-only experiences and artist meet-and-greets.",
                  "Tax documentation will be provided — a portion of your contribution may be tax-deductible.",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <ArrowRight
                      className="w-4 h-4 mt-0.5 flex-shrink-0"
                      style={{ color: COLORS.clay }}
                    />
                    <span style={{ ...typography.body, color: COLORS.charcoal }}>
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Steps - Regular Tickets */}
          {!isPatronsPackage && (
            <div
              className="p-6 mb-12 border"
              style={{
                backgroundColor: `${COLORS.denim}08`,
                borderColor: `${COLORS.denim}25`,
                borderRadius: 0,
              }}
            >
              <h2
                className="text-lg mb-4"
                style={{ ...typography.subhead, color: COLORS.charcoal }}
              >
                What's Next
              </h2>
              <ul className="space-y-3 text-sm">
                {[
                  "Lineup and schedule announcements are coming soon — you'll be the first to know.",
                  "Lodging options at Example Meadow will be available for booking in the coming weeks.",
                  "Detailed event information will be sent as we get closer to May.",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <ArrowRight
                      className="w-4 h-4 mt-0.5 flex-shrink-0"
                      style={{ color: COLORS.denim }}
                    />
                    <span style={{ ...typography.body, color: COLORS.charcoal }}>
                      {text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA */}
          <div className="text-center">
            <p
              className="mb-6"
              style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}
            >
              {isPatronsPackage
                ? "Your generosity makes Cosmico possible. We can't wait to celebrate with you."
                : "Thank you for being part of this new chapter."}
            </p>
            <Link to="/">
              <button
                className="h-12 px-8 transition-opacity hover:opacity-70"
                style={{
                  ...typography.button,
                  backgroundColor: COLORS.clay,
                  color: COLORS.white,
                  borderRadius: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: '14px',
                  border: 'none',
                }}
              >
                Back to Cosmico
              </button>
            </Link>
          </div>
        </motion.div>
      </main>

      {/* Schedule strip */}
      <Link
        to="/schedule"
        className="block hover:opacity-95 transition-opacity"
        style={{ backgroundColor: COLORS.charcoal }}
      >
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-baseline gap-4 flex-wrap">
            <span style={{ ...typography.caption, color: COLORS.mustard, letterSpacing: '0.18em', fontSize: '10px' }}>
              FULL SCHEDULE
            </span>
            <span style={{ ...typography.body, color: COLORS.dustySky, fontSize: '14px', opacity: 0.95 }}>
              Set times, doors, dinner, sauna — the whole weekend.
            </span>
          </div>
          <span style={{ ...typography.caption, color: COLORS.mustard, fontSize: '10px', letterSpacing: '0.14em', borderBottom: `1px solid ${COLORS.mustard}`, paddingBottom: '3px', whiteSpace: 'nowrap' }}>
            SEE THE SCHEDULE →
          </span>
        </div>
      </Link>

      {/* Footer */}
      <footer
        className="py-8 px-6 border-t"
        style={{ borderColor: `${COLORS.charcoal}10` }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>
            Questions? Email us at{" "}
            <a
              href="mailto:hello@example.org"
              className="underline hover:opacity-70"
              style={{ color: COLORS.charcoal }}
            >
              hello@example.org
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default MayTicketSuccess;
