/**
 * AdminMobileNav - Mobile Navigation for Admin
 * 
 * RULES (from Admin Mobile Design Guide):
 * - Flat, text-only labels with subtle active state
 * - No background cards or containers
 * - No status pills or colored badges
 * - Event selector at BOTTOM (rare use case), visually quiet
 * - Same neutral style as desktop left nav
 */

import { useState } from "react";
import { useCollapsedSections } from "@/hooks/useCollapsedSections";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  List, 
  Ticket, 
  BarChart3, 
  Mail, 
  Webhook, 
  MessageSquare,
  Bell,
  Activity,
  Headphones,
  MessageCircle,
  Shield,
  Sparkles,
  Clock,
  ArrowUpCircle,
  MessageSquareText,
  Package,
  UserCircle,
  Settings,
  Palette,
  Gift,
  ChevronDown,
  ChevronRight,
  Home,
  Music,
  TrendingUp,
  Handshake,
  Wine,
  BedDouble,
  Camera,
  LucideIcon,
  Megaphone,
  Star,
  Tag,
  ScanLine,
  AlertTriangle
} from "lucide-react";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { AdminScrollArea } from "@/components/admin";
import analogLogo from "@/assets/analog-wordmark-black.webp";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Top navigation items
const topNavItems: NavItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
  { title: "Sales Report", url: "/admin/sales", icon: BarChart3 },
  { title: "Pacing", url: "/admin/pacing", icon: TrendingUp },
  { title: "Inbox", url: "/admin/inbox", icon: MessageSquareText },
];

// Grouped navigation sections
const navigationSections: NavSection[] = [
  {
    label: "People",
    items: [
      { title: "Registrations", url: "/admin/registrations", icon: Users },
      { title: "Customers", url: "/admin/customers", icon: UserCircle },
      { title: "Guest Lists", url: "/admin/guest-lists", icon: List },
    ]
  },
  {
    label: "Production",
    items: [
      { title: "Artists", url: "/admin/artists", icon: Music },
      { title: "Vendors", url: "/admin/vendors", icon: Package },
      { title: "Partners", url: "/admin/partners", icon: Handshake },
      { title: "Artisans", url: "/admin/artisans", icon: Palette },
      { title: "Volunteers", url: "/admin/production-volunteers", icon: Users },
      { title: "Street Team", url: "/admin/street-team", icon: Megaphone },
      { title: "WineCamp", url: "/admin/winecamp", icon: Wine },
    ]
  },
  {
    label: "Sales",
    items: [
      { title: "Tickets", url: "/admin/tickets", icon: Ticket },
      { title: "Inventory", url: "/admin/inventory", icon: Package },
      { title: "Add-ons", url: "/admin/addons", icon: Package },
      { title: "Lead Recovery", url: "/admin/leads", icon: Star },
      { title: "Crew Bids", url: "/admin/crew-bids", icon: Users },
      { title: "Offers", url: "/admin/offers", icon: Gift },
      { title: "Promo Codes", url: "/admin/promo-codes", icon: Tag },
      { title: "Upgrades", url: "/admin/upgrades", icon: ArrowUpCircle },
      { title: "Box Office", url: "/admin/box-office", icon: ScanLine },
    ]
  },
  {
    label: "Outreach",
    items: [
      { title: "Emails", url: "/admin/emails", icon: Mail },
      { title: "Surveys", url: "/admin/surveys", icon: MessageSquare },
      { title: "Reminders", url: "/admin/reminders", icon: Bell },
      { title: "Preview Signups", url: "/admin/preview-signups", icon: Sparkles },
    ]
  },
  {
    label: "Lodging",
    items: [
      { title: "Zones", url: "/admin/lodging/zones", icon: Home },
      { title: "Unit Inventory", url: "/admin/lodging/units", icon: BedDouble },
    ]
  },
  {
    label: "Waitlists",
    items: [
      { title: "Ticket Waitlist", url: "/admin/waitlist", icon: Clock },
      { title: "Accommodation", url: "/admin/accommodation-waitlist", icon: Clock },
    ]
  },
  {
    label: "Content",
    items: [
      { title: "Social Publishing", url: "/admin/social", icon: Camera },
    ]
  },
  {
    label: "Support",
    items: [
      { title: "Volunteer Interests", url: "/admin/volunteer-interests", icon: Users },
    ]
  },
  {
    label: "Settings",
    items: [
      { title: "Events", url: "/admin/events", icon: Calendar },
      { title: "Settings", url: "/admin/settings", icon: Settings },
      { title: "System Health", url: "/admin/health", icon: Activity },
      { title: "Incidents", url: "/admin/incidents", icon: AlertTriangle },
      { title: "Webhooks", url: "/admin/webhooks", icon: Webhook },
      { title: "Admin Users", url: "/admin/users", icon: Shield },
      { title: "Style Guide", url: "/admin/style-guide", icon: Palette },
    ]
  }
];

