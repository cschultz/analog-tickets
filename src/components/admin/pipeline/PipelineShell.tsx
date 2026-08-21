import { useState, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Download, 
  Upload,
  Plus,
  X,
  FileText,
  Mail,
  Files,
  Users
} from "lucide-react";
import { AdminButton, AdminInput, AdminPageHeader } from "@/components/admin";
import { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent } from "@/components/admin/AdminUI";
import { SavedViewsDropdown } from "./SavedViewsDropdown";
import { SavedView, ViewMode, EntityType } from "@/hooks/useSavedViews";
import { useIsMobile } from "@/hooks/use-mobile";
import { LucideIcon } from "lucide-react";
import { RealtimeStatusIndicator } from "@/components/admin/RealtimeStatusIndicator";
import { BulkActionBar } from "@/components/admin/BulkActionBar";

// Section configuration
export interface PipelineSection {
  id: string;
  label: string;
  icon: LucideIcon;
}

const DEFAULT_SECTIONS: PipelineSection[] = [
  { id: "records", label: "Records", icon: Users },
  { id: "contracts", label: "Contracts", icon: FileText },
  { id: "documents", label: "Documents", icon: Files },
  { id: "email", label: "Email", icon: Mail },
];

interface PipelineShellProps {
  // Header
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  entityType: EntityType;
  
  // Saved Views
  views: SavedView[];
  activeViewId: string | null;
  onViewChange: (view: SavedView) => void;
  onCreateView: (name: string, viewMode: ViewMode) => Promise<void>;
  onUpdateView: (id: string, updates: Partial<SavedView>) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  viewsLoading?: boolean;
  
  // Search
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  
  // Actions
  onNewRecord?: () => void;
  newRecordLabel?: string;
  onImport?: () => void;
  onExport?: () => void;
  
  // Bulk actions
  selectedCount?: number;
  bulkActions?: Array<{
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    variant?: "default" | "destructive";
  }>;
  onClearSelection?: () => void;
  
  // Sections
  sections?: PipelineSection[];
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
  
  // Content
  children: ReactNode;
  
  // Section content (for tabs other than records)
  contractsContent?: ReactNode;
  documentsContent?: ReactNode;
  emailContent?: ReactNode;
  // Realtime indicator
  showRealtimeStatus?: boolean;
  
  className?: string;
}

export function PipelineShell({
  title,
  subtitle,
  icon: HeaderIcon,
  entityType,
  views,
  activeViewId,
  onViewChange,
  onCreateView,
  onUpdateView,
  onDeleteView,
  viewsLoading,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  onNewRecord,
  newRecordLabel = "Add Record",
  onImport,
  onExport,
  selectedCount = 0,
  bulkActions = [],
  onClearSelection,
  sections = DEFAULT_SECTIONS,
  activeSection = "records",
  onSectionChange,
  children,
  contractsContent,
  documentsContent,
  emailContent,
  showRealtimeStatus = true,
  className,
}: PipelineShellProps) {
  const [showFilters, setShowFilters] = useState(false);
  const isMobile = useIsMobile();

  const handleSectionChange = (sectionId: string) => {
    onSectionChange?.(sectionId);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <AdminPageHeader
          icon={HeaderIcon}
          title={title}
          subtitle={subtitle}
        />
        {showRealtimeStatus && (
          <RealtimeStatusIndicator variant="badge" />
        )}
      </div>

      {/* Section Tabs */}
      <AdminTabs value={activeSection} onValueChange={handleSectionChange}>
        <AdminTabsList className="bg-transparent border-b border-[hsl(var(--admin-border))] rounded-none p-0 gap-0 w-full justify-start">
          {sections.map((section) => (
            <AdminTabsTrigger
              key={section.id}
              value={section.id}
              className="relative h-10 px-4 py-2 rounded-none bg-transparent text-sm font-medium text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))] data-[state=active]:text-[hsl(var(--admin-text))] data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[hsl(var(--admin-primary))] transition-colors"
            >
              <section.icon className="h-4 w-4 mr-2" />
              {section.label}
            </AdminTabsTrigger>
          ))}
        </AdminTabsList>

        {/* Records Tab Content */}
        <AdminTabsContent value="records" className="mt-4 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3">
            {/* Row 1: Views + Actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {/* Saved Views Dropdown */}
                <SavedViewsDropdown
                  views={views}
                  activeViewId={activeViewId}
                  onViewChange={onViewChange}
                  onCreateView={onCreateView}
                  onUpdateView={onUpdateView}
                  onDeleteView={onDeleteView}
                  isLoading={viewsLoading}
                />

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

              <div className="flex items-center gap-2">
                {/* Import */}
                {onImport && (
                  <AdminButton variant="adminOutline" size="sm" onClick={onImport}>
                    <Upload className="h-4 w-4" />
                    {!isMobile && <span>Import</span>}
                  </AdminButton>
                )}

                {/* Export */}
                {onExport && (
                  <AdminButton variant="adminOutline" size="sm" onClick={onExport}>
                    <Download className="h-4 w-4" />
                    {!isMobile && <span>Export</span>}
                  </AdminButton>
                )}

                {/* New Record */}
                {onNewRecord && (
                  <AdminButton variant="admin" size="sm" onClick={onNewRecord}>
                    <Plus className="h-4 w-4" />
                    {newRecordLabel}
                  </AdminButton>
                )}
              </div>
            </div>

            {/* Row 2: Search */}
            {onSearchChange && (
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--admin-text-tertiary))]" />
                <AdminInput
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-9 h-9 bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]"
                />
              </div>
            )}
          </div>

          {/* Bulk action bar */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[hsl(var(--admin-selected))] border border-[hsl(var(--admin-accent))] rounded-lg">
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
                <button
                  onClick={onClearSelection}
                  className="ml-auto p-1 hover:bg-[hsl(var(--admin-hover))] rounded"
                >
                  <X className="h-4 w-4 text-[hsl(var(--admin-accent))]" />
                </button>
              )}
            </div>
          )}

          {/* Filter bar (when visible) */}
          {showFilters && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[hsl(var(--admin-hover))] rounded-lg">
              <span className="text-sm text-[hsl(var(--admin-text-secondary))]">
                Filter by:
              </span>
              <AdminButton variant="adminOutline" size="sm" className="h-7">
                + Add filter
              </AdminButton>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 min-h-0">
            {children}
          </div>
        </AdminTabsContent>

        {/* Contracts Tab */}
        <AdminTabsContent value="contracts" className="mt-4">
          {contractsContent || (
            <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
              Contracts content goes here
            </div>
          )}
        </AdminTabsContent>

        {/* Documents Tab */}
        <AdminTabsContent value="documents" className="mt-4">
          {documentsContent || (
            <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
              Documents content goes here
            </div>
          )}
        </AdminTabsContent>

        {/* Email Tab */}
        <AdminTabsContent value="email" className="mt-4">
          {emailContent || (
            <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
              Email content goes here
            </div>
          )}
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
