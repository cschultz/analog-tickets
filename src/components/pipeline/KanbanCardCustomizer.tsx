/**
 * KanbanCardCustomizer - Settings sheet for customizing which fields appear on Kanban cards
 */

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePipeline } from "./PipelineContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
  AdminSheetFooter,
} from "@/components/admin/AdminSheet";
import { AdminButton } from "@/components/admin";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface KanbanCardCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KanbanCardCustomizer({ open, onOpenChange }: KanbanCardCustomizerProps) {
  const { config, fields } = usePipeline();
  const queryClient = useQueryClient();

  // Local state for field visibility
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, boolean>>({});

  // Initialize from current field settings
  useEffect(() => {
    if (fields.length > 0) {
      const visibility: Record<string, boolean> = {};
      fields.forEach(field => {
        visibility[field.id] = field.show_in_card;
      });
      setFieldVisibility(visibility);
    }
  }, [fields, open]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: { id: string; show_in_card: boolean }[]) => {
      // Update each field
      for (const update of updates) {
        const { error } = await supabase
          .from("pipeline_fields")
          .update({ show_in_card: update.show_in_card })
          .eq("id", update.id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-fields", config?.id] });
      toast.success("Card fields updated");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const handleSave = () => {
    const updates = Object.entries(fieldVisibility).map(([id, show_in_card]) => ({
      id,
      show_in_card,
    }));
    updateMutation.mutate(updates);
  };

  const toggleField = (fieldId: string) => {
    setFieldVisibility(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId],
    }));
  };

  // Filter out system fields that shouldn't be toggled (like pipeline_status)
  const editableFields = fields.filter(f => !f.is_system || f.slug !== "pipeline_status");

  // Count visible fields
  const visibleCount = Object.values(fieldVisibility).filter(Boolean).length;

  return (
    <AdminSheet open={open} onOpenChange={onOpenChange}>
      <AdminSheetContent>
        <AdminSheetHeader>
          <AdminSheetTitle>Customize Card Fields</AdminSheetTitle>
          <AdminSheetDescription>
            Choose which fields appear on Kanban cards. More fields = more info, but larger cards.
          </AdminSheetDescription>
        </AdminSheetHeader>

        <div className="py-6 space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]">
            <span className="text-sm text-[hsl(var(--admin-muted-foreground))]">
              Fields shown on cards
            </span>
            <span className="text-sm font-medium text-[hsl(var(--admin-foreground))]">
              {visibleCount} of {editableFields.length}
            </span>
          </div>

          {/* Field list */}
          <div className="space-y-1">
            {editableFields.map(field => {
              const isVisible = fieldVisibility[field.id] ?? field.show_in_card;
              
              return (
                <div
                  key={field.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors",
                    "hover:bg-[hsl(var(--admin-surface-hover))]",
                    isVisible && "bg-[hsl(var(--admin-accent-subtle))]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))] cursor-grab" />
                    <div>
                      <p className="text-sm font-medium text-[hsl(var(--admin-foreground))]">
                        {field.name}
                      </p>
                      <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                        {field.field_type}
                      </p>
                    </div>
                  </div>
                  <AdminButton
                    variant={isVisible ? "admin" : "adminOutline"}
                    size="sm"
                    onClick={() => toggleField(field.id)}
                    className="h-8 w-8 p-0"
                  >
                    {isVisible ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </AdminButton>
                </div>
              );
            })}
          </div>

          {editableFields.length === 0 && (
            <div className="text-center py-8 text-[hsl(var(--admin-muted-foreground))]">
              <p className="text-sm">No customizable fields available</p>
            </div>
          )}
        </div>

        <AdminSheetFooter>
          <AdminButton variant="adminOutline" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton
            variant="admin"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </AdminButton>
        </AdminSheetFooter>
      </AdminSheetContent>
    </AdminSheet>
  );
}
