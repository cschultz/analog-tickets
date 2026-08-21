import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { useCollapsedSections } from "@/hooks/useCollapsedSections";
import { AdminEventProvider, useAdminEvent } from "@/hooks/useAdminEvent";
import { supabase } from "@/integrations/supabase/client";
import analogLogo from "@/assets/analog-wordmark-black.webp";
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
  LogOut,
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
  LucideIcon,
  Camera,
  Check,
  X,
  User,
  Home,
  BedDouble,
  Music,
  TrendingUp,
  Handshake,
  Wine,
  Star,
  Pin,
  Search,
  Menu,
  ClipboardList,
  Megaphone,
  Utensils,
  ScanLine
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { AdminButton, AdminBadge, AdminScrollArea } from "@/components/admin";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AdminBreadcrumb } from "@/components/AdminBreadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { AdminNotifications } from "@/components/admin/AdminNotifications";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";
import { useIsMobile } from "@/hooks/use-mobile";
import { QuickActionsFAB } from "@/components/admin/QuickActionsFAB";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { TestingPanel, TestModeIndicator } from "@/components/admin/TestingPanel";

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

// Top navigation items - shown at top of sidebar
const topNavItems: NavItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
  { title: "Sales Report", url: "/admin/sales", icon: BarChart3 },
  { title: "Pacing", url: "/admin/pacing", icon: TrendingUp },
  { title: "Inbox", url: "/admin/inbox", icon: MessageSquareText },
];

// Object-first navigation structure - grouped by domain
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
      { title: "Add-ons", url: "/admin/addons", icon: Utensils },
      { title: "Lead Recovery", url: "/admin/leads", icon: Star },
      { title: "Crew Bids", url: "/admin/crew-bids", icon: Users },
      { title: "Offers", url: "/admin/offers", icon: Gift },
      { title: "Upgrades", url: "/admin/upgrades", icon: ArrowUpCircle },
      { title: "Abandoned Recovery", url: "/admin/abandoned-recovery", icon: Mail },
      { title: "Payment Plans", url: "/admin/payment-plans", icon: Calendar },
      { title: "Box Office", url: "/admin/box-office", icon: ScanLine },
    ]
  },
  {
    label: "Outreach",
    items: [
      { title: "Emails", url: "/admin/emails", icon: Mail },
      { title: "Surveys", url: "/admin/surveys", icon: MessageSquare },
      { title: "Reminders", url: "/admin/reminders", icon: Bell },
      { title: "Event Photos", url: "/admin/event-photos", icon: Camera },
      { title: "Preview Signups", url: "/admin/preview-signups", icon: Sparkles },
    ]
  },
  {
    label: "Lodging",
    items: [
      { title: "Zones", url: "/admin/lodging/zones", icon: Home },
      { title: "Unit Inventory", url: "/admin/lodging/units", icon: BedDouble },
      { title: "Operations", url: "/admin/lodging/operations", icon: ClipboardList },
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
      { title: "Volunteer Interests", url: "/admin/volunteers", icon: Users },
    ]
  },
  {
    label: "Settings",
    items: [
      { title: "Events", url: "/admin/events", icon: Calendar },
      { title: "Settings", url: "/admin/settings", icon: Settings },
      { title: "Team", url: "/admin/team", icon: Users },
      { title: "System Health", url: "/admin/health", icon: Activity },
      { title: "Webhooks", url: "/admin/webhooks", icon: Webhook },
      { title: "Admin Users", url: "/admin/users", icon: Shield },
      { title: "Style Guide", url: "/admin/style-guide", icon: Palette },
    ]
  }
];

