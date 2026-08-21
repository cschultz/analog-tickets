import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EntityType = "artist" | "artisan" | "vendor" | "partner" | "volunteer";

export interface EntityOwnership {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  event_id: string;
  owner_id: string | null;
  collaborator_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
}

interface UseEntityOwnershipOptions {
  entityType: EntityType;
  entityId: string;
  eventId: string | null;
}

export function useEntityOwnership({ entityType, entityId, eventId }: UseEntityOwnershipOptions) {
  const queryClient = useQueryClient();
  
  const queryKey = ["entity-ownership", entityType, entityId, eventId];

  const { data: ownership, isLoading } = useAuthQuery({
    queryKey: queryKey,
    queryFn: async () => {
      // Guard against empty string eventId (invalid UUID)
      if (!eventId || eventId === "") return null;
      
      const { data, error } = await supabase
        .from("entity_ownership")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("event_id", eventId)
        .maybeSingle();
      
      if (error) throw error;
      return data as EntityOwnership | null;
    },
    enabled: !!eventId,
  });

  const setOwner = useMutation({
    mutationFn: async (ownerId: string | null) => {
      if (!eventId || eventId === "") throw new Error("No event selected");
      
      const { error } = await supabase
        .from("entity_ownership")
        .upsert({
          entity_type: entityType,
          entity_id: entityId,
          event_id: eventId,
          owner_id: ownerId,
          collaborator_ids: ownership?.collaborator_ids || [],
        }, {
          onConflict: "entity_type,entity_id,event_id",
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Owner updated");
    },
    onError: () => {
      toast.error("Failed to update owner");
    },
  });

  const addCollaborator = useMutation({
    mutationFn: async (collaboratorId: string) => {
      if (!eventId || eventId === "") throw new Error("No event selected");
      
      const currentCollaborators = ownership?.collaborator_ids || [];
      if (currentCollaborators.includes(collaboratorId)) return;
      
      const { error } = await supabase
        .from("entity_ownership")
        .upsert({
          entity_type: entityType,
          entity_id: entityId,
          event_id: eventId,
          owner_id: ownership?.owner_id || null,
          collaborator_ids: [...currentCollaborators, collaboratorId],
        }, {
          onConflict: "entity_type,entity_id,event_id",
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Collaborator added");
    },
    onError: () => {
      toast.error("Failed to add collaborator");
    },
  });

  const removeCollaborator = useMutation({
    mutationFn: async (collaboratorId: string) => {
      if (!eventId || !ownership) throw new Error("No ownership record");
      
      const { error } = await supabase
        .from("entity_ownership")
        .update({
          collaborator_ids: ownership.collaborator_ids.filter(id => id !== collaboratorId),
        })
        .eq("id", ownership.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Collaborator removed");
    },
    onError: () => {
      toast.error("Failed to remove collaborator");
    },
  });

  return {
    ownership,
    isLoading,
    ownerId: ownership?.owner_id || null,
    collaboratorIds: ownership?.collaborator_ids || [],
    setOwner: setOwner.mutate,
    addCollaborator: addCollaborator.mutate,
    removeCollaborator: removeCollaborator.mutate,
    isUpdating: setOwner.isPending || addCollaborator.isPending || removeCollaborator.isPending,
  };
}

// Hook to fetch admin users for the picker
export function useAdminUsers() {
  return useAuthQuery({
    queryKey: ["admin-users-for-picker"],
    queryFn: async () => {
      // Get all admin user IDs
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      
      if (rolesError) throw rolesError;
      
      const adminIds = roles?.map(r => r.user_id) || [];
      if (adminIds.length === 0) return [];
      
      // Filter out any empty strings or invalid UUIDs
      const validAdminIds = adminIds.filter(id => id && id.trim() !== '');
      if (validAdminIds.length === 0) return [];
      
      // Get profiles for these admins
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", validAdminIds);
      
      if (profilesError) throw profilesError;
      
      return (profiles || []) as AdminProfile[];
    },
  });
}
