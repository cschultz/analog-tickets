import { useState, useMemo } from "react";
import {
  useVolunteerRoles,
  useVolunteerShifts,
  useShiftAssignments,
  useCreateShiftAssignment,
  useUpdateShiftAssignment,
  useDeleteShiftAssignment,
  VolunteerShift,
} from "@/hooks/useVolunteerScheduling";
import { usePipeline } from "@/components/pipeline/PipelineContext";
import {
  AdminButton,
  AdminBadge,
  AdminConfirmDialog,
} from "@/components/admin";
import {
  AdminSelect,
  AdminSelectItem,
} from "@/components/admin/AdminSelect";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
} from "@/components/admin/AdminSheet";
import {
  UserPlus,
  Clock,
  Users,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface VolunteerShiftAssignmentsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  assigned: { label: "Assigned", className: "bg-[hsl(var(--admin-info)/0.1)] text-[hsl(var(--admin-info))]" },
  confirmed: { label: "Confirmed", className: "bg-[hsl(var(--admin-success)/0.1)] text-[hsl(var(--admin-success))]" },
  checked_in: { label: "Checked In", className: "bg-[hsl(var(--admin-success)/0.15)] text-[hsl(var(--admin-success))]" },
  no_show: { label: "No Show", className: "bg-[hsl(var(--admin-error)/0.1)] text-[hsl(var(--admin-error))]" },
  cancelled: { label: "Cancelled", className: "bg-[hsl(var(--admin-text-muted)/0.1)] text-[hsl(var(--admin-text-muted))]" },
};

