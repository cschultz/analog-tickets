// Shared Meta Conversions API utilities for server-side event tracking
// Used by stripe-webhook (Purchase), checkout functions (InitiateCheckout),
// and meta-capi edge function (Lead, ViewContent, AddToCart, etc.)

const PRODUCTION_DOMAIN = "https://example.invalid";

/**
 * SHA-256 hash for user data (required by Meta CAPI)
 * Normalizes to lowercase, trims whitespace before hashing
 */
export async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a unique event ID for Meta CAPI deduplication
 * Format: {prefix}_{timestamp}_{random}
 */
export function generateMetaEventId(prefix: string = "purchase"): string {
  const timestamp = Date.now();
  const random = crypto.randomUUID().split("-")[0];
  return `${prefix}_${timestamp}_${random}`;
}

// ============================================
// GENERIC META CAPI EVENT SENDER
// ============================================

interface MetaUserData {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  zp?: string;
  external_id?: string;
  fbp?: string;
  fbc?: string;
  client_ip_address?: string;
  client_user_agent?: string;
}

export interface MetaCapiEventParams {
  /** Meta standard event name: "Purchase", "Lead", "InitiateCheckout", etc. */
  event_name: string;
  /** Unique event ID for browser↔server deduplication */
  event_id: string;
  /** User email (will be SHA-256 hashed) */
  email?: string;
  /** User phone (will be SHA-256 hashed, digits only) */
  phone?: string;
  /** First name (will be SHA-256 hashed) */
  first_name?: string;
  /** Last name (will be SHA-256 hashed) */
  last_name?: string;
  /** Zip/postal code (will be SHA-256 hashed) */
  zip_code?: string;
  /** Stable internal identifier — registration ID, user ID, or Stripe customer ID (will be SHA-256 hashed) */
  external_id?: string;
  /** Facebook browser ID cookie — sent RAW (not hashed) */
  fbp?: string;
  /** Facebook click ID cookie — sent RAW (not hashed) */
  fbc?: string;
  /** Client IP address */
  client_ip?: string;
  /** Client user agent string */
  client_user_agent?: string;
  /** Purchase/checkout value in standard currency units (e.g., 197.00) */
  value?: number;
  /** Currency code, e.g., "USD" */
  currency?: string;
  /** Product/content IDs */
  content_ids?: string[];
  /** Content/product name */
  content_name?: string;
  /** Content category */
  content_category?: string;
  /** Canonical page URL where the event occurred */
  event_source_url?: string;
}

interface MetaCapiResponse {
  success: boolean;
  events_received?: number;
  messages?: string[];
  error?: unknown;
}

/**
 * Send any standard event to Meta Conversions API.
 * 
 * Supported events: Purchase, Lead, InitiateCheckout, AddToCart, ViewContent, etc.
 *
 * Environment variables required:
 * - META_PIXEL_ID
 * - META_ACCESS_TOKEN
 * - META_TEST_EVENT_CODE (optional, for Events Manager testing)
 * - SITE_URL (optional fallback for event_source_url)
 */
