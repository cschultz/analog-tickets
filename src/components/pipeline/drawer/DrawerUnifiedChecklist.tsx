/**
 * DrawerUnifiedChecklist
 * 
 * Merges auto-progress items (from DrawerProgressChecklist) with
 * manual workflow items (from ArtistWorkflowModule) into one unified list.
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePipeline } from "../PipelineContext";
import { usePipelineDrawerCounts } from "@/hooks/usePipelineDrawerCounts";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { AdminButton, AdminInput } from "@/components/admin";
import { 
  Check, 
  Square, 
  CheckSquare, 
  Plus, 
  Loader2, 
  ListChecks, 
  Trash2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
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

interface AutoCheckItem {
  key: string;
  label: string;
  completed: boolean;
}

export function DrawerUnifiedChecklist() {
  const { config, selectedRecord } = usePipeline();
  const queryClient = useQueryClient();
  const counts = usePipelineDrawerCounts();
  const [isExpanded, setIsExpanded] = useState(true);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const isArtist = config?.slug === "artist";
  const artistId = selectedRecord?.id as string;

  // Fetch workflow items (artist only)
  const { data: workflowItems = [], isLoading: itemsLoading } = useAuthQuery({
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

  // Build auto-check items from pipeline module counts
  const autoItems: AutoCheckItem[] = [];
  if (config?.has_contacts) {
    autoItems.push({ key: "contact", label: "Contact added", completed: counts.contacts > 0 });
  }
  if (config?.has_contracts) {
    autoItems.push({ key: "contract", label: "Contract sent", completed: counts.contracts > 0 });
  }
  if (config?.has_documents) {
    autoItems.push({ key: "docs", label: "Documents uploaded", completed: counts.documents > 0 });
  }

  // Calculate totals
  const autoCompleted = autoItems.filter(i => i.completed).length;
  const workflowCompleted = workflowItems.filter(i => completedItemIds.has(i.id)).length;
  const totalCompleted = autoCompleted + workflowCompleted;
  const totalCount = autoItems.length + workflowItems.length;
  const progressPercent = totalCount > 0 ? Math.round((totalCompleted / totalCount) * 100) : 0;
  const isComplete = totalCompleted === totalCount && totalCount > 0;

  // Toggle workflow item
  const handleToggle = useCallback(async (itemId: string) => {
    if (!artistId) return;
    setTogglingIds(prev => new Set([...prev, itemId]));
    try {
      const isCompleted = completedItemIds.has(itemId);
      if (isCompleted) {
        const { error } = await supabase
          .from("artist_workflow_completions")
          .delete()
          .eq("workflow_item_id", itemId)
          .eq("artist_id", artistId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("artist_workflow_completions")
          .insert({ workflow_item_id: itemId, artist_id: artistId, completed_by: user?.id || null });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["artist-workflow-completions", artistId] });
    } catch (error: any) {
      toast.error("Failed to update: " + error.message);
    } finally {
      setTogglingIds(prev => { const next = new Set(prev); next.delete(itemId); return next; });
    }
  }, [artistId, completedItemIds, queryClient]);

  // Add workflow item
  const handleAddItem = useCallback(async () => {
    const label = newItemLabel.trim();
    if (!label) return;
    setIsAdding(true);
    try {
      const maxOrder = workflowItems.length > 0 ? Math.max(...workflowItems.map(i => i.sort_order)) : 0;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("artist_workflow_items")
        .insert({ label, sort_order: maxOrder + 1, created_by: user?.id || null });
      if (error) throw error;
      setNewItemLabel("");
      queryClient.invalidateQueries({ queryKey: ["artist-workflow-items"] });
      toast.success("Workflow item added for all artists");
    } catch (error: any) {
      toast.error("Failed to add: " + error.message);
    } finally {
      setIsAdding(false);
    }
  }, [newItemLabel, workflowItems, queryClient]);

  // Delete workflow item
  const handleDeleteItem = useCallback(async (itemId: string, label: string) => {
    try {
      const { error } = await supabase.from("artist_workflow_items").delete().eq("id", itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["artist-workflow-items"] });
      queryClient.invalidateQueries({ queryKey: ["artist-workflow-completions"] });
      toast.success(`Removed "${label}" from all artists`);
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    }
  }, [queryClient]);

  if (!config || !selectedRecord) return null;
  if (totalCount === 0 && !isArtist) return null;

  const isLoading = itemsLoading || completionsLoading;

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))] overflow-hidden">
      {/* Header */}
      <AdminButton
        variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between px-4 py-2.5 h-auto rounded-none hover:bg-[hsl(var(--admin-muted)/0.08)] border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ListChecks className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
          <span className="text-xs font-medium text-[hsl(var(--admin-foreground))]">Checklist</span>
          {totalCount > 0 && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              isComplete
                ? "bg-[hsl(var(--admin-success)/0.15)] text-[hsl(var(--admin-success))]"
                : "bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))]"
            )}>
              {totalCompleted}/{totalCount}
            </span>
          )}
          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="w-16 h-1.5 bg-[hsl(var(--admin-muted)/0.2)] rounded-full overflow-hidden shrink-0">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  isComplete ? "bg-[hsl(var(--admin-success))]" : "bg-[hsl(var(--admin-primary))]"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
        )}
      </AdminButton>

      {isExpanded && (
        <div className="divide-y divide-[hsl(var(--admin-border)/0.5)]">
          {isLoading ? (
            <div className="py-6 text-center text-xs text-[hsl(var(--admin-muted-foreground))]">
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            </div>
          ) : (
            <>
              {/* Auto-progress items */}
              {autoItems.map(item => (
                <div key={item.key} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                    item.completed
                      ? "bg-[hsl(var(--admin-success))] border-[hsl(var(--admin-success))]"
                      : "border-[hsl(var(--admin-border))] bg-transparent"
                  )}>
                    {item.completed && <Check className="w-3 h-3 text-[hsl(var(--admin-card))]" />}
                  </div>
                  <span className={cn(
                    "text-xs",
                    item.completed
                      ? "text-[hsl(var(--admin-muted-foreground))] line-through opacity-60"
                      : "text-[hsl(var(--admin-foreground))]"
                  )}>
                    {item.label}
                  </span>
                  <span className="text-[9px] ml-auto px-1.5 py-0.5 rounded-full border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] text-[hsl(var(--admin-muted-foreground))] font-medium tracking-wide uppercase">
                    auto
                  </span>
                </div>
              ))}

              {/* Manual workflow items */}
              {workflowItems.map(item => {
                const isCompleted = completedItemIds.has(item.id);
                const isToggling = togglingIds.has(item.id);
                const completion = completions.find(c => c.workflow_item_id === item.id);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 group transition-colors",
                      isCompleted ? "bg-[hsl(var(--admin-success)/0.04)]" : "hover:bg-[hsl(var(--admin-surface))]"
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
                        <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--admin-muted-foreground))]" />
                      ) : isCompleted ? (
                        <CheckSquare className="w-4 h-4 text-[hsl(var(--admin-success))]" />
                      ) : (
                        <Square className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                      )}
                    </AdminButton>

                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "text-xs",
                        isCompleted
                          ? "text-[hsl(var(--admin-muted-foreground))] line-through"
                          : "text-[hsl(var(--admin-foreground))]"
                      )}>
                        {item.label}
                      </span>
                      {isCompleted && completion && (
                        <p className="text-[9px] text-[hsl(var(--admin-muted-foreground))] mt-0.5">
                          {formatDistanceToNow(new Date(completion.completed_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>

                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteItem(item.id, item.label)}
                      className="h-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-destructive))]"
                    >
                      <Trash2 className="w-3 h-3" />
                    </AdminButton>
                  </div>
                );
              })}

              {/* Empty state for workflow */}
              {workflowItems.length === 0 && isArtist && autoItems.length === 0 && (
                <div className="py-6 text-center text-xs text-[hsl(var(--admin-muted-foreground))]">
                  No checklist items yet. Add one below.
                </div>
              )}

              {/* Add new workflow item (artist only) */}
              {isArtist && (
                <div className="p-3 space-y-2 bg-[hsl(var(--admin-bg))]">
                  <div className="flex items-center gap-2">
                    <AdminInput
                      value={newItemLabel}
                      onChange={(e) => setNewItemLabel(e.target.value)}
                      placeholder="Add a workflow step..."
                      className="flex-1 text-xs h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newItemLabel.trim()) handleAddItem();
                      }}
                    />
                    <AdminButton
                      variant="adminOutline"
                      size="sm"
                      onClick={handleAddItem}
                      disabled={!newItemLabel.trim() || isAdding}
                      className="h-8 text-xs"
                    >
                      {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                      Add
                    </AdminButton>
                  </div>
                  <p className="text-[9px] text-[hsl(var(--admin-muted-foreground))]">
                    Adding or removing items applies to all artists.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
