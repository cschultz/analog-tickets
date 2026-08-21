import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  LayoutDashboard,
  Users,
  Music,
  Package,
  Handshake,
  Wine,
  Palette,
  Ticket,
  Mail,
  Settings,
  Search,
  Plus,
  TrendingUp,
  Calendar,
  MessageSquare,
  BarChart3,
  UserCircle,
  Clock,
  Headphones,
  History,
  User,
  Tag,
} from "lucide-react";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useRecentItems } from "@/hooks/useRecentItems";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { cn } from "@/lib/utils";

// ============ Admin-themed Command Components ============

const AdminCommand = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-xl bg-[hsl(var(--admin-surface))] text-[hsl(var(--admin-text))]",
      className,
    )}
    {...props}
  />
));
AdminCommand.displayName = "AdminCommand";

const AdminCommandDialog = ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))] max-w-2xl">
        <VisuallyHidden>
          <DialogTitle>Command Palette</DialogTitle>
        </VisuallyHidden>
        <AdminCommand shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[hsl(var(--admin-text-muted))] [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </AdminCommand>
      </DialogContent>
    </Dialog>
  );
};

const AdminCommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-[hsl(var(--admin-border))] px-4" cmdk-input-wrapper="">
    <Search className="mr-3 h-5 w-5 shrink-0 text-[hsl(var(--admin-text-muted))]" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-14 w-full rounded-md bg-transparent py-3 text-base text-[hsl(var(--admin-text))] outline-none placeholder:text-[hsl(var(--admin-text-muted))] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  </div>
));
AdminCommandInput.displayName = "AdminCommandInput";

const AdminCommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[450px] overflow-y-auto overflow-x-hidden p-2", className)}
    {...props}
  />
));
AdminCommandList.displayName = "AdminCommandList";

const AdminCommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-8 text-center text-sm text-[hsl(var(--admin-text-muted))]"
    {...props}
  />
));
AdminCommandEmpty.displayName = "AdminCommandEmpty";

const AdminCommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden p-1 text-[hsl(var(--admin-text))] [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[hsl(var(--admin-text-muted))]",
      className,
    )}
    {...props}
  />
));
AdminCommandGroup.displayName = "AdminCommandGroup";

const AdminCommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-2 h-px bg-[hsl(var(--admin-border))]", className)}
    {...props}
  />
));
AdminCommandSeparator.displayName = "AdminCommandSeparator";

const AdminCommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected='true']:bg-[hsl(var(--admin-hover))] data-[selected=true]:text-[hsl(var(--admin-text))] data-[disabled=true]:opacity-50",
      className,
    )}
    {...props}
  />
));
AdminCommandItem.displayName = "AdminCommandItem";

const AdminCommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-[10px] tracking-widest text-[hsl(var(--admin-text-muted))] font-mono", className)}
      {...props}
    />
  );
};
AdminCommandShortcut.displayName = "AdminCommandShortcut";

// ============ Command Palette Component ============

interface CommandPaletteProps {
  onCreateRecord?: (type: string) => void;
}

// Keyboard shortcuts map
const SHORTCUTS: Record<string, string> = {
  "g h": "/admin",
  "g r": "/admin/registrations",
  "g c": "/admin/customers",
  "g a": "/admin/artists",
  "g v": "/admin/vendors",
  "g p": "/admin/partners",
  "g s": "/admin/sales",
  "g e": "/admin/emails",
  "g t": "/admin/settings",
};

// Icons for search result types
const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  registration: User,
  artist: Music,
  vendor: Package,
  partner: Handshake,
  artisan: Palette,
  customer: UserCircle,
};

const typeColors: Record<string, string> = {
  registration: "text-[hsl(var(--admin-info))] bg-[hsl(var(--admin-info)/0.1)]",
  artist: "text-[hsl(262,83%,58%)] bg-[hsl(262,83%,58%,0.1)]",
  vendor: "text-[hsl(173,58%,39%)] bg-[hsl(173,58%,39%,0.1)]",
  partner: "text-[hsl(var(--admin-warning))] bg-[hsl(var(--admin-warning)/0.1)]",
  artisan: "text-[hsl(340,75%,55%)] bg-[hsl(340,75%,55%,0.1)]",
  customer: "text-[hsl(var(--admin-success))] bg-[hsl(var(--admin-success)/0.1)]",
};