function UserAvatarDropdown({ user, onSignOut }: { user: { id: string; email?: string }; onSignOut: () => void }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfile();
  }, [user.id]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url, full_name')
      .eq('id', user.id)
      .single();
    
    if (data) {
      setAvatarUrl(data.avatar_url);
      setFullName(data.full_name);
      setNameInput(data.full_name || '');
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithTimestamp })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(urlWithTimestamp);
      toast.success('Avatar updated');
    } catch (error: any) {
      toast.error('Failed to upload avatar');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleNameSave = async () => {
    if (!nameInput.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: nameInput.trim() })
        .eq('id', user.id);

      if (error) throw error;

      setFullName(nameInput.trim());
      setEditingName(false);
      toast.success('Name updated');
    } catch (error: any) {
      toast.error('Failed to update name');
      console.error(error);
    }
  };

  const getInitials = (name?: string | null, email?: string) => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
      }
      return name.charAt(0).toUpperCase();
    }
    if (!email) return '?';
    return email.charAt(0).toUpperCase();
  };

  return (
    <div className="flex items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Avatar className="h-8 w-8 border border-[hsl(var(--admin-border))]">
              <AvatarImage src={avatarUrl || undefined} alt="Avatar" />
              <AvatarFallback className="bg-[hsl(var(--admin-active))] text-[hsl(var(--admin-active-foreground))] text-sm font-medium">
                {getInitials(fullName, user.email)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-[hsl(var(--admin-foreground))] hidden sm:inline">
              {fullName || user.email}
            </span>
            <ChevronDown className="h-3 w-3 text-[hsl(var(--admin-text-muted))]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 bg-[hsl(var(--admin-overlay-bg))] border-[hsl(var(--admin-overlay-border))] shadow-lg">
          <div className="px-2 py-2">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="flex-1 px-2 py-1 text-sm border border-[hsl(var(--admin-border))] rounded bg-[hsl(var(--admin-surface))]"
                  placeholder="Your name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSave();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                />
                <button
                  onClick={handleNameSave}
                  className="p-1 hover:bg-[hsl(var(--admin-hover))] rounded"
                >
                  <Check className="h-4 w-4 text-[hsl(var(--admin-success))]" />
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNameInput(fullName || '');
                  }}
                  className="p-1 hover:bg-[hsl(var(--admin-hover))] rounded"
                >
                  <X className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-[hsl(var(--admin-text))]">{fullName || 'No name set'}</p>
                <p className="text-xs text-[hsl(var(--admin-text-muted))]">{user.email}</p>
              </div>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setEditingName(true)}
            className="cursor-pointer text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))] focus:bg-[hsl(var(--admin-hover))]"
          >
            <User className="h-4 w-4 mr-2" />
            Edit Name
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="cursor-pointer text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))] focus:bg-[hsl(var(--admin-hover))]"
          >
            <Camera className="h-4 w-4 mr-2" />
            {uploading ? 'Uploading...' : 'Change Avatar'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut} className="cursor-pointer text-[hsl(var(--admin-error))] hover:bg-[hsl(var(--admin-error-muted))] focus:bg-[hsl(var(--admin-error-muted))]">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />
    </div>
  );
}

