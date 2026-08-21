import { useState } from "react";
import { usePipeline } from "../PipelineContext";
import { useAllPipelineConfigs, PipelineConfig } from "@/hooks/usePipelineConfig";
import { useMoveToAnotherPipeline } from "@/hooks/useMoveToAnotherPipeline";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
  AdminSheetFooter,
  AdminButton,
} from "@/components/admin";
import { ArrowRightLeft, Wine, Store, Music, Palette, Handshake, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const PIPELINE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  vendor: Store,
  artist: Music,
  artisan: Palette,
  partner: Handshake,
  winecamp: Wine,
  volunteer: Users,
};

interface MoveToPipelineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function MoveToPipelineDialog({ open, onOpenChange, onSuccess }: MoveToPipelineSheetProps) {
  const { config, selectedRecord, setSelectedRecord, setIsDrawerOpen } = usePipeline();
  const { data: allConfigs, isLoading } = useAllPipelineConfigs();
  const moveMutation = useMoveToAnotherPipeline();
  const [selectedTarget, setSelectedTarget] = useState<PipelineConfig | null>(null);

  if (!config || !selectedRecord) return null;

  // Filter out the current pipeline
  const availableTargets = allConfigs?.filter(c => c.slug !== config.slug) || [];

  const handleMove = async () => {
    if (!selectedTarget) return;

    await moveMutation.mutateAsync({
      record: selectedRecord,
      sourceConfig: config,
      targetConfig: selectedTarget,
    });

    // Close everything
    onOpenChange(false);
    setSelectedTarget(null);
    setSelectedRecord(null);
    setIsDrawerOpen(false);
    onSuccess?.();
  };

  const recordName = selectedRecord.name || selectedRecord.company_name || selectedRecord.business_name || "this record";

  return (
    <AdminSheet open={open} onOpenChange={onOpenChange}>
      <AdminSheetContent side="right" className="sm:max-w-md">
        <AdminSheetHeader>
          <AdminSheetTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Move to Another Pipeline
          </AdminSheetTitle>
          <AdminSheetDescription>
            Move <strong>{String(recordName)}</strong> from {config.name} to a different pipeline.
            Common fields like name, email, and notes will be preserved.
          </AdminSheetDescription>
        </AdminSheetHeader>

        <div className="py-6 flex-1">
          <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mb-3">
            Select destination:
          </p>
          
          <div className="grid gap-2">
            {isLoading ? (
              <div className="text-center py-4 text-sm text-[hsl(var(--admin-muted-foreground))]">
                Loading pipelines...
              </div>
            ) : availableTargets.length === 0 ? (
              <div className="text-center py-4 text-sm text-[hsl(var(--admin-muted-foreground))]">
                No other pipelines available
              </div>
            ) : (
              availableTargets.map(target => {
                const Icon = PIPELINE_ICONS[target.slug] || Store;
                const isSelected = selectedTarget?.slug === target.slug;
                
                return (
                  <AdminButton
                    key={target.id}
                    variant="adminOutline"
                    onClick={() => setSelectedTarget(target)}
                    className={cn(
                      "h-auto flex items-center gap-3 p-3 justify-start text-left",
                      isSelected && "border-[hsl(var(--admin-primary))] bg-[hsl(var(--admin-primary)/0.1)]"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      isSelected 
                        ? "bg-[hsl(var(--admin-primary))] text-[hsl(var(--admin-primary-foreground))]"
                        : "bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))]"
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium text-sm",
                        isSelected 
                          ? "text-[hsl(var(--admin-primary))]" 
                          : "text-[hsl(var(--admin-foreground))]"
                      )}>
                        {target.name}
                      </p>
                      <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                        {target.name_plural}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--admin-primary))] shrink-0" />
                    )}
                  </AdminButton>
                );
              })
            )}
          </div>
        </div>

        <AdminSheetFooter className="flex-row gap-2 sm:justify-end">
          <AdminButton
            variant="adminOutline"
            onClick={() => onOpenChange(false)}
            disabled={moveMutation.isPending}
          >
            Cancel
          </AdminButton>
          <AdminButton
            variant="admin"
            onClick={handleMove}
            disabled={!selectedTarget || moveMutation.isPending}
          >
            {moveMutation.isPending ? "Moving..." : "Move Record"}
          </AdminButton>
        </AdminSheetFooter>
      </AdminSheetContent>
    </AdminSheet>
  );
}
