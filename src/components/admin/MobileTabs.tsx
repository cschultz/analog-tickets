import { ReactNode } from "react";
import { AdminSelect, AdminSelectItem } from "./AdminSelect";
import { useIsMobile } from "@/hooks/use-mobile";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

interface MobileTabsProps {
  tabs: TabOption[];
  activeTab: string;
  onTabChange: (value: string) => void;
  children?: ReactNode;
  className?: string;
}

/**
 * MobileTabs - Responsive tab navigation
 * 
 * Follows Admin Design Guide patterns:
 * - Mobile: Dropdown selector (saves space, clearly navigational)
 * - Desktop: Horizontal scrollable pills with neutral styling
 * 
 * Use this for section-level navigation within a page (e.g., Vendors, Contracts, Email tabs)
 * For view toggles (Table/Board), use DatabaseView tabs instead.
 */
export function MobileTabs({ tabs, activeTab, onTabChange, className }: MobileTabsProps) {
  const isMobile = useIsMobile();
  
  const currentTab = tabs.find(t => t.value === activeTab);

  if (isMobile) {
    return (
      <AdminSelect 
        value={activeTab} 
        onValueChange={onTabChange}
        className={className}
        mobileTitle="Select Tab"
      >
        {tabs.map((tab) => (
          <AdminSelectItem key={tab.value} value={tab.value}>
            <div className="flex items-center gap-2">
              {tab.icon && <tab.icon className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />}
              <span>{tab.label}</span>
            </div>
          </AdminSelectItem>
        ))}
      </AdminSelect>
    );
  }

  // Desktop: Horizontal scrollable tabs with neutral styling
  return (
    <div 
      className={cn(
        "flex items-center gap-1 overflow-x-auto scrollbar-none",
        className
      )}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === activeTab;
        return (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0",
              isActive
                ? "bg-[hsl(var(--admin-surface))] text-[hsl(var(--admin-text))] shadow-sm border border-[hsl(var(--admin-border))]"
                : "text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))]"
            )}
          >
            {tab.icon && <tab.icon className="h-4 w-4" />}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
