import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  NIL_EVENT_ID,
  getPrimaryEventId,
  getLodgingEventId,
  getSessionsEventId,
  hasConfiguredEventId,
} from "@/platform/config/eventIds";
import {
  configuredSocialLinks,
  NEWSLETTER_LINK,
  PRODUCER,
  STORE_LINK,
  SESSIONS_LODGING_PARTNERS,
  SESSIONS_LODGING_PROMO_CODE,
} from "@/platform/externalLinks";

/**
 * A fresh remix must not ship the original operator's backend row ids or
 * outbound links. These identifiers were removed in the Gate 7 audit; the scan
 * below keeps them from creeping back into frontend source.
 */
const FORBIDDEN = [
  "e40bacfe-6af2-4f11-aeb7-004802804b46",
  "a2a74abc-0f0e-4d56-85c3-c7315f998719",
  "60ad3685-555c-4dd1-85c6-04a0f0d3947e",
  "lp.foundation",
  "cschultz.substack.com",
  "be.synxis.com",
  "instagram.com/analogcommons",
  "facebook.com/analogcommons",
  "a.co/d/",
];

const ROOT = join(process.cwd(), "src");
const EXT = /\.(ts|tsx|html)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(entry)) out.push(full);
  }
  return out;
}

describe("production identifier scan", () => {
  // Scanner test files legitimately name the retired identifiers they guard
// against, so they are excluded from each other's scans.
const SCANNER_FILES = ["production-identifiers.test.ts", "backend-identifiers.test.ts"];
const files = walk(ROOT).filter((f) => !SCANNER_FILES.some((n) => f.endsWith(n)));

  it("finds no production event ids or operator links in frontend source", () => {
    const hits: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const needle of FORBIDDEN) {
        if (content.includes(needle)) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("unconfigured event ids", () => {
  it("resolves to the nil uuid when no env override is present", () => {
    expect(getPrimaryEventId({})).toBe(NIL_EVENT_ID);
    expect(getLodgingEventId({})).toBe(NIL_EVENT_ID);
    expect(getSessionsEventId({})).toBe(NIL_EVENT_ID);
    expect(hasConfiguredEventId({})).toBe(false);
  });

  it("accepts a valid configured uuid and ignores malformed values", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(getPrimaryEventId({ VITE_PRIMARY_EVENT_ID: id })).toBe(id);
    expect(getPrimaryEventId({ VITE_PRIMARY_EVENT_ID: "not-a-uuid" })).toBe(NIL_EVENT_ID);
  });

  it("falls back lodging/sessions ids to the primary event", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(getLodgingEventId({ VITE_PRIMARY_EVENT_ID: id })).toBe(id);
    expect(getSessionsEventId({ VITE_PRIMARY_EVENT_ID: id })).toBe(id);
  });
});

describe("outbound operator links", () => {
  it("ship unset so a fresh remix links nowhere", () => {
    expect(configuredSocialLinks()).toEqual([]);
    expect(NEWSLETTER_LINK.url).toBeUndefined();
    expect(STORE_LINK.url).toBeUndefined();
    expect(PRODUCER.name).toBeUndefined();
    expect(PRODUCER.url).toBeUndefined();
    expect(PRODUCER.legalAddress).toBeUndefined();
    expect(SESSIONS_LODGING_PROMO_CODE).toBeUndefined();
    expect(SESSIONS_LODGING_PARTNERS.every((p) => !p.bookingUrl)).toBe(true);
  });
});
