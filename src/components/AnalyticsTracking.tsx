import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  getTrackingConfig,
  hasGoogleTracking,
  hasMetaTracking,
  isTrackingConfigured,
  isTrackingExemptPath,
  type TrackingConfig,
} from "@/platform/config/tracking";

// ============================================
// TRACKING IDS
// ============================================
// There are NO hardcoded identifiers here. Everything below is opt-in and
// comes from the operator's own optional VITE_* configuration. With no
// configuration (the default fresh remix) nothing is loaded, no pixel is
// initialised, and no tracking endpoint is contacted.
const trackingConfig: TrackingConfig = getTrackingConfig();

const GA4_MEASUREMENT_ID = trackingConfig.ga4MeasurementId;
const GOOGLE_ADS_IDS = trackingConfig.googleAdsIds;
const FB_PIXEL_ID = trackingConfig.metaPixelId;

// Google Ads purchase conversion labels
// NOTE: Purchase conversions are imported from GA4 via the `ticket_purchase` event,
// so no manual Google Ads conversion fire is needed. Add a label here only if you
// also create a native Google Ads website conversion action.
const GOOGLE_ADS_CONVERSION_LABELS: string[] = [];

// Google Ads secondary conversion labels (begin_checkout — learning signal only)
const GOOGLE_ADS_CONVERSION_LABELS_SECONDARY: string[] = [];

/** True only when the operator opted into any tracking surface. */
export function isAnalyticsEnabled(): boolean {
  return isTrackingConfigured(trackingConfig);
}

// Declare global types for tracking
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    fbq: any;
    _fbq: any;
  }
}


// ============================================
// EVENT ID GENERATION FOR DEDUPLICATION
// ============================================

/**
 * Generate a unique event ID for deduplication between Pixel and CAPI
 * Format: {event_name}_{timestamp}_{random}
 */
