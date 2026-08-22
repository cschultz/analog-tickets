import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const FN = `${SUPABASE_URL}/functions/v1/backfill-popup-sms`;

Deno.test("backfill-popup-sms: dry-run returns lead count without sending", async () => {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({ dry_run: true }),
  });
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.dry_run, true);
  assert(typeof json.count === "number", "Should return numeric count");
  assert(Array.isArray(json.sample), "Should return sample array");
});

Deno.test("backfill-popup-sms: CORS preflight", async () => {
  const res = await fetch(FN, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
