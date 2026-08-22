/**
 * Checkout Health Check Tests
 * 
 * Validates that the health check properly catches schema and configuration issues
 * that would break the checkout flow.
 * 
 * Run with: supabase--test-edge-functions with functions: ["checkout-health-check"]
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.test("Health check returns valid response structure", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/checkout-health-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.json();
  
  // Should return 200 or 503 depending on health
  assertEquals([200, 503].includes(response.status), true, `Unexpected status: ${response.status}`);
  
  // Validate response structure
  assertExists(body.status, "Response should have status field");
  assertExists(body.checks, "Response should have checks field");
  assertExists(body.timestamp, "Response should have timestamp field");
  
  // All check categories should be present
  assertExists(body.checks.database, "Should check database");
  assertExists(body.checks.stripeConfig, "Should check Stripe config");
  assertExists(body.checks.activeEvent, "Should check active event");
  assertExists(body.checks.ticketInventory, "Should check ticket inventory");
  assertExists(body.checks.stripePriceIds, "Should check Stripe price IDs");
});

Deno.test("Health check validates stripe_price_id exists for purchasable tickets", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/checkout-health-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.json();
  await response.text().catch(() => {}); // Consume body to prevent leak
  
  // The stripePriceIds check should exist and have a status
  assertExists(body.checks.stripePriceIds.status, "stripePriceIds check should have status");
  
  // If it fails, it should tell us which tickets are missing price IDs
  if (body.checks.stripePriceIds.status === "fail") {
    assertExists(body.checks.stripePriceIds.missing, "Failed check should list missing price IDs");
    assertExists(body.checks.stripePriceIds.message, "Failed check should have message");
  }
});

Deno.test("Health check marks system unhealthy when stripe_price_id is missing", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/checkout-health-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.json();
  
  // If stripe_price_id check fails, overall status should be unhealthy (not just degraded)
  if (body.checks.stripePriceIds.status === "fail") {
    assertEquals(body.status, "unhealthy", "Missing stripe_price_id should make system unhealthy, not just degraded");
  }
});

Deno.test("Health check returns healthy when all checks pass", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/checkout-health-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.json();
  
  // Count passing checks
  const checks = body.checks;
  const allPassing = 
    checks.database?.status === "pass" &&
    checks.stripeConfig?.status === "pass" &&
    checks.activeEvent?.status === "pass" &&
    checks.ticketInventory?.status === "pass" &&
    checks.stripePriceIds?.status === "pass";

  if (allPassing) {
    assertEquals(body.status, "healthy", "All checks passing should result in healthy status");
    assertEquals(response.status, 200, "Healthy system should return 200");
  }
});
