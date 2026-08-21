import { useState, useMemo, useCallback } from "react";
import {
  useVolunteerRoles,
  useVolunteerShifts,
  useCreateVolunteerShift,
  useUpdateVolunteerShift,
  useDeleteVolunteerShift,
  VolunteerShift,
} from "@/hooks/useVolunteerScheduling";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminBadge,
  AdminConfirmDialog,
} from "@/components/admin";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
} from "@/components/admin/AdminSheet";
import {
  AdminSelect,
  AdminSelectItem,
} from "@/components/admin/AdminSelect";
import { AdminTextarea } from "@/components/admin/AdminFormPrimitives";
import {
  Calendar,
  Clock,
  Plus,
  Pencil,
  Trash2,
  Users,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Zap,
  ArrowLeft,
} from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { toast } from "sonner";

interface VolunteerShiftSchedulerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId?: string | null;
}

type DrawerView = "list" | "add" | "edit" | "bulk";

const EMPTY_SHIFT = {
  name: "",
  role_id: "",
  start_time: "",
  end_time: "",
  max_volunteers: 2,
  notes: "",
};

interface BulkShiftEntry {
  id: string;
  date: string;
  start_hour: string;
  end_hour: string;
}

const BULK_DEFAULTS = {
  role_id: "",
  max_volunteers: 2,
  name_prefix: "",
  shifts: [{ id: crypto.randomUUID(), date: "", start_hour: "08:00", end_hour: "12:00" }] as BulkShiftEntry[],
};

