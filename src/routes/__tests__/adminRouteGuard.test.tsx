/**
 * Route-boundary authorization for admin routes.
 *
 * These tests exercise `AdminGuard` directly (the guard `AdminRoute` wraps
 * around AdminLayout). Mounting the full `AdminRoute` is intentionally not
 * attempted: AdminLayout pulls in the admin event provider, sidebar and a
 * large tree of data-fetching children that require backend state. The guard
 * decision — the security-relevant part — is fully covered here and the guard
 * is the outermost element of AdminRoute, so nothing inside it can mount when
 * the guard redirects.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mockAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth() }));

import { AdminGuard } from "../RouteWrappers";

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/admin/dashboard"]}>
      <Routes>
        <Route
          path="/admin/dashboard"
          element={
            <AdminGuard>
              <div>admin content</div>
            </AdminGuard>
          }
        />
        <Route path="/auth" element={<div>auth page</div>} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminGuard", () => {
  beforeEach(() => mockAuth.mockReset());

  it("shows a loading state and renders nothing else while auth resolves", () => {
    mockAuth.mockReturnValue({ user: null, isAdmin: false, loading: true });
    const { container } = renderGuard();
    expect(screen.queryByText("admin content")).toBeNull();
    expect(screen.queryByText("auth page")).toBeNull();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("redirects unauthenticated visitors to /auth", () => {
    mockAuth.mockReturnValue({ user: null, isAdmin: false, loading: false });
    renderGuard();
    expect(screen.getByText("auth page")).toBeInTheDocument();
    expect(screen.queryByText("admin content")).toBeNull();
  });

  it("redirects authenticated non-admins to the home page", () => {
    mockAuth.mockReturnValue({ user: { id: "u1" }, isAdmin: false, loading: false });
    renderGuard();
    expect(screen.getByText("home page")).toBeInTheDocument();
    expect(screen.queryByText("admin content")).toBeNull();
  });

  it("renders admin content for an authenticated admin", () => {
    mockAuth.mockReturnValue({ user: { id: "u1" }, isAdmin: true, loading: false });
    renderGuard();
    expect(screen.getByText("admin content")).toBeInTheDocument();
  });
});