export function generateEventId(eventName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${eventName}_${timestamp}_${random}`;
}

/**
 * Capture fbclid from URL and persist as _fbc first-party cookie.
 * Format: fb.1.<creation_time>.<fbclid>
 * Only overwrites existing _fbc if a new fbclid is present in the URL.
 */
export function captureFbcFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid");
    
    if (fbclid) {
      const fbc = `fb.1.${Date.now()}.${fbclid}`;
      document.cookie = `_fbc=${fbc}; max-age=${90 * 24 * 60 * 60}; path=/; SameSite=Lax`;
      console.log("[Analytics] Captured fbclid → _fbc cookie:", fbc);
    }
  } catch (e) {
    console.warn("[Analytics] Could not capture fbclid:", e);
  }
}

/**
 * Get Facebook cookies for enhanced matching.
 * Reads _fbp (set by Pixel) and _fbc (set by captureFbcFromUrl or Pixel).
 */
export function getFbCookies(): { fbp?: string; fbc?: string } {
  const cookies: { fbp?: string; fbc?: string } = {};
  
  try {
    const cookieString = document.cookie;
    const fbpMatch = cookieString.match(/_fbp=([^;]+)/);
    const fbcMatch = cookieString.match(/_fbc=([^;]+)/);
    
    if (fbpMatch) cookies.fbp = fbpMatch[1];
    if (fbcMatch) cookies.fbc = fbcMatch[1];
  } catch (e) {
    console.warn("[Analytics] Could not read FB cookies:", e);
  }
  
  return cookies;
}

// ============================================
// CLIENT IP CAPTURE (cached per session)
// ============================================

let _cachedClientIp: string | null = null;
let _ipFetchPromise: Promise<string | null> | null = null;

/**
 * Fetch the real client IP via our edge function.
 * Cached in memory for the session — only one network call.
 */
export async function getClientIp(): Promise<string | null> {
  if (_cachedClientIp) return _cachedClientIp;
  if (_ipFetchPromise) return _ipFetchPromise;
  
  _ipFetchPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-client-ip");
      if (!error && data?.ip) {
        _cachedClientIp = data.ip;
        return data.ip as string;
      }
    } catch (e) {
      console.warn("[Analytics] Could not fetch client IP:", e);
    }
    return null;
  })();
  
  return _ipFetchPromise;
}

/**
 * Get all Meta CAPI client metadata for passing to server-side events.
 * Includes fbp, fbc, client_ip, client_user_agent, event_source_url.
 */
export async function getMetaClientData(): Promise<{
  fbp?: string;
  fbc?: string;
  client_ip?: string;
  client_user_agent: string;
  event_source_url: string;
}> {
  const { fbp, fbc } = getFbCookies();
  const clientIp = await getClientIp();
  
  return {
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    client_ip: clientIp || undefined,
    client_user_agent: navigator.userAgent,
    event_source_url: window.location.href,
  };
}

/**
 * Send event to Meta Conversions API (server-side)
 * This should be called alongside Pixel events for deduplication
 */
async function sendToMetaCapi(params: {
  event_name: string;
  event_id: string;
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  user_email?: string;
}): Promise<void> {
  // No Meta configuration → no server-side conversion call at all.
  if (!hasMetaTracking(trackingConfig)) return;

  try {
    const metaData = await getMetaClientData();
    
    const { error } = await supabase.functions.invoke("meta-capi", {
      body: {
        ...params,
        ...metaData,
      },
    });
    
    if (error) {
      console.error("[Meta CAPI] Error:", error);
    }
  } catch (err) {
    console.error("[Meta CAPI] Failed to send:", err);
  }
}

// ============================================
// ANALYTICS TRACKING COMPONENT
// ============================================

export const AnalyticsTracking = () => {
  const location = useLocation();

  // Initialize all tracking scripts on mount
  useEffect(() => {
    // Unconfigured remix, or a staff-facing surface → load nothing.
    if (!isTrackingConfigured(trackingConfig)) return;
    if (isTrackingExemptPath(window.location.pathname)) return;

    // Capture fbclid → _fbc cookie on every page load (before pixel init)
    captureFbcFromUrl();

    // Tag Manager container (optional)
    initTagManager();

    // Initialize Google Tag (GA4 + Google Ads)
    initGoogleTag();

    // Initialize Facebook Pixel
    initFacebookPixel();

    // Optional third-party content/personalisation script
    initContentScript();
  }, []);

  // Track page views on route change AND initial load
  const initialPageViewSent = useRef(false);
  
  useEffect(() => {
    if (!isTrackingConfigured(trackingConfig)) return;

    // Skip duplicate PageView on initial load (already fired in init)
    if (!initialPageViewSent.current) {
      initialPageViewSent.current = true;
      console.log("[Analytics] PageView (initial):", location.pathname);
      return; // initFacebookPixel already fires PageView
    }

    // GA4 page view on SPA navigation
    if (hasGoogleTracking(trackingConfig)) {
      whenGtagReady(() => {
        window.gtag("event", "page_view", {
          page_path: location.pathname + location.search,
          page_title: document.title,
        });
      });
    }

    // Facebook page view on SPA navigation
    if (window.fbq) {
      window.fbq("track", "PageView");
      console.log("[Analytics] PageView (route change):", location.pathname);
    }
  }, [location.pathname, location.search]);


  return null;
};

// ============================================
// GTAG READINESS QUEUE
// ============================================

let gtagReady = false;
let gtagReadyCallbacks: (() => void)[] = [];

/**
 * Wait for gtag to be fully ready before executing callback.
 * Handles the race condition where events fire before gtag loads.
 */
export function whenGtagReady(callback: () => void): void {
  if (gtagReady && window.gtag) {
    callback();
  } else {
    gtagReadyCallbacks.push(callback);
  }
}

// ============================================
// TAG MANAGER / THIRD-PARTY SCRIPT (opt-in)
// ============================================

/** Injects a Tag Manager container only when the operator configured one. */
function initTagManager() {
  const containerId = trackingConfig.gtmContainerId;
  if (!containerId) return;
  if (document.querySelector('script[data-tracking="gtm"]')) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.async = true;
  script.dataset.tracking = "gtm";
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.appendChild(script);
}

/** Injects an optional third-party content/personalisation script. */
function initContentScript() {
  const src = trackingConfig.contentScriptUrl;
  if (!src) return;
  if (document.querySelector('script[data-tracking="content"]')) return;

  const script = document.createElement("script");
  script.src = src;
  script.defer = true;
  script.dataset.tracking = "content";
  document.head.appendChild(script);
}

// ============================================
// GOOGLE TAG INITIALIZATION
// ============================================

/**
 * Initialize Google Tag (gtag.js) for GA4 and Google Ads.
 * No-ops entirely when the operator configured no Google ids.
 */
function initGoogleTag() {
  if (!hasGoogleTracking(trackingConfig)) return;

  const tagId = GA4_MEASUREMENT_ID ?? GOOGLE_ADS_IDS[0];
  const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag/js"]`);
  
  if (!existingScript) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
    document.head.appendChild(script);
  }

  // Reuse existing dataLayer or create new one
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
  
  // Configure GA4
  window.gtag("js", new Date());
  if (GA4_MEASUREMENT_ID) {
    window.gtag("config", GA4_MEASUREMENT_ID, {
      send_page_view: true,
    });
    console.log("[Analytics] GA4 configured");
  }

  // Configure Google Ads accounts
  for (const adsId of GOOGLE_ADS_IDS) {
    window.gtag("config", adsId);
    console.log("[Analytics] Google Ads configured");
  }
  
  // Mark gtag as ready and flush queued callbacks
  gtagReady = true;
  const callbacks = gtagReadyCallbacks;
  gtagReadyCallbacks = [];
  callbacks.forEach(cb => cb());
}