export function VolunteerShiftScheduler({ open, onOpenChange, eventId }: VolunteerShiftSchedulerProps) {
  const { data: roles = [] } = useVolunteerRoles(eventId);
  const { data: shifts = [], isLoading } = useVolunteerShifts(eventId);
  const createShift = useCreateVolunteerShift();
  const updateShift = useUpdateVolunteerShift();
  const deleteShift = useDeleteVolunteerShift();

  const [view, setView] = useState<DrawerView>("list");
  const [editingShift, setEditingShift] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newShift, setNewShift] = useState({ ...EMPTY_SHIFT });
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [bulkConfig, setBulkConfig] = useState({ ...BULK_DEFAULTS });

  // Group shifts by date
  const shiftsByDay = useMemo(() => {
    const map = new Map<string, VolunteerShift[]>();
    for (const shift of shifts) {
      const dayKey = shift.start_time ? format(parseISO(shift.start_time), "yyyy-MM-dd") : "unscheduled";
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(shift);
    }
    for (const [, dayShifts] of map) {
      dayShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [shifts]);

  const days = useMemo(() => Array.from(shiftsByDay.keys()).sort(), [shiftsByDay]);

  const toggleDay = (day: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  };

  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name || "Unknown";
  const getRoleColor = (roleId: string) => roles.find((r) => r.id === roleId)?.color || "#6b7280";

  const roleOptions = useMemo(() => {
    const cats = new Map<string, typeof roles>();
    for (const r of roles) {
      const cat = r.category || "Other";
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(r);
    }
    return cats;
  }, [roles]);

  const handleCreate = () => {
    if (!newShift.name.trim() || !newShift.role_id || !newShift.start_time || !newShift.end_time) return;
    createShift.mutate(
      {
        ...newShift,
        max_volunteers: newShift.max_volunteers || undefined,
        notes: newShift.notes || undefined,
        event_id: eventId || undefined,
      },
      {
        onSuccess: () => {
          setView("list");
          setNewShift({ ...EMPTY_SHIFT });
        },
      }
    );
  };

  const handleUpdate = () => {
    if (!editingShift) return;
    updateShift.mutate(
      {
        id: editingShift.id,
        name: editingShift.name,
        role_id: editingShift.role_id,
        start_time: editingShift.start_time,
        end_time: editingShift.end_time,
        max_volunteers: editingShift.max_volunteers,
        notes: editingShift.notes,
      },
      {
        onSuccess: () => {
          setView("list");
          setEditingShift(null);
        },
      }
    );
  };

  const handleCloneDay = useCallback((sourceDay: string) => {
    const dayShifts = shiftsByDay.get(sourceDay);
    if (!dayShifts?.length) return;
    const sourceDate = parseISO(sourceDay);
    const targetDate = addDays(sourceDate, 1);
    let created = 0;
    for (const shift of dayShifts) {
      const startTime = parseISO(shift.start_time);
      const endTime = parseISO(shift.end_time);
      const diffDays = Math.round((targetDate.getTime() - sourceDate.getTime()) / 86400000);
      const newStart = new Date(startTime.getTime() + diffDays * 86400000);
      const newEnd = new Date(endTime.getTime() + diffDays * 86400000);
      createShift.mutate({
        name: shift.name,
        role_id: shift.role_id,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        max_volunteers: shift.max_volunteers || undefined,
        notes: shift.notes || undefined,
        event_id: eventId || undefined,
      });
      created++;
    }
    toast.success(`Cloning ${created} shifts to ${format(targetDate, "EEEE, MMM d")}`);
  }, [shiftsByDay, createShift, eventId]);

  const handleBulkGenerate = () => {
    if (!bulkConfig.role_id) return;
    const validShifts = bulkConfig.shifts.filter(s => s.date && s.start_hour && s.end_hour);
    if (validShifts.length === 0) return;

    const role = roles.find(r => r.id === bulkConfig.role_id);
    const roleName = role?.name || "Shift";
    const prefix = bulkConfig.name_prefix || roleName;
    let created = 0;

    for (const entry of validShifts) {
      const startTime = new Date(`${entry.date}T${entry.start_hour}:00`);
      const endTime = new Date(`${entry.date}T${entry.end_hour}:00`);
      const dayLabel = format(startTime, "EEE");
      const shiftName = `${prefix} – ${dayLabel} ${format(startTime, "ha")}–${format(endTime, "ha")}`;

      createShift.mutate({
        name: shiftName,
        role_id: bulkConfig.role_id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        max_volunteers: bulkConfig.max_volunteers || undefined,
        event_id: eventId || undefined,
      });
      created++;
    }
    toast.success(`Creating ${created} shifts`);
    setView("list");
    setBulkConfig({ ...BULK_DEFAULTS });
  };

  const addBulkShiftEntry = () => {
    const lastEntry = bulkConfig.shifts[bulkConfig.shifts.length - 1];
    setBulkConfig(p => ({
      ...p,
      shifts: [...p.shifts, {
        id: crypto.randomUUID(),
        date: lastEntry?.date || "",
        start_hour: lastEntry?.end_hour || "08:00",
        end_hour: "",
      }],
    }));
  };

  const updateBulkShiftEntry = (id: string, field: keyof BulkShiftEntry, value: string) => {
    setBulkConfig(p => ({
      ...p,
      shifts: p.shifts.map(s => s.id === id ? { ...s, [field]: value } : s),
    }));
  };

  const removeBulkShiftEntry = (id: string) => {
    setBulkConfig(p => ({
      ...p,
      shifts: p.shifts.filter(s => s.id !== id),
    }));
  };

  const RoleSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <AdminSelect value={value} onValueChange={onChange} placeholder="Select role...">
      {Array.from(roleOptions.entries()).map(([cat, catRoles]) => (
        <div key={cat}>
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">
            {cat}
          </div>
          {catRoles.map((r) => (
            <AdminSelectItem key={r.id} value={r.id}>
              {r.name}
            </AdminSelectItem>
          ))}
        </div>
      ))}
    </AdminSelect>
  );

  const ShiftFormFields = ({ data, onChange }: { data: typeof EMPTY_SHIFT; onChange: (d: typeof EMPTY_SHIFT) => void }) => (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <AdminLabel>Shift Name</AdminLabel>
        <AdminInput
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="e.g. Saturday Morning Gate"
        />
      </div>
      <div className="space-y-1.5">
        <AdminLabel>Role</AdminLabel>
        <RoleSelect value={data.role_id} onChange={(v) => onChange({ ...data, role_id: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <AdminLabel>Start Time</AdminLabel>
          <AdminInput
            type="datetime-local"
            value={data.start_time ? data.start_time.slice(0, 16) : ""}
            onChange={(e) => onChange({ ...data, start_time: e.target.value ? new Date(e.target.value).toISOString() : "" })}
          />
        </div>
        <div className="space-y-1.5">
          <AdminLabel>End Time</AdminLabel>
          <AdminInput
            type="datetime-local"
            value={data.end_time ? data.end_time.slice(0, 16) : ""}
            onChange={(e) => onChange({ ...data, end_time: e.target.value ? new Date(e.target.value).toISOString() : "" })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <AdminLabel>Max Volunteers</AdminLabel>
        <AdminInput
          type="number"
          min={1}
          value={data.max_volunteers || ""}
          onChange={(e) => onChange({ ...data, max_volunteers: parseInt(e.target.value) || 0 })}
        />
      </div>
      <div className="space-y-1.5">
        <AdminLabel>Notes</AdminLabel>
        <AdminTextarea
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          placeholder="Any special instructions..."
          rows={2}
        />
      </div>
    </div>
  );

  // Render the correct view inside the drawer
  const renderContent = () => {
    // ADD SHIFT VIEW
    if (view === "add") {
      return (
        <>
          <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
            <div className="flex items-center gap-2">
              <AdminButton variant="adminGhost" size="icon" className="h-7 w-7" onClick={() => setView("list")}>
                <ArrowLeft className="w-4 h-4" />
              </AdminButton>
              <AdminSheetTitle>Add Shift</AdminSheetTitle>
            </div>
          </AdminSheetHeader>
          <div className="mt-4">
            <ShiftFormFields data={newShift} onChange={setNewShift} />
            <div className="flex items-center gap-2 mt-6">
              <AdminButton variant="adminOutline" className="flex-1" onClick={() => setView("list")}>Cancel</AdminButton>
              <AdminButton
                variant="admin"
                className="flex-1"
                onClick={handleCreate}
                disabled={createShift.isPending || !newShift.name.trim() || !newShift.role_id}
              >
                {createShift.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Create Shift
              </AdminButton>
            </div>
          </div>
        </>
      );
    }

    // EDIT SHIFT VIEW
    if (view === "edit" && editingShift) {
      return (
        <>
          <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
            <div className="flex items-center gap-2">
              <AdminButton variant="adminGhost" size="icon" className="h-7 w-7" onClick={() => { setView("list"); setEditingShift(null); }}>
                <ArrowLeft className="w-4 h-4" />
              </AdminButton>
              <AdminSheetTitle>Edit Shift</AdminSheetTitle>
            </div>
          </AdminSheetHeader>
          <div className="mt-4">
            <ShiftFormFields data={editingShift} onChange={setEditingShift} />
            <div className="flex items-center gap-2 mt-6">
              <AdminButton variant="adminOutline" className="flex-1" onClick={() => { setView("list"); setEditingShift(null); }}>Cancel</AdminButton>
              <AdminButton variant="admin" className="flex-1" onClick={handleUpdate} disabled={updateShift.isPending}>
                Save Changes
              </AdminButton>
            </div>
          </div>
        </>
      );
    }

    // BULK GENERATE VIEW
    if (view === "bulk") {
      const validCount = bulkConfig.shifts.filter(s => s.date && s.start_hour && s.end_hour).length;
      return (
        <>
          <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
            <div className="flex items-center gap-2">
              <AdminButton variant="adminGhost" size="icon" className="h-7 w-7" onClick={() => setView("list")}>
                <ArrowLeft className="w-4 h-4" />
              </AdminButton>
              <AdminSheetTitle className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Quick Add Shifts
              </AdminSheetTitle>
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1 ml-9">
              Add individual shifts with specific times per day
            </p>
          </AdminSheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <AdminLabel>Role</AdminLabel>
              <RoleSelect value={bulkConfig.role_id} onChange={(v) => setBulkConfig(p => ({ ...p, role_id: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <AdminLabel>Shift Name Prefix</AdminLabel>
                <AdminInput
                  value={bulkConfig.name_prefix}
                  onChange={(e) => setBulkConfig(p => ({ ...p, name_prefix: e.target.value }))}
                  placeholder="e.g. Gate, defaults to role name"
                />
              </div>
              <div className="space-y-1.5">
                <AdminLabel>Volunteers per Shift</AdminLabel>
                <AdminInput
                  type="number"
                  min={1}
                  value={bulkConfig.max_volunteers}
                  onChange={(e) => setBulkConfig(p => ({ ...p, max_volunteers: parseInt(e.target.value) || 2 }))}
                />
              </div>
            </div>

            {/* Shift entries */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <AdminLabel className="text-xs">Shifts</AdminLabel>
                <span className="text-[10px] text-[hsl(var(--admin-text-muted))]">{bulkConfig.shifts.length} added</span>
              </div>
              {bulkConfig.shifts.map((entry, idx) => (
                <div key={entry.id} className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">
                      Shift {idx + 1}
                    </span>
                    {bulkConfig.shifts.length > 1 && (
                      <AdminButton
                        variant="adminGhost"
                        size="icon"
                        className="h-5 w-5 text-[hsl(var(--admin-error))]"
                        onClick={() => removeBulkShiftEntry(entry.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </AdminButton>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <AdminLabel className="text-[11px]">Date</AdminLabel>
                    <AdminInput
                      type="date"
                      value={entry.date}
                      onChange={(e) => updateBulkShiftEntry(entry.id, "date", e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <AdminLabel className="text-[11px]">Start Time</AdminLabel>
                      <AdminInput
                        type="time"
                        value={entry.start_hour}
                        onChange={(e) => updateBulkShiftEntry(entry.id, "start_hour", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <AdminLabel className="text-[11px]">End Time</AdminLabel>
                      <AdminInput
                        type="time"
                        value={entry.end_hour}
                        onChange={(e) => updateBulkShiftEntry(entry.id, "end_hour", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <AdminButton
                variant="adminOutline"
                size="sm"
                className="w-full"
                onClick={addBulkShiftEntry}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Shift
              </AdminButton>
            </div>

            {/* Preview */}
            {validCount > 0 && (
              <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">Preview</span>
                <p className="text-sm text-[hsl(var(--admin-text))] mt-1">
                  {validCount} shift{validCount !== 1 ? "s" : ""} will be created
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <AdminButton variant="adminOutline" className="flex-1" onClick={() => setView("list")}>Cancel</AdminButton>
              <AdminButton
                variant="admin"
                className="flex-1"
                onClick={handleBulkGenerate}
                disabled={!bulkConfig.role_id || validCount === 0}
              >
                <Zap className="w-4 h-4 mr-1.5" />
                Generate {validCount} Shift{validCount !== 1 ? "s" : ""}
              </AdminButton>
            </div>
          </div>
        </>
      );
    }

    // LIST VIEW (default)
    return (
      <>
        <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
          <AdminSheetTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Shift Scheduler
          </AdminSheetTitle>
          <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
            {shifts.length} shifts across {days.length} days
          </p>
        </AdminSheetHeader>

        <div className="mt-4 space-y-1">
          {/* Action buttons */}
          <div className="flex items-center gap-2 mb-3">
            <AdminButton
              variant="adminOutline"
              size="sm"
              className="flex-1"
              onClick={() => { setNewShift({ ...EMPTY_SHIFT }); setView("add"); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Shift
            </AdminButton>
            <AdminButton
              variant="adminOutline"
              size="sm"
              className="flex-1"
              onClick={() => setView("bulk")}
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              Bulk Generate
            </AdminButton>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--admin-text-muted))]" />
            </div>
          ) : shifts.length === 0 ? (
            <div className="text-center py-8 text-sm text-[hsl(var(--admin-text-muted))]">
              No shifts scheduled yet. Create your first shift above.
            </div>
          ) : (
            days.map((day) => {
              const dayShifts = shiftsByDay.get(day) || [];
              const isExpanded = expandedDays.has(day);
              const dayLabel = day === "unscheduled" ? "Unscheduled" : format(parseISO(day), "EEEE, MMMM d");

              return (
                <div key={day} className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden">
                  <div className="flex items-center bg-[hsl(var(--admin-surface))]">
                    <AdminButton
                      variant="adminGhost"
                      onClick={() => toggleDay(day)}
                      className="flex-1 flex items-center gap-2 px-3 py-2.5 justify-start rounded-none h-auto"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--admin-text-muted))]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--admin-text-muted))]" />
                      )}
                      <Calendar className="w-3.5 h-3.5 text-[hsl(var(--admin-text-muted))]" />
                      <span className="text-sm font-medium text-[hsl(var(--admin-text))] flex-1 text-left">
                        {dayLabel}
                      </span>
                      <AdminBadge intent="neutral" size="sm" className="text-[10px] px-1.5 py-0">
                        {dayShifts.length}
                      </AdminBadge>
                    </AdminButton>
                    {day !== "unscheduled" && (
                      <AdminButton
                        variant="adminGhost"
                        size="icon"
                        className="h-8 w-8 mr-1"
                        title={`Clone all shifts to next day`}
                        onClick={() => handleCloneDay(day)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </AdminButton>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[hsl(var(--admin-border))]">
                      {dayShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="flex items-center gap-2 px-3 py-2.5 pl-9 hover:bg-[hsl(var(--admin-hover))] group border-b border-[hsl(var(--admin-border))] last:border-b-0"
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getRoleColor(shift.role_id) }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[hsl(var(--admin-text))] truncate">
                              {shift.name}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--admin-text-muted))]">
                              <span>{getRoleName(shift.role_id)}</span>
                              <span>·</span>
                              <Clock className="w-3 h-3" />
                              <span>
                                {format(parseISO(shift.start_time), "h:mm a")} – {format(parseISO(shift.end_time), "h:mm a")}
                              </span>
                              {shift.max_volunteers && (
                                <>
                                  <span>·</span>
                                  <Users className="w-3 h-3" />
                                  <span>{shift.max_volunteers}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <AdminButton
                              variant="adminGhost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => { setEditingShift({ ...shift }); setView("edit"); }}
                            >
                              <Pencil className="w-3 h-3" />
                            </AdminButton>
                            <AdminButton
                              variant="adminGhost"
                              size="icon"
                              className="h-6 w-6 text-[hsl(var(--admin-error))]"
                              onClick={() => setDeleteTarget(shift.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </AdminButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <AdminSheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setView("list"); }}>
        <AdminSheetContent side="right" className="w-[520px] overflow-y-auto">
          {renderContent()}
        </AdminSheetContent>
      </AdminSheet>

      {/* Delete Confirmation */}
      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Shift"
        description="This will remove this shift and all volunteer assignments to it."
        actionLabel="Delete"
        actionType="danger"
        icon="delete"
        onConfirm={() => {
          if (deleteTarget) {
            deleteShift.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