export function CommandPalette({ onCreateRecord }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedEvent } = useAdminEvent();
  
  // Global search hook
  const {
    query,
    setQuery,
    results,
    isSearching,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
  } = useGlobalSearch({ eventId: selectedEvent?.id });

  // Recent items hook
  const { items: recentItems } = useRecentItems();

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open, setQuery]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Ignore if typing in an input (except our command input)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        // Allow ⌘K even in inputs
        if (!(e.key === "k" && (e.metaKey || e.ctrlKey))) {
          return;
        }
      }

      // ⌘K / Ctrl+K to open command palette
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
        return;
      }

      // Handle "g" prefix shortcuts (vim-style navigation)
      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPendingKey("g");
        setTimeout(() => setPendingKey(null), 1000);
        return;
      }

      // Handle second key after "g"
      if (pendingKey === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const combo = `g ${e.key}`;
        const path = SHORTCUTS[combo];
        if (path && path !== location.pathname) {
          e.preventDefault();
          navigate(path);
        }
        setPendingKey(null);
        return;
      }

      // ? to show keyboard shortcuts help
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [pendingKey, navigate, location.pathname]);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const handleSearchResultClick = useCallback((result: typeof results[0]) => {
    addRecentSearch(query);
    runCommand(() => navigate(result.url));
  }, [query, addRecentSearch, runCommand, navigate]);

  const navigationItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/admin", shortcut: "G H" },
    { label: "Sales Report", icon: BarChart3, path: "/admin/sales", shortcut: "G S" },
    { label: "Sales Pacing", icon: TrendingUp, path: "/admin/pacing" },
    { label: "Registrations", icon: Users, path: "/admin/registrations", shortcut: "G R" },
    { label: "Customers", icon: UserCircle, path: "/admin/customers", shortcut: "G C" },
    { label: "Artists", icon: Music, path: "/admin/artists", shortcut: "G A" },
    { label: "WineCamp", icon: Wine, path: "/admin/winecamp" },
    { label: "Vendors", icon: Package, path: "/admin/vendors", shortcut: "G V" },
    { label: "Partners", icon: Handshake, path: "/admin/partners", shortcut: "G P" },
    { label: "Artisans", icon: Palette, path: "/admin/artisans" },
    { label: "Events", icon: Calendar, path: "/admin/events" },
    { label: "Tickets", icon: Ticket, path: "/admin/tickets" },
    { label: "Emails", icon: Mail, path: "/admin/emails", shortcut: "G E" },
    { label: "Surveys", icon: MessageSquare, path: "/admin/surveys" },
    { label: "Waitlist", icon: Clock, path: "/admin/waitlist" },
    { label: "Promo Codes", icon: Tag, path: "/admin/promo-codes" },
    { label: "Promo Code Status", icon: Tag, path: "/admin/promo-codes/status" },
    { label: "Promo Code Insights", icon: Tag, path: "/admin/promo-codes/insights" },
    { label: "Support", icon: Headphones, path: "/admin/support" },
    { label: "Settings", icon: Settings, path: "/admin/settings", shortcut: "G T" },
  ];

  const quickActions = [
    { label: "New Registration", type: "registration", icon: Plus },
    { label: "New Artist", type: "artist", icon: Plus },
    { label: "New Vendor", type: "vendor", icon: Plus },
    { label: "New Partner", type: "partner", icon: Plus },
    { label: "Send Email", type: "email", icon: Mail },
  ];

  const showSearchResults = isSearching && results.length > 0;
  const showRecentSearches = !query && recentSearches.length > 0;
  const showRecentItems = !query && recentItems.length > 0;

  return (
    <>
      {/* Pending shortcut indicator */}
      {pendingKey && (
        <div className="fixed bottom-4 right-4 px-3 py-1.5 bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] text-[hsl(var(--admin-text))] rounded-lg text-sm font-mono z-50 animate-in fade-in slide-in-from-bottom-2">
          {pendingKey}...
        </div>
      )}

      {/* Trigger button for header */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-[hsl(var(--admin-text-tertiary))] bg-[hsl(var(--admin-hover))] hover:bg-[hsl(var(--admin-border))] rounded-lg transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] rounded">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <AdminCommandDialog open={open} onOpenChange={setOpen}>
        <AdminCommandInput 
          placeholder="Search records, pages, or type a command..." 
          value={query}
          onValueChange={setQuery}
        />
        <AdminCommandList>
          <AdminCommandEmpty>
            {isSearching ? "No matching records found." : "No results found."}
          </AdminCommandEmpty>

          {/* Search Results */}
          {showSearchResults && (
            <>
              <AdminCommandGroup heading={`Search Results (${results.length})`}>
                {results.map((result) => {
                  const Icon = typeIcons[result.type] || User;
                  const colorClass = typeColors[result.type] || "text-[hsl(var(--admin-text-muted))] bg-[hsl(var(--admin-hover))]";
                  
                  return (
                    <AdminCommandItem
                      key={result.id}
                      value={`${result.type}-${result.id}`}
                      onSelect={() => handleSearchResultClick(result)}
                      className="flex items-center gap-3"
                    >
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", colorClass)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.title}</p>
                        {result.subtitle && (
                          <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--admin-text-subtle))] bg-[hsl(var(--admin-hover))] px-1.5 py-0.5 rounded">
                        {result.type}
                      </span>
                    </AdminCommandItem>
                  );
                })}
              </AdminCommandGroup>
              <AdminCommandSeparator />
            </>
          )}

          {/* Recent Searches */}
          {showRecentSearches && (
            <>
              <AdminCommandGroup heading={
                <div className="flex items-center justify-between">
                  <span>Recent Searches</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearRecentSearches();
                    }}
                    className="text-[10px] text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))]"
                  >
                    Clear
                  </button>
                </div>
              }>
                {recentSearches.slice(0, 5).map((search) => (
                  <AdminCommandItem
                    key={search.timestamp}
                    onSelect={() => setQuery(search.query)}
                    className="flex items-center gap-3"
                  >
                    <History className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                    <span className="text-sm">{search.query}</span>
                  </AdminCommandItem>
                ))}
              </AdminCommandGroup>
              <AdminCommandSeparator />
            </>
          )}

          {/* Recent Items */}
          {showRecentItems && (
            <>
              <AdminCommandGroup heading="Recently Viewed">
                {recentItems.slice(0, 5).map((item) => {
                  const Icon = typeIcons[item.type] || User;
                  const colorClass = typeColors[item.type] || "text-[hsl(var(--admin-text-muted))] bg-[hsl(var(--admin-hover))]";
                  
                  return (
                    <AdminCommandItem
                      key={`${item.type}-${item.id}`}
                      onSelect={() => runCommand(() => navigate(item.url))}
                      className="flex items-center gap-3"
                    >
                      <div className={cn("flex h-6 w-6 items-center justify-center rounded", colorClass)}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <span className="text-sm flex-1 truncate">{item.name}</span>
                      <span className="text-[10px] text-[hsl(var(--admin-text-muted))]">
                        {item.type}
                      </span>
                    </AdminCommandItem>
                  );
                })}
              </AdminCommandGroup>
              <AdminCommandSeparator />
            </>
          )}
          
          {/* Quick Actions - show when not searching */}
          {!isSearching && (
            <AdminCommandGroup heading="Quick Actions">
              {quickActions.map((action) => (
                <AdminCommandItem
                  key={action.type}
                  onSelect={() => runCommand(() => onCreateRecord?.(action.type))}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--admin-accent)/0.1)]">
                    <action.icon className="h-4 w-4 text-[hsl(var(--admin-accent))]" />
                  </div>
                  <span className="font-medium">{action.label}</span>
                </AdminCommandItem>
              ))}
            </AdminCommandGroup>
          )}

          <AdminCommandSeparator />

          {/* Navigation - hide when searching records */}
          {!isSearching && (
            <AdminCommandGroup heading="Navigation">
              {navigationItems.map((item) => (
                <AdminCommandItem
                  key={item.path}
                  value={item.label}
                  onSelect={() => runCommand(() => navigate(item.path))}
                  className="flex items-center gap-3"
                >
                  <item.icon className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && (
                    <AdminCommandShortcut>
                      {item.shortcut}
                    </AdminCommandShortcut>
                  )}
                </AdminCommandItem>
              ))}
            </AdminCommandGroup>
          )}

          <AdminCommandSeparator />

          <AdminCommandGroup heading="Keyboard Shortcuts">
            <div className="px-3 py-2 text-xs text-[hsl(var(--admin-text-muted))] space-y-1.5">
              <div className="flex justify-between">
                <span>Open command palette</span>
                <kbd className="font-mono text-[hsl(var(--admin-text-subtle))]">⌘K</kbd>
              </div>
              <div className="flex justify-between">
                <span>Go to [page] (vim-style)</span>
                <kbd className="font-mono text-[hsl(var(--admin-text-subtle))]">g [key]</kbd>
              </div>
              <div className="flex justify-between">
                <span>Show shortcuts</span>
                <kbd className="font-mono text-[hsl(var(--admin-text-subtle))]">?</kbd>
              </div>
            </div>
          </AdminCommandGroup>
        </AdminCommandList>
      </AdminCommandDialog>
    </>
  );
}
