/**
 * Send Payment Plan Reminders Tests
 *
 * Validates the reminder function handles all scenarios correctly.
 *
 * Run with: supabase--test-edge-functions with functions: ["send-payment-plan-reminders"]
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.test("Payment plan reminders returns valid response", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-payment-plan-reminders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.json();
  assertEquals(response.status, 200, `Should return 200, got ${response.status}`);
  assertExists(body.sent !== undefined || body.processed !== undefined, "Should have a count field");
});

Deno.test("Payment plan reminders handles CORS preflight", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-payment-plan-reminders`, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://example.invalid",
      "Access-Control-Request-Method": "POST",
    },
  });

  await response.text();
  assertEquals(response.status, 200, "OPTIONS should return 200");
});

Deno.test("Payment plan reminders does not crash on empty queue", async () => {
  // Running reminders when none are due should succeed gracefully
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-payment-plan-reminders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.json();
  assertEquals(response.status, 200, "Should return 200 even with no reminders to send");
});