// ============================================
// FACEBOOK PIXEL INITIALIZATION
// ============================================

function initFacebookPixel() {
  if (!FB_PIXEL_ID) return;

  // Check if already initialized elsewhere
  if (window.fbq && window.fbq.loaded) {
    console.log("[Analytics] Meta Pixel already initialized");
    return;
  }


  // Initialize the pixel loader dynamically
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(
    window,
    document,
    "script",
    "https://connect.facebook.net/en_US/fbevents.js"
  );

  window.fbq("init", FB_PIXEL_ID);
  window.fbq("track", "PageView");
  console.log("[Analytics] Meta Pixel initialized");

}

// ============================================
// GA4 ECOMMERCE EVENT TYPES
// ============================================

export interface GA4Item {
  item_id: string;
  item_name: string;
  item_category?: string;
  price?: number;
  quantity?: number;
}

// ============================================
// TICKET FUNNEL EVENTS (GA4 Ecommerce)
// ============================================

/**
 * Track view_item — fire on ticketing page load.
 * GA4 recommended ecommerce event.
 */
export function trackGA4ViewItem(params: {
  item_id: string;
  item_name: string;
  item_category: string;
  price: number;
  currency?: string;
}) {
  const { item_id, item_name, item_category, price, currency = "USD" } = params;
  
  whenGtagReady(() => {
    window.gtag("event", "view_item", {
      currency,
      value: price,
      items: [{
        item_id,
        item_name,
        item_category,
        price,
        quantity: 1,
      }],
    });
    console.log("[GA4] view_item:", { item_id, item_name, price });
  });

  // Facebook ViewContent
  if (window.fbq) {
    window.fbq("track", "ViewContent", {
      content_name: item_name,
      content_category: item_category,
      content_ids: [item_id],
      content_type: "product",
      value: price,
      currency,
    });
  }
}

/**
 * Track view_item_list — fire when ticket options grid is displayed.
 * GA4 recommended ecommerce event.
 */
