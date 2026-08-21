import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { siteRoutes } from "@/routes/site.routes";

const MANIFEST = resolve(process.cwd(), "src/routes/site.routes.tsx");

describe("site module routes", () => {
  it("keeps the expected public URLs", () => {
    const paths = siteRoutes.routes.map((r) => r.path);
    for (const p of ["/", "/stay", "/lineup", "/schedule", "/winecamp", "/winecamp/:slug", "/contact", "/faq"]) {
      expect(paths).toContain(p);
    }
    // legacy redirects preserved
    expect(paths).toContain("/may/contact");
  });

  it("imports every page from the site module directory", () => {
    const src = readFileSync(MANIFEST, "utf8");
    const imports = [...src.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]);
    const siteModuleImports = imports.filter((p) => p.startsWith("@/modules/site/pages/"));
    expect(siteModuleImports.length).toBeGreaterThan(25);

    for (const spec of siteModuleImports) {
      const file = resolve(process.cwd(), "src", spec.replace("@/", "") + ".tsx");
      expect(existsSync(file), `${spec} should exist`).toBe(true);
    }
  });
});
