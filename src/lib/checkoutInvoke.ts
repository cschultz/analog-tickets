import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CheckoutError {
  /** Friendly message safe to show in a toast */
  message: string;
  /** Raw server/Stripe message for logs */
  rawMessage: string;
  status?: number;
  retryable: boolean;
}

export interface CheckoutInvokeResult<T = unknown> {
  data?: T;
  error?: CheckoutError;
}

interface FriendlyMatch {
  pattern: RegExp;
  message: string;
  retryable?: boolean;
}

const FRIENDLY: FriendlyMatch[] = [
  { pattern: /insufficient.?funds/i, message: "Your card was declined for insufficient funds. Please try a different card." },
  { pattern: /incorrect_cvc|incorrect security code/i, message: "The card's security code (CVC) was incorrect. Please re-enter it on the payment page." },
  { pattern: /expired_card|card has expired/i, message: "That card has expired. Please use a different card." },
  { pattern: /card_declined|card was declined|do_not_honor|generic_decline/i, message: "Your card was declined. Please try a different payment method." },
  { pattern: /rate.?limit|too many requests|429/i, message: "We're getting a lot of requests right now. Please wait a few seconds and try again.", retryable: true },
  { pattern: /sold ?out|no inventory|out of inventory|capacity reached/i, message: "This item just sold out. Refresh the page to see what's still available." },
  { pattern: /already (purchased|paid|owned)|matches your ticket cap|ticket cap|already have/i, message: "Looks like this is already on your order. Refresh the page to see your latest tickets." },
  { pattern: /unauthor|not signed in|jwt|auth session/i, message: "Your session has expired. Please sign in again to continue." },
  { pattern: /failed to fetch|network request failed|networkerror|timeout|econnreset|api_connection_error/i, message: "We couldn't reach the payment service. Check your connection and try again.", retryable: true },
  { pattern: /5\d\d|temporarily unavailable|service unavailable|gateway/i, message: "The payment service hiccuped. Give it another try in a moment.", retryable: true },
];

export function toFriendlyError(rawMessage: string, status?: number): { message: string; retryable: boolean } {
  const raw = (rawMessage || "").trim();
  for (const f of FRIENDLY) {
    if (f.pattern.test(raw)) {
      return { message: f.message, retryable: f.retryable ?? false };
    }
  }
  if (status !== undefined && status >= 500) {
    return { message: "The payment service hiccuped. Give it another try in a moment.", retryable: true };
  }
  return { message: raw || "Something went wrong starting checkout. Please try again.", retryable: false };
}

async function extractServerMessage(error: unknown): Promise<{ message: string; status?: number }> {
  const ctx = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string>; status?: number } } | null)?.context;
  const status = ctx?.status;
  try {
    const body = (await ctx?.json?.()) as { error?: string; message?: string } | undefined;
    if (body?.error || body?.message) return { message: String(body.error ?? body.message ?? ""), status };
  } catch {
    /* ignore */
  }
  try {
    const text = await ctx?.text?.();
    if (text) return { message: text, status };
  } catch {
    /* ignore */
  }
  const msg = (error as { message?: string } | null)?.message;
  return { message: msg || "", status };
}

export interface InvokeCheckoutOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Invoke a checkout edge function with retry-on-transient-failure and
 * friendly error mapping. Surfaces the real server-side error message
 * from supabase-js FunctionsHttpError responses (which otherwise default
 * to "Edge Function returned a non-2xx status code").
 */
export async function invokeCheckout<T = unknown>(
  fn: string,
  body: Record<string, unknown>,
  opts: InvokeCheckoutOptions = {}
): Promise<CheckoutInvokeResult<T>> {
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelay = opts.baseDelayMs ?? 700;
  let lastError: CheckoutError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke<T>(fn, { body });

      if (!error) {
        const inline = (data as { error?: string } | undefined)?.error;
        if (inline) {
          const f = toFriendlyError(String(inline));
          // Inline 200-OK errors are deterministic — don't retry.
          return { error: { message: f.message, rawMessage: String(inline), retryable: false } };
        }
        return { data: data as T };
      }

      const { message: serverMessage, status } = await extractServerMessage(error);
      const f = toFriendlyError(serverMessage, status);
      lastError = {
        message: f.message,
        rawMessage: serverMessage || (error as Error).message || "Failed to start checkout",
        status,
        retryable: f.retryable,
      };
      if (!f.retryable || attempt === maxRetries) return { error: lastError };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const f = toFriendlyError(raw);
      lastError = { message: f.message, rawMessage: raw, retryable: f.retryable };
      if (!f.retryable || attempt === maxRetries) return { error: lastError };
    }

    await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
  }

  return { error: lastError };
}

/**
 * Show a friendly checkout error toast with an optional Retry action
 * for transient failures (network/5xx/rate-limit).
 */
export function showCheckoutErrorToast(err: CheckoutError, onRetry?: () => void) {
  toast.error(err.message, {
    duration: 9000,
    action: err.retryable && onRetry ? { label: "Retry", onClick: onRetry } : undefined,
  });
}

/**
 * Error thrown by `invokeCheckoutOrThrow`. `message` is the friendly,
 * user-facing copy. `rawMessage` is the underlying server/Stripe text
 * so callers can still log the original details for monitoring.
 */
export class CheckoutHttpError extends Error {
  rawMessage: string;
  status?: number;
  retryable: boolean;
  constructor(err: CheckoutError) {
    super(err.message);
    this.name = "CheckoutHttpError";
    this.rawMessage = err.rawMessage;
    this.status = err.status;
    this.retryable = err.retryable;
  }
}

/**
 * Same as `invokeCheckout` but throws a `CheckoutHttpError` on failure.
 * Useful for sites that already have try/catch blocks doing analytics —
 * they get friendly `error.message` and transient retry for free.
 */
export async function invokeCheckoutOrThrow<T = unknown>(
  fn: string,
  body: Record<string, unknown>,
  opts: InvokeCheckoutOptions = {}
): Promise<T> {
  const { data, error } = await invokeCheckout<T>(fn, body, opts);
  if (error) throw new CheckoutHttpError(error);
  return data as T;
}
