import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export type NoteType = "note" | "call" | "email" | "meeting" | "message";

interface PipelineNote {
  id: string;
  entity_type: string;
  entity_id: string;
  content: string;
  note_type: NoteType;
  created_at: string;
  created_by: string | null;
}

export function usePipelineNotes(entityType: string, entityId?: string) {
  const queryClient = useQueryClient();
  const [isDeletingNote, setIsDeletingNote] = useState<string | null>(null);

  const queryKey = ["pipeline-notes", entityType, entityId];

  const { data: notes = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!entityId) return [];
      
      const { data, error } = await supabase
        .from("pipeline_notes")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map(note => ({
        ...note,
        note_type: (note.note_type || "note") as NoteType,
      })) as PipelineNote[];
    },
    enabled: !!entityId,
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ content, noteType }: { content: string; noteType: NoteType }) => {
      if (!entityId) throw new Error("No entity selected");
      
      const { data: session } = await supabase.auth.getSession();
      
      const { data, error } = await supabase
        .from("pipeline_notes")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          content,
          note_type: noteType,
          created_by: session?.session?.user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Interaction logged");
    },
    onError: (error) => {
      console.error("Failed to log interaction:", error);
      toast.error("Failed to log interaction");
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
      const { error } = await supabase
        .from("pipeline_notes")
        .update({ content })
        .eq("id", noteId);

      if (error) throw error;
      return noteId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Entry updated");
    },
    onError: (error) => {
      console.error("Failed to update entry:", error);
      toast.error("Failed to update entry");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      setIsDeletingNote(noteId);
      
      const { error } = await supabase
        .from("pipeline_notes")
        .delete()
        .eq("id", noteId);

      if (error) throw error;
      return noteId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Entry deleted");
      setIsDeletingNote(null);
    },
    onError: (error) => {
      console.error("Failed to delete entry:", error);
      toast.error("Failed to delete entry");
      setIsDeletingNote(null);
    },
  });

  return {
    notes,
    isLoading,
    addNote: (content: string, noteType: NoteType = "note") => 
      addNoteMutation.mutateAsync({ content, noteType }),
    updateNote: (noteId: string, content: string) =>
      updateNoteMutation.mutateAsync({ noteId, content }),
    deleteNote: deleteNoteMutation.mutate,
    isAddingNote: addNoteMutation.isPending,
    isUpdatingNote: updateNoteMutation.isPending,
    isDeletingNote,
  };
}
