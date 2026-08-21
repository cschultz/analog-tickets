import { supabase } from "@/integrations/supabase/client";
import { categorizeStripeFailure } from "@/lib/stripeFailureCategory";

type ErrorType = 'validation' | 'stripe' | 'database' | 'network' | 'unknown' | 'lodging' | 'lodging_offer' | 'addon' | 'patrons' | 'redirect' | 'payment_verification';

interface CheckoutErrorDetails {
  error_type: ErrorType;
  error_message: string;
  error_code?: string;
  failure_category?: string;
  ticket_type?: string;
  user_email?: string;
  request_payload?: Record<string, unknown>;
  stack_trace?: string;
}

/**
 * Hook for reporting checkout errors to the monitoring system.
 * Errors are logged to the database and trigger real-time alerts for critical issues.
 */
export function useCheckoutErrorReporting() {
  const reportError = async (details: CheckoutErrorDetails): Promise<void> => {
    try {
      const failure_category = details.failure_category ?? (
        details.error_type === 'stripe' || details.error_type === 'redirect'
          ? categorizeStripeFailure({
              error_code: details.error_code,
              error_message: details.error_message,
              request_payload: details.request_payload,
            })
          : undefined
      );

      // Don't block the UI - fire and forget
      supabase.functions.invoke('log-checkout-error', {
        body: {
          ...details,
          failure_category,
          user_agent: navigator.userAgent,
          session_id: sessionStorage.getItem('checkout_session_id') || undefined,
        },
      }).catch((error) => {
        // Silent fail - we don't want error reporting to cause more errors
        console.error('[CheckoutErrorReporting] Failed to report error:', error);
      });
    } catch (error) {
      // Silent fail
      console.error('[CheckoutErrorReporting] Failed to report error:', error);
    }
  };

  /**
   * Wrap a checkout operation with error reporting
   */
  const withErrorReporting = async <T>(
    operation: () => Promise<T>,
    context: { ticket_type?: string; user_email?: string }
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      
      // Determine error type based on the error
      let error_type: ErrorType = 'unknown';
      if (errorMessage.toLowerCase().includes('stripe')) {
        error_type = 'stripe';
      } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
        error_type = 'network';
      } else if (errorMessage.toLowerCase().includes('database') || errorMessage.toLowerCase().includes('supabase')) {
        error_type = 'database';
      } else if (errorMessage.toLowerCase().includes('valid') || errorMessage.toLowerCase().includes('required')) {
        error_type = 'validation';
      }

      // Report the error
      await reportError({
        error_type,
        error_message: errorMessage,
        ticket_type: context.ticket_type,
        user_email: context.user_email,
        stack_trace: stack,
      });

      // Re-throw so the caller can handle it
      throw error;
    }
  };

  return { reportError, withErrorReporting };
}

/**
 * Standalone function for reporting errors outside of React components
 */
export async function reportCheckoutError(details: CheckoutErrorDetails): Promise<void> {
  try {
    const failure_category = details.failure_category ?? (
      details.error_type === 'stripe' || details.error_type === 'redirect'
        ? categorizeStripeFailure({
            error_code: details.error_code,
            error_message: details.error_message,
            request_payload: details.request_payload,
          })
        : undefined
    );

    await supabase.functions.invoke('log-checkout-error', {
      body: {
        ...details,
        failure_category,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
    });
  } catch (error) {
    console.error('[reportCheckoutError] Failed to report error:', error);
  }
}
