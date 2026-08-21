/**
 * Gate 6 slice 21 — approved brand architecture regression tests.
 *
 * Locks in the hierarchy Chris approved:
 *  - Analog Commons — the umbrella / open-source commons
 *  - Analog Tickets — the free, remixable ticketing platform
 *  - Cosmico — a festival previously produced, kept online only as a
 *    demonstration site with no active event, lineup, date or ticket sales.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BRANDING, DEMO_SITE_DISCLAIMER } from "@/platform/branding";

const ROOT = process.cwd();
const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");

describe("approved brand architecture", () => {
  it("names the umbrella, platform and demo site", () => {
    expect(BRANDING.commonsName).toBe("Analog Commons");
    expect(BRANDING.platformName).toBe("Analog Tickets");
    expect(BRANDING.demoSiteName).toBe("Cosmico");
  });

  it("states the demo site is inactive and not selling tickets", () => {
    const copy = DEMO_SITE_DISCLAIMER.lines.join(" ").toLowerCase();
    expect(copy).toContain("previously created");
    expect(copy).toContain("no longer produce");
    expect(copy).toContain("demonstration of analog tickets");
    expect(copy).toContain("tickets and bookings are not available");
    expect(DEMO_SITE_DISCLAIMER.short.toLowerCase()).toContain("not available");
  });

  it("never implies a live event in the disclaimer copy", () => {
    const copy = [...DEMO_SITE_DISCLAIMER.lines, DEMO_SITE_DISCLAIMER.short, DEMO_SITE_DISCLAIMER.heading]
      .join(" ")
      .toLowerCase();
    for (const forbidden of ["buy tickets", "on sale", "lineup", "this year", "join us"]) {
      expect(copy).not.toContain(forbidden);
    }
  });

  it("uses the approved names in public head metadata", () => {
    expect(indexHtml).toContain("<title>Cosmico — a demonstration of Analog Tickets</title>");
    expect(indexHtml).toMatch(/no longer produce/);
    expect(indexHtml).toMatch(/Tickets and bookings are not available/);
  });

  it("documents the hierarchy in the README", () => {
    expect(readme).toContain("Analog Tickets");
    expect(readme).toContain("Analog Commons");
    expect(readme).toContain("Cosmico");
  });
});

/**
 * Gate 6 slice 22 — visible demo copy normalization.
 *
 * The example festival is now called "Cosmico" in user-visible copy. The
 * umbrella name "Analog Commons" is still allowed (it is the commons, not the
 * event), as are internal keys such as the `analog-commons` config slug and the
 * `src/events/analog-commons/` directory.
 */
describe("visible demo copy names the example event Cosmico", () => {
  const VISIBLE_ROOTS = ["src/modules/site/pages", "src/modules/ticketing/pages", "src/components/may"];

  /** Lines allowed to keep the umbrella/product wording. */
  const ALLOWED = [
    "Analog Commons", // umbrella name, always allowed on its own
  ];

  function walk(dir: string): string[] {
    const abs = join(ROOT, dir);
    const out: string[] = [];
    for (const name of readdirSync(abs)) {
      const child = join(abs, name);
      if (statSync(child).isDirectory()) out.push(...walk(join(dir, name)));
      else if (/\.tsx?$/.test(name)) out.push(child);
    }
    return out;
  }

  const visibleFiles = VISIBLE_ROOTS.flatMap(walk);

  it("scans the public page surfaces", () => {
    expect(visibleFiles.length).toBeGreaterThan(20);
  });

  it("no longer calls the example event 'Analog Commons 20xx'", () => {
    const hits: string[] = [];
    for (const file of visibleFiles) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/analog\s+commons\s+(20\d\d|weekend|ticket|kids)/i.test(line)) {
            hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 140)}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });

  it("keeps the demo event config pointing at Cosmico while the slug stays internal", () => {
    const config = readFileSync(join(ROOT, "src/events/analog-commons/config.ts"), "utf8");
    expect(config).toContain('name: "Cosmico"');
    expect(config).toContain('slug: "analog-commons"');
    expect(config).toMatch(/no longer produced as an\s*\n?\s*\*?\s*active event/);
  });

  it("still shows the inactive-demo disclaimer on the site surfaces", () => {
    const notice = readFileSync(join(ROOT, "src/components/DemoSiteNotice.tsx"), "utf8");
    expect(notice).toContain("DEMO_SITE_DISCLAIMER");
    const index = readFileSync(join(ROOT, "src/modules/site/pages/Index.tsx"), "utf8");
    expect(index).toContain("DemoSiteNotice");
    const footer = readFileSync(join(ROOT, "src/components/may/MayFooter.tsx"), "utf8");
    expect(footer).toContain("DemoSiteNotice");
  });

  it("keeps generic remixer-facing template wording in the README", () => {
    expect(readme.toLowerCase()).toContain("remix");
    expect(readme).toContain("src/events/<your-event>/config.ts");
  });

  it("uses ALLOWED umbrella wording knowingly", () => {
    expect(ALLOWED[0]).toBe(BRANDING.commonsName);
  });
});
