// Shared Stripe utilities for edge functions
import Stripe from "https://esm.sh/stripe@18.5.0";

// Standard API version for all Stripe operations
export const STRIPE_API_VERSION = "2025-08-27.basil" as const;

// Lazily initialized Stripe client
let _stripeClient: Stripe | null = null;

/**
 * Get a configured Stripe client instance
 * Ensures consistent API version across all functions
 */
export function getStripeClient(): Stripe {
  if (!_stripeClient) {
    const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }
    
    _stripeClient = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });
  }
  
  return _stripeClient;
}

/**
 * Create a new Stripe client (for when you need a fresh instance)
 */
export function createStripeClient(): Stripe {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

/**
 * Verify a Stripe webhook signature
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<Stripe.Event> {
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }
  
  const stripe = getStripeClient();
  return await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
}

/**
 * Get or create a Stripe customer by email
 */
export async function getOrCreateCustomer(
  email: string,
  name?: string
): Promise<string> {
  const stripe = getStripeClient();
  
  // Check if customer exists
  const customers = await stripe.customers.list({ email, limit: 1 });
  
  if (customers.data.length > 0) {
    return customers.data[0].id;
  }
  
  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
  });
  
  return customer.id;
}

/**
 * Standard success/cancel URL builder
 */
export function buildCheckoutUrls(
  origin: string,
  successPath: string = "/ticket-success",
  cancelPath: string = "/"
): { success_url: string; cancel_url: string } {
  return {
    success_url: `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${cancelPath}?canceled=true`,
  };
}

/**
 * Format amount in cents to display string
 */
export function formatAmountFromCents(cents: number, currency: string = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Calculate ticket price based on type
 */
export function getTicketPrice(ticketType: string): number {
  const prices: Record<string, number> = {
    dinner_party: 16500,
    party_only: 6900,
    ga_3day: 24900,
    ga_2day: 19900,
    vip_3day: 39900,
    wine_camp: 79900,
  };
  return prices[ticketType] || 0;
}

/**
 * Get Stripe price ID for a ticket type
 */
export function getStripePriceId(ticketType: string): string | null {
  // Stripe price ids are operator-specific. Supply them per ticket type via
  // env, e.g. STRIPE_PRICE_DINNER_PARTY. Unset => null (caller must handle).
  const envKey = `STRIPE_PRICE_${ticketType.toUpperCase()}`;
  return (Deno.env.get(envKey) ?? "").trim() || null;
}
