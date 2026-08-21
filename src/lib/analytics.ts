/**
 * Conversion Funnel Analytics
 *
 * Tracks user journey through: Landing → Tickets → Checkout (multi-step) → Success
 * Persists to localStorage and writes events to public.funnel_events in Supabase.
 */

import { supabase } from "@/integrations/supabase/client";

export const FUNNEL_DEBUGGER_STORAGE_KEY = "analog_funnel_debugger_enabled";
const FUNNEL_DEBUG_EVENT = "analog:funnel-event";

export type FunnelStep =
  | "landing"
  | "tickets"
  | "ticket_selected"
  | "checkout_addons_view"
  | "checkout_lodging_view"
  | "checkout_review_view"
  | "checkout_start"
  | "checkout_submit"
  | "checkout_complete"
  | "payment_redirect"
  | "payment_session_failed"
  | "payment_success"
  | "payment_failed"
  | "payment_retry_clicked"
  | "payment_support_copied";

const STEP_ORDER: FunnelStep[] = [
  "landing",
  "tickets",
  "ticket_selected",
  "checkout_addons_view",
  "checkout_lodging_view",
  "checkout_review_view",
  "checkout_start",
  "checkout_submit",
  "checkout_complete",
  "payment_redirect",
  "payment_session_failed",
  "payment_success",
  "payment_failed",
  "payment_retry_clicked",
  "payment_support_copied",
];

export type FunnelDeviceType = 'mobile' | 'tablet' | 'desktop';

export interface FunnelEvent {
  step: FunnelStep;
  timestamp: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface SessionData {
  sessionId: string;
  startedAt: number;
  events: FunnelEvent[];
  landingPage?: string;
  deviceType?: FunnelDeviceType;
  viewportType?: FunnelDeviceType;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
}

interface FunnelDebugEventDetail {
  event: FunnelEvent;
  session: SessionData;
}

/**
 * Detect device type from user agent
 */
function detectDeviceType(): FunnelDeviceType {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

function detectViewportType(): FunnelDeviceType {
  if (typeof window === 'undefined') return 'desktop';
  if (window.innerWidth < 768) return 'mobile';
  if (window.innerWidth < 1024) return 'tablet';
  return 'desktop';
}

const STORAGE_KEY = 'analog_funnel_session';
const HISTORY_STORAGE_KEY = 'analog_funnel_session_history';
const PAYMENT_RETRY_CONTEXT_KEY = 'analog_payment_retry_context';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const PAYMENT_RETRY_CONTEXT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface PaymentRetryContext {
  attempt: number;
  clickedAt: number;
  sourceErrorCode: string;
  sourceFailureCategory: string;
  sourceSessionId?: string;
  originFunnelStep: 'payment_retry_clicked' | 'payment_support_copied';
}

/**
 * Generate a simple session ID
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get or create session
 */
function getSession(): SessionData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const session: SessionData = JSON.parse(stored);
      
      // Check if session is still active
      const lastEvent = session.events[session.events.length - 1];
      if (lastEvent && Date.now() - lastEvent.timestamp < SESSION_TIMEOUT_MS) {
        return session;
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Create new session
  const utm = parseUTMParams();
  const session: SessionData = {
    sessionId: generateSessionId(),
    startedAt: Date.now(),
    events: [],
    landingPage: typeof window !== "undefined" ? window.location.pathname : undefined,
    deviceType: detectDeviceType(),
    viewportType: detectViewportType(),
    utm,
  };
  
  saveSession(session);
  return session;
}

/**
 * Parse UTM params from URL
 */
function parseUTMParams(): SessionData['utm'] {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      source: params.get('utm_source') || undefined,
      medium: params.get('utm_medium') || undefined,
      campaign: params.get('utm_campaign') || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Save session to localStorage
 */
function saveSession(session: SessionData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    const history = getAnalyticsHistory();
    const nextHistory = [session, ...history.filter((item) => item.sessionId !== session.sessionId)].slice(0, 20);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
  } catch {
    // Storage might be full or disabled
  }
}

function getPaymentRetryContext(): PaymentRetryContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = sessionStorage.getItem(PAYMENT_RETRY_CONTEXT_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as PaymentRetryContext;
    if (!parsed.clickedAt || Date.now() - parsed.clickedAt > PAYMENT_RETRY_CONTEXT_TTL_MS) {
      sessionStorage.removeItem(PAYMENT_RETRY_CONTEXT_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function recordPaymentRetryContext(context: {
  sourceErrorCode: string;
  sourceFailureCategory: string;
  sourceSessionId?: string;
  originFunnelStep: 'payment_retry_clicked' | 'payment_support_copied';
}): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = getPaymentRetryContext();
    const nextContext: PaymentRetryContext = {
      attempt: context.originFunnelStep === 'payment_retry_clicked'
        ? (existing?.attempt ?? 0) + 1
        : (existing?.attempt ?? 0),
      clickedAt: Date.now(),
      sourceErrorCode: context.sourceErrorCode,
      sourceFailureCategory: context.sourceFailureCategory,
      sourceSessionId: context.sourceSessionId,
      originFunnelStep: context.originFunnelStep,
    };

    sessionStorage.setItem(PAYMENT_RETRY_CONTEXT_KEY, JSON.stringify(nextContext));
  } catch {
    // Ignore storage failures
  }
}

export function getPaymentRetryMetadata(): Record<string, string | number | boolean> | undefined {
  const context = getPaymentRetryContext();
  if (!context) return undefined;

  return {
    from_retry: true,
    retry_attempt: context.attempt,
    retry_source_error_code: context.sourceErrorCode,
    retry_source_failure_category: context.sourceFailureCategory,
    retry_source_session_id: context.sourceSessionId || 'missing',
    retry_origin_funnel_step: context.originFunnelStep,
  };
}

export function clearPaymentRetryContext(): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(PAYMENT_RETRY_CONTEXT_KEY);
  } catch {
    // Ignore storage failures
  }
}

function emitDebugEvent(detail: FunnelDebugEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FunnelDebugEventDetail>(FUNNEL_DEBUG_EVENT, { detail }));
}

