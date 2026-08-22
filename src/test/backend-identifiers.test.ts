import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Gate 9 static scan.
 *
 * Proves that no production/operator-specific identifier can come back into
 * the backend (Supabase edge function) source tree. This is a source scan, not
 * a runtime test: it fails the build the moment a real domain, mailbox,
 * event id or payment-provider id is committed again.
 */

const BACKEND_ROOT = "supabase/functions";

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.(ts|tsx|js|json|toml|md)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = collect(BACKEND_ROOT);
const sources = files.map((f) => [f, readFileSync(f, "utf8")] as const);

/** Retired production identifiers. None of these may ever reappear. */
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: "production domain cosmi.co", pattern: /cosmi\.co\b/i },
  { label: "production domain cosmico.org", pattern: /cosmico\.org\b/i },
  { label: "production domain cosmicofeast.com", pattern: /cosmicofeast\.com/i },
  { label: "production domain cosmicoevents.com", pattern: /cosmicoevents\.com/i },
  { label: "production domain mail.cosmico.live", pattern: /cosmico\.live/i },
  { label: "production domain cosmico.lovable.app", pattern: /cosmico\.lovable\.app/i },
  { label: "production domain cosmico.lp.foundation", pattern: /lp\.foundation/i },
  { label: "production lovableproject.com host", pattern: /lovableproject\.com/i },
  { label: "legacy event brand 'Analog Reunion'", pattern: /Analog\s+Reunion/i },
  { label: "operator mailbox catchavibe@", pattern: /catchavibe@/i },
  { label: "operator personal mailbox", pattern: /\b[\w.+-]+@(gmail|outlook|hotmail|yahoo)\.com\b/i },
  { label: "production event uuid e40bacfe-…", pattern: /e40bacfe-6af2-4f11-aeb7-004802804b46/i },
  { label: "production enrollment uuid ac81e9f2-…", pattern: /ac81e9f2-3cc7-442a-ab13-6ca9c158f670/i },
  { label: "live Stripe price id", pattern: /"price_[A-Za-z0-9]{8,}"/ },
  { label: "live Stripe customer id", pattern: /"cus_[A-Za-z0-9]{8,}"/ },
  { label: "live Stripe payment intent id", pattern: /"pi_[A-Za-z0-9]{8,}"/ },
  { label: "live Stripe account id", pattern: /"acct_[A-Za-z0-9]{8,}"/ },
  // Operator personal phone numbers: any 10/11-digit US number literal
  // (555 exchange is reserved for fiction and allowed in fixtures).
  { label: "hardcoded operator phone number", pattern: /"\+?1?(?!.*555)[2-9]\d{9}"/ },
];

describe("backend source contains no production identifiers", () => {
  it("scans a non-trivial number of backend files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const { label, pattern } of FORBIDDEN) {
    it(`has no ${label}`, () => {
      const hits = sources
        .filter(([, body]) => pattern.test(body))
        .map(([file]) => file);
      expect(hits, `${label} found in:\n${hits.join("\n")}`).toEqual([]);
    });
  }
});

