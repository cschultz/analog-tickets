import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { FileQuestion, LayoutDashboard, ArrowLeft } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminUI";
import { trackCustomEvent } from "@/components/AnalyticsTracking";

const AdminNotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("Admin 404 Error: User attempted to access non-existent route:", location.pathname);
    
    // Track admin 404 in analytics
    trackCustomEvent("admin_page_not_found", {
      attempted_path: location.pathname,
      referrer: document.referrer || "direct",
    });
  }, [location.pathname]);

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* 404 Icon */}
        <div className="mx-auto w-16 h-16 bg-[hsl(var(--admin-warning))]/10 rounded-full flex items-center justify-center mb-6">
          <FileQuestion className="w-8 h-8 text-[hsl(var(--admin-warning))]" />
        </div>
        
        {/* 404 Message */}
        <h1 className="text-4xl font-bold text-[hsl(var(--admin-text))] mb-2">404</h1>
        <h2 className="text-xl font-semibold text-[hsl(var(--admin-text))] mb-2">
          Page not found
        </h2>
        <p className="text-[hsl(var(--admin-text-muted))] mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        
        {/* Path info */}
        <div className="mb-6 bg-[hsl(var(--admin-hover))] p-3 rounded-lg border border-[hsl(var(--admin-border))]">
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
            Requested path:
          </p>
          <code className="text-sm font-mono text-[hsl(var(--admin-text))]">
            {location.pathname}
          </code>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-3 justify-center">
          <AdminButton variant="adminOutline" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </AdminButton>
          <AdminButton variant="admin" asChild>
            <Link to="/admin">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Link>
          </AdminButton>
        </div>
      </div>
    </div>
  );
};

export default AdminNotFound;
