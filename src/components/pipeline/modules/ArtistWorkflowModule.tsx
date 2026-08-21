/**
 * ArtistWorkflowModule
 * 
 * Shared workflow checklist for artists. Items are global (same list for all artists),
 * completions are tracked per-artist. Admins can add new items from any artist view.
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePipeline } from "../PipelineContext";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { AdminButton, AdminInput } from "@/components/admin";
import { CheckSquare, Square, Plus, Loader2, ListChecks, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface WorkflowItem {
  id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

interface WorkflowCompletion {
  id: string;
  workflow_item_id: string;
  artist_id: string;
  completed_at: string;
  completed_by: string | null;
}

export function ArtistWorkflowModule() {
  const { config, selectedRecord } = usePipeline();
  const queryClient = useQueryClient();
  const [newItemLabel, setNewItemLabel] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const isArtist = config?.slug === "artist";
  const artistId = selectedRecord?.id as string;

  // Fetch shared workflow items
  const { data: items = [], isLoading: itemsLoading } = useAuthQuery({
    queryKey: ["artist-workflow-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artist_workflow_items")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as WorkflowItem[];
    },
    enabled: isArtist,
  });

  // Fetch completions for this artist
  const { data: completions = [], isLoading: completionsLoading } = useAuthQuery({
    queryKey: ["artist-workflow-completions", artistId],
    queryFn: async () => {
      if (!artistId) return [];
      const { data, error } = await supabase
        .from("artist_workflow_completions")
        .select("*")
        .eq("artist_id", artistId);
      if (error) throw error;
      return data as WorkflowCompletion[];
    },
    enabled: isArtist && !!artistId,
  });

  const completedItemIds = new Set(completions.map(c => c.workflow_item_id));

  const handleToggle = useCallback(async (itemId: string) => {
    if (!artistId) return;
    setTogglingIds(prev => new Set([...prev, itemId]));

    try {
      const isCompleted = completedItemIds.has(itemId);

      if (isCompleted) {
        // Remove completion
        const { error } = await supabase
          .from("artist_workflow_completions")
          .delete()
          .eq("workflow_item_id", itemId)
          .eq("artist_id", artistId);
        if (error) throw error;
      } else {
        // Add completion
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("artist_workflow_completions")
          .insert({
            workflow_item_id: itemId,
            artist_id: artistId,
            completed_by: user?.id || null,
          });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["artist-workflow-completions", artistId] });
    } catch (error: any) {
      toast.error("Failed to update: " + error.message);
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }, [artistId, completedItemIds, queryClient]);

  const handleAddItem = useCallback(async () => {
    const label = newItemLabel.trim();
    if (!label) return;

    setIsAdding(true);
    try {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) : 0;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("artist_workflow_items")
        .insert({
          label,
          sort_order: maxOrder + 1,
          created_by: user?.id || null,
        });
      if (error) throw error;

      setNewItemLabel("");
      queryClient.invalidateQueries({ queryKey: ["artist-workflow-items"] });
      toast.success("Workflow item added for all artists");
    } catch (error: any) {
      toast.error("Failed to add: " + error.message);
    } finally {
      setIsAdding(false);
    }
  }, [newItemLabel, items, queryClient]);

  const handleDeleteItem = useCallback(async (itemId: string, label: string) => {
    try {
      const { error } = await supabase
        .from("artist_workflow_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["artist-workflow-items"] });
      queryClient.invalidateQueries({ queryKey: ["artist-workflow-completions"] });
      toast.success(`Removed "${label}" from all artists`);
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    }
  }, [queryClient]);

  if (!isArtist || !selectedRecord) {
    return (
      <div className="py-8 text-center text-sm text-[hsl(var(--admin-muted-foreground))]">
        Workflow is only available for artists.
      </div>
    );
  }

  const isLoading = itemsLoading || completionsLoading;
  const completedCount = items.filter(i => completedItemIds.has(i.id)).length;
  const totalCount = items.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
          <h3 className="text-sm font-medium text-[hsl(var(--admin-foreground))]">Workflow</h3>
          {totalCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--admin-muted)/0.3)] text-[hsl(var(--admin-muted-foreground))] font-medium">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
        {totalCount > 0 && (
          <div className="h-1.5 w-24 rounded-full bg-[hsl(var(--admin-muted)/0.3)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[hsl(var(--admin-success))] transition-all duration-300"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-[hsl(var(--admin-muted-foreground))]">Loading...</div>
      ) : (
        <>
          {/* Checklist */}
          <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))] overflow-hidden divide-y divide-[hsl(var(--admin-border)/0.5)]">
            {items.length === 0 ? (
              <div className="py-8 text-center text-xs text-[hsl(var(--admin-muted-foreground))]">
                No workflow items yet. Add one below.
              </div>
            ) : (
              items.map(item => {
                const isCompleted = completedItemIds.has(item.id);
                const isToggling = togglingIds.has(item.id);
                const completion = completions.find(c => c.workflow_item_id === item.id);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 group transition-colors",
                      isCompleted
                        ? "bg-[hsl(var(--admin-success)/0.04)]"
                        : "hover:bg-[hsl(var(--admin-surface))]"
                    )}
                  >
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(item.id)}
                      disabled={isToggling}
                      className="h-auto p-0 hover:bg-transparent shrink-0"
                    >
                      {isToggling ? (
                        <Loader2 className="w-4.5 h-4.5 animate-spin text-[hsl(var(--admin-muted-foreground))]" />
                      ) : isCompleted ? (
                        <CheckSquare className="w-4.5 h-4.5 text-[hsl(var(--admin-success))]" />
                      ) : (
                        <Square className="w-4.5 h-4.5 text-[hsl(var(--admin-muted-foreground))]" />
                      )}
                    </AdminButton>

                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "text-sm",
                        isCompleted
                          ? "text-[hsl(var(--admin-muted-foreground))] line-through"
                          : "text-[hsl(var(--admin-foreground))]"
                      )}>
                        {item.label}
                      </span>
                      {isCompleted && completion && (
                        <p className="text-[10px] text-[hsl(var(--admin-muted-foreground))] mt-0.5">
                          Completed {formatDistanceToNow(new Date(completion.completed_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>

                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteItem(item.id, item.label)}
                      className="h-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-destructive))]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </AdminButton>
                  </div>
                );
              })
            )}
          </div>

          {/* Add new item */}
          <div className="flex items-center gap-2">
            <AdminInput
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              placeholder="Add a workflow step..."
              className="flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItemLabel.trim()) handleAddItem();
              }}
            />
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={handleAddItem}
              disabled={!newItemLabel.trim() || isAdding}
            >
              {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Add
            </AdminButton>
          </div>
          <p className="text-[10px] text-[hsl(var(--admin-muted-foreground))]">
            Adding or removing items applies to all artists.
          </p>
        </>
      )}
    </div>
  );
}
