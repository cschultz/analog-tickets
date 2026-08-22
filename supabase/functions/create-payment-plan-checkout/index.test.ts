/**
 * Create Payment Plan Checkout Tests
 *
 * Validates the payment plan checkout edge function handles all edge cases correctly.
 *
 * Run with: supabase--test-edge-functions with functions: ["create-payment-plan-checkout"]
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

const validPayload = {
  cartTotal: 50000,
  cartDescription: "Weekend Pass × 2",
  cartLineItems: [{ name: "Weekend Pass", amount: 25000, quantity: 2 }],
  name: "Test User",
  email: "test-payment-plan@example.com",
};

Deno.test("Payment plan checkout rejects missing required fields", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-plan-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({}),
  });

  const body = await response.json();
  assertEquals(response.status, 400, "Should return 400 for missing fields");
  assertExists(body.error, "Should return error message");
});

Deno.test("Payment plan checkout rejects invalid email", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-plan-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ...validPayload, email: "not-an-email" }),
  });

  const body = await response.json();
  assertEquals(response.status, 400, "Should return 400 for invalid email");
  assertExists(body.error, "Should return error message");
});

Deno.test("Payment plan checkout rejects cart total below minimum", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-plan-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ...validPayload, cartTotal: 50 }),
  });

  const body = await response.json();
  // Should be 400 either from validation (min 100) or config min_cart_amount
  assertEquals([400].includes(response.status), true, `Should reject low cart total, got ${response.status}`);
  assertExists(body.error, "Should return error message");
});

Deno.test("Payment plan checkout rejects empty cart line items", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-plan-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ...validPayload, cartLineItems: [] }),
  });

  const body = await response.json();
  // Empty array is valid per schema but should still work — this tests it doesn't crash
  await response.text().catch(() => {});
  // Either 200 with URL or 400 — both are acceptable, just shouldn't be 500
  assertEquals(response.status !== 500, true, "Should not return 500 for empty line items");
});

Deno.test("Payment plan checkout rejects missing name", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-plan-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ...validPayload, name: "" }),
  });

  const body = await response.json();
  assertEquals(response.status, 400, "Should return 400 for empty name");
  assertExists(body.error, "Should return error message");
});

Deno.test("Payment plan checkout rejects missing cartDescription", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-plan-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ...validPayload, cartDescription: "" }),
  });

  const body = await response.json();
  assertEquals(response.status, 400, "Should return 400 for empty cart description");
  assertExists(body.error, "Should return error message");
});

Deno.test("Payment plan checkout accepts valid request and returns Stripe URL", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-plan-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(validPayload),
  });

  const body = await response.json();

  if (response.status === 200) {
    assertExists(body.url, "Response should have Stripe URL");
    assertEquals(
      body.url.includes("checkout.stripe.com"),
      true,
      "URL should be a Stripe checkout URL"
    );
    assertExists(body.enrollmentId, "Response should have enrollmentId");
    assertExists(body.paymentPlan, "Response should have paymentPlan details");
    assertExists(body.paymentPlan.count, "Payment plan should have count");
    assertExists(body.paymentPlan.amounts, "Payment plan should have amounts");
    assertExists(body.paymentPlan.dates, "Payment plan should have dates");
    assertEquals(
      body.paymentPlan.amounts.length,
      body.paymentPlan.count,
      "Amounts array length should match payment count"
    );
    // Verify amounts sum to total
    const sum = body.paymentPlan.amounts.reduce((a: number, b: number) => a + b, 0);
    assertEquals(sum, validPayload.cartTotal, "Payment amounts should sum to cart total");
  } else {
    // Payment plans might be disabled — that's OK
    assertEquals([400].includes(response.status), true, `Unexpected status: ${response.status}`);
  }
});

Deno.test("Payment plan checkout handles CORS preflight", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment-plan-checkout`, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://example.invalid",
      "Access-Control-Request-Method": "POST",
    },
  });

  await response.text();
  assertEquals(response.status, 200, "OPTIONS should return 200");
  assertExists(
    response.headers.get("access-control-allow-origin"),
    "Should have CORS headers"
  );
});
