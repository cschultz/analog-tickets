import { COLORS, typography } from "@/styles/may-theme";
import { CalendarDays } from "lucide-react";
import { PaymentPlanBreakdown, formatPaymentDate, formatCentsToDollars } from "@/hooks/usePaymentPlan";

interface PaymentPlanToggleProps {
  breakdown: PaymentPlanBreakdown;
  isSelected: boolean;
  onToggle: (selected: boolean) => void;
  className?: string;
}

/**
 * Clean payment plan toggle — appears right before the final CTA.
 * Two options: Pay in full OR split into payments.
 * Designed for minimal friction — one tap to opt in.
 */
export function PaymentPlanToggle({
  breakdown,
  isSelected,
  onToggle,
  className = "",
}: PaymentPlanToggleProps) {
  if (!breakdown.available) return null;

  const totalAmount = breakdown.amounts.reduce((a, b) => a + b, 0);

  return (
    <div className={`space-y-2 ${className}`}>
      <p style={{ ...typography.caption, color: COLORS.boulder, fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Payment method
      </p>

      {/* Pay in full option */}
      <button
        type="button"
        onClick={() => onToggle(false)}
        className="w-full text-left px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-between"
        style={{
          borderColor: !isSelected ? COLORS.clay : `${COLORS.charcoal}12`,
          backgroundColor: !isSelected ? `${COLORS.clay}06` : 'transparent',
        }}
      >
        <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: !isSelected ? 600 : 400 }}>
          Pay in full
        </span>
        <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
          {formatCentsToDollars(totalAmount)}
        </span>
      </button>

      {/* Split payment option */}
      <button
        type="button"
        onClick={() => onToggle(true)}
        className="w-full text-left px-4 py-3 rounded-lg border-2 transition-all"
        style={{
          borderColor: isSelected ? COLORS.clay : `${COLORS.charcoal}12`,
          backgroundColor: isSelected ? `${COLORS.clay}06` : 'transparent',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" style={{ color: COLORS.clay }} />
            <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: isSelected ? 600 : 400 }}>
              {breakdown.paymentCount} easy payments
            </span>
          </div>
          <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', fontWeight: 600 }}>
            {formatCentsToDollars(breakdown.firstPayment)} today
          </span>
        </div>

        {/* Expanded schedule when selected */}
        {isSelected && (
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
              Same total. Card saved securely. No interest, no fees.
            </p>
          </div>
        )}
      </button>
    </div>
  );
}