interface AdminMobileNavProps {
  onNavigate?: () => void;
}

export function AdminMobileNav({ onNavigate }: AdminMobileNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedEvent, events, setSelectedEventId } = useAdminEvent();
  const { collapsedSections, toggleSection } = useCollapsedSections();
  const [eventSelectorOpen, setEventSelectorOpen] = useState(false);

  const isActive = (url: string, end?: boolean) => {
    if (end) {
      return location.pathname === url;
    }
    return location.pathname.startsWith(url);
  };

  const handleNavigate = (url: string) => {
    navigate(url);
    onNavigate?.();
  };

  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    setEventSelectorOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--admin-surface))]">
      {/* Header with event name */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-[hsl(var(--admin-border))]">
        {selectedEvent ? (
          <>
            <span className="text-sm font-semibold text-[hsl(var(--admin-text))] tracking-wide uppercase">
              {selectedEvent.title}
            </span>
            <span className="text-xs text-[hsl(var(--admin-text-muted))]">
              {selectedEvent.status}
            </span>
          </>
        ) : (
          <img src={analogLogo} alt="Analog" className="h-5" />
        )}
      </div>

      {/* Navigation */}
      <AdminScrollArea className="flex-1">
        <div className="py-2">
          {/* Top nav items */}
          <div className="px-2 pb-3">
            {topNavItems.map((item) => (
              <button
                key={item.url}
                onClick={() => handleNavigate(item.url)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors",
                  "min-h-[44px]", // Touch target
                  isActive(item.url, item.end)
                    ? "bg-[hsl(var(--admin-active))] text-[hsl(var(--admin-active-foreground))] font-medium"
                    : "text-[hsl(var(--admin-text-muted))] hover:bg-[hsl(var(--admin-hover))] hover:text-[hsl(var(--admin-text))]"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.title}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-4 my-1 border-t border-[hsl(var(--admin-divider))]" />

          {/* Section navigation */}
          {navigationSections.map((section) => (
            <div key={section.label} className="px-2">
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center justify-between px-3 py-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--admin-text-subtle))] hover:text-[hsl(var(--admin-text-secondary))] transition-colors min-h-[44px]"
              >
                <span>{section.label}</span>
                <ChevronRight 
                  className={cn(
                    "h-4 w-4 transition-transform",
                    !collapsedSections[section.label] && "rotate-90"
                  )} 
                />
              </button>
              
              {!collapsedSections[section.label] && (
                <div className="pb-2">
                  {section.items.map((item) => (
                    <button
                      key={item.url}
                      onClick={() => handleNavigate(item.url)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors",
                        "min-h-[44px]", // Touch target
                        isActive(item.url, item.end)
                          ? "bg-[hsl(var(--admin-active))] text-[hsl(var(--admin-active-foreground))] font-medium"
                          : "text-[hsl(var(--admin-text-muted))] hover:bg-[hsl(var(--admin-hover))] hover:text-[hsl(var(--admin-text))]"
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </AdminScrollArea>

      {/* Event Selector - At bottom, visually quiet (rare use case) */}
      <div className="px-3 py-3 border-t border-[hsl(var(--admin-border))] mt-auto">
        <button
          onClick={() => setEventSelectorOpen(!eventSelectorOpen)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm rounded-md bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-active))] transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--admin-text-subtle))] mb-0.5">
              Working on
            </p>
            <p className="font-medium text-[hsl(var(--admin-text))] truncate">
              {selectedEvent?.title || "Select event"}
            </p>
          </div>
          <ChevronDown className={cn(
            "h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0 transition-transform",
            eventSelectorOpen && "rotate-180"
          )} />
        </button>
        
        {/* Event selector dropdown - expands upward */}
        {eventSelectorOpen && (
          <div className="mt-2 py-1 max-h-48 overflow-y-auto">
            {events?.map((event) => (
              <button
                key={event.id}
                onClick={() => handleEventSelect(event.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                  "hover:bg-[hsl(var(--admin-hover))]",
                  event.id === selectedEvent?.id && "bg-[hsl(var(--admin-active))] font-medium"
                )}
              >
                <span className="text-[hsl(var(--admin-text))]">{event.title}</span>
                {/* Status as subtle text, not pill */}
                <span className="ml-2 text-xs text-[hsl(var(--admin-text-muted))]">
                  ({event.status})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
