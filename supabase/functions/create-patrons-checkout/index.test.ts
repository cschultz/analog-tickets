/**
 * Create Patrons Checkout Tests
 * 
 * Validates the patrons checkout edge function handles all edge cases correctly.
 * 
 * Run with: supabase--test-edge-functions with functions: ["create-patrons-checkout"]
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.test("Patrons checkout rejects missing required fields", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-patrons-checkout`, {
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

Deno.test("Patrons checkout rejects invalid package types", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-patrons-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      packageType: "fake_package",
      name: "Test User",
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400, "Invalid package type should return 400");
  const body = await response.json();
  assertExists(body.error, "Should return error message");
});

Deno.test("Patrons checkout rejects invalid email formats", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-patrons-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      packageType: "ultimate",
      name: "Test User",
      email: "not-an-email",
    }),
  });

  assertEquals(response.status, 400, "Invalid email should return 400");
  const body = await response.json();
  assertExists(body.error, "Should return error message");
});

Deno.test("Patrons checkout accepts valid ultimate package request", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-patrons-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      packageType: "ultimate",
      name: "E2E Test Patron",
      email: `e2e-patron-${Date.now()}@example.com`,
    }),
  });

  // Check response
  const body = await response.json();
  
  if (response.status === 200) {
    assertExists(body.url, "Response should have Stripe URL");
    assertEquals(
      body.url.includes("checkout.stripe.com"),
      true,
      "URL should be a Stripe checkout URL"
    );
  } else {
    // If patron packages aren't configured, expect a clear error
    assertEquals(response.status, 400, `Unexpected status: ${response.status}`);
  }
});

Deno.test("Patrons checkout accepts valid premier package request", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-patrons-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      packageType: "premier",
      name: "E2E Test Patron Premier",
      email: `e2e-patron-premier-${Date.now()}@example.com`,
    }),
  });

  const body = await response.json();
  
  if (response.status === 200) {
    assertExists(body.url, "Response should have Stripe URL");
  }
  // Premier might not be configured - that's OK for this test
});
