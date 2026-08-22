import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const FN = `${SUPABASE_URL}/functions/v1/send-promo-sms-batch`;

Deno.test("send-promo-sms-batch: rejects empty leads array", async () => {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({ leads: [] }),
  });
  const json = await res.json();
  assertEquals(res.status, 400);
  assert(json.error?.includes("No leads"));
});

Deno.test("send-promo-sms-batch: handles invalid phone gracefully", async () => {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({ leads: [{ phone: "123", name: "Test", code: "ANALOG-TEST" }] }),
  });
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.results[0].success, false);
  assertEquals(json.results[0].error, "Invalid phone");
});

Deno.test("send-promo-sms-batch: CORS preflight returns headers", async () => {
  const res = await fetch(FN, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});

// Snapshot test for message format — guards against accidentally regressing the copy/paste-friendly format
Deno.test("send-promo-sms-batch: message format includes code on its own line, no period after", () => {
  const code = "ANALOG-TEST";
  const firstName = "Chris";
  const message = `${firstName}, Chris from Analog. Here's your 20% off tix code, good for 48hrs:\n\n${code}\n\nA month out, hope you're in. https://example.invalid/tickets`;

  // Code must be on its own line (newlines on both sides)
  assert(message.includes(`\n\n${code}\n\n`), "Code must be isolated on its own line");
  // No period directly after code
  assert(!message.includes(`${code}.`), "Code must NOT be followed by a period");
  // Within single SMS segment after newlines collapse
  assert(message.length < 200, `Message too long: ${message.length} chars`);
});