export async function sendMetaCapiEvent(
  params: MetaCapiEventParams
): Promise<MetaCapiResponse> {
  const metaPixelId = Deno.env.get("META_PIXEL_ID");
  const metaAccessToken = Deno.env.get("META_ACCESS_TOKEN");
  const testEventCode = Deno.env.get("META_TEST_EVENT_CODE");

  if (!metaPixelId || !metaAccessToken) {
    console.log(`[Meta CAPI] Missing META_PIXEL_ID or META_ACCESS_TOKEN, skipping ${params.event_name}`);
    return { success: false, error: "CAPI not configured" };
  }

  try {
    // Build user_data with SHA-256 hashing for PII, raw for fbp/fbc
    const userData: MetaUserData = {};

    if (params.email) {
      userData.em = await hashData(params.email);
    }
    if (params.phone) {
      userData.ph = await hashData(params.phone.replace(/\D/g, ""));
    }
    if (params.first_name) {
      userData.fn = await hashData(params.first_name);
    }
    if (params.last_name) {
      userData.ln = await hashData(params.last_name);
    }
    if (params.zip_code) {
      userData.zp = await hashData(params.zip_code);
    }
    // external_id is SHA-256 hashed (stable internal identifier)
    if (params.external_id) {
      userData.external_id = await hashData(params.external_id);
    }
    // fbp and fbc are NOT hashed per Meta spec
    if (params.fbp) {
      userData.fbp = params.fbp;
    }
    if (params.fbc) {
      userData.fbc = params.fbc;
    }
    if (params.client_ip) {
      userData.client_ip_address = params.client_ip;
    }
    if (params.client_user_agent) {
      userData.client_user_agent = params.client_user_agent;
    }

    // Build custom_data — only include fields that are relevant
    const customData: Record<string, unknown> = {};
    if (params.value !== undefined) {
      customData.value = params.value;
      customData.currency = (params.currency || "USD").toUpperCase();
    }
    if (params.content_ids?.length) {
      customData.content_ids = params.content_ids;
      customData.content_type = "product";
      customData.contents = params.content_ids.map((id) => ({ id, quantity: 1 }));
    }
    if (params.content_name) {
      customData.content_name = params.content_name;
    }
    if (params.content_category) {
      customData.content_category = params.content_category;
    }

    // Build the event payload
    const eventPayload: Record<string, unknown> = {
      event_name: params.event_name,
      event_id: params.event_id,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: params.event_source_url || Deno.env.get("SITE_URL") || PRODUCTION_DOMAIN,
      action_source: "website",
    };

    if (Object.keys(userData).length > 0) {
      eventPayload.user_data = userData;
    }
    if (Object.keys(customData).length > 0) {
      eventPayload.custom_data = customData;
    }

    // Build request body
    const requestBody: Record<string, unknown> = {
      data: [eventPayload],
    };

    if (testEventCode) {
      requestBody.test_event_code = testEventCode;
    }

    const hasIdentity = !!(userData.em || userData.ph || userData.external_id);
    console.log(`[Meta CAPI] Sending ${params.event_name} | event_id=${params.event_id} | em=${!!userData.em} ph=${!!userData.ph} fn=${!!userData.fn} ln=${!!userData.ln} zp=${!!userData.zp} ext_id=${!!userData.external_id} fbp=${!!userData.fbp} fbc=${!!userData.fbc} ip=${!!userData.client_ip_address} ua=${!!userData.client_user_agent}${params.value !== undefined ? ` | value=${params.value} ${params.currency || "USD"}` : ""} | identity=${hasIdentity}`);

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${metaPixelId}/events?access_token=${metaAccessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[Meta CAPI] ${params.event_name} API error:`, JSON.stringify(responseData));
      return { success: false, error: responseData };
    }

    console.log(`[Meta CAPI] ${params.event_name} accepted:`, JSON.stringify(responseData));
    return { success: true, ...responseData };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Meta CAPI] ${params.event_name} error:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================
// CONVENIENCE WRAPPERS
// ============================================

/** Backwards-compatible Purchase sender (delegates to sendMetaCapiEvent) */
export async function sendMetaCapiPurchase(
  params: Omit<MetaCapiEventParams, "event_name"> & { event_id: string }
): Promise<MetaCapiResponse> {
  return sendMetaCapiEvent({ ...params, event_name: "Purchase" });
}

/** Send an InitiateCheckout event */
export async function sendMetaCapiInitiateCheckout(
  params: Omit<MetaCapiEventParams, "event_name"> & { event_id: string }
): Promise<MetaCapiResponse> {
  return sendMetaCapiEvent({ ...params, event_name: "InitiateCheckout" });
}

/** Send a Lead event */
export async function sendMetaCapiLead(
  params: Omit<MetaCapiEventParams, "event_name"> & { event_id: string }
): Promise<MetaCapiResponse> {
  return sendMetaCapiEvent({ ...params, event_name: "Lead" });
}
