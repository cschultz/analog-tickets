/**
 * BulkStageChangeSheet - Sheet for changing stage of multiple records at once
 */

import { useState } from "react";
import { usePipeline } from "./PipelineContext";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
  AdminSheetFooter,
} from "@/components/admin/AdminSheet";
import { AdminButton, AdminBadge, getIntentFromColor } from "@/components/admin";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkStageChangeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onComplete: () => void;
}

export function BulkStageChangeSheet({
  open,
  onOpenChange,
  selectedIds,
  onComplete,
}: BulkStageChangeSheetProps) {
  const { config, stages, records, updateStatus, clearSelection } = usePipeline();
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Get current stages of selected records for preview
  const selectedRecords = records.filter(r => selectedIds.includes(r.id));
  const currentStages = [...new Set(selectedRecords.map(r => r.pipeline_status))];

  const handleApply = async () => {
    if (!selectedStage) return;
    
    setIsUpdating(true);
    try {
      // Update each record's status
      for (const id of selectedIds) {
        updateStatus(id, selectedStage);
      }
      onComplete();
      clearSelection();
      onOpenChange(false);
    } finally {
      setIsUpdating(false);
      setSelectedStage(null);
    }
  };

  const handleClose = () => {
    setSelectedStage(null);
    onOpenChange(false);
  };

  return (
    <AdminSheet open={open} onOpenChange={handleClose}>
      <AdminSheetContent>
        <AdminSheetHeader>
          <AdminSheetTitle>Move to Stage</AdminSheetTitle>
          <AdminSheetDescription>
            Move {selectedIds.length} {selectedIds.length === 1 ? config?.name_singular?.toLowerCase() : config?.name_plural?.toLowerCase()} to a new stage
          </AdminSheetDescription>
        </AdminSheetHeader>

        <div className="py-6 space-y-6">
          {/* Current stages preview */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[hsl(var(--admin-muted-foreground))] uppercase tracking-wide">
              Currently in
            </p>
            <div className="flex flex-wrap gap-2">
              {currentStages.map(stageSlug => {
                const stage = stages.find(s => s.slug === stageSlug);
                if (!stage) return null;
                const count = selectedRecords.filter(r => r.pipeline_status === stageSlug).length;
                return (
                  <AdminBadge key={stageSlug} intent={getIntentFromColor(stage.color)} size="sm">
                    {stage.name} ({count})
                  </AdminBadge>
                );
              })}
            </div>
          </div>

          {/* Stage selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[hsl(var(--admin-muted-foreground))] uppercase tracking-wide">
              Move to
            </p>
            <div className="space-y-2">
              {stages.map(stage => {
                const intent = getIntentFromColor(stage.color);
                const isSelected = selectedStage === stage.slug;
                const recordsInStage = selectedRecords.filter(r => r.pipeline_status === stage.slug).length;
                const allInStage = recordsInStage === selectedIds.length;
                
                return (
                  <AdminButton
                    key={stage.id}
                    variant="ghost"
                    onClick={() => setSelectedStage(stage.slug)}
                    disabled={allInStage}
                    className={cn(
                      "w-full flex items-center justify-between p-3 h-auto rounded-lg border transition-all",
                      "text-left",
                      isSelected
                        ? "border-[hsl(var(--admin-accent))] bg-[hsl(var(--admin-accent-subtle))]"
                        : "border-[hsl(var(--admin-border))] hover:border-[hsl(var(--admin-accent))] hover:bg-[hsl(var(--admin-surface-hover))]",
                      allInStage && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="font-medium text-[hsl(var(--admin-foreground))]">
                        {stage.name}
                      </span>
                      {allInStage && (
                        <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                          (all selected already here)
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[hsl(var(--admin-accent))]" />
                    )}
                  </AdminButton>
                );
              })}
            </div>
          </div>

          {/* Preview of change */}
          {selectedStage && (
            <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[hsl(var(--admin-muted-foreground))]">
                  {selectedIds.length} records will be moved to
                </span>
                <ArrowRight className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                <AdminBadge 
                  intent={getIntentFromColor(stages.find(s => s.slug === selectedStage)?.color || "gray")} 
                  size="sm"
                >
                  {stages.find(s => s.slug === selectedStage)?.name}
                </AdminBadge>
              </div>
            </div>
          )}
        </div>

        <AdminSheetFooter>
          <AdminButton variant="adminOutline" onClick={handleClose}>
            Cancel
          </AdminButton>
          <AdminButton
            variant="admin"
            onClick={handleApply}
            disabled={!selectedStage || isUpdating}
          >
            {isUpdating ? "Moving..." : "Move Records"}
          </AdminButton>
        </AdminSheetFooter>
      </AdminSheetContent>
    </AdminSheet>
  );
}