/**
 * Track a funnel step
 */
export function trackFunnelStep(
  step: FunnelStep,
  metadata?: Record<string, string | number | boolean>
): void {
  const session = getSession();
  session.deviceType = detectDeviceType();
  session.viewportType = detectViewportType();
  
  // Don't duplicate consecutive same-step events
  const lastEvent = session.events[session.events.length - 1];
  if (lastEvent?.step === step) {
    return;
  }

  const event: FunnelEvent = {
    step,
    timestamp: Date.now(),
    metadata,
  };

  session.events.push(event);
  saveSession(session);
  emitDebugEvent({ session, event });

  // Send to analytics (non-blocking)
  sendAnalytics(session, event);
}

/**
 * Send analytics event (fire and forget)
 */
async function sendAnalytics(session: SessionData, event: FunnelEvent): Promise<void> {
  try {
    const currentIndex = STEP_ORDER.indexOf(event.step);
    const previousEvent = session.events.length > 1
      ? session.events[session.events.length - 2]
      : null;

    // Best-effort fire-and-forget insert.
    // NOTE: PostgrestBuilder is a lazy thenable — `void supabase.from(...).insert(...)`
    // does NOT actually execute the request. We must call .then() to trigger it.
    supabase.from("funnel_events").insert({
      session_id: session.sessionId,
      step: event.step,
      step_index: currentIndex,
      source_path: typeof window !== "undefined" ? window.location.pathname : null,
      time_from_start_ms: event.timestamp - session.startedAt,
      time_from_previous_ms: previousEvent ? event.timestamp - previousEvent.timestamp : null,
      utm_source: session.utm?.source ?? null,
      utm_medium: session.utm?.medium ?? null,
      utm_campaign: session.utm?.campaign ?? null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      landing_page: session.landingPage ?? null,
      device_type: session.deviceType ?? null,
      metadata: event.metadata ?? null,
    }).then(({ error }) => {
      if (error) {
        console.warn("[funnel] insert failed:", error.message);
      }
    });
  } catch {
    // Silently fail - analytics shouldn't break the app
  }
}

/**
 * Get current session for debugging
 */
export function getAnalyticsSession(): SessionData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function getAnalyticsHistory(): SessionData[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Clear session (for testing)
 */
export function clearAnalyticsSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function clearAnalyticsHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function getFunnelDebuggerEnabled(): boolean {
  try {
    return localStorage.getItem(FUNNEL_DEBUGGER_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setFunnelDebuggerEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FUNNEL_DEBUGGER_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage failures
  }
}

export function subscribeToFunnelEvents(callback: (detail: FunnelDebugEventDetail) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<FunnelDebugEventDetail>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };

  window.addEventListener(FUNNEL_DEBUG_EVENT, handler as EventListener);
  return () => window.removeEventListener(FUNNEL_DEBUG_EVENT, handler as EventListener);
}

/**
 * Convenience functions for common tracking points
 */
export const Funnel = {
  /** Landing page view (homepage, /reserve, /win, /go, etc.) */
  landing: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("landing", metadata),

  /** Tickets page view */
  tickets: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("tickets", metadata),

  /** User picked a ticket type and clicked continue */
  ticketSelected: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("ticket_selected", metadata),

  /** Add-ons step viewed */
  addonsView: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("checkout_addons_view", metadata),

  /** Lodging step viewed */
  lodgingView: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("checkout_lodging_view", metadata),

  /** Cart review page viewed */
  reviewView: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("checkout_review_view", metadata),

  /** Checkout flow started (entered details) */
  checkoutStart: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("checkout_start", metadata),

  /** User clicked the "Pay" / "Continue to payment" button */
  checkoutSubmit: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("checkout_submit", metadata),

  /** Stripe checkout session created and ready */
  checkoutComplete: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("checkout_complete", metadata),

  /** User redirected to Stripe */
  paymentRedirect: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("payment_redirect", metadata),

  /** Stripe Checkout session creation failed before redirect */
  paymentSessionFailed: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("payment_session_failed", metadata),

  /** Successful payment confirmation page reached */
  paymentSuccess: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("payment_success", metadata),

  /** Payment failed (Stripe error, validation error, etc.) */
  paymentFailed: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("payment_failed", metadata),

  /** User clicked retry from the payment failure panel */
  paymentRetryClicked: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("payment_retry_clicked", metadata),

  /** User copied the support note from the payment failure panel */
  paymentSupportCopied: (metadata?: Record<string, string | number | boolean>) =>
    trackFunnelStep("payment_support_copied", metadata),
};

export default Funnel;