export function trackGA4ViewItemList(params: {
  item_list_id: string;
  item_list_name: string;
  items: GA4Item[];
}) {
  const { item_list_id, item_list_name, items } = params;
  
  whenGtagReady(() => {
    window.gtag("event", "view_item_list", {
      item_list_id,
      item_list_name,
      items: items.map((item, index) => ({
        item_id: item.item_id,
        item_name: item.item_name,
        item_category: item.item_category,
        price: item.price,
        quantity: item.quantity || 1,
        index,
        item_list_id,
        item_list_name,
      })),
    });
    console.log("[GA4] view_item_list:", { item_list_id, item_list_name, itemCount: items.length });
  });
}

/**
 * Track select_item — fire when user clicks/selects a specific ticket type.
 * GA4 recommended ecommerce event.
 */
export function trackGA4SelectItem(params: {
  item_list_id?: string;
  item_list_name?: string;
  item: GA4Item;
}) {
  const { item_list_id, item_list_name, item } = params;
  
  whenGtagReady(() => {
    window.gtag("event", "select_item", {
      item_list_id,
      item_list_name,
      items: [{
        item_id: item.item_id,
        item_name: item.item_name,
        item_category: item.item_category,
        price: item.price,
        quantity: item.quantity || 1,
      }],
    });
    console.log("[GA4] select_item:", { item_id: item.item_id, item_name: item.item_name });
  });
}

/**
 * Track add_to_cart — fire when user adds tickets to cart.
 * GA4 recommended ecommerce event.
 */
export function trackGA4AddToCart(params: {
  items: GA4Item[];
  currency?: string;
  value: number;
}) {
  const { items, currency = "USD", value } = params;
  const eventId = generateEventId("AddToCart");
  
  whenGtagReady(() => {
    window.gtag("event", "add_to_cart", {
      currency,
      value,
      items: items.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        item_category: item.item_category,
        price: item.price,
        quantity: item.quantity || 1,
      })),
    });
    console.log("[GA4] add_to_cart:", { value, items });
  });

  // Facebook AddToCart with deduplication
  if (window.fbq) {
    window.fbq("track", "AddToCart", {
      value,
      currency,
      content_type: "product",
      content_ids: items.map(i => i.item_id),
    }, { eventID: eventId });
  }

  // Meta CAPI
  sendToMetaCapi({
    event_name: "AddToCart",
    event_id: eventId,
    value,
    currency,
    content_ids: items.map(i => i.item_id),
  });
}

/**
 * Track begin_checkout — fire when user proceeds to payment.
 * GA4 recommended ecommerce event.
 * 
 * Server-side CAPI InitiateCheckout is fired by the checkout creation
 * edge function. Browser Pixel uses the same icEventId for deduplication.
 */
export function trackGA4BeginCheckout(params: {
  items: GA4Item[];
  currency?: string;
  value: number;
  /** Pass the icEventId returned by the checkout creation function for deduplication */
  icEventId?: string;
}) {
  const { items, currency = "USD", value, icEventId } = params;
  const eventId = icEventId || generateEventId("InitiateCheckout");
  
  // GA4 begin_checkout
  whenGtagReady(() => {
    const ecommerce = {
      currency,
      value,
      items: items.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        item_category: item.item_category,
        price: item.price,
        quantity: item.quantity || 1,
      })),
    };
    window.gtag("event", "begin_checkout", ecommerce);

    // GTM-shaped dataLayer push (clears prior ecommerce object first per GA4 best practice)
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({
      event: "begin_checkout",
      ecommerce: { ...ecommerce, transaction_id: eventId },
    });
    console.log("[GA4/GTM] begin_checkout:", { value, items });

    // Google Ads secondary conversion (begin_checkout learning signal)
    for (const label of GOOGLE_ADS_CONVERSION_LABELS_SECONDARY) {
      window.gtag("event", "conversion", {
        send_to: label,
        value,
        currency,
      });
      console.log("[Google Ads] Secondary conversion (begin_checkout):", label);
    }
  });

  // Facebook Pixel InitiateCheckout with same event_id for dedup with server CAPI
  if (window.fbq) {
    window.fbq("track", "InitiateCheckout", {
      value,
      currency,
      content_type: "product",
      content_ids: items.map(i => i.item_id),
    }, { eventID: eventId });
    console.log("[FB Pixel] InitiateCheckout fired with eventID:", eventId);
  }
}

