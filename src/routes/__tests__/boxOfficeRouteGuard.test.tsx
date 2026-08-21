/**
 * Route-boundary authorization for box-office data screens.
 *
 * `BoxOfficeGuard` is exercised directly — it is the outermost element of
 * `BoxOfficeRoute`, so when it redirects, the lazy page (and its data fetching
 * on mount) never mounts. The PIN-gated scanner routes (`/box-office`,
 * `/station`) intentionally remain outside this guard and keep their own PIN
 * flow; the manifest test below asserts that split at the manifest level.
 *
 * The app has a single `isAdmin` role — there is no distinct box-office role —
 * so "authenticated non-admin" is the unauthorized case.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth() }));

import { BoxOfficeGuard } from "../RouteWrappers";
import { boxOfficeRoutes } from "../boxoffice.routes";

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/printable-manifest"]}>
      <Routes>
        <Route
          path="/printable-manifest"
          element={
            <BoxOfficeGuard>
              <div>manifest data</div>
            </BoxOfficeGuard>
          }
        />
        <Route path="/auth" element={<div>auth page</div>} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BoxOfficeGuard", () => {
  beforeEach(() => mockAuth.mockReset());

  it("shows a loading state and no registration data while auth resolves", () => {
    mockAuth.mockReturnValue({ user: null, isAdmin: false, loading: true });
    const { container } = renderGuard();
    expect(screen.queryByText("manifest data")).toBeNull();
    expect(screen.queryByText("auth page")).toBeNull();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("redirects unauthenticated visitors to /auth", () => {
    mockAuth.mockReturnValue({ user: null, isAdmin: false, loading: false });
    renderGuard();
    expect(screen.getByText("auth page")).toBeInTheDocument();
    expect(screen.queryByText("manifest data")).toBeNull();
  });

  it("redirects authenticated non-admins to the home page", () => {
    mockAuth.mockReturnValue({ user: { id: "u1" }, isAdmin: false, loading: false });
    renderGuard();
    expect(screen.getByText("home page")).toBeInTheDocument();
    expect(screen.queryByText("manifest data")).toBeNull();
  });

  it("renders box-office data for an authenticated admin", () => {
    mockAuth.mockReturnValue({ user: { id: "u1" }, isAdmin: true, loading: false });
    renderGuard();
    expect(screen.getByText("manifest data")).toBeInTheDocument();
  });
});

describe("box-office route manifest", () => {
  const paths = boxOfficeRoutes.routes.map((r) => r.path);

  it("keeps every original box-office path", () => {
    expect(paths).toEqual([
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
    ]);
  });

  it("guards data-fetching screens and leaves PIN-gated scanners untouched", () => {
    const nameOf = (path: string) => {
      const el = boxOfficeRoutes.routes.find((r) => r.path === path)?.element as
        | { type?: { name?: string } }
        | undefined;
      return el?.type?.name;
    };

    for (const path of [
      "/admin/checkin",
      "/box-office/manifest",
      "/box-office/door-list",
      "/printable-checkin",
      "/printable-manifest",
      "/printable-dinner-manifest",
    ]) {
      expect(nameOf(path)).toBe("BoxOfficeRoute");
    }

    // PIN flow preserved — these must NOT be behind the account guard.
    expect(nameOf("/box-office")).toBe("LazyRoute");
    expect(nameOf("/station")).toBe("LazyRoute");
  });
});
