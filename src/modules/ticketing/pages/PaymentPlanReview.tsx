import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { COLORS, typography } from "@/styles/may-theme";
import { usePaymentPlan, formatPaymentDate, formatCentsToDollars } from "@/hooks/usePaymentPlan";
import { CalendarDays, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import analogLogo from "@/assets/analog-wordmark-black.webp";
import { trackGA4BeginCheckout, getFbCookies } from "@/components/AnalyticsTracking";
import { redirectToExternal } from "@/lib/safeRedirect";

interface PlanData {
  ticketType: string;
  ticketName: string;
  ticketDuration: string;
  ticketPrice: number;
  quantity: number;
  name: string;
  email: string;
  phone?: string;
  childCount: number;
  youthTicketType: string | null;
  youthCount: number;
  cartTotalCents: number;
}

const YOUTH_PRICES: Record<string, number> = {
  youth_2day: 100,
  youth_saturday: 60,
};

export default function PaymentPlanReview() {
  const navigate = useNavigate();
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("cosmico_payment_plan_data");
    if (!raw) {
      navigate("/tickets", { replace: true });
      return;
    }
    try {
      setPlanData(JSON.parse(raw));
    } catch {
      navigate("/tickets", { replace: true });
    }
  }, [navigate]);

  const { breakdown } = usePaymentPlan(planData?.cartTotalCents ?? 0);

  if (!planData || !breakdown.available) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dustySky }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: COLORS.boulder }} />
      </div>
    );
  }

  const handleConfirm = async () => {
    setIsSubmitting(true);

    try {
      const { fbp, fbc } = getFbCookies();

      const cartLineItems: { name: string; amount: number; quantity: number }[] = [];
      if (planData.ticketName) {
        cartLineItems.push({
          name: `${planData.ticketName} — ${planData.ticketDuration}`,
          amount: Math.round(planData.ticketPrice * 100),
          quantity: planData.quantity,
        });
      }
      if (planData.youthTicketType && planData.youthCount > 0) {
        const youthLabel = planData.youthTicketType === "youth_2day" ? "Youth — 2 Day" : "Youth — Saturday";
        cartLineItems.push({
          name: youthLabel,
          amount: Math.round(YOUTH_PRICES[planData.youthTicketType] * 100),
          quantity: planData.youthCount,
        });
      }

      const cartDescription = planData.ticketName
        ? `${planData.ticketName} — ${planData.ticketDuration}${planData.youthCount > 0 ? ` + ${planData.youthCount} Youth` : ""}`
        : "Cosmico Tickets where";

      const { data, error } = await supabase.functions.invoke("create-payment-plan-checkout", {
        body: {
          cartTotal: planData.cartTotalCents,
          cartDescription,
          cartLineItems,
          name: planData.name,
          email: planData.email,
          phone: planData.phone || undefined,
          ticketType: planData.ticketType,
          fbp,
          fbc,
        },
      });

      if (error) throw error;

      if (data?.url) {
        trackGA4BeginCheckout({
          value: planData.cartTotalCents / 100,
          currency: "USD",
          items: [{
            item_id: planData.ticketType,
            item_name: `${planData.ticketName} — ${planData.ticketDuration}`,
            item_category: "Festival Ticket",
            price: planData.ticketPrice,
            quantity: planData.quantity,
          }],
        });
        redirectToExternal(data.url);
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error: any) {
      console.error("Payment plan checkout error:", error);
      toast.error(error.message || "Unable to start checkout. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAmount = breakdown.amounts.reduce((a, b) => a + b, 0);

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

      <main className="pt-24 pb-20 px-6">
        <div className="max-w-lg mx-auto">
          {/* Back link */}
          <button
            onClick={() => navigate("/tickets")}
            className="flex items-center gap-2 mb-6 hover:opacity-70 transition-opacity"
            style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to tickets
          </button>

          {/* Card */}
          <div
            className="rounded-xl border p-6 md:p-8 space-y-6"
            style={{
              backgroundColor: COLORS.white,
              borderColor: `${COLORS.charcoal}10`,
            }}
          >
            {/* Title */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <CalendarDays className="w-5 h-5" style={{ color: COLORS.clay }} />
                <h1 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '22px' }}>
                  Split Your Ticket
                </h1>
              </div>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                Same total. No interest. No fees.
              </p>
            </div>

            {/* Order summary */}
            <div
              className="rounded-lg p-4 space-y-2"
              style={{ backgroundColor: `${COLORS.charcoal}04` }}
            >
              <div className="flex justify-between">
                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
                  {planData.quantity}x {planData.ticketName}
                </span>
                <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
                  ${(planData.ticketPrice * planData.quantity).toLocaleString()}
                </span>
              </div>
              {planData.youthTicketType && planData.youthCount > 0 && (
                <div className="flex justify-between">
                  <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    {planData.youthCount}x Youth
                  </span>
                  <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>
                    ${(YOUTH_PRICES[planData.youthTicketType] * planData.youthCount).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2" style={{ borderTop: `1px solid ${COLORS.charcoal}10` }}>
                <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>Total</span>
                <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
                  {formatCentsToDollars(totalAmount)}
                </span>
              </div>
            </div>

            {/* Payment schedule */}
            <div className="space-y-3">
              <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.08em' }}>
                PAYMENT SCHEDULE
              </p>
              <div className="space-y-0">
                {breakdown.amounts.map((amount, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-3"
                    style={{ borderBottom: i < breakdown.amounts.length - 1 ? `1px solid ${COLORS.charcoal}08` : 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                        style={{
                          backgroundColor: i === 0 ? COLORS.clay : `${COLORS.charcoal}08`,
                          color: i === 0 ? COLORS.white : COLORS.boulder,
                          fontWeight: 600,
                        }}
                      >
                        {i + 1}
                      </div>
                      <div>
                        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 500 }}>
                          {formatPaymentDate(breakdown.dates[i])}
                          {i === 0 && (
                            <span style={{ color: COLORS.clay, fontWeight: 600 }}> (today)</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '15px', fontWeight: 600 }}>
                      {formatCentsToDollars(amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Terms note */}
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

            {/* CTA */}
            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="w-full h-12 uppercase hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
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
                `Reserve for ${formatCentsToDollars(breakdown.firstPayment)} today`
              )}
            </button>

            {/* Pay in full fallback */}
            <button
              onClick={() => navigate("/tickets")}
              className="w-full text-center py-1 hover:opacity-70 transition-opacity"
              style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              or pay in full
            </button>
          </div>

          {/* Stripe trust */}
          <p className="text-center mt-4" style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>
            Secure checkout powered by Stripe
          </p>
        </div>
      </main>
    </div>
  );
}