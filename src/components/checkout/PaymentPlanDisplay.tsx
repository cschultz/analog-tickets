import { COLORS, typography } from "@/styles/may-theme";
import { PaymentPlanBreakdown, formatPaymentDate, formatCentsToDollars } from "@/hooks/usePaymentPlan";
import { CalendarDays } from "lucide-react";

interface PaymentPlanDisplayProps {
  breakdown: PaymentPlanBreakdown;
  isSelected: boolean;
  onSelect: () => void;
  className?: string;
}

/**
 * Payment plan option display for checkout.
 * Designed to feel like the PRIMARY option — simple, human, not financial.
 */
export function PaymentPlanDisplay({
  breakdown,
  isSelected,
  onSelect,
  className = "",
}: PaymentPlanDisplayProps) {
  if (!breakdown.available) return null;

  return (
    <div className={className}>
      {/* Payment plan option */}
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left p-4 rounded-lg border-2 transition-all"
        style={{
          borderColor: isSelected ? COLORS.clay : `${COLORS.charcoal}15`,
          backgroundColor: isSelected ? `${COLORS.clay}08` : COLORS.white,
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" style={{ color: COLORS.clay }} />
            <span style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
              Split your ticket
            </span>
          </div>
          {isSelected && (
            <span
              className="px-2 py-0.5 rounded-full text-xs"
              style={{
                backgroundColor: COLORS.clay,
                color: COLORS.white,
                fontWeight: 600,
              }}
            >
              Selected
            </span>
          )}
        </div>

        <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Reserve for {formatCentsToDollars(breakdown.firstPayment)} today
        </p>

        {/* Payment schedule breakdown */}
        <div className="space-y-1.5">
          {breakdown.amounts.map((amount, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                style={{
                  backgroundColor: i === 0 ? COLORS.clay : `${COLORS.charcoal}12`,
                  color: i === 0 ? COLORS.white : COLORS.boulder,
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </div>
              <span style={{ ...typography.body, color: i === 0 ? COLORS.charcoal : COLORS.boulder, fontSize: '13px' }}>
                {formatCentsToDollars(amount)} — {formatPaymentDate(breakdown.dates[i])}
                {i === 0 && " (today)"}
              </span>
            </div>
          ))}
        </div>

        <p
          className="mt-3 pt-3 border-t"
          style={{
            ...typography.body,
            color: COLORS.boulder,
            fontSize: '11px',
            borderColor: `${COLORS.charcoal}10`,
          }}
        >
          Same total price. Card saved securely for upcoming payments. No interest, no fees.
        </p>
      </button>
    </div>
  );
}

/**
 * Compact payment plan teaser shown near the ticket price
 */
export function PaymentPlanTeaser({
  breakdown,
}: {
  breakdown: PaymentPlanBreakdown;
}) {
  if (!breakdown.available) return null;

  return (
    <p style={{ ...typography.body, color: COLORS.clay, fontSize: '12px', marginTop: '4px' }}>
      or {formatCentsToDollars(breakdown.firstPayment)} today with {breakdown.paymentCount} easy payments
    </p>
  );
}
