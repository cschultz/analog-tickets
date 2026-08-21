import { Check } from "lucide-react";
import { COLORS, typography } from "@/styles/may-theme";

interface CheckoutProgressProps {
  /** 1 = Select ticket, 2 = Your details, 3 = Add-ons, 4 = Review, 5 = Payment */
  currentStep: number;
}

const STEPS = [
  { label: "Select", number: 1 },
  { label: "Details", number: 2 },
  { label: "Add-ons", number: 3 },
  { label: "Review", number: 4 },
  { label: "Payment", number: 5 },
];

/**
 * Minimal 3-step progress bar for the ticket checkout flow.
 * Shows users where they are and that checkout is just one click away.
 */
export function CheckoutProgress({ currentStep }: CheckoutProgressProps) {
  return (
    <div className="flex items-center justify-center gap-0 max-w-xs mx-auto mb-8">
      {STEPS.map((step, idx) => {
        const isCompleted = currentStep > step.number;
        const isActive = currentStep === step.number;

        return (
          <div key={step.number} className="flex items-center">
            {/* Step indicator */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  backgroundColor: isCompleted
                    ? COLORS.clay
                    : isActive
                      ? COLORS.clay
                      : `${COLORS.charcoal}10`,
                  border: isActive ? `2px solid ${COLORS.clay}` : 'none',
                }}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5" style={{ color: COLORS.white }} />
                ) : (
                  <span
                    style={{
                      ...typography.body,
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isActive ? COLORS.white : COLORS.boulder,
                    }}
                  >
                    {step.number}
                  </span>
                )}
              </div>
              <span
                style={{
                  ...typography.caption,
                  fontSize: '10px',
                  letterSpacing: '0.06em',
                  color: isActive || isCompleted ? COLORS.charcoal : COLORS.boulder,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div
                className="h-px w-10 sm:w-14 mx-1 mt-[-14px]"
                style={{
                  backgroundColor: isCompleted ? COLORS.clay : `${COLORS.charcoal}15`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
