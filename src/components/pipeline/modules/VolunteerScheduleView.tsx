import { useMemo, useState } from "react";
import {
  useVolunteerRoles,
  useVolunteerShifts,
  useAllShiftAssignments,
} from "@/hooks/useVolunteerScheduling";
import { usePipeline } from "@/components/pipeline/PipelineContext";
import { AdminCard, AdminCardContent, AdminBadge, AdminButton } from "@/components/admin";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
} from "@/components/admin/AdminSheet";
import { Calendar, Users, Clock, ChevronLeft, ChevronRight, User } from "lucide-react";
import { format, parseISO } from "date-fns";

interface VolunteerScheduleViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId?: string | null;
}

interface ShiftWithAssignments {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  max_volunteers: number | null;
  role_id: string;
  notes: string | null;
  volunteers: { id: string; name: string; status: string }[];
}

export function VolunteerScheduleView({ open, onOpenChange, eventId }: VolunteerScheduleViewProps) {
  const { records } = usePipeline();
  const { data: roles = [] } = useVolunteerRoles(eventId);
  const { data: shifts = [], isLoading } = useVolunteerShifts(eventId);
  const { data: assignments = [] } = useAllShiftAssignments(eventId) as { data: any[] };

  // Build a lookup: volunteer_id -> name
  const volunteerMap = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r) => map.set(r.id, String(r.name || "Unknown")));
    return map;
  }, [records]);

  // Build shift data with assignments
  const shiftsWithAssignments: ShiftWithAssignments[] = useMemo(() => {
    return shifts.map((shift) => {
      const shiftAssignments = assignments.filter((a: any) => a.shift_id === shift.id);
      return {
        ...shift,
        volunteers: shiftAssignments.map((a: any) => ({
          id: a.volunteer_id,
          name: volunteerMap.get(a.volunteer_id) || "Unknown",
          status: a.status,
        })),
      };
    });
  }, [shifts, assignments, volunteerMap]);

  // Group shifts by day
  const shiftsByDay = useMemo(() => {
    const groups = new Map<string, ShiftWithAssignments[]>();
    shiftsWithAssignments.forEach((shift) => {
      const day = shift.start_time.split("T")[0]; // extract date part
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(shift);
    });
    // Sort days
    const sorted = new Map([...groups.entries()].sort());
    return sorted;
  }, [shiftsWithAssignments]);

  const days = useMemo(() => Array.from(shiftsByDay.keys()), [shiftsByDay]);
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  // Active day's shifts grouped by role
  const activeDay = days[activeDayIndex] || null;
  const activeDayShifts = activeDay ? shiftsByDay.get(activeDay) || [] : [];

  const shiftsByRole = useMemo(() => {
    const groups = new Map<string, ShiftWithAssignments[]>();
    activeDayShifts.forEach((shift) => {
      if (!groups.has(shift.role_id)) groups.set(shift.role_id, []);
      groups.get(shift.role_id)!.push(shift);
    });
    // Sort shifts within each role by start_time
    groups.forEach((roleShifts) => {
      roleShifts.sort((a, b) => a.start_time.localeCompare(b.start_time));
    });
    return groups;
  }, [activeDayShifts]);

  const roleMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; category: string | null }>();
    roles.forEach((r: any) => map.set(r.id, { name: r.name, color: r.color, category: r.category }));
    return map;
  }, [roles]);

  // Get unique role categories for grouping
  const rolesByCategory = useMemo(() => {
    const categories = new Map<string, string[]>();
    Array.from(shiftsByRole.keys()).forEach((roleId) => {
      const role = roleMap.get(roleId);
      const cat = role?.category || "Other";
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(roleId);
    });
    return categories;
  }, [shiftsByRole, roleMap]);

  const formatTime = (iso: string) => {
    try {
      return format(parseISO(iso), "h:mma").toLowerCase();
    } catch {
      return iso;
    }
  };

  const getDayLabel = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEEE, MMMM d");
    } catch {
      return dateStr;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-[hsl(var(--admin-success)/0.15)] text-[hsl(var(--admin-success))]";
      case "checked_in": return "bg-[hsl(var(--admin-accent)/0.15)] text-[hsl(var(--admin-accent))]";
      case "no_show": return "bg-[hsl(var(--admin-error)/0.15)] text-[hsl(var(--admin-error))]";
      default: return "bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-text-secondary))]";
    }
  };

  // Stats
  const totalAssigned = assignments.length;
  const totalSlots = shifts.reduce((sum: number, s: any) => sum + (s.max_volunteers || 1), 0);
  const openSlots = totalSlots - totalAssigned;

  return (
    <AdminSheet open={open} onOpenChange={onOpenChange}>
      <AdminSheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <AdminSheetHeader>
          <AdminSheetTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[hsl(var(--admin-accent))]" />
            Volunteer Schedule
          </AdminSheetTitle>
        </AdminSheetHeader>

        {/* Stats Strip */}
        <div className="flex items-center gap-4 text-sm py-3 border-b border-[hsl(var(--admin-border))]">
          <span className="text-[hsl(var(--admin-text-secondary))]">
            <span className="font-medium text-[hsl(var(--admin-text))]">{totalAssigned}</span> assigned
          </span>
          <span className="text-[hsl(var(--admin-text-secondary))]">
            <span className="font-medium text-[hsl(var(--admin-text))]">{totalSlots}</span> total slots
          </span>
          {openSlots > 0 && (
            <span className="text-[hsl(var(--admin-warning))]">
              <span className="font-medium">{openSlots}</span> open
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[hsl(var(--admin-text-secondary))]">
            Loading schedule...
          </div>
        ) : days.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="w-10 h-10 text-[hsl(var(--admin-muted-foreground))] mb-3" />
            <p className="text-[hsl(var(--admin-text-secondary))]">No shifts scheduled yet</p>
            <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mt-1">
              Create shifts first, then assign volunteers
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {/* Day Selector */}
            <div className="flex items-center justify-between">
              <AdminButton
                variant="adminGhost"
                size="icon"
                disabled={activeDayIndex === 0}
                onClick={() => setActiveDayIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </AdminButton>
              <div className="text-center">
                <h3 className="text-base font-semibold text-[hsl(var(--admin-text))]">
                  {activeDay ? getDayLabel(activeDay) : ""}
                </h3>
                <p className="text-xs text-[hsl(var(--admin-text-secondary))]">
                  {activeDayShifts.length} shift{activeDayShifts.length !== 1 ? "s" : ""} · Day {activeDayIndex + 1} of {days.length}
                </p>
              </div>
              <AdminButton
                variant="adminGhost"
                size="icon"
                disabled={activeDayIndex >= days.length - 1}
                onClick={() => setActiveDayIndex((i) => Math.min(days.length - 1, i + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </AdminButton>
            </div>

            {/* Schedule Grid by Role Category */}
            {Array.from(rolesByCategory.entries()).map(([category, roleIds]) => (
              <div key={category} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))] px-1">
                  {category}
                </h4>
                {roleIds.map((roleId) => {
                  const role = roleMap.get(roleId);
                  const roleShifts = shiftsByRole.get(roleId) || [];
                  if (!role) return null;

                  return (
                    <AdminCard key={roleId} className="overflow-hidden">
                      {/* Role Header */}
                      <div
                        className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--admin-border))]"
                        style={{
                          borderLeft: `3px solid ${role.color || "hsl(var(--admin-accent))"}`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[hsl(var(--admin-text))]">
                            {role.name}
                          </span>
                          <AdminBadge intent="neutral" className="text-[10px]">
                            {roleShifts.reduce((sum, s) => sum + s.volunteers.length, 0)}/
                            {roleShifts.reduce((sum, s) => sum + (s.max_volunteers || 1), 0)}
                          </AdminBadge>
                        </div>
                      </div>

                      {/* Shifts Table */}
                      <div className="divide-y divide-[hsl(var(--admin-border)/0.5)]">
                        {roleShifts.map((shift) => {
                          const filled = shift.volunteers.length;
                          const max = shift.max_volunteers || 1;
                          const isFull = filled >= max;

                          return (
                            <div
                              key={shift.id}
                              className="flex flex-col sm:flex-row sm:items-start gap-2 px-4 py-3"
                            >
                              {/* Time Column */}
                              <div className="flex items-center gap-2 sm:w-40 shrink-0">
                                <Clock className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
                                <span className="text-sm font-medium text-[hsl(var(--admin-text))]">
                                  {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                                </span>
                              </div>

                              {/* Capacity */}
                              <div className="sm:w-16 shrink-0">
                                <AdminBadge
                                  intent={isFull ? "success" : filled > 0 ? "warning" : "danger"}
                                  className="text-[10px]"
                                >
                                  {filled}/{max}
                                </AdminBadge>
                              </div>

                              {/* Assigned Volunteers */}
                              <div className="flex-1 min-w-0">
                                {shift.volunteers.length === 0 ? (
                                  <span className="text-xs text-[hsl(var(--admin-muted-foreground))] italic">
                                    Open shift
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {shift.volunteers.map((v) => (
                                      <span
                                        key={v.id}
                                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${getStatusColor(v.status)}`}
                                      >
                                        <User className="w-3 h-3" />
                                        {v.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Notes */}
                              {shift.notes && (
                                <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))] italic sm:w-32 shrink-0 truncate" title={shift.notes}>
                                  {shift.notes}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </AdminCard>
                  );
                })}
              </div>
            ))}

            {/* Unassigned Volunteers */}
            {(() => {
              const assignedIds = new Set(assignments.map((a: any) => a.volunteer_id));
              const unassigned = records.filter((r) => !assignedIds.has(r.id) && r.pipeline_status !== "declined");
              if (unassigned.length === 0) return null;

              return (
                <div className="mt-6">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--admin-muted-foreground))] px-1 mb-2">
                    Unassigned Volunteers ({unassigned.length})
                  </h4>
                  <AdminCard>
                    <AdminCardContent className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {unassigned.map((v) => (
                          <span
                            key={v.id}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[hsl(var(--admin-muted)/0.3)] text-[hsl(var(--admin-text-secondary))]"
                          >
                            <User className="w-3 h-3" />
                            {String(v.name || "")}
                          </span>
                        ))}
                      </div>
                    </AdminCardContent>
                  </AdminCard>
                </div>
              );
            })()}
          </div>
        )}
      </AdminSheetContent>
    </AdminSheet>
  );
}
