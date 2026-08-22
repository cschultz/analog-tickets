import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.test("upsert-checkout-abandonment rejects invalid email", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/upsert-checkout-abandonment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email: "not-an-email" }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("upsert-checkout-abandonment accepts valid payload", async () => {
  const email = `abandonment-smoke-${Date.now()}@example.com`;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/upsert-checkout-abandonment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      email,
      name: "Smoke Test",
      phone: "5551234567",
      ticket_type: "tier_1_ga_2day",
    }),
  });

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.success, true);
});

Deno.test("upsert-checkout-abandonment handles CORS preflight", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/upsert-checkout-abandonment`, {
    method: "OPTIONS",
  });
  await response.text();

  assertEquals(response.status, 200);
  assertExists(response.headers.get("Access-Control-Allow-Origin"));
  assertExists(response.headers.get("Access-Control-Allow-Headers"));
});