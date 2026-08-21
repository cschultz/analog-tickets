import { useState } from "react";
import { PipelineStage } from "@/hooks/usePipelineConfig";
import { useCreatePipelineStage, useUpdatePipelineStage, useDeletePipelineStage, useReorderPipelineStages } from "@/hooks/usePipelineAdmin";
import { AdminButton, AdminInput, AdminBadge, AdminLabel, getIntentFromColor } from "@/components/admin";
import { AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { Plus, Trash2, Palette, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
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

interface StageListEditorProps {
  pipelineId: string;
  stages: PipelineStage[];
}

interface EditingStage {
  id: string;
  name: string;
  color: string;
  is_terminal: boolean;
  is_positive: boolean;
}

export function StageListEditor({ pipelineId, stages }: StageListEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<EditingStage | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("gray");

  const createStage = useCreatePipelineStage();
  const updateStage = useUpdatePipelineStage();
  const deleteStage = useDeletePipelineStage();
  const reorderStages = useReorderPipelineStages();

  const sortedStages = [...stages].sort((a, b) => a.display_order - b.display_order);

  const handleExpand = (stage: PipelineStage) => {
    if (expandedId === stage.id) {
      setExpandedId(null);
      setEditingStage(null);
    } else {
      setExpandedId(stage.id);
      setEditingStage({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        is_terminal: stage.is_terminal,
        is_positive: stage.is_positive,
      });
    }
  };

  const handleSave = () => {
    if (!editingStage) return;
    const stage = stages.find(s => s.id === editingStage.id);
    if (!stage) return;

    const hasChanges =
      editingStage.name !== stage.name ||
      editingStage.color !== stage.color ||
      editingStage.is_terminal !== stage.is_terminal ||
      editingStage.is_positive !== stage.is_positive;

    if (editingStage.name.trim() && hasChanges) {
      updateStage.mutate({
        id: editingStage.id,
        pipeline_id: pipelineId,
        name: editingStage.name.trim(),
        color: editingStage.color,
        is_terminal: editingStage.is_terminal,
        is_positive: editingStage.is_positive,
      });
    }
    setExpandedId(null);
    setEditingStage(null);
  };

  const handleDelete = (stage: PipelineStage) => {
    if (confirm(`Delete stage "${stage.name}"? Records in this stage will need to be moved.`)) {
      deleteStage.mutate({ id: stage.id, pipeline_id: pipelineId });
      setExpandedId(null);
      setEditingStage(null);
    }
  };

  const handleCreate = () => {
    if (!newName.trim()) return;

    const slug = newName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    createStage.mutate(
      {
        pipeline_id: pipelineId,
        slug,
        name: newName.trim(),
        color: newColor,
        display_order: sortedStages.length + 1,
        is_terminal: false,
        is_positive: false,
      },
      {
        onSuccess: () => {
          setNewName("");
          setNewColor("gray");
          setIsAdding(false);
        },
      }
    );
  };

  const handleMoveUp = (stage: PipelineStage, index: number) => {
    if (index === 0) return;
    const newOrder = sortedStages.map((s, i) => ({
      id: s.id,
      display_order: i === index ? index : i === index - 1 ? index + 1 : i + 1,
    }));
    reorderStages.mutate({ pipeline_id: pipelineId, stages: newOrder });
  };

  const handleMoveDown = (stage: PipelineStage, index: number) => {
    if (index === sortedStages.length - 1) return;
    const newOrder = sortedStages.map((s, i) => ({
      id: s.id,
      display_order: i === index ? index + 2 : i === index + 1 ? index + 1 : i + 1,
    }));
    reorderStages.mutate({ pipeline_id: pipelineId, stages: newOrder });
  };

  return (
    <div className="space-y-2">
      {sortedStages.map((stage, index) => (
        <div
          key={stage.id}
          className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden"
        >
          {/* Stage Row */}
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[hsl(var(--admin-surface-hover))] transition-colors",
              expandedId === stage.id && "bg-[hsl(var(--admin-surface-hover))]"
            )}
            onClick={() => handleExpand(stage)}
          >
            <GripVertical className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))] opacity-50" />
            <AdminBadge intent={getIntentFromColor(stage.color)} size="sm">
              {stage.name}
            </AdminBadge>
            <div className="flex-1" />
            {stage.is_terminal && (
              <span className="text-[10px] text-[hsl(var(--admin-muted-foreground))] uppercase">
                {stage.is_positive ? "Won" : "Lost"}
              </span>
            )}
            <div className="flex items-center gap-1">
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleMoveUp(stage, index); }}
                disabled={index === 0}
                className="h-6 w-6 p-0"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </AdminButton>
              <AdminButton
                variant="adminGhost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleMoveDown(stage, index); }}
                disabled={index === sortedStages.length - 1}
                className="h-6 w-6 p-0"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </AdminButton>
            </div>
          </div>

          {/* Expanded Editor */}
          {expandedId === stage.id && editingStage && (
            <div className="px-3 pb-3 pt-1 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] space-y-3">
              {/* Name */}
              <div className="space-y-1">
                <AdminLabel>Name</AdminLabel>
                <AdminInput
                  value={editingStage.name}
                  onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                  className="h-8"
                />
              </div>

              {/* Color */}
              <div className="space-y-1">
                <AdminLabel className="flex items-center gap-1">
                  <Palette className="w-3 h-3" />
                  Color
                </AdminLabel>
                <div className="flex flex-wrap gap-1">
                  {STAGE_COLORS.map((c) => (
                    <AdminButton
                      key={c.value}
                      variant="adminGhost"
                      size="sm"
                      onClick={() => setEditingStage({ ...editingStage, color: c.value })}
                      className={cn(
                        "h-auto p-0.5",
                        editingStage.color === c.value && "ring-2 ring-[hsl(var(--admin-accent))] ring-offset-1"
                      )}
                    >
                      <AdminBadge intent={getIntentFromColor(c.value)} size="sm">
                        {c.label}
                      </AdminBadge>
                    </AdminButton>
                  ))}
                </div>
              </div>

              {/* Terminal Options */}
              <div className="space-y-2">
                <div 
                  className="flex items-center gap-2 text-xs cursor-pointer"
                  onClick={() => setEditingStage({ ...editingStage, is_terminal: !editingStage.is_terminal, is_positive: !editingStage.is_terminal })}
                >
                  <AdminCheckbox
                    checked={editingStage.is_terminal}
                    onCheckedChange={(checked) =>
                      setEditingStage({ ...editingStage, is_terminal: !!checked, is_positive: !!checked })
                    }
                  />
                  <span>Terminal stage (final outcome)</span>
                </div>
                {editingStage.is_terminal && (
                  <div 
                    className="flex items-center gap-2 text-xs ml-5 cursor-pointer"
                    onClick={() => setEditingStage({ ...editingStage, is_positive: !editingStage.is_positive })}
                  >
                    <AdminCheckbox
                      checked={editingStage.is_positive}
                      onCheckedChange={(checked) =>
                        setEditingStage({ ...editingStage, is_positive: !!checked })
                      }
                    />
                    <span>Positive outcome (won)</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--admin-border))]">
                <AdminButton
                  variant="adminGhost"
                  size="sm"
                  onClick={() => handleDelete(stage)}
                  className="text-[hsl(var(--admin-danger))] hover:text-[hsl(var(--admin-danger))] hover:bg-[hsl(var(--admin-danger))]/10 h-7 px-2"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Delete
                </AdminButton>
                <AdminButton variant="admin" size="sm" onClick={handleSave} className="h-7 px-3">
                  Save
                </AdminButton>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add Stage */}
      {isAdding ? (
        <div className="border border-dashed border-[hsl(var(--admin-accent))] rounded-lg p-3 space-y-3">
          <div className="space-y-1">
            <AdminLabel>Name</AdminLabel>
            <AdminInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Stage name"
              className="h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setIsAdding(false);
              }}
            />
          </div>
          <div className="space-y-1">
            <AdminLabel className="flex items-center gap-1">
              <Palette className="w-3 h-3" />
              Color
            </AdminLabel>
            <div className="flex flex-wrap gap-1">
              {STAGE_COLORS.map((c) => (
                <AdminButton
                  key={c.value}
                  variant="adminGhost"
                  size="sm"
                  onClick={() => setNewColor(c.value)}
                  className={cn(
                    "h-auto p-0.5",
                    newColor === c.value && "ring-2 ring-[hsl(var(--admin-accent))] ring-offset-1"
                  )}
                >
                  <AdminBadge intent={getIntentFromColor(c.value)} size="sm">
                    {c.label}
                  </AdminBadge>
                </AdminButton>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <AdminButton
              variant="adminOutline"
              size="sm"
              onClick={() => { setIsAdding(false); setNewName(""); setNewColor("gray"); }}
              className="h-7"
            >
              Cancel
            </AdminButton>
            <AdminButton
              variant="admin"
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || createStage.isPending}
              className="h-7"
            >
              Add Stage
            </AdminButton>
          </div>
        </div>
      ) : (
        <AdminButton
          variant="adminGhost"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="w-full justify-center py-2 border border-dashed border-[hsl(var(--admin-border))] hover:border-[hsl(var(--admin-accent))]"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Stage
        </AdminButton>
      )}
    </div>
  );
}
