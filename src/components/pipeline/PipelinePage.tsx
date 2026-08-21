import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { 
  PipelineProvider, 
  usePipeline 
} from "./PipelineContext";
import { PipelineTableView } from "./PipelineTableView";
import { PipelineKanbanView } from "./PipelineKanbanView";
import { PipelineRecordDrawer } from "./PipelineRecordDrawer";
import { PipelineEntityForm } from "./PipelineEntityForm";
import { PipelineSettingsPanel } from "./inline/PipelineSettingsPanel";
import { PipelineStatusTabs } from "./PipelineStatusTabs";
import { PipelineStageProgressBar } from "./PipelineStageProgressBar";
import { PipelineBulkEmailer } from "./modules/PipelineBulkEmailer";
import { BulkStageChangeSheet } from "./BulkStageChangeSheet";
import { KanbanCardCustomizer } from "./KanbanCardCustomizer";
import { VolunteerRolesManager } from "./modules/VolunteerRolesManager";
import { VolunteerShiftScheduler } from "./modules/VolunteerShiftScheduler";
import { VolunteerShiftAssignments } from "./modules/VolunteerShiftAssignments";
import { VolunteerScheduleView } from "./modules/VolunteerScheduleView";
import { BulkActionBar, commonBulkActions } from "@/components/admin/BulkActionBar";
import { 
  AdminSheet, 
  AdminSheetContent, 
  AdminSheetHeader, 
  AdminSheetTitle, 
  AdminSheetDescription 
} from "@/components/admin/AdminSheet";
import { AdminButton, AdminInput, AdminBadge } from "@/components/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ViewModeToggle } from "@/components/production/ViewModeToggle";
import { 
  Plus, 
  Search, 
  Download, 
  Trash2,
  Store,
  Music,
  Palette,
  Handshake,
  Users,
  Wine,
  Settings2,
  Mail,
  ArrowRight,
  SlidersHorizontal,
  Calendar,
  UserPlus,
  ClipboardList,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminEvent } from "@/hooks/useAdminEvent";

// Icon mapping
const ICON_MAP: Record<string, React.ElementType> = {
  Store,
  Music,
  Palette,
  Handshake,
  Users,
  Wine,
  Megaphone,
};

function PipelinePageContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isBulkStageOpen, setIsBulkStageOpen] = useState(false);
  const [isCardCustomizerOpen, setIsCardCustomizerOpen] = useState(false);
  const [isRolesOpen, setIsRolesOpen] = useState(false);
  const [isShiftsOpen, setIsShiftsOpen] = useState(false);
  const [isAssignmentsOpen, setIsAssignmentsOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const { selectedEventId } = useAdminEvent();
  
  const {
    config,
    stages,
    records,
    isLoading,
    viewMode,
    setViewMode,
    searchTerm,
    setSearchTerm,
    selectedIds,
    clearSelection,
    bulkDelete,
    isAddDialogOpen,
    setIsAddDialogOpen,
    isEditDialogOpen,
    setIsEditDialogOpen,
    selectedRecord,
    setIsDrawerOpen,
    createRecord,
    updateRecord,
    isCreating,
    isUpdating,
  } = usePipeline();

  // Handle compose query param for deep-linking to email composer
  useEffect(() => {
    if (searchParams.get("compose")) {
      setIsBulkEmailOpen(true);
      // Clear the param after opening
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[hsl(var(--admin-muted-foreground))]">
          {isLoading ? "Loading pipeline..." : "Pipeline not found"}
        </p>
      </div>
    );
  }

  const Icon = ICON_MAP[config.icon] || Users;
  const isVolunteerPipeline = config.slug === "volunteer";

  // Calculate totals for header
  const totalValue = records.reduce((sum, r) => {
    const val = r.deal_value || r.total_value || r.booth_fee;
    return sum + (typeof val === "number" ? val : 0);
  }, 0);

  const handleCreate = (data: Record<string, unknown>) => {
    createRecord(data);
    setIsAddDialogOpen(false);
  };

  const handleUpdate = (data: Record<string, unknown>) => {
    if (selectedRecord) {
      updateRecord({ ...data, id: selectedRecord.id });
      setIsEditDialogOpen(false);
    }
  };

  const handleBulkDelete = () => {
    if (confirm(`Delete ${selectedIds.length} ${config.name_plural.toLowerCase()}?`)) {
      bulkDelete(selectedIds);
      clearSelection();
    }
  };

  const handleBulkEmail = () => {
    setIsBulkEmailOpen(true);
  };

  const handleBulkStageChange = () => {
    setIsBulkStageOpen(true);
  };

  // Build bulk actions array
  const bulkActions = [
    {
      label: "Move",
      icon: <ArrowRight className="h-4 w-4" />,
      onClick: handleBulkStageChange,
    },
    ...(config?.has_email ? [{
      label: "Email",
      icon: <Mail className="h-4 w-4" />,
      onClick: handleBulkEmail,
    }] : []),
    commonBulkActions.delete(handleBulkDelete),
  ];
  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6 bg-[hsl(var(--admin-bg))]">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--admin-accent-subtle))]">
            <Icon className="h-5 w-5 text-[hsl(var(--admin-accent))]" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-[hsl(var(--admin-text))]">
              {config.name}
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--admin-text-secondary))] mt-0.5 hidden sm:block">
              {config.description || `Manage ${config.name_plural.toLowerCase()} for your event`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Volunteer-specific scheduling buttons */}
          {isVolunteerPipeline && (
            <>
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={() => setIsRolesOpen(true)}
                className="hidden sm:flex"
                title="Manage volunteer roles"
              >
                <ClipboardList className="w-4 h-4 mr-1.5" />
                Roles
              </AdminButton>
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={() => setIsShiftsOpen(true)}
                className="hidden sm:flex"
                title="Schedule shifts"
              >
                <Calendar className="w-4 h-4 mr-1.5" />
                Shifts
              </AdminButton>
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={() => setIsAssignmentsOpen(true)}
                className="hidden sm:flex"
                title="Assign volunteers to shifts"
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Assign
              </AdminButton>
              <AdminButton
                variant="adminOutline"
                size="sm"
                onClick={() => setIsScheduleOpen(true)}
                className="hidden sm:flex"
                title="View full schedule"
              >
                <Calendar className="w-4 h-4 mr-1.5" />
                Schedule
              </AdminButton>
            </>
          )}
          <AdminButton 
            variant="adminGhost" 
            size="icon"
            onClick={() => setIsSettingsOpen(true)}
            className="text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
            title="Pipeline settings"
          >
            <Settings2 className="w-4 h-4" />
          </AdminButton>
          <AdminButton variant="adminOutline" size="sm" className="hidden sm:flex">
            <Download className="w-4 h-4 mr-1.5" />
            Export
          </AdminButton>
          <AdminButton variant="admin" size="sm" onClick={() => { setIsDrawerOpen(false); setIsAddDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add {config.name_singular}
          </AdminButton>
        </div>
      </div>

      {/* Progress Bar */}
      <PipelineStageProgressBar className="hidden sm:block" compact />

      {/* Stats Bar with Status Filter Tabs */}
      <div className="flex flex-col gap-3 md:gap-4">
        {/* Status Filter Tabs - horizontal scroll on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <PipelineStatusTabs />
        </div>
        
        {/* Stats Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[hsl(var(--admin-muted-foreground))]">
              {records.length} {records.length === 1 ? config.name_singular.toLowerCase() : config.name_plural.toLowerCase()}
            </span>
            {totalValue > 0 && (
              <>
                <span className="text-[hsl(var(--admin-muted-foreground))]">·</span>
                <span className="font-medium text-[hsl(var(--admin-success))]">
                  ${totalValue.toLocaleString()} total value
                </span>
              </>
            )}
          </div>
          
          {/* Search + View Toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:flex-none sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
              <AdminInput
                placeholder={`Search ${config.name_plural.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 w-full"
              />
            </div>
            
            {/* Card customizer (Kanban mode only) */}
            {config.has_kanban && viewMode === "kanban" && (
              <AdminButton
                variant="adminGhost"
                size="icon"
                onClick={() => setIsCardCustomizerOpen(true)}
                title="Customize card fields"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </AdminButton>
            )}
            
            {config.has_kanban && (
              <ViewModeToggle 
                viewMode={viewMode} 
                onViewModeChange={setViewMode} 
              />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {records.length === 0 && !isLoading && !searchTerm ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-[hsl(var(--admin-border))] rounded-xl bg-[hsl(var(--admin-surface))]">
          <div className="p-3 rounded-full bg-[hsl(var(--admin-accent-subtle))] mb-4">
            <Icon className="h-8 w-8 text-[hsl(var(--admin-accent))]" />
          </div>
          <h3 className="text-lg font-semibold text-[hsl(var(--admin-text))] mb-1">
            No {config.name_plural.toLowerCase()} yet
          </h3>
          <p className="text-sm text-[hsl(var(--admin-text-secondary))] mb-6 text-center max-w-sm">
            Add your first {config.name_singular.toLowerCase()} to start building your pipeline.
          </p>
          <AdminButton variant="admin" size="default" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add {config.name_singular}
          </AdminButton>
        </div>
      ) : viewMode === "table" ? (
        <PipelineTableView />
      ) : (
        <PipelineKanbanView />
      )}

      {/* Record Drawer */}
      <PipelineRecordDrawer />

      {/* Add Drawer */}
      <AdminSheet open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <AdminSheetContent side="right" className="sm:max-w-lg overflow-y-auto z-[60]">
          <AdminSheetHeader>
            <AdminSheetTitle>Add {config.name_singular}</AdminSheetTitle>
            <AdminSheetDescription>
              Add a new {config.name_singular.toLowerCase()} to your pipeline
            </AdminSheetDescription>
          </AdminSheetHeader>
          <div className="py-6">
            <PipelineEntityForm
              mode="create"
              onSubmit={handleCreate}
              onCancel={() => setIsAddDialogOpen(false)}
              isLoading={isCreating}
            />
          </div>
        </AdminSheetContent>
      </AdminSheet>

      {/* Edit Drawer */}
      <AdminSheet open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <AdminSheetContent side="right" className="sm:max-w-lg overflow-y-auto z-[60]">
          <AdminSheetHeader>
            <AdminSheetTitle>Edit {config.name_singular}</AdminSheetTitle>
            <AdminSheetDescription>
              Update {config.name_singular.toLowerCase()} details
            </AdminSheetDescription>
          </AdminSheetHeader>
          <div className="py-6">
            {selectedRecord && (
              <PipelineEntityForm
                mode="edit"
                initialData={selectedRecord}
                onSubmit={handleUpdate}
                onCancel={() => setIsEditDialogOpen(false)}
                isLoading={isUpdating}
              />
            )}
          </div>
        </AdminSheetContent>
      </AdminSheet>

      {/* Settings Panel */}
      {config && (
        <PipelineSettingsPanel
          config={config}
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
        />
      )}

      {/* Bulk Email Sheet */}
      <PipelineBulkEmailer
        isOpen={isBulkEmailOpen}
        onClose={() => setIsBulkEmailOpen(false)}
      />

      {/* Bulk Stage Change Sheet */}
      <BulkStageChangeSheet
        open={isBulkStageOpen}
        onOpenChange={setIsBulkStageOpen}
        selectedIds={selectedIds}
        onComplete={() => {}}
      />

      {/* Card Customizer Sheet */}
      <KanbanCardCustomizer
        open={isCardCustomizerOpen}
        onOpenChange={setIsCardCustomizerOpen}
      />

      {/* Volunteer Scheduling Panels */}
      {isVolunteerPipeline && (
        <>
          <VolunteerRolesManager
            open={isRolesOpen}
            onOpenChange={setIsRolesOpen}
            eventId={selectedEventId}
          />
          <VolunteerShiftScheduler
            open={isShiftsOpen}
            onOpenChange={setIsShiftsOpen}
            eventId={selectedEventId}
          />
          <VolunteerShiftAssignments
            open={isAssignmentsOpen}
            onOpenChange={setIsAssignmentsOpen}
            eventId={selectedEventId}
          />
          <VolunteerScheduleView
            open={isScheduleOpen}
            onOpenChange={setIsScheduleOpen}
            eventId={selectedEventId}
          />
        </>
      )}

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        actions={bulkActions}
        onClearSelection={clearSelection}
      />
    </div>
  );
}

interface PipelinePageProps {
  slug?: string; // Can be passed as prop or from route params
}

export function PipelinePage({ slug: propSlug }: PipelinePageProps) {
  const params = useParams<{ pipelineSlug: string }>();
  const slug = propSlug || params.pipelineSlug || "";

  if (!slug) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[hsl(var(--admin-muted-foreground))]">
          No pipeline specified
        </p>
      </div>
    );
  }

  return (
    <PipelineProvider slug={slug}>
      <PipelinePageContent />
    </PipelineProvider>
  );
}
