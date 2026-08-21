import { useAuthQuery } from "@/hooks/useAuthQuery";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Types
export interface VolunteerRole {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  color: string | null;
  is_lead_role: boolean;
  is_active: boolean | null;
  max_volunteers: number | null;
  display_order: number | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VolunteerShift {
  id: string;
  role_id: string;
  event_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  max_volunteers: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  role?: VolunteerRole;
  assignments?: VolunteerShiftAssignment[];
}

export interface VolunteerShiftAssignment {
  id: string;
  shift_id: string;
  volunteer_id: string;
  role_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  volunteer?: { id: string; name: string; email: string | null };
}

// ============ ROLES ============

export function useVolunteerRoles(eventId?: string | null) {
  return useAuthQuery({
    queryKey: ["volunteer-roles", eventId],
    queryFn: async () => {
      let query = supabase
        .from("volunteer_roles")
        .select("*")
        .order("display_order", { ascending: true });

      if (eventId) {
        query = query.or(`event_id.eq.${eventId},event_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as VolunteerRole[];
    },
  });
}

export function useCreateVolunteerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (role: { name: string; category?: string; description?: string; color?: string; is_lead_role?: boolean; event_id?: string }) => {
      // Get max display_order
      const { data: maxOrder } = await supabase
        .from("volunteer_roles")
        .select("display_order")
        .order("display_order", { ascending: false })
        .limit(1)
        .single();

      const { data, error } = await supabase
        .from("volunteer_roles")
        .insert({ ...role, display_order: (maxOrder?.display_order || 0) + 1 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-roles"] });
      toast.success("Role created");
    },
    onError: (e: Error) => toast.error("Failed to create role: " + e.message),
  });
}

export function useUpdateVolunteerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<VolunteerRole> & { id: string }) => {
      const { error } = await supabase
        .from("volunteer_roles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-roles"] });
    },
    onError: (e: Error) => toast.error("Failed to update role: " + e.message),
  });
}

export function useDeleteVolunteerRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("volunteer_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-roles"] });
      toast.success("Role deleted");
    },
    onError: (e: Error) => toast.error("Failed to delete role: " + e.message),
  });
}

// ============ SHIFTS ============

export function useVolunteerShifts(eventId?: string | null, roleId?: string) {
  return useAuthQuery({
    queryKey: ["volunteer-shifts", eventId, roleId],
    queryFn: async () => {
      let query = supabase
        .from("volunteer_shifts")
        .select("*, volunteer_roles(*)")
        .order("start_time", { ascending: true });

      if (eventId) query = query.eq("event_id", eventId);
      if (roleId) query = query.eq("role_id", roleId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((s: any) => ({ ...s, role: s.volunteer_roles })) as VolunteerShift[];
    },
    enabled: !!eventId || !roleId,
  });
}

export function useCreateVolunteerShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shift: { role_id: string; event_id?: string; name: string; start_time: string; end_time: string; max_volunteers?: number; notes?: string }) => {
      const { data, error } = await supabase
        .from("volunteer_shifts")
        .insert(shift)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-shifts"] });
      toast.success("Shift created");
    },
    onError: (e: Error) => toast.error("Failed to create shift: " + e.message),
  });
}

export function useUpdateVolunteerShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<VolunteerShift> & { id: string }) => {
      const { error } = await supabase
        .from("volunteer_shifts")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-shifts"] });
    },
    onError: (e: Error) => toast.error("Failed to update shift: " + e.message),
  });
}

export function useDeleteVolunteerShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("volunteer_shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-shifts"] });
      toast.success("Shift deleted");
    },
    onError: (e: Error) => toast.error("Failed to delete shift: " + e.message),
  });
}

// ============ ASSIGNMENTS ============

export function useShiftAssignments(shiftId?: string) {
  return useAuthQuery({
    queryKey: ["volunteer-shift-assignments", shiftId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("volunteer_shift_assignments")
        .select("*, volunteers(id, name, email)")
        .eq("shift_id", shiftId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((a: any) => ({ ...a, volunteer: a.volunteers })) as VolunteerShiftAssignment[];
    },
    enabled: !!shiftId,
  });
}

export function useAllShiftAssignments(eventId?: string | null) {
  return useAuthQuery({
    queryKey: ["volunteer-shift-assignments-all", eventId],
    queryFn: async () => {
      // Get all shift IDs for this event first
      const { data: shifts, error: shiftsError } = await supabase
        .from("volunteer_shifts")
        .select("id")
        .eq("event_id", eventId!);
      if (shiftsError) throw shiftsError;
      if (!shifts || shifts.length === 0) return [];

      const shiftIds = shifts.map((s: any) => s.id);
      const { data, error } = await supabase
        .from("volunteer_shift_assignments")
        .select("*")
        .in("shift_id", shiftIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
  });
}

export function useVolunteerAssignments(volunteerId?: string) {
  return useAuthQuery({
    queryKey: ["volunteer-assignments-by-volunteer", volunteerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("volunteer_shift_assignments")
        .select("*, volunteer_shifts(id, name, start_time, end_time, role_id, max_volunteers), volunteer_roles(id, name, color, category)")
        .eq("volunteer_id", volunteerId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((a: any) => ({
        ...a,
        shift: a.volunteer_shifts,
        role: a.volunteer_roles,
      }));
    },
    enabled: !!volunteerId,
  });
}

export function useCreateShiftAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignment: { shift_id: string; volunteer_id: string; role_id: string; status?: string; notes?: string }) => {
      const { data, error } = await supabase
        .from("volunteer_shift_assignments")
        .insert(assignment)
        .select()
        .single();
      if (error) throw error;

      // Auto-move volunteer to "scheduled" stage
      await supabase
        .from("volunteers")
        .update({ pipeline_status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", assignment.volunteer_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-shift-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-shift-assignments-all"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-assignments-by-volunteer"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-records"] });
      toast.success("Volunteer assigned & moved to Scheduled");
    },
    onError: (e: Error) => toast.error("Failed to assign: " + e.message),
  });
}

export function useUpdateShiftAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; notes?: string }) => {
      const { error } = await supabase
        .from("volunteer_shift_assignments")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-shift-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-assignments-by-volunteer"] });
    },
    onError: (e: Error) => toast.error("Failed to update assignment: " + e.message),
  });
}

export function useDeleteShiftAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("volunteer_shift_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volunteer-shift-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-shift-assignments-all"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-assignments-by-volunteer"] });
      queryClient.invalidateQueries({ queryKey: ["volunteer-shifts"] });
      toast.success("Assignment removed");
    },
    onError: (e: Error) => toast.error("Failed to remove assignment: " + e.message),
  });
}

// Get assignment counts per shift for capacity tracking
export function useShiftAssignmentCounts(eventId?: string | null) {
  return useAuthQuery({
    queryKey: ["volunteer-shift-assignment-counts", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("volunteer_shift_assignments")
        .select("shift_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((a: any) => {
        counts[a.shift_id] = (counts[a.shift_id] || 0) + 1;
      });
      return counts;
    },
    enabled: true,
  });
}