describe("backend fails closed without configuration", () => {
  const config = readFileSync(`${BACKEND_ROOT}/_shared/operator-config.ts`, "utf8");

  it("uses a reserved, non-routable placeholder origin", () => {
    expect(config).toContain('PLACEHOLDER_ORIGIN = "https://example.invalid"');
  });

  it("defaults event ids to the nil UUID", () => {
    expect(config).toContain('NIL_UUID = "00000000-0000-0000-0000-000000000000"');
  });

  it("defaults operator mailboxes to empty strings", () => {
    expect(config).toMatch(/export function getFromEmail\(\): string \{\s*return env\("OPERATOR_FROM_EMAIL"\);/);
    expect(config).toMatch(/export function getAlertEmail\(\): string \{\s*return env\("OPERATOR_ALERT_EMAIL"\);/);
  });

  it("hardcodes no platform admin recipient", () => {
    const notify = readFileSync(`${BACKEND_ROOT}/_shared/admin-notify-recipients.ts`, "utf8");
    expect(notify).toContain("PLATFORM_ADMIN_EMAILS");
    expect(notify).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });

  it("routes every SMS alert through OPERATOR_ALERT_PHONE", () => {
    expect(config).toMatch(/export function getAlertPhone\(\): string \{\s*return env\("OPERATOR_ALERT_PHONE"\);/);

    const smsFunctions = [
      "checkout-canary",
      "client-error-alert-monitor",
      "send-checkin-alert",
      "sms-health-canary",
    ];
    for (const fn of smsFunctions) {
      const body = readFileSync(`${BACKEND_ROOT}/${fn}/index.ts`, "utf8");
      expect(body, `${fn} must resolve its alert number from config`).toContain("getAlertPhone()");
      expect(body, `${fn} must not hardcode a phone number`).not.toMatch(/"\+?1?(?!.*555)[2-9]\d{9}"/);
    }
  });

  it("never falls back to a real domain for SITE_URL", () => {
    const bad = sources.filter(([, body]) =>
      /SITE_URL"\)\s*(\?\?|\|\|)\s*"https:\/\/(?!example\.invalid)/.test(body),
    );
    expect(bad.map(([f]) => f)).toEqual([]);
  });
});

describe("create-addon-checkout logs no customer PII", () => {
  const body = readFileSync(`${BACKEND_ROOT}/create-addon-checkout/index.ts`, "utf8");
  const logCalls = body.match(/logStep\([^\n]*/g) ?? [];

  it("has logStep calls to inspect", () => {
    expect(logCalls.length).toBeGreaterThan(3);
  });

  it("never passes an email value into logStep", () => {
    const leaks = logCalls.filter(
      (call) => /[eE]mail/.test(call) && !/(!!|has[A-Z]|redacted)/.test(call),
    );
    expect(leaks, `PII leak in logStep:\n${leaks.join("\n")}`).toEqual([]);
  });
});

describe("ticketing functions log no customer email or raw promo codes", () => {
  const SAFE = /(!!|has[A-Z]|_ref\b|fingerprint\(|redacted|null)/;

  const checkout = readFileSync(`${BACKEND_ROOT}/create-cosmico-checkout/index.ts`, "utf8");
  const promo = readFileSync(`${BACKEND_ROOT}/validate-promo-code/index.ts`, "utf8");

  const logCallsOf = (body: string, fnNames: string[]) =>
    fnNames.flatMap((name) => body.match(new RegExp(`${name}\\([^\\n]*`, "g")) ?? []);

  const checkoutLogs = logCallsOf(checkout, ["console\\.log", "console\\.error"]);
  const promoLogs = logCallsOf(promo, ["logLine"]);

  it("has log calls to inspect", () => {
    expect(checkoutLogs.length).toBeGreaterThan(3);
    expect(promoLogs.length).toBeGreaterThan(3);
  });

  it("create-cosmico-checkout never logs an email value", () => {
    const leaks = checkoutLogs.filter((c) => /[eE]mail/.test(c) && !SAFE.test(c));
    expect(leaks, `PII leak:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("create-cosmico-checkout never logs a raw promo code", () => {
    const leaks = checkoutLogs.filter((c) => /promo\.code|\bcode:/.test(c));
    expect(leaks, `promo code leak:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("validate-promo-code never logs an email or raw code value", () => {
    const leaks = promoLogs.filter(
      (c) => /(\bemail\b|\bcode\b|promo\.code)(?!_ref)/.test(c) && !SAFE.test(c),
    );
    expect(leaks, `PII leak:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("validate-promo-code records no email or raw code in checkout_errors", () => {
    const insert = promo.match(/from\("checkout_errors"\)\s*\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(insert).toContain("user_email: null");
    expect(insert).not.toContain("attempted_code: code");
    expect(insert).toMatch(/code_ref/);
  });
});
