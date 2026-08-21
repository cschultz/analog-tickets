import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  useVolunteerAssignments,
  useVolunteerShifts,
  useVolunteerRoles,
} from "@/hooks/useVolunteerScheduling";
import { usePipeline } from "./PipelineContext";
import { PipelineStageSelect } from "./PipelineStageSelect";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { InlineFieldValue } from "./inline/InlineFieldValue";
import { 
  AdminSheet, 
  AdminSheetContent, 
  AdminSheetHeader, 
  AdminSheetTitle, 
  AdminSheetDescription 
} from "@/components/admin/AdminSheet";
import { AdminButton, AdminBadge } from "@/components/admin";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { AdminAvatar, TypeLabel, ActivityTimestamp, StatValue } from "@/components/admin/AdminPrimitives";
import { OwnerPicker } from "@/components/admin/OwnerPicker";
import { useEntityOwnership, EntityType } from "@/hooks/useEntityOwnership";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { usePipelineDrawerCounts } from "@/hooks/usePipelineDrawerCounts";
import { 
  LayoutList, 
  FileText, 
  Files, 
  Mail, 
  Phone, 
  Globe, 
  Instagram, 
  ExternalLink,
  Trash2,
  Users,
  Plus,
  ArrowRightLeft,
  FolderOpen,
  ListChecks,
  MoreHorizontal,
  Megaphone,
  DollarSign,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Drawer components
import { DrawerQuickActions } from "./drawer/DrawerQuickActions";
import { DrawerEditableNotes } from "./drawer/DrawerEditableNotes";
import { DrawerUnifiedChecklist } from "./drawer/DrawerUnifiedChecklist";
import { DrawerUnifiedTimeline } from "./drawer/DrawerUnifiedTimeline";
import { DrawerFieldSections } from "./drawer/DrawerFieldSections";
import { MoveToPipelineDialog } from "./drawer/MoveToPipelineDialog";

// Module imports
import { PipelineContactsModule } from "./modules/PipelineContactsModule";
import { PipelineContractsModule } from "./modules/PipelineContractsModule";
import { PipelineDocumentsModule } from "./modules/PipelineDocumentsModule";
import { PipelineEmailModule } from "./modules/PipelineEmailModule";
import { PipelineFinanceCard } from "./modules/PipelineFinanceCard";
import { PipelineAssetsModule } from "./modules/PipelineAssetsModule";
import { VolunteerShiftsTab } from "./modules/VolunteerShiftsTab";

type DrawerSection = "overview" | "marketing" | "finance" | "shifts";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  section: DrawerSection;
  active: boolean;
  onClick: () => void;
  count?: number;
  description?: string;
}

function NavItem({ icon, label, section, active, onClick, count, description }: NavItemProps) {
  return (
    <AdminButton
      variant="ghost"
      onClick={onClick}
      className={cn(
        "w-full justify-start gap-2.5 px-3 py-3 h-auto text-[13px] font-medium rounded-lg transition-all",
        active 
          ? "bg-[hsl(var(--admin-foreground)/0.06)] text-[hsl(var(--admin-foreground))] hover:bg-[hsl(var(--admin-foreground)/0.06)] shadow-sm border border-[hsl(var(--admin-border))]" 
          : "text-[hsl(var(--admin-muted-foreground))] hover:bg-[hsl(var(--admin-surface))] hover:text-[hsl(var(--admin-foreground))] border border-transparent"
      )}
    >
      <span className={cn("shrink-0", active && "text-[hsl(var(--admin-primary))]")}>{icon}</span>
      <div className="flex-1 text-left min-w-0 truncate">
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {typeof count === "number" && count > 0 && (
            <span className={cn(
              "text-[10px] min-w-[18px] text-center px-1.5 py-0.5 rounded-full font-semibold",
              active 
                ? "bg-[hsl(var(--admin-primary)/0.12)] text-[hsl(var(--admin-primary))]" 
                : "bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))]"
            )}>
              {count}
            </span>
          )}
        </div>
        {description && !active && (
          <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))] opacity-70 block mt-0.5">{description}</span>
        )}
      </div>
    </AdminButton>
  );
}