function EventSelectorDropdown() {
  const { open } = useSidebar();
  const { selectedEvent, events, setSelectedEventId } = useAdminEvent();

  if (!open) {
    return (
      <div className="p-2">
        <div 
          className="h-8 w-8 rounded bg-[hsl(var(--admin-active))] flex items-center justify-center text-xs font-bold text-[hsl(var(--admin-active-foreground))]"
          title={selectedEvent?.title || "Select event"}
        >
          {selectedEvent?.title?.charAt(0) || "?"}
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] rounded-md bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-active))] transition-colors">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--admin-text-subtle))] mb-0.5">
              Working on
            </p>
            <p className="font-medium text-[hsl(var(--admin-text))] truncate text-[13px]">
              {selectedEvent?.title || "Select event"}
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-56 bg-[hsl(var(--admin-overlay-bg))] border-[hsl(var(--admin-overlay-border))] shadow-lg"
      >
        {events?.map((event) => (
          <DropdownMenuItem
            key={event.id}
            onClick={() => setSelectedEventId(event.id)}
            className="flex items-center justify-between gap-2 text-[13px] text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))] focus:bg-[hsl(var(--admin-hover))]"
          >
            <span className={event.id === selectedEvent?.id ? "font-medium" : ""}>
              {event.title}
            </span>
            <AdminBadge
              intent={
                event.status === "published"
                  ? "success"
                  : event.status === "draft"
                  ? "neutral"
                  : "warning"
              }
              size="sm"
            >
              {event.status}
            </AdminBadge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar() {
  const { open } = useSidebar();
  const { collapsedSections, toggleSection } = useCollapsedSections();

  return (
    <Sidebar collapsible="icon" className="admin-theme font-admin border-r border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-sidebar))]">
      {/* Header with branding */}
      <div className="h-14 flex items-center px-3 border-b border-[hsl(var(--admin-border))]">
        {open ? (
          <img src={analogLogo} alt="Analog" className="h-5" />
        ) : (
          <div className="h-8 w-8 rounded-md bg-[hsl(var(--admin-accent))] flex items-center justify-center">
            <span className="text-xs font-bold text-[hsl(var(--admin-surface))]">A</span>
          </div>
        )}
      </div>

      <SidebarContent>
        <AdminScrollArea className="flex-1">
          {/* Top navigation items */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {topNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url} 
                        end={item.end}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))] transition-colors"
                        activeClassName="bg-[hsl(var(--admin-active))] text-[hsl(var(--admin-active-foreground))] font-medium"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {open && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Divider */}
          {open && <div className="mx-3 my-1 border-t border-[hsl(var(--admin-divider))]" />}

          {/* Main navigation sections */}
          {navigationSections.map((section) => (
            <SidebarGroup key={section.label}>
              {open && (
                <button
                  onClick={() => toggleSection(section.label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--admin-text-subtle))] hover:text-[hsl(var(--admin-text-secondary))] transition-colors"
                >
                  <span>{section.label}</span>
                  <ChevronRight 
                    className={`h-3 w-3 transition-transform ${!collapsedSections[section.label] ? 'rotate-90' : ''}`} 
                  />
                </button>
              )}
              {!collapsedSections[section.label] && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <NavLink 
                            to={item.url} 
                            end={item.end}
                            className="flex items-center gap-3 px-3 py-1.5 rounded-md text-[13px] text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))] transition-colors"
                            activeClassName="bg-[hsl(var(--admin-active))] text-[hsl(var(--admin-active-foreground))] font-medium"
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {open && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          ))}
        </AdminScrollArea>
      </SidebarContent>
      <SidebarFooter className="border-t border-[hsl(var(--admin-border))]">
        <EventSelectorDropdown />
      </SidebarFooter>
    </Sidebar>
  );
}

// SECURITY NOTE: This client-side admin check is for UX purposes only.
// All admin operations are protected by server-side RLS policies and 
// edge function authorization checks. The client-side check prevents 
// rendering admin UI but does not provide security boundaries.
export const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
    if (!loading && user && !isAdmin) {
      navigate("/");
    }
  }, [user, isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--admin-accent))]"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <AdminEventProvider>
      <SidebarProvider>
        <div className="admin-theme font-admin flex min-h-screen w-full bg-[hsl(var(--admin-bg))]">
          {/* Desktop sidebar - hidden on mobile */}
          <div className="hidden md:block">
            <AppSidebar />
          </div>
          
          <div className="flex-1 flex flex-col">
            <header className="sticky top-0 z-10 flex h-14 items-center gap-2 sm:gap-4 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] px-3 sm:px-4 lg:px-6">
              {/* Mobile menu trigger */}
              {isMobile ? (
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <AdminButton 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 min-h-[44px] min-w-[44px] text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))]"
                    >
                      <Menu className="h-5 w-5" />
                      <span className="sr-only">Open menu</span>
                    </AdminButton>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[280px] p-0 border-r border-[hsl(var(--admin-border))]">
                    <AdminMobileNav onNavigate={() => setMobileMenuOpen(false)} />
                  </SheetContent>
                </Sheet>
              ) : (
                <SidebarTrigger />
              )}
              
              <div className="flex-1 min-w-0">
                <AdminBreadcrumb />
              </div>
              
              {/* Hide command palette on mobile - too complex */}
              <div className="hidden sm:block">
                <CommandPalette />
              </div>
              
              {/* Test mode indicator when tests are active */}
              <TestModeIndicator />
              
              <AdminNotifications />
              
              {/* Simplified user dropdown on mobile */}
              <UserAvatarDropdown user={user} onSignOut={handleSignOut} />
            </header>
            
            <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto">
              {children}
            </main>
          </div>
          
          {/* Quick Actions FAB - hidden on mobile */}
          <div className="hidden md:block">
            <QuickActionsFAB />
          </div>
          
          {/* Offline Indicator */}
          <OfflineIndicator />
          
          {/* Testing Panel - only shows in development */}
          <TestingPanel />
        </div>
      </SidebarProvider>
    </AdminEventProvider>
  );
};
