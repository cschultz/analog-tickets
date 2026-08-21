import * as React from "react";
import { cn } from "@/lib/utils";

interface AccessibleInputProps extends React.ComponentProps<"input"> {
  /** Mobile-optimized: larger touch target */
  touchOptimized?: boolean;
  /** Input mode for mobile keyboards */
  inputMode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  /** Auto-capitalize behavior */
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  /** Visual label for screen readers (uses aria-label if no visible label) */
  accessibleLabel?: string;
  /** Error state styling */
  hasError?: boolean;
  /** Error message for aria-describedby */
  errorMessage?: string;
}

/**
 * Accessible, mobile-optimized input component
 * - Larger touch targets on mobile (min 44px as per WCAG 2.5.5)
 * - Proper input modes for mobile keyboards
 * - Enhanced focus states for visibility
 * - ARIA attributes for screen readers
 */
const AccessibleInput = React.forwardRef<HTMLInputElement, AccessibleInputProps>(
  (
    {
      className,
      type = "text",
      touchOptimized = true,
      inputMode,
      autoCapitalize = "none",
      accessibleLabel,
      hasError,
      errorMessage,
      id,
      ...props
    },
    ref
  ) => {
    // Generate stable error ID for aria-describedby
    const errorId = errorMessage && id ? `${id}-error` : undefined;

    // Determine appropriate inputMode based on type if not explicitly set
    const effectiveInputMode = inputMode || getInputModeForType(type);

    return (
      <>
        <input
          type={type}
          inputMode={effectiveInputMode}
          autoCapitalize={autoCapitalize}
          autoComplete={getAutoCompleteForType(type)}
          aria-label={accessibleLabel}
          aria-invalid={hasError}
          aria-describedby={errorId}
          id={id}
          className={cn(
            // Base styles
            "flex w-full rounded-md border bg-background px-3 py-2",
            "text-base ring-offset-background",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
            "placeholder:text-muted-foreground",
            // Focus states - enhanced visibility
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            // Disabled state
            "disabled:cursor-not-allowed disabled:opacity-50",
            // Touch optimization - 44px minimum height on mobile
            touchOptimized ? "min-h-[44px] md:min-h-[40px]" : "h-10",
            // Error state
            hasError
              ? "border-destructive focus-visible:ring-destructive"
              : "border-input",
            // Font size - 16px on mobile prevents iOS zoom
            "text-base md:text-sm",
            className
          )}
          ref={ref}
          {...props}
        />
        {/* Hidden error message for screen readers */}
        {errorId && errorMessage && (
          <span id={errorId} className="sr-only">
            {errorMessage}
          </span>
        )}
      </>
    );
  }
);

AccessibleInput.displayName = "AccessibleInput";

// Helper to determine inputMode based on input type
function getInputModeForType(
  type: string
): AccessibleInputProps["inputMode"] | undefined {
  switch (type) {
    case "email":
      return "email";
    case "tel":
      return "tel";
    case "url":
      return "url";
    case "number":
      return "decimal";
    case "search":
      return "search";
    default:
      return undefined;
  }
}

// Helper to determine autoComplete based on input type
function getAutoCompleteForType(type: string): string | undefined {
  switch (type) {
    case "email":
      return "email";
    case "tel":
      return "tel";
    case "password":
      return "current-password";
    default:
      return undefined;
  }
}

export { AccessibleInput };
export type { AccessibleInputProps };