/**
 * Track purchase — fire on successful payment completion (TicketSuccess page).
 * GA4 recommended ecommerce event.
 * 
 * The browser-side Pixel Purchase uses the same event_id (meta_event_id)
 * as the server-side CAPI Purchase sent from the Stripe webhook.
 * We do NOT send a CAPI call from the browser for Purchase.
 */
export function trackGA4Purchase(params: {
  transaction_id: string;
  value: number;
  currency?: string;
  tax?: number;
  items: GA4Item[];
  user_email?: string;
  user_phone?: string;
  user_name?: string;
}) {
  const { transaction_id, value, currency = "USD", tax = 0, items } = params;
  const eventId = transaction_id || generateEventId("Purchase");

  // Idempotency guard: prevent duplicate purchase events on page refresh
  const idempotencyKey = `purchase_fired_${eventId}`;
  if (sessionStorage.getItem(idempotencyKey)) {
    console.log("[Analytics] Purchase already fired for this session, skipping:", eventId);
    return;
  }
  sessionStorage.setItem(idempotencyKey, "1");
  
  whenGtagReady(() => {
    // Set user data for Google Enhanced Conversions before the purchase event.
    // gtag hashes email/phone/name automatically before sending to Google Ads.
    // Including phone + name boosts match rate by 10-30% (recovers iOS/Safari/ad-block losses).
    if (params.user_email || params.user_phone || params.user_name) {
      const userData: {
        email?: string;
        phone_number?: string;
        address?: { first_name?: string; last_name?: string };
      } = {};

      if (params.user_email) {
        userData.email = params.user_email.toLowerCase().trim();
      }

      if (params.user_phone) {
        // Normalize to E.164-ish: strip spaces/dashes/parens, ensure leading +.
        // gtag accepts +1XXXXXXXXXX format. Default to +1 (US) if no country code.
        const cleaned = params.user_phone.replace(/[\s\-().]/g, "");
        if (cleaned) {
          const e164 = cleaned.startsWith("+")
            ? cleaned
            : cleaned.length === 10
              ? `+1${cleaned}`
              : `+${cleaned}`;
          userData.phone_number = e164;
        }
      }

      if (params.user_name) {
        const parts = params.user_name.trim().split(/\s+/);
        const firstName = parts[0]?.toLowerCase();
        const lastName = parts.slice(1).join(" ").toLowerCase() || undefined;
        if (firstName) {
          userData.address = { first_name: firstName };
          if (lastName) userData.address.last_name = lastName;
        }
      }

      window.gtag("set", "user_data", userData);
      console.log("[GA4] Enhanced conversions user_data set:", {
        has_email: !!userData.email,
        has_phone: !!userData.phone_number,
        has_name: !!userData.address,
      });
    }

    // GA4 ticket_purchase event (imported into Google Ads as primary Purchase conversion)
    const purchasePayload = {
      transaction_id: eventId,
      value,
      currency,
      tax,
      items: items.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        item_category: item.item_category,
        price: item.price,
        quantity: item.quantity || 1,
      })),
    };
    // Fire `ticket_purchase` (the event Google Ads is configured to import from GA4)
    window.gtag("event", "ticket_purchase", purchasePayload);
    // Also fire standard `purchase` for GA4 ecommerce reports
    window.gtag("event", "purchase", purchasePayload);

    // GTM-shaped dataLayer push for GTM custom triggers (TikTok, LinkedIn, Reddit, server-side, etc.)
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({
      event: "purchase",
      ecommerce: purchasePayload,
      user_data: {
        email: params.user_email?.toLowerCase().trim(),
        phone: params.user_phone,
        name: params.user_name,
      },
    });
    console.log("[GA4/GTM] ticket_purchase + purchase:", { transaction_id: eventId, value, tax, items });

    // Google Ads conversions — only fire when labels are actually configured
    for (const label of GOOGLE_ADS_CONVERSION_LABELS) {
      window.gtag("event", "conversion", {
        send_to: label,
        value,
        currency,
        transaction_id: eventId,
      });
      console.log("[Google Ads] Conversion fired:", label);
    }

    if (GOOGLE_ADS_CONVERSION_LABELS.length === 0) {
      console.warn("[Google Ads] No conversion labels configured — purchase conversion NOT sent to Google Ads. Add labels to GOOGLE_ADS_CONVERSION_LABELS.");
    }
  });

  // Facebook Pixel Purchase with same event_id for deduplication with server-side CAPI
  if (window.fbq) {
    window.fbq("track", "Purchase", {
      value,
      currency,
      content_type: "product",
      content_ids: items.map(i => i.item_id),
    }, { eventID: eventId });
    console.log("[FB Pixel] Purchase fired with eventID:", eventId);
  }
}

