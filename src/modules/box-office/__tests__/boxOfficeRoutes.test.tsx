import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { boxOfficeRoutes } from "@/routes/boxoffice.routes";

const MANIFEST = resolve(process.cwd(), "src/routes/boxoffice.routes.tsx");

describe("box office module routes", () => {
  it("keeps the expected operational URLs", () => {
    const paths = boxOfficeRoutes.routes.map((r) => r.path);
    for (const p of [
      "/admin/checkin",
      "/check-in",
      "/check-in-scanner",
      "/box-office",
      "/box-office/manifest",
      "/box-office/door-list",
      "/station",
      "/printable-checkin",
      "/printable-manifest",
      "/printable-dinner-manifest",
    ]) {
      expect(paths).toContain(p);
    }
  });

  it("imports every page from the box-office module directory", () => {
    const src = readFileSync(MANIFEST, "utf8");
    expect(src).not.toMatch(/@\/pages\/(CheckIn|BoxOffice|DoorList|StationScanner|Printable)/);
    const specs = [...src.matchAll(/import\("([^"]+)"\)/g)]
      .map((m) => m[1])
      .filter((p) => p.startsWith("@/modules/box-office/pages/"));
    expect(specs).toHaveLength(9);
    for (const spec of specs) {
      expect(existsSync(resolve(process.cwd(), "src", spec.replace("@/", "") + ".tsx")), `${spec} exists`).toBe(true);
    }
  });
});
