import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewAccess } from "@/hooks/usePreviewAccess";
import { sanitizeInternalPath } from "@/lib/safeRedirect";

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  allowPreviewAccess?: boolean;
}

const ProtectedRoute = ({ 
  children, 
  redirectTo = "/auth",
  allowPreviewAccess = false 
}: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { hasPreviewAccess, loading: previewLoading } = usePreviewAccess();
  const location = useLocation();

  const loading = authLoading || (allowPreviewAccess && previewLoading);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Allow access if user is authenticated OR has valid preview token
  const hasAccess = user || (allowPreviewAccess && hasPreviewAccess);

  if (!hasAccess) {
    // Save the attempted URL to redirect back after login
    return (
      <Navigate
        to={sanitizeInternalPath(redirectTo, "/auth")}
        state={{ from: sanitizeInternalPath(location.pathname, "/") }}
        replace
      />
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;