// ============================================
// LEAD FUNNEL EVENTS
// ============================================

/**
 * Track view_lead_form — fire when lead form is viewed.
 * Custom GA4 event for lead funnel.
 */
export function trackViewLeadForm() {
  whenGtagReady(() => {
    window.gtag("event", "view_lead_form");
    console.log("[GA4] view_lead_form");
  });
}

/**
 * Track generate_lead — fire on successful lead form submission.
 * GA4 recommended event with method parameter.
 *
 * Server-side CAPI Lead is fired by the calling code via the meta-capi
 * edge function after a confirmed successful submission. Browser Pixel uses the
 * same leadEventId for deduplication.
 */
export function trackGenerateLead(params: {
  method?: string;
  user_email?: string;
  content_name?: string;
  /** Pass the leadEventId used for the server-side CAPI call for deduplication */
  leadEventId?: string;
}) {
  const { method = "onsite_form", content_name = "Cosmico Email Opt-in", leadEventId } = params;
  const eventId = leadEventId || generateEventId("Lead");
  
  whenGtagReady(() => {
    window.gtag("event", "generate_lead", {
      method,
    });
    console.log("[GA4] generate_lead:", { method });
  });

  // Facebook Pixel Lead with same event_id for dedup with server CAPI
  if (window.fbq) {
    window.fbq("track", "Lead", {
      content_name,
    }, { eventID: eventId });
    console.log("[FB Pixel] Lead fired with eventID:", eventId);
  }
}

// ============================================
// LEGACY TRACKING FUNCTIONS (backwards compatibility)
// ============================================

/** @deprecated Use trackGA4Purchase instead */
export function trackPurchase(
  value: number,
  currency: string = "USD",
  transactionId?: string,
  contentIds?: string[],
  userEmail?: string
) {
  trackGA4Purchase({
    transaction_id: transactionId || generateEventId("Purchase"),
    value,
    currency,
    items: contentIds?.map(id => ({
      item_id: id,
      item_name: "Cosmico Ticket",
      item_category: "Festival Ticket",
      price: value / (contentIds?.length || 1),
      quantity: 1,
    })) || [],
    user_email: userEmail,
  });
}

/** @deprecated Use trackGA4BeginCheckout instead */
export function trackInitiateCheckout(
  value: number,
  currency: string = "USD",
  contentIds?: string[]
) {
  trackGA4BeginCheckout({
    value,
    currency,
    items: contentIds?.map(id => ({
      item_id: id,
      item_name: "Cosmico Ticket",
      item_category: "Festival Ticket",
      price: value / (contentIds?.length || 1),
      quantity: 1,
    })) || [],
  });
}