export function VolunteerShiftAssignments({ open, onOpenChange, eventId }: VolunteerShiftAssignmentsProps) {
  const { records } = usePipeline();
  const { data: roles = [] } = useVolunteerRoles(eventId);
  const { data: shifts = [], isLoading } = useVolunteerShifts(eventId);
  const createAssignment = useCreateShiftAssignment();
  const updateAssignment = useUpdateShiftAssignment();
  const deleteAssignment = useDeleteShiftAssignment();

  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: assignments = [] } = useShiftAssignments(selectedShiftId || undefined);

  // Group shifts by role category
  const shiftsByCategory = useMemo(() => {
    const map = new Map<string, VolunteerShift[]>();
    for (const shift of shifts) {
      const role = roles.find((r) => r.id === shift.role_id);
      const cat = role?.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(shift);
    }
    return map;
  }, [shifts, roles]);

  const categories = useMemo(() => Array.from(shiftsByCategory.keys()).sort(), [shiftsByCategory]);

  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name || "Unknown";
  const getRoleColor = (roleId: string) => roles.find((r) => r.id === roleId)?.color || "#6b7280";

  const toggleShift = (shiftId: string) => {
    setSelectedShiftId(shiftId);
    setExpandedShifts((prev) => {
      const next = new Set(prev);
      next.has(shiftId) ? next.delete(shiftId) : next.add(shiftId);
      return next;
    });
  };

  const handleAssign = (shiftId: string, volunteerId: string) => {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;
    createAssignment.mutate({
      shift_id: shiftId,
      volunteer_id: volunteerId,
      role_id: shift.role_id,
      status: "assigned",
    });
  };

  const handleStatusChange = (assignmentId: string, status: string) => {
    updateAssignment.mutate({ id: assignmentId, status });
  };

  // Volunteers not yet assigned to selected shift
  const availableVolunteers = useMemo(() => {
    if (!selectedShiftId) return records;
    const assignedIds = new Set(assignments.map((a) => a.volunteer_id));
    return records.filter((r) => !assignedIds.has(r.id));
  }, [records, assignments, selectedShiftId]);

  return (
    <>
      <AdminSheet open={open} onOpenChange={onOpenChange}>
        <AdminSheetContent side="right" className="w-[560px] overflow-y-auto">
          <AdminSheetHeader className="pb-4 border-b border-[hsl(var(--admin-border))]">
            <AdminSheetTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Shift Assignments
            </AdminSheetTitle>
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
              {records.length} volunteers available · {shifts.length} shifts
            </p>
          </AdminSheetHeader>

          <div className="mt-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--admin-text-muted))]" />
              </div>
            ) : shifts.length === 0 ? (
              <div className="text-center py-8 text-sm text-[hsl(var(--admin-text-muted))]">
                No shifts created yet. Use the Shift Scheduler to create shifts first.
              </div>
            ) : (
              categories.map((cat) => {
                const catShifts = shiftsByCategory.get(cat) || [];
                return (
                  <div key={cat}>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--admin-text-muted))] px-1 py-2">
                      {cat}
                    </div>
                    {catShifts.map((shift) => {
                      const isExpanded = expandedShifts.has(shift.id) && selectedShiftId === shift.id;
                      const shiftAssignments = isExpanded ? assignments : [];
                      const filledCount = shift.max_volunteers ? shiftAssignments.length : 0;
                      const maxCount = shift.max_volunteers || 0;
                      const isFull = maxCount > 0 && filledCount >= maxCount;

                      return (
                        <div key={shift.id} className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden mb-1">
                          <AdminButton
                            variant="adminGhost"
                            onClick={() => toggleShift(shift.id)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 justify-start rounded-none h-auto"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--admin-text-muted))]" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--admin-text-muted))]" />
                            )}
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: getRoleColor(shift.role_id) }}
                            />
                            <div className="flex-1 min-w-0 text-left">
                              <span className="text-sm font-medium text-[hsl(var(--admin-text))] truncate block">
                                {shift.name}
                              </span>
                              <span className="text-[11px] text-[hsl(var(--admin-text-muted))]">
                                {getRoleName(shift.role_id)} · {format(parseISO(shift.start_time), "EEE h:mm a")} – {format(parseISO(shift.end_time), "h:mm a")}
                              </span>
                            </div>
                            {maxCount > 0 && (
                              <AdminBadge
                                intent={isFull ? "success" : "neutral"}
                                size="sm"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {filledCount}/{maxCount}
                              </AdminBadge>
                            )}
                          </AdminButton>

                          {isExpanded && (
                            <div className="border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-bg))]">
                              {/* Current assignments */}
                              {shiftAssignments.length > 0 && (
                                <div className="divide-y divide-[hsl(var(--admin-border))]">
                                  {shiftAssignments.map((a) => (
                                    <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                                      <div className="w-6 h-6 rounded-full bg-[hsl(var(--admin-accent-subtle))] flex items-center justify-center text-[10px] font-medium text-[hsl(var(--admin-accent))]">
                                        {(a.volunteer?.name || "?")[0].toUpperCase()}
                                      </div>
                                      <span className="text-sm text-[hsl(var(--admin-text))] flex-1 truncate">
                                        {a.volunteer?.name || "Unknown"}
                                      </span>
                                      <AdminSelect
                                        value={a.status}
                                        onValueChange={(v) => handleStatusChange(a.id, v)}
                                      >
                                        {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                                          <AdminSelectItem key={val} value={val}>
                                            {cfg.label}
                                          </AdminSelectItem>
                                        ))}
                                      </AdminSelect>
                                      <AdminButton
                                        variant="adminGhost"
                                        size="icon"
                                        className="h-6 w-6 text-[hsl(var(--admin-error))]"
                                        onClick={() => setDeleteTarget(a.id)}
                                      >
                                        <X className="w-3 h-3" />
                                      </AdminButton>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Assign new volunteer */}
                              {!isFull && availableVolunteers.length > 0 && (
                                <div className="px-3 py-2 border-t border-[hsl(var(--admin-border))]">
                                  <AdminSelect
                                    value=""
                                    onValueChange={(v) => handleAssign(shift.id, v)}
                                    placeholder="+ Assign volunteer..."
                                  >
                                    {availableVolunteers.map((v: any) => (
                                      <AdminSelectItem key={v.id} value={v.id}>
                                        {v.name as string}
                                      </AdminSelectItem>
                                    ))}
                                  </AdminSelect>
                                </div>
                              )}

                              {isFull && (
                                <div className="px-3 py-2 border-t border-[hsl(var(--admin-border))] flex items-center gap-1.5 text-xs text-[hsl(var(--admin-success))]">
                                  <Check className="w-3 h-3" />
                                  Fully staffed
                                </div>
                              )}

                              {!isFull && availableVolunteers.length === 0 && records.length > 0 && (
                                <div className="px-3 py-2 border-t border-[hsl(var(--admin-border))] flex items-center gap-1.5 text-xs text-[hsl(var(--admin-warning))]">
                                  <AlertTriangle className="w-3 h-3" />
                                  All volunteers already assigned
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </AdminSheetContent>
      </AdminSheet>

      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove Assignment"
        description="Remove this volunteer from this shift?"
        actionLabel="Remove"
        actionType="danger"
        icon="delete"
        onConfirm={() => {
          if (deleteTarget) {
            deleteAssignment.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
