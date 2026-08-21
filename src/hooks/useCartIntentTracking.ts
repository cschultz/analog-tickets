import { useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredUTMParams } from "./useUTMTracking";

const SESSION_KEY = "cart_intent_session_id";

/** Stable anonymous session ID that persists across page navigations */
function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function getDeviceType(): string {
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function getFbclid(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("fbclid");
    if (fromUrl) return fromUrl;
    // Try _fbc cookie
    const fbc = document.cookie.match(/(?:^|;\s*)_fbc=([^;]*)/);
    if (fbc) return fbc[1];
  } catch {}
  return null;
}

interface TrackIntentParams {
  signalType: string;
  ticketType?: string | null;
  quantity?: number;
  email?: string | null;
  name?: string | null;
  pageUrl?: string;
}

/**
 * Tracks anonymous and identified browsing intent signals
 * for lead recovery. Signals are fire-and-forget to avoid
 * impacting checkout UX.
 */
export function useCartIntentTracking() {
  const sessionId = useRef(getSessionId());
  const lastSignal = useRef<string>("");

  const trackIntent = useCallback(async ({
    signalType,
    ticketType,
    quantity,
    email,
    name,
    pageUrl,
  }: TrackIntentParams) => {
    // Deduplicate rapid-fire identical signals
    const key = `${signalType}:${ticketType}:${quantity}:${email}`;
    if (key === lastSignal.current) return;
    lastSignal.current = key;

    try {
      const utm = getStoredUTMParams();
      const fbclid = getFbclid();

      await supabase.from("cart_intent_signals").insert({
        session_id: sessionId.current,
        signal_type: signalType,
        ticket_type: ticketType || null,
        quantity: quantity || 1,
        email: email || null,
        name: name || null,
        page_url: pageUrl || window.location.pathname,
        utm_source: utm.utm_source || null,
        utm_medium: utm.utm_medium || null,
        utm_campaign: utm.utm_campaign || null,
        utm_content: utm.utm_content || null,
        fbclid: fbclid,
        gclid: utm.gclid || null,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        device_type: getDeviceType(),
        lead_status: email ? "identified" : "anonymous",
      });
    } catch (e) {
      // Silent fail — never block checkout UX
      console.warn("[Intent Tracking] Failed to log signal:", e);
    }
  }, []);

  /** Fire page_view signal on mount */
  const trackPageView = useCallback((page?: string) => {
    trackIntent({ signalType: "page_view", pageUrl: page });
  }, [trackIntent]);

  /** Track ticket type selection */
  const trackTicketSelect = useCallback((ticketType: string, quantity?: number) => {
    trackIntent({ signalType: "ticket_select", ticketType, quantity });
  }, [trackIntent]);

  /** Track quantity change */
  const trackQuantityChange = useCallback((ticketType: string, quantity: number) => {
    trackIntent({ signalType: "quantity_change", ticketType, quantity });
  }, [trackIntent]);

  /** Track when user expands checkout / details form */
  const trackDetailsExpanded = useCallback((ticketType?: string) => {
    trackIntent({ signalType: "details_expanded", ticketType });
  }, [trackIntent]);

  /** Track email capture — upgrades session from anonymous to identified */
  const trackEmailCapture = useCallback((email: string, name?: string, ticketType?: string) => {
    trackIntent({ signalType: "email_entered", ticketType, email, name });

    // Also retroactively update all anonymous signals in this session
    supabase.from("cart_intent_signals")
      .update({ email, name: name || null, lead_status: "identified" })
      .eq("session_id", sessionId.current)
      .is("email", null)
      .then(() => {});
  }, [trackIntent]);

  /** Track checkout form submission */
  const trackCheckoutSubmit = useCallback((ticketType: string, email: string, name: string) => {
    trackIntent({ signalType: "checkout_submit", ticketType, email, name });
  }, [trackIntent]);

  return {
    trackPageView,
    trackTicketSelect,
    trackQuantityChange,
    trackDetailsExpanded,
    trackEmailCapture,
    trackCheckoutSubmit,
    sessionId: sessionId.current,
  };
}