/** @deprecated Use trackGA4AddToCart instead */
export function trackAddToCart(
  value: number,
  currency: string = "USD",
  contentIds?: string[]
) {
  trackGA4AddToCart({
    value,
    currency,
    items: contentIds?.map(id => ({
      item_id: id,
      item_name: "Cosmico Ticket",
      item_category: "Festival Ticket",
      price: value,
      quantity: 1,
    })) || [],
  });
}

/** @deprecated Use trackGA4ViewItem instead */
export function trackViewContent(
  contentName: string = "Cosmico 2026",
  contentCategory: string = "Festival"
) {
  trackGA4ViewItem({
    item_id: "analog_reunion_ticket",
    item_name: contentName,
    item_category: contentCategory,
    price: 0,
  });
}

/** @deprecated Use trackGenerateLead instead */
export function trackLead(contentName: string = "Cosmico Email Opt-in", userEmail?: string, leadEventId?: string) {
  trackGenerateLead({
    method: "onsite_form",
    user_email: userEmail,
    content_name: contentName,
    leadEventId,
  });
}

/**
 * Track custom event (GA4 + Facebook)
 */
export function trackCustomEvent(eventName: string, params?: Record<string, unknown>) {
  whenGtagReady(() => {
    window.gtag("event", eventName, params);
  });
  if (window.fbq) {
    window.fbq("trackCustom", eventName, params);
  }
}

// ============================================
// SCROLL DEPTH TRACKING
// ============================================

/**
 * Track scroll depth milestones (25%, 50%, 75%, 100%).
 * Returns a cleanup function to remove the listener.
 * Call once per page mount.
 */
export function initScrollDepthTracking(): () => void {
  const milestones = [25, 50, 75, 100];
  const firedMilestones = new Set<number>();
  const pagePath = window.location.pathname;
  
  function checkScroll() {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollHeight <= 0) return;
    
    const scrollPercent = Math.round((window.scrollY / scrollHeight) * 100);
    
    for (const milestone of milestones) {
      if (scrollPercent >= milestone && !firedMilestones.has(milestone)) {
        firedMilestones.add(milestone);
        
        whenGtagReady(() => {
          window.gtag("event", "scroll_depth", {
            percent_scrolled: milestone,
            page_path: pagePath,
          });
          console.log(`[GA4] scroll_depth: ${milestone}% on ${pagePath}`);
        });
      }
    }
  }
  
  window.addEventListener("scroll", checkScroll, { passive: true });
  return () => window.removeEventListener("scroll", checkScroll);
}

// ============================================
// ENHANCED CONVERSIONS: SET USER DATA
// ============================================

/**
 * Google enhanced conversions user data shape.
 * gtag hashes email/phone/name automatically before sending.
 */
interface EnhancedConversionUserData {
  email?: string;
  phone_number?: string;
  address?: {
    first_name?: string;
    last_name?: string;
  };
}

/**
 * Set user data for Google enhanced conversions.
 * Call when you capture user email (e.g. lead form, checkout).
 * gtag hashes automatically before sending to Google.
 */
export function setGoogleUserData(params: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}) {
  whenGtagReady(() => {
    const userData: EnhancedConversionUserData = {};
    
    if (params.email) {
      userData.email = params.email.toLowerCase().trim();
    }
    if (params.phone) {
      userData.phone_number = params.phone;
    }
    
    const hasName = params.firstName || params.lastName;
    if (hasName) {
      userData.address = {};
      if (params.firstName) userData.address.first_name = params.firstName;
      if (params.lastName) userData.address.last_name = params.lastName;
    }
    
    window.gtag("set", "user_data", userData);
    console.log("[GA4] Enhanced conversions: user_data updated");
  });
}
