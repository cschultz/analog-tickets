import { describe, expect, it } from "vitest";

import { ALL_MANIFESTS, routesForMode } from "@/routes";

const pathsFor = (mode: Parameters<typeof routesForMode>[0]) =>
  routesForMode(mode).map((route) => route.path);

describe("route manifests", () => {
  it("has no duplicate paths across manifests", () => {
    const paths = ALL_MANIFESTS.flatMap((m) => m.routes.map((r) => r.path));
    const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i);
    expect(duplicates).toEqual([]);
  });

  it("integrated mode exposes every manifest route", () => {
    const all = ALL_MANIFESTS.flatMap((m) => m.routes.map((r) => r.path)).sort();
    expect(pathsFor("integrated").sort()).toEqual(all);
  });

  it("integrated mode covers the current public and admin surface", () => {
    const paths = pathsFor("integrated");
    for (const expected of [
      "/",
      "/lineup",
      "/tickets",
      "/checkout/lodging",
      "/checkout/addons",
      "/checkout/review",
      "/my-tickets",
      "/box-office",
      "/admin",
      "/admin/*",
      "/admin/checkin",
      "/auth",
      "/may/tickets",
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("site mode exposes presentation routes only", () => {
    const paths = pathsFor("site");
    expect(paths).toContain("/");
    expect(paths).toContain("/lineup");
    expect(paths).not.toContain("/tickets");
    expect(paths).not.toContain("/my-tickets");
    expect(paths).not.toContain("/box-office");
    expect(paths).not.toContain("/admin");
  });

  it("ticketing mode exposes commerce and operations routes only", () => {
    const paths = pathsFor("ticketing");
    expect(paths).toContain("/tickets");
    expect(paths).toContain("/my-tickets");
    expect(paths).toContain("/box-office");
    expect(paths).toContain("/admin");
    expect(paths).not.toContain("/");
    expect(paths).not.toContain("/lineup");
  });
});
