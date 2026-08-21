import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ticketingRoutes } from "@/routes/ticketing.routes";

const MANIFEST = resolve(process.cwd(), "src/routes/ticketing.routes.tsx");

describe("ticketing module routes", () => {
  it("keeps the expected commerce URLs", () => {
    const paths = ticketingRoutes.routes.map((r) => r.path);
    for (const p of [
      "/tickets",
      "/tickets/payment-plan",
      "/checkout/lodging",
      "/checkout/addons",
      "/checkout/review",
      "/accommodations",
      "/accommodations/invite",
      "/accommodations/success",
      "/ticket-success",
      "/lodging",
      "/lodging/success",
      "/lodging/invite",
      "/bringyourcrew",
      "/bringyourcrew/checkout",
      "/payment-plan-status",
      "/my-tickets",
      "/may/tickets",
      "/may/accommodations",
      "/may/ticket-success",
    ]) {
      expect(paths).toContain(p);
    }
  });

  it("no longer imports pages from the legacy src/pages/may location", () => {
    const src = readFileSync(MANIFEST, "utf8");
    expect(src).not.toContain("@/pages/may/");
  });

  it("imports purchase-flow pages from the ticketing module directory", () => {
    const src = readFileSync(MANIFEST, "utf8");
    const imports = [...src.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]);
    const moduleImports = imports.filter((p) => p.startsWith("@/modules/ticketing/pages/"));
    expect(moduleImports.length).toBeGreaterThanOrEqual(10);

    for (const spec of moduleImports) {
      const file = resolve(process.cwd(), "src", spec.replace("@/", "") + ".tsx");
      expect(existsSync(file), `${spec} should exist`).toBe(true);
    }
  });
});
