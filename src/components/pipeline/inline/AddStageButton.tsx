import { useState } from "react";
import { useCreatePipelineStage } from "@/hooks/usePipelineAdmin";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin/AdminSheet";
import { AdminButton, AdminInput, AdminBadge, AdminLabel, getIntentFromColor } from "@/components/admin";
import { Plus, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGE_COLORS = [
  { value: "gray", label: "Gray" },
  { value: "blue", label: "Blue" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "red", label: "Red" },
  { value: "purple", label: "Purple" },
  { value: "orange", label: "Orange" },
];

interface AddStageButtonProps {
  pipelineId: string;
  existingStageCount: number;
}

export function AddStageButton({ pipelineId, existingStageCount }: AddStageButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("gray");

  const createStage = useCreatePipelineStage();

  const handleCreate = () => {
    if (!name.trim()) return;

    const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    createStage.mutate(
      {
        pipeline_id: pipelineId,
        slug,
        name: name.trim(),
        color,
        display_order: existingStageCount + 1,
        is_terminal: false,
        is_positive: false,
      },
      {
        onSuccess: () => {
          setName("");
          setColor("gray");
          setOpen(false);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCreate();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="flex-shrink-0 w-[280px] min-h-[200px] border-2 border-dashed border-[hsl(var(--admin-border))] rounded-lg flex items-center justify-center cursor-pointer hover:border-[hsl(var(--admin-accent))] hover:bg-[hsl(var(--admin-surface-hover))] transition-colors group"
      >
        <div className="flex flex-col items-center gap-2 text-[hsl(var(--admin-muted-foreground))] group-hover:text-[hsl(var(--admin-foreground))]">
          <Plus className="w-6 h-6" />
          <span className="text-sm font-medium">Add Stage</span>
        </div>
      </div>

      <AdminSheet open={open} onOpenChange={setOpen}>
        <AdminSheetContent side="right" className="w-[360px]">
          <AdminSheetHeader>
            <AdminSheetTitle>Add Stage</AdminSheetTitle>
            <AdminSheetDescription>
              Create a new stage for this pipeline.
            </AdminSheetDescription>
          </AdminSheetHeader>

          <div className="space-y-6 py-6">
            {/* Stage Name */}
            <div className="space-y-2">
              <AdminLabel htmlFor="new-stage-name" required>Name</AdminLabel>
              <AdminInput
                id="new-stage-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Stage name"
                autoFocus
              />
            </div>

            {/* Color Picker */}
            <div className="space-y-2">
              <AdminLabel className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                Color
              </AdminLabel>
              <div className="flex flex-wrap gap-2">
                {STAGE_COLORS.map((c) => (
                  <AdminButton
                    key={c.value}
                    variant="adminGhost"
                    size="sm"
                    onClick={() => setColor(c.value)}
                    className={cn(
                      "h-auto p-1",
                      color === c.value && "ring-2 ring-[hsl(var(--admin-accent))] ring-offset-2"
                    )}
                  >
                    <AdminBadge intent={getIntentFromColor(c.value)} size="sm">
                      {c.label}
                    </AdminBadge>
                  </AdminButton>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-[hsl(var(--admin-border))]">
              <AdminButton
                variant="adminOutline"
                onClick={() => {
                  setName("");
                  setColor("gray");
                  setOpen(false);
                }}
              >
                Cancel
              </AdminButton>
              <AdminButton
                variant="admin"
                onClick={handleCreate}
                disabled={!name.trim() || createStage.isPending}
              >
                {createStage.isPending ? "Creating..." : "Add Stage"}
              </AdminButton>
            </div>
          </div>
        </AdminSheetContent>
      </AdminSheet>
    </>
  );
}
