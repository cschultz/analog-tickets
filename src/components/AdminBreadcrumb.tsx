import { useLocation, useNavigate } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home, Calendar, ChevronLeft } from "lucide-react";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

// Maps route paths to display names (will be uppercased in display)
const routeNames: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/registrations": "Registrations",
  "/admin/events": "Events",
  "/admin/guest-lists": "Guest Lists",
  "/admin/tickets": "Tickets",
  "/admin/sales": "Sales Report",
  "/admin/emails": "Emails",
  "/admin/webhooks": "Webhooks",
  "/admin/surveys": "Surveys",
  "/admin/reminders": "Reminders",
  "/admin/health": "System Health",
  "/admin/support": "Support Messages",
  "/admin/chat-logs": "Chat Logs",
  "/admin/users": "Admin Users",
  "/admin/customers": "Customers",
  "/admin/artists": "Artists",
  "/admin/vendors": "Vendors",
  "/admin/partners": "Partners",
  "/admin/artisans": "Artisans",
  "/admin/production-volunteers": "Volunteers",
  "/admin/street-team": "Street Team",
  "/admin/winecamp": "WineCamp",
  
  "/admin/pacing": "Pacing",
  "/admin/inventory": "Inventory",
  "/admin/leads": "Lead Recovery",
  "/admin/offers": "Offers",
  "/admin/upgrades": "Upgrades",
  "/admin/waitlist": "Waitlist",
  "/admin/accommodation-waitlist": "Accommodation",
  "/admin/contact": "Contact Forms",
  "/admin/volunteers": "Volunteer Interests",
  "/admin/preview-signups": "Preview Signups",
  "/admin/settings": "Settings",
  "/admin/style-guide": "Style Guide",
  "/admin/inbox": "Inbox",
};

// Format segment for display: converts "customers" to "Customers" or "guest-lists" to "Guest Lists"
function formatSegment(segment: string): string {
  return segment
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function AdminBreadcrumb() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedEvent } = useAdminEvent();
  const isMobile = useIsMobile();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  // Build breadcrumb items, skipping the "admin" segment since Home icon already links to dashboard
  const breadcrumbItems = pathSegments
    .filter((segment) => segment !== "admin")
    .map((segment, index, filteredSegments) => {
      // Rebuild the full path including "admin" for route matching
      const fullPath = `/admin/${filteredSegments.slice(0, index + 1).join("/")}`;
      // Use mapped name or format the segment
      const rawName = routeNames[fullPath] || formatSegment(segment);
      // Apply uppercase for consistency
      const name = rawName.toUpperCase();
      const isLast = index === filteredSegments.length - 1;

      return {
        path: fullPath,
        name,
        isLast,
      };
    });

  // Show back button when on nested pages (2+ segments after filtering)
  const showBackButton = breadcrumbItems.length >= 2;
  const parentPath = showBackButton ? breadcrumbItems[breadcrumbItems.length - 2]?.path : null;
  const currentPage = breadcrumbItems[breadcrumbItems.length - 1];

  // Mobile: Show only back button + current page title
  if (isMobile) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        {showBackButton && parentPath && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))]"
            onClick={() => navigate(parentPath)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Button>
        )}
        {currentPage && (
          <span className="font-medium text-[hsl(var(--admin-text))] text-xs tracking-wide truncate">
            {currentPage.name}
          </span>
        )}
      </div>
    );
  }

  // Desktop: Full breadcrumb with all items
  return (
    <div className="flex items-center gap-4">
      {showBackButton && parentPath && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))]"
          onClick={() => navigate(parentPath)}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Back</span>
        </Button>
      )}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin" className="flex items-center gap-1">
              <Home className="h-3.5 w-3.5" />
              <span className="sr-only">Home</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {breadcrumbItems.length > 0 && <BreadcrumbSeparator />}
          {breadcrumbItems.map((item, index) => (
            <div key={item.path} className="flex items-center gap-2">
              <BreadcrumbItem>
                {item.isLast ? (
                  <BreadcrumbPage className="font-medium text-[hsl(var(--admin-text))] text-xs tracking-wide">
                    {item.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={item.path} className="text-xs tracking-wide">
                    {item.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!item.isLast && index < breadcrumbItems.length - 1 && (
                <BreadcrumbSeparator />
              )}
            </div>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      
      {selectedEvent && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[hsl(var(--admin-hover))] border border-[hsl(var(--admin-border))] text-xs text-[hsl(var(--admin-text-muted))]">
          <Calendar className="h-3 w-3" />
          <span className="font-medium">{selectedEvent.title}</span>
        </div>
      )}
    </div>
  );
}
