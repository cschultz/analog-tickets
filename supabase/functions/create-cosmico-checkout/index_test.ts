import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-cosmico-checkout`;

// =============================================================================
// VALIDATION TESTS
// =============================================================================

Deno.test("create-cosmico-checkout - should reject invalid ticket type", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "invalid_ticket_type",
      quantity: 1,
      name: "Test User",
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("create-cosmico-checkout - should reject quantity over 4", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "tier_1_vip_3day",
      quantity: 5,
      name: "Test User",
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("create-cosmico-checkout - should reject quantity of 0", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "tier_1_vip_3day",
      quantity: 0,
      name: "Test User",
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("create-cosmico-checkout - should reject missing email", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "tier_1_vip_3day",
      quantity: 1,
      name: "Test User",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("create-cosmico-checkout - should reject invalid email format", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "tier_1_vip_3day",
      quantity: 1,
      name: "Test User",
      email: "not-an-email",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("create-cosmico-checkout - should reject missing name", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "tier_1_vip_3day",
      quantity: 1,
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("create-cosmico-checkout - should reject empty name", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "tier_1_vip_3day",
      quantity: 1,
      name: "   ",
      email: "test@example.com",
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("create-cosmico-checkout - should reject negative donation amount", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "tier_1_krewe_3day",
      quantity: 1,
      name: "Test User",
      email: "test@example.com",
      donationAmount: -100,
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

Deno.test("create-cosmico-checkout - should reject donation over $1000", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ticketType: "tier_1_krewe_3day",
      quantity: 1,
      name: "Test User",
      email: "test@example.com",
      donationAmount: 100001, // Over $1000 in cents
    }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertExists(body.error);
});

// =============================================================================
// DATABASE INTEGRITY TESTS
// =============================================================================

Deno.test({
  name: "create-cosmico-checkout - valid request should find active event",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data: event, error } = await supabase
      .from("event_details")
      .select("id, title")
      .eq("title", "Cosmico 2026")
      .eq("is_active", true)
      .maybeSingle();

    assertEquals(error, null, "Should not have database error");
    assertExists(event, "Active 'Cosmico 2026' event must exist for checkout to work");
    assertEquals(event.title, "Cosmico 2026");
  }
});

Deno.test({
  name: "create-cosmico-checkout - ticket inventory should exist for all tier 1 tickets",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data: event } = await supabase
      .from("event_details")
      .select("id")
      .eq("title", "Cosmico 2026")
      .eq("is_active", true)
      .single();

    assertExists(event, "Active event must exist");

    // Check all 5 tier 1 ticket types
    const ticketTypes = [
      "tier_1_krewe_3day", 
      "tier_1_vip_3day", 
      "tier_1_ga_2day",
      "tier_1_ga_friday",
      "tier_1_ga_saturday"
    ];
    
    for (const ticketType of ticketTypes) {
      const { data, error } = await supabase
        .from("ticket_inventory")
        .select("ticket_type, total_quantity, sold_quantity")
        .eq("ticket_type", ticketType)
        .eq("event_id", event.id)
        .limit(1);

      assertEquals(error, null, `Should not have error for ${ticketType}`);
      assert(data && data.length > 0, `Inventory for ${ticketType} must exist`);
    }
  }
});

// =============================================================================
// RATE LIMIT TESTS
// =============================================================================

Deno.test({
  name: "create-cosmico-checkout - rate limit table should exist",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Check that the ip_rate_limits table exists by querying its structure
    const { error } = await supabase
      .from("ip_rate_limits")
      .select("id")
      .limit(0);

    // Should not error (table exists)
    assertEquals(error, null, "ip_rate_limits table must exist for DB-backed rate limiting");
  }
});

// =============================================================================
// SUCCESS PATH TESTS
// Note: Tests run from the same IP and share a rate limit. We run only essential
// success tests to avoid hitting the rate limit (10 requests per hour).
// =============================================================================

Deno.test({
  name: "create-cosmico-checkout - valid krewe request returns Stripe URL",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        ticketType: "tier_1_krewe_3day",
        quantity: 1,
        name: "E2E Test Krewe",
        email: "e2e-test-krewe@example.com",
        donationAmount: 0,
        accommodationWaitlist: false,
      }),
    });

    // If rate limited, skip test gracefully (means rate limiting is working!)
    if (response.status === 429) {
      const body = await response.json();
      assertExists(body.retryAfter, "Rate limit response should include retryAfter");
      console.log("Rate limited - DB rate limiting is working correctly");
      return;
    }

    assertEquals(response.status, 200);
    const data = await response.json();
    assertExists(data.url, "Should return Stripe URL");
    assert(data.url.includes("checkout.stripe.com"), "URL should be Stripe checkout");
    assertExists(data.sessionId, "Should return session ID");
  }
});

Deno.test({
  name: "create-cosmico-checkout - valid request with youth tickets and donation",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        ticketType: "tier_1_ga_2day",
        quantity: 1,
        name: "E2E Test Full",
        email: "e2e-test-full@example.com",
        donationAmount: 5000, // $50 in cents
        accommodationWaitlist: true,
        youthTicketType: "youth_2day",
        youthCount: 1,
        childCount: 1,
      }),
    });

    // If rate limited, skip test gracefully
    if (response.status === 429) {
      const body = await response.json();
      assertExists(body.retryAfter);
      console.log("Rate limited - DB rate limiting is working correctly");
      return;
    }

    assertEquals(response.status, 200);
    const data = await response.json();
    assertExists(data.url);
    assert(data.url.includes("checkout.stripe.com"));
  }
});
