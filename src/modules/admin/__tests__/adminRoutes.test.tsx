import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { adminRoutes } from "@/routes/admin.routes";

const MANIFEST = resolve(process.cwd(), "src/routes/admin.routes.tsx");

describe("admin module routes", () => {
  it("keeps the expected admin URLs", () => {
    const paths = adminRoutes.routes.map((r) => r.path);
    for (const p of [
      "/auth",
      "/admin",
      "/admin/registrations",
      "/admin/customers",
      "/admin/customers/:email",
      "/admin/tickets",
      "/admin/sales",
      "/admin/settings",
      "/admin/users",
      "/admin/inventory",
      "/admin/lodging",
      "/admin/*",
    ]) {
      expect(paths).toContain(p);
    }
  });

  it("still wraps admin pages in the AdminRoute guard", () => {
    const src = readFileSync(MANIFEST, "utf8");
    const guarded = [...src.matchAll(/path: "(\/admin[^"]*)", element: <AdminRoute>/g)].map((m) => m[1]);
    expect(guarded.length).toBeGreaterThan(30);
    expect(guarded).toContain("/admin/users");
  });

  it("imports admin pages from the admin module directory only", () => {
    const src = readFileSync(MANIFEST, "utf8");
    expect(src).not.toContain("@/pages/admin/");
    const specs = [
      ...[...src.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]),
      ...[...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]),
    ].filter((p) => p.startsWith("@/modules/admin/pages/"));
    expect(specs.length).toBeGreaterThan(40);
    for (const spec of specs) {
      expect(existsSync(resolve(process.cwd(), "src", spec.replace("@/", "") + ".tsx")), `${spec} exists`).toBe(true);
    }
  });
});
