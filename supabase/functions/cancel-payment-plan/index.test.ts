/**
 * Cancel Payment Plan Tests
 *
 * Validates the cancellation edge function handles all edge cases correctly.
 *
 * Run with: supabase--test-edge-functions with functions: ["cancel-payment-plan"]
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.test("Cancel payment plan rejects missing enrollment ID", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cancel-payment-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({}),
  });

  const body = await response.json();
  assertEquals([400, 401].includes(response.status), true, `Should reject missing ID, got ${response.status}`);
  assertExists(body.error, "Should return error message");
});

Deno.test("Cancel payment plan rejects non-existent enrollment", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cancel-payment-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      enrollmentId: "00000000-0000-0000-0000-000000000000",
      reason: "Testing",
    }),
  });

  const body = await response.json();
  assertEquals([400, 401, 404].includes(response.status), true, `Should reject non-existent enrollment, got ${response.status}`);
  assertExists(body.error, "Should return error message");
});

Deno.test("Cancel payment plan handles CORS preflight", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cancel-payment-plan`, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://example.invalid",
      "Access-Control-Request-Method": "POST",
    },
  });

  await response.text();
  assertEquals(response.status, 200, "OPTIONS should return 200");
});
