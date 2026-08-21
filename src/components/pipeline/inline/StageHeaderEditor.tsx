import { useState, useRef, useEffect } from "react";
import { PipelineStage } from "@/hooks/usePipelineConfig";
import { useUpdatePipelineStage, useDeletePipelineStage } from "@/hooks/usePipelineAdmin";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin/AdminSheet";
import { AdminButton, AdminInput, AdminBadge, AdminLabel, getIntentFromColor } from "@/components/admin";
import { AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { Trash2, Palette } from "lucide-react";
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

interface StageHeaderEditorProps {
  stage: PipelineStage;
  children: React.ReactNode;
  disabled?: boolean;
}

export function StageHeaderEditor({ stage, children, disabled }: StageHeaderEditorProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const [isTerminal, setIsTerminal] = useState(stage.is_terminal);
  const [isPositive, setIsPositive] = useState(stage.is_positive);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateStage = useUpdatePipelineStage();
  const deleteStage = useDeletePipelineStage();

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open]);

  // Reset values when sheet opens
  useEffect(() => {
    if (open) {
      setName(stage.name);
      setColor(stage.color);
      setIsTerminal(stage.is_terminal);
      setIsPositive(stage.is_positive);
    }
  }, [open, stage]);

  const handleSave = () => {
    const hasChanges = 
      name !== stage.name || 
      color !== stage.color || 
      isTerminal !== stage.is_terminal ||
      isPositive !== stage.is_positive;

    if (name.trim() && hasChanges) {
      updateStage.mutate({
        id: stage.id,
        pipeline_id: stage.pipeline_id,
        name: name.trim(),
        color,
        is_terminal: isTerminal,
        is_positive: isPositive,
      });
    }
    setOpen(false);
  };

  const handleDelete = () => {
    if (confirm(`Delete stage "${stage.name}"? Records in this stage will need to be moved.`)) {
      deleteStage.mutate({ id: stage.id, pipeline_id: stage.pipeline_id });
      setOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setName(stage.name);
      setColor(stage.color);
      setIsTerminal(stage.is_terminal);
      setIsPositive(stage.is_positive);
      setOpen(false);
    }
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <>
      <AdminButton
        variant="adminGhost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-auto p-0 font-normal"
      >
        {children}
      </AdminButton>

      <AdminSheet open={open} onOpenChange={setOpen}>
        <AdminSheetContent side="right" className="w-[360px]">
          <AdminSheetHeader>
            <AdminSheetTitle>Edit Stage</AdminSheetTitle>
            <AdminSheetDescription>
              Modify the stage name, color, and behavior.
            </AdminSheetDescription>
          </AdminSheetHeader>
          
          <div className="space-y-6 py-6">
            {/* Stage Name */}
            <div className="space-y-2">
              <AdminLabel htmlFor="stage-name">Name</AdminLabel>
              <AdminInput
                ref={inputRef}
                id="stage-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Stage name"
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

            {/* Terminal/Positive Options */}
            <div className="space-y-3 pt-4 border-t border-[hsl(var(--admin-border))]">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setIsTerminal(!isTerminal)}>
                <AdminCheckbox
                  checked={isTerminal}
                  onCheckedChange={(checked) => setIsTerminal(!!checked)}
                />
                <span className="text-sm text-[hsl(var(--admin-foreground))]">Terminal stage</span>
              </div>
              {isTerminal && (
                <div className="flex items-center gap-3 cursor-pointer ml-7" onClick={() => setIsPositive(!isPositive)}>
                  <AdminCheckbox
                    checked={isPositive}
                    onCheckedChange={(checked) => setIsPositive(!!checked)}
                  />
                  <span className="text-sm text-[hsl(var(--admin-foreground))]">Positive outcome</span>
                </div>
              )}
              <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                Terminal stages represent final outcomes (e.g., "Won" or "Lost")
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[hsl(var(--admin-border))]">
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={handleDelete}
                className="text-[hsl(var(--admin-danger))] hover:text-[hsl(var(--admin-danger))] hover:bg-[hsl(var(--admin-danger))]/10"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete Stage
              </AdminButton>
              <div className="flex gap-2">
                <AdminButton
                  variant="adminOutline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </AdminButton>
                <AdminButton
                  variant="admin"
                  onClick={handleSave}
                  disabled={!name.trim()}
                >
                  Save
                </AdminButton>
              </div>
            </div>
          </div>
        </AdminSheetContent>
      </AdminSheet>
    </>
  );
}
