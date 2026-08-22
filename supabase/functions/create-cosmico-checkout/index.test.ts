/**
 * Create Cosmico Checkout Tests
 * 
 * Validates the checkout edge function handles all edge cases correctly.
 * These tests catch schema mismatches and configuration issues before they hit production.
 * 
 * Run with: supabase--test-edge-functions with functions: ["create-cosmico-checkout"]
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

// Test data
const VALID_CHECKOUT_REQUEST = {
  ticketType: "tier_1_krewe_3day",
  quantity: 1,
  name: "Test User",
  email: "test-checkout@example.com",
  donationAmount: 0,
  accommodationWaitlist: false,
};

Deno.test("Checkout rejects missing required fields", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({}),
  });

  assertEquals(response.status, 400, "Empty request should return 400");
  const body = await response.json();
  assertExists(body.error, "Should return error message");
});

Deno.test("Checkout rejects invalid ticket types", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      ticketType: "fake_nonexistent_ticket",
    }),
  });

  assertEquals(response.status, 400, "Invalid ticket type should return 400");
  const body = await response.json();
  assertExists(body.error, "Should return error message");
});

Deno.test("Checkout rejects quantities over maximum", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      quantity: 10, // Max is 4
    }),
  });

  assertEquals(response.status, 400, "Quantity over 4 should return 400");
  const body = await response.json();
  assertExists(body.error, "Should return error message");
});

Deno.test("Checkout rejects invalid email formats", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      email: "not-an-email",
    }),
  });

  assertEquals(response.status, 400, "Invalid email should return 400");
  const body = await response.json();
  assertExists(body.error, "Should return error message");
});

Deno.test("Checkout rejects zero quantity", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      quantity: 0,
    }),
  });

  assertEquals(response.status, 400, "Zero quantity should return 400");
  const body = await response.json();
  assertExists(body.error, "Should return error message");
});

Deno.test("Checkout rejects negative donation amounts", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      donationAmount: -100,
    }),
  });

  assertEquals(response.status, 400, "Negative donation should return 400");
  const body = await response.json();
  assertExists(body.error, "Should return error message");
});

Deno.test("Checkout accepts valid request and returns Stripe URL", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      email: `e2e-test-${Date.now()}@example.com`, // Unique email to avoid rate limits
    }),
  });

  // Should succeed
  assertEquals(response.status, 200, `Expected 200 but got ${response.status}`);
  
  const body = await response.json();
  assertExists(body.url, "Response should have Stripe URL");
  assertExists(body.sessionId, "Response should have session ID");
  
  // Validate URL format
  assertEquals(
    body.url.includes("checkout.stripe.com"), 
    true, 
    "URL should be a Stripe checkout URL"
  );
});

Deno.test("Checkout handles VIP ticket type", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      ticketType: "tier_1_vip_3day",
      email: `e2e-vip-${Date.now()}@example.com`,
    }),
  });

  assertEquals(response.status, 200, `VIP checkout should succeed, got ${response.status}`);
  
  const body = await response.json();
  assertExists(body.url, "Response should have Stripe URL");
});

Deno.test("Checkout handles GA 2-day ticket type", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      ticketType: "tier_1_ga_2day",
      email: `e2e-ga-${Date.now()}@example.com`,
    }),
  });

  assertEquals(response.status, 200, `GA checkout should succeed, got ${response.status}`);
  
  const body = await response.json();
  assertExists(body.url, "Response should have Stripe URL");
});

Deno.test("Checkout handles donations correctly", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...VALID_CHECKOUT_REQUEST,
      donationAmount: 5000, // $50 in cents
      email: `e2e-donation-${Date.now()}@example.com`,
    }),
  });

  assertEquals(response.status, 200, `Checkout with donation should succeed`);
  
  const body = await response.json();
  assertExists(body.url, "Response should have Stripe URL");
});
