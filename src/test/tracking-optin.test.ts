/**
 * Regression coverage for Gate 7, Slice 24.
 *
 * A fresh remix with no environment configuration must not load a tag
 * manager, initialise a pixel, or contact a tracking endpoint. No production
 * analytics/advertising identifier may be committed anywhere in the repo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getTrackingConfig,
  isTrackingConfigured,
  hasGoogleTracking,
  hasMetaTracking,
  isTrackingExemptPath,
} from "@/platform/config/tracking";

const ROOT = resolve(__dirname, "../..");
const INDEX_HTML = readFileSync(join(ROOT, "index.html"), "utf8");

/**
 * Identifiers that belonged to the original operator's production accounts.
 * None of them may ever reappear in the repository.
 */
const FORBIDDEN_IDENTIFIERS = [
  "GTM-PQXLPH9V",
  "G-4VGPY2997B",
  "AW-4177121452",
  "AW-16492594677",
  "AW-17340061089",
  "180875934879890",
  "2350848071975415",
  "groas.ai",
];

const SCAN_DIRS = ["src", "public"];
const SCAN_EXT = /\.(tsx?|jsx?|html|css|json)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(entry)) out.push(full);
  }
  return out;
}

describe("no committed production tracking identifiers", () => {
  it("index.html loads no tag manager, analytics, pixel or third-party script", () => {
    expect(INDEX_HTML).not.toMatch(/googletagmanager\.com/);
    expect(INDEX_HTML).not.toMatch(/connect\.facebook\.net/);
    expect(INDEX_HTML).not.toMatch(/\bfbq\(/);
    expect(INDEX_HTML).not.toMatch(/gtag\(/);
    expect(INDEX_HTML).not.toMatch(/groas/i);
  });

  it("no forbidden identifier appears in index.html", () => {
    for (const id of FORBIDDEN_IDENTIFIERS) {
      expect(INDEX_HTML).not.toContain(id);
    }
  });

  it("no forbidden identifier appears in scanned source", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        // this spec necessarily contains the identifiers it forbids
        if (file.endsWith("tracking-optin.test.ts")) continue;
        const contents = readFileSync(file, "utf8");
        for (const id of FORBIDDEN_IDENTIFIERS) {
          if (contents.includes(id)) offenders.push(`${file}: ${id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("tracking configuration is opt-in", () => {
  it("is entirely disabled with no environment configuration", () => {
    const config = getTrackingConfig({});
    expect(config).toEqual({
      gtmContainerId: undefined,
      ga4MeasurementId: undefined,
      googleAdsIds: [],
      metaPixelId: undefined,
      contentScriptUrl: undefined,
    });
    expect(isTrackingConfigured(config)).toBe(false);
    expect(hasGoogleTracking(config)).toBe(false);
    expect(hasMetaTracking(config)).toBe(false);
  });

  it("enables only the surfaces an operator explicitly supplies", () => {
    const config = getTrackingConfig({
      VITE_GTM_CONTAINER_ID: " gtm-abc1234 ",
      VITE_GA4_MEASUREMENT_ID: "g-abcdef1234",
      VITE_GOOGLE_ADS_IDS: "AW-000000000, aw-111111111 ,",
      VITE_META_PIXEL_ID: "000000000000000",
      VITE_CONTENT_SCRIPT_URL: "https://scripts.example.test/content.js",
    });

    expect(config.gtmContainerId).toBe("GTM-ABC1234");
    expect(config.ga4MeasurementId).toBe("G-ABCDEF1234");
    expect(config.googleAdsIds).toEqual(["AW-000000000", "AW-111111111"]);
    expect(config.metaPixelId).toBe("000000000000000");
    expect(config.contentScriptUrl).toBe("https://scripts.example.test/content.js");
    expect(isTrackingConfigured(config)).toBe(true);
  });

  it("ignores malformed values rather than passing them through", () => {
    const config = getTrackingConfig({
      VITE_GTM_CONTAINER_ID: "not-a-container",
      VITE_GA4_MEASUREMENT_ID: "nope",
      VITE_GOOGLE_ADS_IDS: "AW-,12345,javascript:alert(1)",
      VITE_META_PIXEL_ID: "abc",
      VITE_CONTENT_SCRIPT_URL: "http://insecure.example.test/x.js",
    });

    expect(isTrackingConfigured(config)).toBe(false);
    expect(config.googleAdsIds).toEqual([]);
  });

  it("never tracks staff-facing surfaces", () => {
    expect(isTrackingExemptPath("/admin")).toBe(true);
    expect(isTrackingExemptPath("/admin/dashboard")).toBe(true);
    expect(isTrackingExemptPath("/box-office/scan")).toBe(true);
    expect(isTrackingExemptPath("/tickets")).toBe(false);
  });
});

describe("unconfigured runtime injects nothing", () => {
  it("mounting AnalyticsTracking with no configuration adds no scripts", async () => {
    const { render } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const React = await import("react");
    const { AnalyticsTracking, isAnalyticsEnabled } = await import(
      "@/components/AnalyticsTracking"
    );

    expect(isAnalyticsEnabled()).toBe(false);

    render(
      React.createElement(MemoryRouter, null, React.createElement(AnalyticsTracking)),
    );

    const scripts = Array.from(document.querySelectorAll("script"));
    const external = scripts
      .map((s) => s.getAttribute("src") ?? "")
      .filter(Boolean);

    expect(external).toEqual([]);
    expect((window as unknown as { fbq?: unknown }).fbq).toBeUndefined();
    expect((window as unknown as { gtag?: unknown }).gtag).toBeUndefined();
  });
});
