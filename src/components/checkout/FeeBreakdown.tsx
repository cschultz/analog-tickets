import { CalculatedFee } from "@/hooks/useCheckoutFees";
import { COLORS, typography } from "@/styles/may-theme";

interface FeeBreakdownProps {
  fees: CalculatedFee[];
  className?: string;
}

/**
 * Displays calculated fees (service fee, occupancy tax, etc.) in the order summary
 */
export function FeeBreakdown({ fees, className = "" }: FeeBreakdownProps) {
  if (fees.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {fees.map((fee) => (
        <div key={fee.key} className="flex justify-between items-center">
          <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
            {fee.label} {fee.rate && <span className="opacity-60">({fee.rate})</span>}
          </span>
          <span style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px' }}>
            ${(fee.amount / 100).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}
