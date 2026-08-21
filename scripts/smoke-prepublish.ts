/**
 * Pre-publish smoke test
 *
 * Lightweight read-only checks against critical ticketing + dinner add-on
 * flows. Designed to run in <30s before publishing.
 *
 * All targets must be supplied by the caller — there are no defaults, so the
 * script can never accidentally point at someone else's environment.
 *
 * Usage:
 *   SMOKE_BASE_URL=https://example.test \
 *   VITE_SUPABASE_URL=https://<supabase-project-ref>.supabase.co \
 *   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-anon-key> \
 *     bun scripts/smoke-prepublish.ts
 *
 * Exits non-zero on any critical failure so it can gate publish.
 */
import { createClient } from "@supabase/supabase-js";

function required(name: string, ...aliases: string[]): string {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  console.error(
    `🛑 Missing required environment variable ${name}` +
      (aliases.length ? ` (or ${aliases.join(", ")})` : "") +
      `.\n   This smoke test has no default target. Set SMOKE_BASE_URL, ` +
      `VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the environment ` +
      `you intend to test, e.g.\n` +
      `   SMOKE_BASE_URL=https://example.test \\\n` +
      `   VITE_SUPABASE_URL=https://<supabase-project-ref>.supabase.co \\\n` +
      `   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-anon-key> \\\n` +
      `     bun scripts/smoke-prepublish.ts`,
  );
  process.exit(2);
}

const BASE_URL = required("SMOKE_BASE_URL").replace(/\/+$/, "");
const SUPABASE_URL = required("VITE_SUPABASE_URL").replace(/\/+$/, "");
const SUPABASE_KEY = required("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");

const TIMEOUT_MS = 8000;
const results: { name: string; ok: boolean; detail?: string; ms: number }[] = [];

async function check(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
      ),
    ]);
    results.push({ name, ok: true, detail: detail || undefined, ms: Date.now() - t0 });
  } catch (e) {
    results.push({
      name,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0,
    });
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function head(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${path}`);
  return `${res.status}`;
}

// ─── Critical pages ─────────────────────────────────────────────────────
const PAGES = ["/", "/tickets", "/my-tickets", "/box-office", "/lineup", "/stay"];

// ─── Critical edge functions (CORS preflight only — no side-effects) ────
const EDGE_FUNCTIONS = [
  "create-checkout",
  "verify-payment",
  "get-addon-availability",
  "send-ticket-email",
  "cosmico-bot",
];

async function main() {
  console.log(`🚦 Pre-publish smoke test → ${BASE_URL}\n`);

  // 1. Critical pages reachable
  for (const path of PAGES) {
    await check(`page ${path}`, () => head(path));
  }

  // 2. ticket_types is the source of truth — must have active rows w/ valid pricing
  await check("db: ticket_types has active rows w/ valid pricing", async () => {
    const { data, error } = await supabase
      .from("ticket_types")
      .select("id, key, label, price, is_active")
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("no active ticket_types");
    // price is stored in cents per project standard; allow $0 (free child) up to $1000
    const bad = data.filter(
      (t: any) => !Number.isFinite(t.price) || t.price < 0 || t.price > 1_000_000,
    );
    if (bad.length) throw new Error(`bad price: ${bad.map((b: any) => `${b.label}=${b.price}`).join(",")}`);
    return `${data.length} active`;
  });

  // 3. Attendance cap not exceeded (700 hard cap) — uses ticket_inventory
  await check("db: attendance under 700 cap", async () => {
    const { data, error } = await supabase
      .from("ticket_inventory")
      .select("sold_quantity, comp_quantity, total_quantity")
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    const sold = (data || []).reduce(
      (s, r: any) => s + (r.sold_quantity || 0) + (r.comp_quantity || 0),
      0,
    );
    if (sold > 700) throw new Error(`attendance ${sold} > 700`);
    const oversold = (data || []).filter(
      (r: any) => (r.sold_quantity || 0) > (r.total_quantity || 0),
    );
    if (oversold.length) throw new Error(`oversold inventory rows: ${oversold.length}`);
    return `${sold}/700`;
  });

  // 4. Dinner add-on inventory healthy
  await check("db: addon_inventory dinner availability", async () => {
    const { data, error } = await supabase
      .from("addon_inventory")
      .select("display_name, addon_type, total_quantity, sold_quantity, is_active")
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("no active addon_inventory rows");
    const oversold = data.filter(
      (a: any) => (a.sold_quantity || 0) > (a.total_quantity || 0),
    );
    if (oversold.length) throw new Error(`oversold: ${oversold.map((o: any) => o.display_name).join(",")}`);
    const dinner = data.filter((a: any) => /dinner/i.test(a.addon_type) || /dinner/i.test(a.display_name));
    return `${data.length} active, ${dinner.length} dinner`;
  });

  // 5. Active event singleton
  await check("db: exactly one active event_details", async () => {
    const { data, error } = await supabase
      .from("event_details")
      .select("id")
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    if (!data || data.length !== 1) throw new Error(`expected 1 active event, got ${data?.length || 0}`);
    return "1";
  });

  // 6. Edge function CORS reachability (OPTIONS preflight, no body)
  for (const fn of EDGE_FUNCTIONS) {
    await check(`edge: ${fn} reachable`, async () => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Method": "POST",
          Origin: BASE_URL,
        },
      });
      // 200/204 expected for CORS preflight; 401/405 also indicate function is up
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return `${res.status}`;
    });
  }

  // 7. Public lodging flags RPC (verifies post-security-hardening RPC works)
  await check("rpc: get_lodging_public_flags", async () => {
    const { error } = await supabase.rpc("get_lodging_public_flags");
    if (error) throw new Error(error.message);
    return "ok";
  });

  // ─── Report ───────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(
    results
      .map((r) => `${r.ok ? "✅" : "❌"} [${String(r.ms).padStart(4)}ms] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`)
      .join("\n"),
  );
  console.log(`\n${passed}/${results.length} passed`);

  if (failed.length) {
    console.error(`\n🛑 ${failed.length} critical check(s) failed — DO NOT PUBLISH`);
    process.exit(1);
  }
  console.log("\n🟢 Safe to publish");
}

main().catch((e) => {
  console.error("smoke runner crashed:", e);
  process.exit(2);
});
