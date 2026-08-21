import { useMemo } from "react";
import { usePipeline } from "@/components/pipeline/PipelineContext";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import {
  useVolunteerAssignments,
  useVolunteerShifts,
  useVolunteerRoles,
  useCreateShiftAssignment,
  useDeleteShiftAssignment,
  useUpdateShiftAssignment,
  useShiftAssignmentCounts,
} from "@/hooks/useVolunteerScheduling";
import { AdminButton, AdminBadge, AdminConfirmDialog } from "@/components/admin";
import {
  AdminSelect,
  AdminSelectItem,
} from "@/components/admin/AdminSelect";
import { Calendar, Clock, Trash2, Loader2, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useState } from "react";

const STATUS_OPTIONS: Record<string, { label: string; className: string }> = {
  assigned: { label: "Assigned", className: "bg-[hsl(var(--admin-info)/0.1)] text-[hsl(var(--admin-info))]" },
  confirmed: { label: "Confirmed", className: "bg-[hsl(var(--admin-success)/0.1)] text-[hsl(var(--admin-success))]" },
  checked_in: { label: "Checked In", className: "bg-[hsl(var(--admin-success)/0.15)] text-[hsl(var(--admin-success))]" },
  no_show: { label: "No Show", className: "bg-[hsl(var(--admin-error)/0.1)] text-[hsl(var(--admin-error))]" },
  cancelled: { label: "Cancelled", className: "bg-[hsl(var(--admin-text-muted)/0.1)] text-[hsl(var(--admin-text-muted))]" },
};

export function VolunteerShiftsTab() {
  const { selectedRecord, config, updateRecord } = usePipeline();
  const { selectedEventId } = useAdminEvent();
  const queryClient = useQueryClient();
  const volunteerId = selectedRecord?.id as string;

  const { data: assignments = [], isLoading } = useVolunteerAssignments(volunteerId);
  const { data: shifts = [] } = useVolunteerShifts(selectedEventId);
  const { data: roles = [] } = useVolunteerRoles(selectedEventId);
  const { data: assignmentCounts = {} } = useShiftAssignmentCounts(selectedEventId);
  const createAssignment = useCreateShiftAssignment();
  const updateAssignment = useUpdateShiftAssignment();
  const deleteAssignment = useDeleteShiftAssignment();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Shifts not yet assigned to this volunteer AND not filled
  const assignedShiftIds = useMemo(() => new Set(assignments.map((a: any) => a.shift_id)), [assignments]);
  const availableShifts = useMemo(() => shifts.filter(s => {
    if (assignedShiftIds.has(s.id)) return false;
    // Hide filled shifts
    if (s.max_volunteers && (assignmentCounts[s.id] || 0) >= s.max_volunteers) return false;
    return true;
  }), [shifts, assignedShiftIds, assignmentCounts]);

  const getRoleName = (roleId: string) => roles.find(r => r.id === roleId)?.name || "";
  const getRoleColor = (roleId: string) => roles.find(r => r.id === roleId)?.color || "#6b7280";

  const handleAssign = (shiftId: string) => {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;
    createAssignment.mutate({
      shift_id: shiftId,
      volunteer_id: volunteerId,
      role_id: shift.role_id,
      status: "assigned",
    }, {
      onSuccess: () => {
        // Auto-advance volunteer to "scheduled" stage
        if (selectedRecord && selectedRecord.pipeline_status !== "scheduled") {
          updateRecord({ id: volunteerId, pipeline_status: "scheduled" });
        }
      },
    });
  };

  const handleStatusChange = (assignmentId: string, status: string) => {
    updateAssignment.mutate({ id: assignmentId, status });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--admin-text-muted))]" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Current assignments */}
        {assignments.length === 0 && (
          <p className="text-sm text-[hsl(var(--admin-text-muted))] py-4 text-center">
            No shifts assigned yet
          </p>
        )}
        {assignments.map((a: any) => {
          const shift = a.shift;
          const roleName = shift ? getRoleName(shift.role_id) : "";
          const roleColor = shift ? getRoleColor(shift.role_id) : "#6b7280";
          const count = shift ? (assignmentCounts[shift.id] || 0) : 0;
          const max = shift?.max_volunteers;
          return (
            <div
              key={a.id}
              className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: roleColor }} />
                    <span className="text-sm font-medium text-[hsl(var(--admin-text))] truncate">
                      {shift?.name || "Unknown Shift"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[hsl(var(--admin-text-muted))]">
                    {roleName && <span>{roleName}</span>}
                    {shift?.start_time && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(parseISO(shift.start_time), "EEE, MMM d")}
                      </span>
                    )}
                    {shift?.start_time && shift?.end_time && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(parseISO(shift.start_time), "h:mm a")} – {format(parseISO(shift.end_time), "h:mm a")}
                      </span>
                    )}
                    {max && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {count}/{max}
                      </span>
                    )}
                  </div>
                </div>
                <AdminButton
                  variant="adminGhost"
                  size="icon"
                  className="h-6 w-6 text-[hsl(var(--admin-error))] shrink-0"
                  onClick={() => setDeleteTarget(a.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </AdminButton>
              </div>
              <div className="mt-2">
                <AdminSelect
                  value={a.status}
                  onValueChange={(v) => handleStatusChange(a.id, v)}
                >
                  {Object.entries(STATUS_OPTIONS).map(([val, cfg]) => (
                    <AdminSelectItem key={val} value={val}>
                      {cfg.label}
                    </AdminSelectItem>
                  ))}
                </AdminSelect>
              </div>
            </div>
          );
        })}

        {/* Assign new shift */}
        {availableShifts.length > 0 && (
          <div className="pt-2 border-t border-[hsl(var(--admin-border))]">
            <AdminSelect
              value=""
              onValueChange={handleAssign}
              placeholder="+ Assign to shift..."
            >
              {availableShifts.map(s => {
                const count = assignmentCounts[s.id] || 0;
                const max = s.max_volunteers;
                const spotsLabel = max ? ` (${count}/${max})` : "";
                return (
                  <AdminSelectItem key={s.id} value={s.id}>
                    {s.name}{s.start_time ? ` — ${format(parseISO(s.start_time), "EEE h:mma")}` : ""}{spotsLabel}
                  </AdminSelectItem>
                );
              })}
            </AdminSelect>
          </div>
        )}

        {availableShifts.length === 0 && assignments.length > 0 && (
          <p className="text-[11px] text-[hsl(var(--admin-text-muted))] text-center pt-2">
            All shifts assigned or filled
          </p>
        )}
      </div>

      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove Shift Assignment"
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
