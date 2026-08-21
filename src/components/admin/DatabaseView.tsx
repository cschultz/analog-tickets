import { useState, ReactNode, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { 
  Table as TableIcon, 
  LayoutGrid, 
  Calendar,
  Filter,
  ArrowUpDown,
  Search,
  Columns,
  Download,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import { AdminButton, AdminInput, AdminCheckbox } from "@/components/admin";
import { AdminDropdown } from "@/components/admin/AdminOverlay";
import { useIsMobile } from "@/hooks/use-mobile";

export type ViewType = "table" | "board" | "calendar";

export interface DatabaseViewTab {
  id: string;
  label: string;
  type: ViewType;
  filters?: any[];
  isDefault?: boolean;
}

interface DatabaseViewProps {
  tabs: DatabaseViewTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onNewRecord?: () => void;
  newRecordLabel?: string;
  children: ReactNode;
  // Bulk actions
  selectedCount?: number;
  bulkActions?: Array<{
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    variant?: "default" | "destructive";
  }>;
  onClearSelection?: () => void;
  // Column picker
  columns?: Array<{ id: string; label: string; visible: boolean }>;
  onColumnToggle?: (columnId: string) => void;
  // Export
  onExport?: () => void;
  className?: string;
}

function ViewTypeIcon({ type }: { type: ViewType }) {
  switch (type) {
    case "table":
      return <TableIcon className="h-3.5 w-3.5" />;
    case "board":
      return <LayoutGrid className="h-3.5 w-3.5" />;
    case "calendar":
      return <Calendar className="h-3.5 w-3.5" />;
  }
}

export function DatabaseView({
  tabs,
  activeTab,
  onTabChange,
  searchPlaceholder = "Search...",
  searchValue = "",
  onSearchChange,
  onNewRecord,
  newRecordLabel = "New",
  children,
  selectedCount = 0,
  bulkActions = [],
  onClearSelection,
  columns,
  onColumnToggle,
  onExport,
  className,
}: DatabaseViewProps) {
  const [showFilters, setShowFilters] = useState(false);
  const isMobile = useIsMobile();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const activeTabLabel = tabs.find(t => t.id === activeTab)?.label || tabs[0]?.label;

  // Check scroll position for arrow visibility
  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    checkScrollPosition();
    window.addEventListener('resize', checkScrollPosition);
    return () => window.removeEventListener('resize', checkScrollPosition);
  }, [tabs]);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 150;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Header with tabs and actions */}
      <div className="flex flex-col gap-3 mb-4">
        {/* Tab navigation row */}
        <div className="flex items-center justify-between gap-2">
          {/* Mobile: Dropdown selector */}
          {isMobile ? (
            <AdminDropdown
              align="start"
              trigger={
                <AdminButton 
                  variant="adminOutline" 
                  size="sm" 
                  className="gap-2 min-w-[140px] justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <ViewTypeIcon type={tabs.find(t => t.id === activeTab)?.type || "table"} />
                    {activeTabLabel}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--admin-text-muted))]" />
                </AdminButton>
              }
            >
              <div className="w-48">
                <div className="px-3 py-2 border-b border-[hsl(var(--admin-border))]">
                  <span className="text-xs font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wider">Views</span>
                </div>
                <div className="p-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors text-left",
                        activeTab === tab.id
                          ? "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text))] font-medium"
                          : "text-[hsl(var(--admin-text-secondary))] hover:bg-[hsl(var(--admin-hover))] hover:text-[hsl(var(--admin-text))]"
                      )}
                    >
                      <ViewTypeIcon type={tab.type} />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </AdminDropdown>
          ) : (
            /* Desktop: Scrollable tab bar */
            <div className="relative flex items-center flex-1 min-w-0">
              {/* Left scroll button */}
              {canScrollLeft && (
                <button
                  onClick={() => scrollTabs('left')}
                  className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-[hsl(var(--admin-background))] to-transparent"
                >
                  <ChevronLeft className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                </button>
              )}
              
              {/* Scrollable tabs container */}
              <div 
                ref={scrollContainerRef}
                onScroll={checkScrollPosition}
                className="flex items-center gap-1 overflow-x-auto scrollbar-none scroll-smooth"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
                      activeTab === tab.id
                        ? "bg-[hsl(var(--admin-surface))] text-[hsl(var(--admin-text))] shadow-sm border border-[hsl(var(--admin-border))]"
                        : "text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))]"
                    )}
                  >
                    <ViewTypeIcon type={tab.type} />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Right scroll button */}
              {canScrollRight && (
                <button
                  onClick={() => scrollTabs('right')}
                  className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-[hsl(var(--admin-background))] to-transparent"
                >
                  <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                </button>
              )}
            </div>
          )}

          {/* Actions - always visible */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Filter */}
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(showFilters && "bg-[hsl(var(--admin-accent-muted))]")}
            >
              <Filter className="h-4 w-4" />
              {!isMobile && <span>Filter</span>}
            </AdminButton>

            {/* Sort */}
            <AdminButton variant="adminOutline" size="sm">
              <ArrowUpDown className="h-4 w-4" />
              {!isMobile && <span>Sort</span>}
            </AdminButton>
          </div>
        </div>

        {/* Search and additional actions row */}
        {(onSearchChange || onNewRecord || columns || onExport) && (
          <div className="flex items-center gap-2">
            {/* Search */}
            {onSearchChange && (
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-tertiary))]" />
                <AdminInput
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-9 h-9 bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]"
                />
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {/* Column picker */}
              {columns && onColumnToggle && (
                <AdminDropdown
                  align="end"
                  trigger={
                    <AdminButton variant="adminOutline" size="sm">
                      <Columns className="h-4 w-4" />
                    </AdminButton>
                  }
                >
                  <div className="p-2 space-y-1">
                    {columns.map((col) => (
                      <label
                        key={col.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[hsl(var(--admin-hover))] cursor-pointer text-sm text-[hsl(var(--admin-text))]"
                      >
                        <AdminCheckbox
                          checked={col.visible}
                          onCheckedChange={() => onColumnToggle(col.id)}
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </AdminDropdown>
              )}

              {/* Export */}
              {onExport && (
                <AdminButton variant="adminOutline" size="sm" onClick={onExport}>
                  <Download className="h-4 w-4" />
                </AdminButton>
              )}

              {/* New record */}
              {onNewRecord && (
                <AdminButton variant="admin" size="sm" onClick={onNewRecord}>
                  <Plus className="h-4 w-4" />
                  {newRecordLabel}
                </AdminButton>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-4 bg-[hsl(var(--admin-selected))] border border-[hsl(var(--admin-accent))] rounded-lg">
          <span className="text-sm font-medium text-[hsl(var(--admin-accent))]">
            {selectedCount} selected
          </span>
          <div className="flex items-center gap-2">
            {bulkActions.map((action, i) => (
              <AdminButton
                key={i}
                variant={action.variant === "destructive" ? "adminDestructive" : "adminOutline"}
                size="sm"
                onClick={action.onClick}
                className="h-7"
              >
                {action.icon}
                {action.label}
              </AdminButton>
            ))}
          </div>
          {onClearSelection && (
            <AdminButton
              variant="ghost"
              size="icon"
              onClick={onClearSelection}
              className="ml-auto h-6 w-6"
            >
              <X className="h-4 w-4 text-[hsl(var(--admin-accent))]" />
            </AdminButton>
          )}
        </div>
      )}

      {/* Filter bar (when visible) */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 mb-4 bg-[hsl(var(--admin-hover))] rounded-lg">
          <span className="text-sm text-[hsl(var(--admin-text-secondary))]">
            Filter by:
          </span>
          <AdminButton variant="adminOutline" size="sm" className="h-7">
            + Add filter
          </AdminButton>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

// Skeleton loader for table
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 bg-[hsl(var(--admin-hover))] border-b border-[hsl(var(--admin-border))]">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="admin-skeleton h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-4 border-b border-[hsl(var(--admin-divider))] last:border-0">
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="admin-skeleton h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
