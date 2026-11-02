import type { ReactNode } from "react";
import {
  Ticket,
  Users,
  Tag,
  Menu,
  LayoutDashboard,
  BarChart3,
  Calendar,
  Package,
  ScanLine,
  Settings2,
} from "lucide-react";
import { AdminPageHeader } from "./AdminPageHeader";
import "./organizer-admin.css";
import {
  organizerEventContext,
  type OrganizerAccess,
  type OrganizerSection,
} from "@/lib/organizer-navigation";
export type { OrganizerSection } from "@/lib/organizer-navigation";
/** Adapted from legacy AdminLayout's domain sidebar and event-context structure.
 * Deliberately excludes old AuthProvider, assets, tracking, global roles and integrations.
 */
export function OrganizerAdminShell({
  children,
  section,
  onSection,
  signedIn,
  eventName,
  access = signedIn ? "ready" : "signed_out",
  eventControl,
  accountControl,
}: {
  children: ReactNode;
  section: OrganizerSection;
  onSection: (s: OrganizerSection) => void;
  signedIn: boolean;
  eventName: string;
  access?: OrganizerAccess;
  eventControl?: ReactNode;
  accountControl?: ReactNode;
}) {
  const links = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { id: "reports" as const, label: "Sales Report", icon: BarChart3 },
    { id: "orders" as const, label: "Orders", icon: Ticket },
    { id: "attendees" as const, label: "Attendees", icon: Users },
    { id: "check-in" as const, label: "Check-in", icon: ScanLine },
    { id: "promotions" as const, label: "Promotions", icon: Tag },
    { id: "event" as const, label: "Event Management", icon: Calendar },
    { id: "tickets" as const, label: "Ticket Management", icon: Ticket },
    { id: "inventory" as const, label: "Inventory", icon: Package },
    { id: "setup" as const, label: "Setup & readiness", icon: Settings2 },
  ];
  const nav = (
    <nav aria-label="Organizer workspace">
      {links.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          disabled={!signedIn || access !== "ready" || !eventName}
          aria-current={section === id ? "page" : undefined}
          onClick={(e) => {
            onSection(id);
            e.currentTarget.closest("details.organizer-mobile-nav")?.removeAttribute("open");
          }}
        >
          <Icon aria-hidden="true" size={18} />
          {label}
        </button>
      ))}
    </nav>
  );
  return (
    <div className="organizer-admin">
      <a
        className="admin-skip"
        href="#organizer-workspace"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("organizer-workspace")?.focus();
        }}
      >
        Skip to organizer content
      </a>
      <aside className="organizer-sidebar">
        <a className="admin-identity" href="/admin">
          Analog Tickets <span>TEST workspace</span>
        </a>
        <p className="admin-event-context">
          Working on <strong>{organizerEventContext(access, eventName)}</strong>
        </p>
        {nav}
        <details className="admin-future">
          <summary>About this workspace</summary>
          <p>
            Team, lodging, add-ons and outreach are tracked for integration. They are not available
            in this slice. Only connected TEST tools are shown here.
          </p>
        </details>
        <a href="/">View event website ↗</a>
      </aside>
      <div className="organizer-body">
        <header className="organizer-topbar">
          <div className="admin-event-switcher">
            {eventControl ?? organizerEventContext(access, eventName)}
          </div>
          <div className="admin-account-controls">
            <span className="admin-test-badge">TEST · No real admission</span>
            {accountControl}
          </div>
        </header>
        <details className="organizer-mobile-nav">
          <summary>
            <Menu aria-hidden="true" size={18} /> Workspace navigation
          </summary>
          {nav}
        </details>
        <main
          id="organizer-workspace"
          tabIndex={-1}
          className="organizer-content"
          aria-label={links.find((l) => l.id === section)?.label}
        >
          {!["dashboard", "reports", "event", "tickets", "inventory"].includes(section) ||
          access !== "ready" ||
          !eventName ? (
            <AdminPageHeader
              title={
                access === "signed_out"
                  ? "Organizer sign-in"
                  : (links.find((l) => l.id === section)?.label ?? "Organizer tools")
              }
              subtitle={eventName || "Organizer tools · TEST installation"}
            />
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
