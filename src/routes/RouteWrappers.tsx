import { Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { AdminLayout } from "@/layouts/AdminLayout";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";
import { AdminVersionIndicator } from "@/components/admin/AdminVersionIndicator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageLoader, AdminPageLoader } from "@/components/PageLoader";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeInternalPath } from "@/lib/safeRedirect";

/**
 * Route-boundary authorization for admin routes.
 *
 * The same authenticated + admin-role check also exists inside AdminLayout,
 * but enforcing it here means the guard survives a layout swap and no admin
 * chrome or lazy admin page is ever mounted for an unauthorized visitor.
 * Redirects are declarative (<Navigate replace />) so they cannot loop, and
 * no extra auth subscription is created — this reads the existing AuthProvider
 * context.
 *
 * SECURITY NOTE: this is a client-side check. Server-side RLS policies and
 * edge-function authorization remain the real security boundary.
 */
export const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-accent))]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: sanitizeInternalPath(location.pathname, "/") }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

/** Wrapper for admin routes with auth guard + Suspense + admin chrome. */
export const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <AdminGuard>
    <AdminLayout>
      <AdminErrorBoundary>
        <Suspense fallback={<AdminPageLoader />}>{children}</Suspense>
      </AdminErrorBoundary>
      <AdminVersionIndicator />
    </AdminLayout>
  </AdminGuard>
);

/**
 * Route-boundary authorization for box-office data screens (manifests, door
 * lists, printable rosters). These screens fetch registration/attendee data on
 * mount, so the guard must resolve before the page component is mounted at all.
 *
 * This intentionally does NOT cover the PIN-gated scanner routes
 * (`/box-office`, `/station`): those are designed for shift staff without
 * accounts and keep their own PIN flow.
 *
 * The role model is the same single `isAdmin` role used by AdminGuard — there
 * is no separate box-office role — so authenticated non-admins are redirected.
 *
 * SECURITY NOTE: this is a client-side guard only. Row Level Security on the
 * registration/event tables remains the real boundary and is verified in a
 * separate backend gate.
 */
export const BoxOfficeGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: sanitizeInternalPath(location.pathname, "/") }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

/** Wrapper for box-office data routes: auth guard + Suspense, no admin chrome. */
export const BoxOfficeRoute = ({ children }: { children: React.ReactNode }) => (
  <BoxOfficeGuard>
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  </BoxOfficeGuard>
);



/** Wrapper for public lazy routes. */
export const LazyRoute = ({ children }: { children: React.ReactNode }) => (
  <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>{children}</Suspense>
  </ErrorBoundary>
);