export function PipelineRecordDrawer() {
  const [activeSection, setActiveSection] = useState<DrawerSection>("overview");
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const {
    config,
    stages,
    fields,
    selectedRecord,
    setSelectedRecord,
    isDrawerOpen,
    setIsDrawerOpen,
    updateStatus,
    updateRecord,
    deleteRecord,
    isUpdating,
  } = usePipeline();

  const { selectedEventId } = useAdminEvent();
  const counts = usePipelineDrawerCounts();
  
  // Ownership
  const {
    ownerId,
    collaboratorIds,
    setOwner,
    addCollaborator,
    removeCollaborator,
    isUpdating: ownershipUpdating,
  } = useEntityOwnership({
    entityType: (config?.slug || "vendor") as EntityType,
    entityId: selectedRecord?.id || "",
    eventId: selectedEventId || null,
  });

  if (!selectedRecord || !config) return null;

  // Get display fields
  const nameField = fields.find(f => f.slug === "name");
  const companyField = fields.find(f => f.slug === "company_name" || f.slug === "business_name");
  const categoryField = fields.find(f => f.slug === "category" || f.slug === "craft_type" || f.slug === "genre" || f.slug === "tier");

  const name = nameField ? String(selectedRecord[nameField.slug] || "") : String(selectedRecord.name || "");
  const company = companyField ? String(selectedRecord[companyField.slug] || "") : "";
  const category = categoryField ? String(selectedRecord[categoryField.slug] || "") : "";

  const handleClose = () => {
    setIsDrawerOpen(false);
    setSelectedRecord(null);
    setActiveSection("overview");
  };

  const handleFieldUpdate = async (fieldSlug: string, value: any) => {
    if (!selectedRecord) return;
    updateRecord({ id: selectedRecord.id, [fieldSlug]: value });
  };

  const handleDelete = () => {
    deleteRecord(selectedRecord.id);
    handleClose();
    setIsDeleteDialogOpen(false);
  };

  const handleStatusChange = (status: string) => {
    updateStatus(selectedRecord.id, status);
  };

  const handleNavigate = (section: DrawerSection) => {
    setActiveSection(section);
  };

  // Compute counts for tabs
  const marketingCount = counts.contacts + counts.emails + counts.assets;
  const financeCount = counts.contracts + counts.documents;

  // Build nav items — always 3 tabs
  const navItems: { section: DrawerSection; icon: React.ReactNode; label: string; count?: number; description: string }[] = [
    { 
      section: "overview", 
      icon: <LayoutList className="w-4 h-4" />, 
      label: "Overview",
      description: ""
    },
    { 
      section: "marketing", 
      icon: <Megaphone className="w-4 h-4" />, 
      label: "Marketing",
      count: marketingCount > 0 ? marketingCount : undefined,
      description: ""
    },
    { 
      section: "finance", 
      icon: <DollarSign className="w-4 h-4" />, 
      label: "Finance",
      count: financeCount > 0 ? financeCount : undefined,
      description: ""
    },
    ...(config.slug === "volunteer" ? [{
      section: "shifts" as DrawerSection,
      icon: <CalendarCheck className="w-4 h-4" />,
      label: "Shifts",
      description: "",
    }] : []),
  ];

  // Check which sub-modules are relevant for showing/hiding sections
  const hasMarketingContent = config.has_contacts || config.has_email || config.slug === "artist";
  const hasFinanceContent = config.has_payments || config.has_contracts || config.has_documents;

  const enabledNavItems = navItems.filter(item => {
    if (item.section === "marketing") return hasMarketingContent;
    if (item.section === "finance") return hasFinanceContent;
    return true;
  });

  return (
    <>
    <AdminSheet open={isDrawerOpen} onOpenChange={handleClose}>
      <AdminSheetContent
        side="right" 
        className="w-full sm:max-w-2xl p-0 overflow-hidden flex flex-col"
      >
        {/* Sticky Header */}
        <div className="shrink-0 sticky top-0 z-20">
        <div className="p-4 md:p-5 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))]">
          <div className="flex items-start gap-3 md:gap-4">
            <AdminAvatar 
              name={company || name} 
              type={(config.slug as "vendor" | "artist" | "artisan" | "partner") || "default"}
              size={config.slug === "artist" ? "xl" : "lg"}
              className="shrink-0"
            />
            <div className="flex-1 min-w-0 pr-8">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {nameField && (
                    <h2 className="text-base md:text-lg font-semibold text-[hsl(var(--admin-foreground))] leading-tight">
                      <InlineFieldValue
                        field={nameField}
                        value={selectedRecord[nameField.slug]}
                        onSave={(value) => handleFieldUpdate(nameField.slug, value)}
                        disabled={isUpdating}
                        className="max-w-[calc(100%-2rem)]"
                      />
                    </h2>
                  )}
                  <div className="flex items-center gap-1.5 md:gap-2 mt-1 md:mt-1.5 flex-wrap">
                    <TypeLabel type={config.slug as "vendor" | "artist" | "artisan" | "partner"} />
                    {category && (
                      <>
                        <span className="text-[hsl(var(--admin-muted-foreground))] hidden md:inline">·</span>
                        <span className="text-[10px] md:text-[11px] text-[hsl(var(--admin-muted-foreground))]">{category}</span>
                      </>
                    )}
                    <ActivityTimestamp date={selectedRecord.updated_at as string} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status & Quick Info */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-3 md:mt-4 pt-3 md:pt-4 border-t border-[hsl(var(--admin-border)/0.5)]">
            <div className="flex items-center gap-1.5 md:gap-2">
              <span className="text-[11px] md:text-xs text-[hsl(var(--admin-muted-foreground))]">Status:</span>
              <PipelineStageSelect
                stages={stages}
                value={selectedRecord.pipeline_status as string}
                onValueChange={handleStatusChange}
                disabled={isUpdating}
              />
            </div>
            
            {config.has_ownership && (
              <div className="flex items-center gap-1.5 md:gap-2">
                <OwnerPicker
                  ownerId={ownerId}
                  onOwnerChange={setOwner}
                  collaboratorIds={collaboratorIds}
                  onAddCollaborator={addCollaborator}
                  onRemoveCollaborator={removeCollaborator}
                  disabled={ownershipUpdating}
                  compact
                />
              </div>
            )}
            
            {selectedRecord.email && (
              <a
                href={`mailto:${selectedRecord.email}`}
                className="flex items-center gap-1 md:gap-1.5 text-[11px] md:text-xs text-[hsl(var(--admin-info))] hover:underline"
              >
                <Mail className="w-3 md:w-3.5 h-3 md:h-3.5" />
                <span className="hidden sm:inline truncate max-w-[120px]">{String(selectedRecord.email)}</span>
              </a>
            )}
            
            {selectedRecord.phone && (
              <a
                href={`tel:${selectedRecord.phone}`}
                className="flex items-center gap-1 md:gap-1.5 text-[11px] md:text-xs text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
              >
                <Phone className="w-3 md:w-3.5 h-3 md:h-3.5" />
                <span className="hidden sm:inline">{String(selectedRecord.phone)}</span>
              </a>
            )}
            
            {selectedRecord.website_url && (
              <a
                href={String(selectedRecord.website_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 md:gap-1.5 text-[11px] md:text-xs text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
              >
                <Globe className="w-3 md:w-3.5 h-3 md:h-3.5" />
                <span className="hidden sm:inline">Website</span>
                <ExternalLink className="w-2.5 md:w-3 h-2.5 md:h-3 hidden sm:inline" />
              </a>
            )}

            {selectedRecord.instagram_url && (
              <a
                href={String(selectedRecord.instagram_url).startsWith("http") 
                  ? String(selectedRecord.instagram_url) 
                  : `https://instagram.com/${String(selectedRecord.instagram_url).replace("@", "")}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 md:gap-1.5 text-[11px] md:text-xs text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
              >
                <Instagram className="w-3 md:w-3.5 h-3 md:h-3.5" />
                <span className="hidden sm:inline">Instagram</span>
              </a>
            )}
          </div>
        </div>

        {/* Quick Action Bar */}
        <div className="px-3 md:px-5 py-2 md:py-2.5 bg-[hsl(var(--admin-card))] border-b border-[hsl(var(--admin-border))] overflow-x-auto">
          <DrawerQuickActions onNavigate={handleNavigate} />
        </div>
        </div>{/* end sticky header */}

        {/* Mobile horizontal tabs / Desktop sidebar navigation */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Mobile: Horizontal scrolling tabs */}
          <div className="md:hidden flex items-center gap-0.5 px-3 py-1 border-b border-[hsl(var(--admin-border))] overflow-x-auto bg-[hsl(var(--admin-card))]">
            {enabledNavItems.map(item => (
              <AdminButton
                key={item.section}
                variant="ghost"
                onClick={() => setActiveSection(item.section)}
                className={cn(
                  "shrink-0 px-3 py-2 h-auto text-xs font-medium relative transition-colors rounded-none",
                  activeSection === item.section
                    ? "text-[hsl(var(--admin-foreground))]"
                    : "text-[hsl(var(--admin-muted-foreground))]"
                )}
              >
                <span className="flex items-center gap-1.5">
                  {item.label}
                  {typeof item.count === "number" && item.count > 0 && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      activeSection === item.section
                        ? "bg-[hsl(var(--admin-primary))] text-[hsl(var(--admin-card))]"
                        : "bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))]"
                    )}>
                      {item.count}
                    </span>
                  )}
                </span>
                {activeSection === item.section && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[hsl(var(--admin-primary))] rounded-full" />
                )}
              </AdminButton>
            ))}
          </div>
          
          {/* Desktop: Sidebar Navigation */}
          <div className="hidden md:flex flex-col w-44 shrink-0 border-r border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-bg))] overflow-hidden">
            <nav className="p-2.5 space-y-1 flex-1">
              {enabledNavItems.map(item => (
                <NavItem
                  key={item.section}
                  section={item.section}
                  icon={item.icon}
                  label={item.label}
                  active={activeSection === item.section}
                  onClick={() => setActiveSection(item.section)}
                  count={item.count}
                  description={item.description}
                />
              ))}
            </nav>
            {/* Actions at bottom */}
            <div className="p-2 border-t border-[hsl(var(--admin-border))]">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <AdminButton 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start gap-2.5 px-3 py-2 h-auto text-xs font-medium text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))] hover:bg-[hsl(var(--admin-surface))] rounded-lg"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    More Actions
                  </AdminButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => setIsMoveDialogOpen(true)}>
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-2" />
                    Move to Pipeline
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="text-[hsl(var(--admin-destructive))] focus:text-[hsl(var(--admin-destructive))]"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete Record
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* ── OVERVIEW TAB ── */}
            {activeSection === "overview" && (
              <div className="space-y-5">
                {/* Shift Assignments Summary (volunteer only) */}
                {config.slug === "volunteer" && selectedRecord && (
                  <OverviewShiftSummary volunteerId={selectedRecord.id} onGoToShifts={() => setActiveSection("shifts")} />
                )}

                {/* Editable Notes */}
                <DrawerEditableNotes />

                {/* Unified Checklist */}
                <DrawerUnifiedChecklist />

                {/* Collapsible Field Sections */}
                <DrawerFieldSections
                  fields={fields}
                  record={selectedRecord}
                  onFieldUpdate={handleFieldUpdate}
                  isUpdating={isUpdating}
                  excludeSlugs={[
                    nameField?.slug,
                    companyField?.slug,
                    "notes", // notes shown in editable area above
                  ].filter(Boolean) as string[]}
                />

                {/* Unified Timeline */}
                <DrawerUnifiedTimeline />
              </div>
            )}

            {/* ── MARKETING TAB ── */}
            {activeSection === "marketing" && (
              <div className="space-y-6">
                {/* Contacts */}
                {config.has_contacts && (
                  <section>
                    <SectionHeader icon={<Users className="w-4 h-4" />} label="Contacts" count={counts.contacts} />
                    <PipelineContactsModule />
                  </section>
                )}

                {/* Email */}
                {config.has_email && (
                  <section>
                    <SectionHeader icon={<Mail className="w-4 h-4" />} label="Email" count={counts.emails} />
                    <PipelineEmailModule />
                  </section>
                )}

                {/* Assets (artist only) */}
                {config.slug === "artist" && (
                  <section>
                    <SectionHeader icon={<FolderOpen className="w-4 h-4" />} label="Assets & Media" count={counts.assets} />
                    <PipelineAssetsModule />
                  </section>
                )}
              </div>
            )}

            {/* ── FINANCE TAB ── */}
            {activeSection === "finance" && (
              <div className="space-y-6">
                {/* Deal Value + Payments */}
                {config.has_payments && <PipelineFinanceCard />}

                {/* Contracts */}
                {config.has_contracts && (
                  <section>
                    <SectionHeader icon={<FileText className="w-4 h-4" />} label="Contracts" count={counts.contracts} />
                    <PipelineContractsModule />
                  </section>
                )}

                {/* Documents */}
                {config.has_documents && (
                  <section>
                    <SectionHeader icon={<Files className="w-4 h-4" />} label="Documents" count={counts.documents} />
                    <PipelineDocumentsModule />
                  </section>
                )}
              </div>
            )}

            {/* ── SHIFTS TAB ── */}
            {activeSection === "shifts" && config.slug === "volunteer" && (
              <div className="space-y-6">
                <SectionHeader icon={<CalendarCheck className="w-4 h-4" />} label="Shift Assignments" />
                <VolunteerShiftsTab />
              </div>
            )}
          </div>
        </div>
      </AdminSheetContent>

      {/* Move to Pipeline Dialog */}
      <MoveToPipelineDialog
        open={isMoveDialogOpen}
        onOpenChange={setIsMoveDialogOpen}
      />
    </AdminSheet>

      {/* Delete Confirmation */}
      <AdminConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title={`Delete ${config.name_singular}`}
        description={`This ${config.name_singular.toLowerCase()} will be permanently deleted along with all associated data. This action cannot be undone.`}
        actionLabel="Delete"
        actionType="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}

/** Compact shift summary for the Overview tab */
function OverviewShiftSummary({ volunteerId, onGoToShifts }: { volunteerId: string; onGoToShifts: () => void }) {
  const { selectedEventId } = useAdminEvent();
  const { data: assignments = [] } = useVolunteerAssignments(volunteerId);
  const { data: shifts = [] } = useVolunteerShifts(selectedEventId);
  const { data: roles = [] } = useVolunteerRoles(selectedEventId);

  const assignedShifts = assignments.map((a: any) => {
    const shift = shifts.find((s: any) => s.id === a.shift_id);
    const role = shift ? roles.find((r: any) => r.id === shift.role_id) : null;
    return { assignment: a, shift, role };
  }).filter((x: any) => x.shift);

  if (assignedShifts.length === 0) {
    return (
      <AdminCard className="border-dashed">
        <AdminCardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[hsl(var(--admin-muted-foreground))]">
            <CalendarCheck className="w-4 h-4" />
            <span className="text-sm">No shifts assigned yet</span>
          </div>
          <AdminButton variant="adminOutline" size="sm" onClick={onGoToShifts}>
            Assign Shift
          </AdminButton>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--admin-border))]">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
            <h3 className="text-sm font-semibold text-[hsl(var(--admin-foreground))]">Shift Assignments</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))] font-medium">
              {assignedShifts.length}
            </span>
          </div>
          <AdminButton variant="ghost" size="sm" className="text-xs" onClick={onGoToShifts}>
            Manage
          </AdminButton>
        </div>
        <div className="divide-y divide-[hsl(var(--admin-border))]">
          {assignedShifts.map(({ assignment, shift, role }: any) => (
            <div key={assignment.id} className="px-4 py-2.5 flex items-center gap-3">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: role?.color || "#6b7280" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[hsl(var(--admin-foreground))] truncate">
                  {role?.name || "Shift"} – {shift.start_time ? format(parseISO(shift.start_time), "EEE, MMM d") : ""}
                </p>
                <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                  {shift.start_time ? format(parseISO(shift.start_time), "h:mm a") : ""} – {shift.end_time ? format(parseISO(shift.end_time), "h:mm a") : ""}
                </p>
              </div>
              <AdminBadge
                intent={assignment.status === "confirmed" || assignment.status === "checked_in" ? "success" : "neutral"}
                size="sm"
              >
                {assignment.status === "assigned" ? "Assigned" : assignment.status === "confirmed" ? "Confirmed" : assignment.status === "checked_in" ? "Checked In" : assignment.status}
              </AdminBadge>
            </div>
          ))}
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}

/** Small section header used within Marketing & Finance tabs */
function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[hsl(var(--admin-muted-foreground))]">{icon}</span>
      <h3 className="text-sm font-semibold text-[hsl(var(--admin-foreground))]">{label}</h3>
      {typeof count === "number" && count > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))] font-medium">
          {count}
        </span>
      )}
    </div>
  );
}
