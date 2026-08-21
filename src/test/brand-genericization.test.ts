/**
 * Gate 3 slice 6B — genericization scan.
 *
 * Proves the frontend/demo surfaces that were genericized no longer carry the
 * production event brands, real domains, or real vendor/partner data.
 *
 * Explicitly OUT of scope (deferred to later gates, intentionally not asserted):
 *  - `supabase/functions/**` (edge functions, including function names such as
 *    `create-cosmico-checkout` that the frontend must keep calling)
 *  - binary assets and their filenames under `src/assets/**` and `public/**`
 *  - historical/internal runbooks under `docs/` that record past operations
 *  - legacy localStorage / UTM / error-monitor keys prefixed `cosmico_`, which
 *    are storage identifiers rather than user-visible brand copy
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const SCANNED_ROOTS = ["src", "index.html", "README.md"];

const SKIP_DIRS = new Set(["assets", "node_modules", "dist"]);

/** Files whose remaining hits are asset paths / storage keys, documented above. */
const ALLOWED_SUBSTRINGS = [
  "cosmico_", // localStorage / sessionStorage keys
  "__cosmico", // global error-monitor flag
  "create-cosmico-checkout", // edge function name — backend contract
  "cosmico-stage-night", // asset filename
  "cosmico-projection", // asset filename
  "analog-reunion-map", // asset filename
  "class_from_wildhaven", // generated database column name
  "wildhaven-map.png", // public asset filename
  "wildhaven/", // asset directory
  "cosmic-magenta", // design token, unrelated word
  "sonomaPizza", // asset import identifier
  "lioco", // asset import identifier / filename
  "arnotRoberts", // asset import identifier
  "arnot-roberts", // asset filename
  "wildhaven-map", // asset filename
  "bazaarSonoma", // asset import identifier
  "pressSonomaMag", // asset import identifier
  "brand-genericization", // this test file
];

const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: "Analog Reunion", pattern: /analog\s?reunion/i },
  // "Cosmico" is intentionally allowed: it is the approved name of the inactive
  // demonstration festival (Gate 6, slice 21). The production domain is not.
  { label: "cosmi.co domain", pattern: /cosmi\.co/i },
  { label: "cosmico.lovable.app", pattern: /cosmico\.lovable\.app/i },
  { label: "Wildhaven", pattern: /wildhaven/i },
  { label: "Dawn Ranch", pattern: /dawn\s?ranch/i },
  { label: "Winter Escape", pattern: /winter\s?escape/i },
  { label: "Real organizer names", pattern: /chris\s+schultz|anne\s+driscoll/i },
];

/** Real vendor/partner names that must not survive in the frontend demo data. */
const FORBIDDEN_VENDOR_DATA = [
  "Ryme Cellars",
  "Bloodroot Wines",
  "LIOCO",
  "Arnot-Roberts",
  "Marietta Cellars",
  "Sonoma Pizza Co",
  "Bazaar Sonoma",
  "Nellie's Oysters",
  "Sundrop Sauna",
  "Anderson Pugash",
  "rymecellars.com",
  "thisisfjord.com",
  "sundropsauna.com",
];

function collectFiles(entry: string): string[] {
  const abs = join(ROOT, entry);
  let stats;
  try {
    stats = statSync(abs);
  } catch {
    return [];
  }
  if (stats.isFile()) return [abs];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    if (SKIP_DIRS.has(name)) continue;
    const child = join(abs, name);
    const childStats = statSync(child);
    if (childStats.isDirectory()) {
      out.push(...collectFiles(relative(ROOT, child)));
    } else if (
      /\.(ts|tsx|css|md|html)$/.test(name) &&
      // Scanner tests legitimately name the identifiers they guard against.
      name !== "brand-genericization.test.ts" &&
      name !== "backend-identifiers.test.ts"
    ) {
      out.push(child);
    }
  }
  return out;
}

const FILES = SCANNED_ROOTS.flatMap(collectFiles);

function offendingLines(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of FILES) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!pattern.test(line)) return;
      if (ALLOWED_SUBSTRINGS.some((allowed) => line.includes(allowed))) return;
      hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
  return hits;
}

describe("frontend brand genericization", () => {
  it("scans a non-trivial number of files", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  for (const { label, pattern } of FORBIDDEN) {
    it(`contains no production reference: ${label}`, () => {
      expect(offendingLines(pattern)).toEqual([]);
    });
  }

  it("contains no real vendor/partner names or websites in frontend data", () => {
    const hits = FORBIDDEN_VENDOR_DATA.flatMap((needle) =>
      offendingLines(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")),
    );
    expect(hits).toEqual([]);
  });

  it("uses the inactive Cosmico demo identity in the demo event config", () => {
    const config = readFileSync(join(ROOT, "src/events/analog-commons/config.ts"), "utf8");
    expect(config).toContain('name: "Cosmico"');
    expect(config).toContain("example.test");
    // The slug stays `analog-commons` on purpose — backend key, not copy.
    expect(config).toContain('slug: "analog-commons"');
  });
});
