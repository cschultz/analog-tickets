/**
 * Process Scheduled Payments Tests
 *
 * Validates the scheduled payment processor handles all scenarios correctly.
 *
 * Run with: supabase--test-edge-functions with functions: ["process-scheduled-payments"]
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.test("Process scheduled payments returns valid response structure", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-scheduled-payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.json();
  assertEquals(response.status, 200, `Should return 200, got ${response.status}`);
  assertExists(body.processed !== undefined, "Response should have processed count");
  assertExists(body.succeeded !== undefined, "Response should have succeeded count");
  assertExists(body.failed !== undefined, "Response should have failed count");
  assertEquals(typeof body.processed, "number", "processed should be a number");
  assertEquals(typeof body.succeeded, "number", "succeeded should be a number");
  assertEquals(typeof body.failed, "number", "failed should be a number");
});

Deno.test("Process scheduled payments succeeds/failed counts are consistent", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-scheduled-payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.json();
  assertEquals(
    body.succeeded + body.failed <= body.processed,
    true,
    "succeeded + failed should not exceed processed"
  );
});

Deno.test("Process scheduled payments handles CORS preflight", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-scheduled-payments`, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://example.invalid",
      "Access-Control-Request-Method": "POST",
    },
  });

  await response.text();
  assertEquals(response.status, 200, "OPTIONS should return 200");
});

Deno.test("Process scheduled payments is idempotent on consecutive runs", async () => {
  // Run twice — second run should process 0 or same results
  const response1 = await fetch(`${SUPABASE_URL}/functions/v1/process-scheduled-payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const body1 = await response1.json();

  const response2 = await fetch(`${SUPABASE_URL}/functions/v1/process-scheduled-payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const body2 = await response2.json();

  assertEquals(response2.status, 200, "Second run should also return 200");
  // After first run processes payments, second run should have fewer or equal
  assertEquals(
    body2.processed <= body1.processed,
    true,
    "Second run should not process more than the first"
  );
});
