import { useState, useRef, useMemo, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AdminCard, AdminCardContent, AdminBadge, AdminScrollArea } from "@/components/admin";
import { PIPELINE_STATUSES, PipelineStatus } from "./PipelineStatusBadge";
import { Mail, Phone, ChevronRight, Building2, Store, Users, Wine, Music, CheckSquare, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { CardPreview, PipelineCardPreviewContent } from "@/components/ui/CardPreview";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardNavigation";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useRealtimeTable } from "@/hooks/useRealtimePipeline";
import { usePipelineStageConfig } from "@/hooks/usePipelineStageConfig";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export interface ProductionItem {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  category?: string;
  pipeline_status: string | null;
  // Optional metadata
  booth_number?: string;
  tier?: string;
  value?: number;
  notes?: string;
  contacts?: Array<{ name: string; email: string; role?: string }>;
}

interface ProductionKanbanProps<T extends ProductionItem> {
  items: T[];
  onItemClick: (item: T) => void;
  onStatusChange: (item: T, newStatus: string) => void;
  entityType: "vendor" | "artisan" | "partner" | "artist";
  renderItemBadge?: (item: T) => React.ReactNode;
  isLoading?: boolean;
  queryKey?: string;
  enableRealtime?: boolean;
  enableBulkSelection?: boolean;
}

const getEntityIcon = (type: string) => {
  switch (type) {
    case "vendor":
      return Building2;
    case "artisan":
      return Store;
    case "partner":
      return Users;
    case "winecamp":
      return Wine;
    case "artist":
      return Music;
    default:
      return Users;
  }
};

const getEntityColor = (type: string) => {
  switch (type) {
    case "vendor":
      return "bg-[hsl(var(--admin-info)/0.15)] text-[hsl(var(--admin-info))]";
    case "artisan":
      return "bg-[hsl(280_60%_50%/0.15)] text-[hsl(280_60%_50%)]";
    case "partner":
      return "bg-[hsl(var(--admin-warning)/0.15)] text-[hsl(var(--admin-warning))]";
    case "winecamp":
      return "bg-[hsl(var(--admin-danger)/0.15)] text-[hsl(var(--admin-danger))]";
    case "artist":
      return "bg-[hsl(var(--admin-primary)/0.15)] text-[hsl(var(--admin-primary))]";
    default:
      return "bg-[hsl(var(--admin-border))] text-[hsl(var(--admin-text-secondary))]";
  }
};

const getTableName = (entityType: string): string => {
  switch (entityType) {
    case "vendor":
      return "vendors";
    case "artisan":
      return "artisans";
    case "partner":
      return "partners";
    case "artist":
      return "artists";
    default:
      return "vendors";
  }
};

// Draggable Card Component
interface DraggableCardProps<T extends ProductionItem> {
  item: T;
  onItemClick: (item: T) => void;
  Icon: React.ComponentType<{ className?: string }>;
  iconColorClass: string;
  renderItemBadge?: (item: T) => React.ReactNode;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: (item: T) => void;
}

function DraggableCard<T extends ProductionItem>({
  item,
  onItemClick,
  Icon,
  iconColorClass,
  renderItemBadge,
  isSelectionMode,
  isSelected,
  onToggleSelection,
}: DraggableCardProps<T>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: item,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.stopPropagation();
      onToggleSelection(item);
    } else {
      onItemClick(item);
    }
  };

  const cardContent = (
    <AdminCard
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={cn(
        "cursor-pointer transition-all active:cursor-grabbing",
        "hover:shadow-md hover:scale-[1.02]",
        isDragging && "shadow-lg rotate-2",
        isSelected && "ring-2 ring-[hsl(var(--admin-primary))] bg-[hsl(var(--admin-primary)/0.05)]"
      )}
      tabIndex={0}
      data-item-id={item.id}
    >
      <AdminCardContent className="p-3">
        <div className="flex items-start gap-2">
          {/* Selection checkbox */}
          {isSelectionMode && (
            <div className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelection(item)}
              />
            </div>
          )}
          
          <div className={cn("p-1.5 rounded-md shrink-0", iconColorClass)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {item.company || item.name}
            </p>
            {item.company && (
              <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                {item.name}
              </p>
            )}

            {/* Category/Metadata Badge */}
            {(item.category || renderItemBadge) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {item.category && (
                  <AdminBadge intent="neutral" className="text-[10px] px-1.5 py-0">
                    {item.category}
                  </AdminBadge>
                )}
                {renderItemBadge?.(item)}
              </div>
            )}

            {/* Value display */}
            {item.value && item.value > 0 && (
              <p className="text-xs font-medium text-[hsl(var(--admin-foreground))] mt-1">
                ${item.value.toLocaleString()}
              </p>
            )}

            {/* Contact Info */}
            {(item.email || item.phone) && (
              <div className="mt-2 flex items-center gap-2 text-xs text-[hsl(var(--admin-text-muted))]">
                {item.email && (
                  <div className="flex items-center gap-0.5 truncate">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{item.email}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))] shrink-0" />
        </div>
      </AdminCardContent>
    </AdminCard>
  );

  // Wrap with preview on hover (disabled during drag or selection mode)
  return (
    <CardPreview
      disabled={isDragging || isSelectionMode}
      content={
        <PipelineCardPreviewContent
          name={item.name}
          company={item.company}
          email={item.email}
          phone={item.phone}
          notes={item.notes}
          category={item.category}
          value={item.value}
          contacts={item.contacts}
        />
      }
    >
      {cardContent}
    </CardPreview>
  );
}

// Droppable Column Component
interface DroppableColumnProps<T extends ProductionItem> {
  status: typeof PIPELINE_STATUSES[number];
  items: T[];
  onItemClick: (item: T) => void;
  Icon: React.ComponentType<{ className?: string }>;
  iconColorClass: string;
  renderItemBadge?: (item: T) => React.ReactNode;
  isSelectionMode: boolean;
  isSelected: (item: T) => boolean;
  onToggleSelection: (item: T) => void;
  stageLabel?: string;
  stageColor?: string;
  valueLabel?: string;
}

function DroppableColumn<T extends ProductionItem>({
  status,
  items,
  onItemClick,
  Icon,
  iconColorClass,
  renderItemBadge,
  isSelectionMode,
  isSelected,
  onToggleSelection,
  stageLabel,
  stageColor,
  valueLabel = "Value",
}: DroppableColumnProps<T>) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.value,
  });

  const totalValue = useMemo(
    () => items.reduce((sum, item) => sum + (item.value || 0), 0),
    [items]
  );

  const displayLabel = stageLabel || status.label;
  const displayColor = stageColor || status.color.split(" ")[0];

  return (
    <div className="flex flex-col" ref={setNodeRef}>
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <motion.div 
            className={cn("w-2 h-2 rounded-full", displayColor)}
            animate={{ scale: isOver ? 1.3 : 1 }}
          />
          <span className="font-medium text-sm">{displayLabel}</span>
        </div>
        <AdminBadge intent="neutral" className="text-xs">
          <AnimatedCounter value={items.length} duration={300} />
        </AdminBadge>
      </div>

      {/* Value total */}
      {totalValue > 0 && (
        <div className="text-xs text-[hsl(var(--admin-text-muted))] mb-2 px-1">
          <AnimatedCounter 
            value={totalValue} 
            prefix="$" 
            duration={500}
            className="font-medium"
          />
          {" "}total {valueLabel.toLowerCase()}
        </div>
      )}

      {/* Column Content */}
      <AdminScrollArea 
        className={cn(
          "flex-1 min-h-[200px] max-h-[600px] rounded-lg transition-colors",
          isOver && "bg-[hsl(var(--admin-primary)/0.05)] ring-2 ring-[hsl(var(--admin-primary))] ring-dashed"
        )}
      >
        <div className="space-y-2 pr-2 p-1">
          <AnimatePresence mode="popLayout">
            {items.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-8 text-sm text-[hsl(var(--admin-text-muted))] border-2 border-dashed border-[hsl(var(--admin-border))] rounded-lg"
              >
                Drop items here
              </motion.div>
            ) : (
              items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <DraggableCard
                    item={item}
                    onItemClick={onItemClick}
                    Icon={Icon}
                    iconColorClass={iconColorClass}
                    renderItemBadge={renderItemBadge}
                    isSelectionMode={isSelectionMode}
                    isSelected={isSelected(item)}
                    onToggleSelection={onToggleSelection}
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </AdminScrollArea>
    </div>
  );
}

// Bulk Actions Bar
interface BulkActionsBarProps {
  selectedCount: number;
  onMoveToStatus: (status: string) => void;
  onCancel: () => void;
  stages: Array<{ value: string; label: string }>;
}

function BulkActionsBar({ selectedCount, onMoveToStatus, onCancel, stages }: BulkActionsBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))] rounded-lg shadow-lg p-3 flex items-center gap-3"
    >
      <span className="text-sm font-medium">
        {selectedCount} selected
      </span>
      <div className="h-4 w-px bg-[hsl(var(--admin-border))]" />
      <div className="flex items-center gap-1">
        <span className="text-xs text-[hsl(var(--admin-text-muted))]">Move to:</span>
        {stages.map((stage) => (
          <Button
            key={stage.value}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onMoveToStatus(stage.value)}
          >
            {stage.label}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7"
        onClick={onCancel}
      >
        <X className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}

// Main Kanban Component
export function ProductionKanban<T extends ProductionItem>({
  items,
  onItemClick,
  onStatusChange,
  entityType,
  renderItemBadge,
  isLoading,
  queryKey,
  enableRealtime = true,
  enableBulkSelection = true,
}: ProductionKanbanProps<T>) {
  const [activeItem, setActiveItem] = useState<T | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const Icon = getEntityIcon(entityType);
  const iconColorClass = getEntityColor(entityType);
  const tableName = getTableName(entityType);

  // Get configurable stages
  const { orderedStages, valueLabel, getStageLabel, getStageColor } = usePipelineStageConfig(entityType);

  // Enable realtime updates
  useRealtimeTable(tableName, queryKey || `${entityType}s`, enableRealtime);

  // Bulk selection
  const {
    isSelectionMode,
    toggleSelectionMode,
    exitSelectionMode,
    selectedCount,
    selectedItems,
    isSelected,
    toggleSelection,
    selectAll,
    deselectAll,
  } = useBulkSelection<T>({
    items,
    getItemId: (item) => item.id,
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Keyboard shortcuts
  useGlobalKeyboardShortcuts({
    "s": () => enableBulkSelection && toggleSelectionMode(),
    "escape": () => isSelectionMode && exitSelectionMode(),
    "meta+a": () => isSelectionMode && selectAll(),
  });

  // Group items by status
  const itemsByStatus = useMemo(() => {
    const grouped: Record<string, T[]> = {};
    orderedStages.forEach((stage) => {
      grouped[stage.id] = items.filter(
        (item) => (item.pipeline_status || "lead") === stage.id
      );
    });
    return grouped;
  }, [items, orderedStages]);

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const item = items.find((i) => i.id === event.active.id);
    if (item) setActiveItem(item);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const item = items.find((i) => i.id === active.id);
      if (item && item.pipeline_status !== over.id) {
        // Call the status change with optimistic update
        onStatusChange(item, over.id as string);
      }
    }
  };

  // Bulk move handler
  const handleBulkMove = async (newStatus: string) => {
    const updates = selectedItems.map((item) => {
      onStatusChange(item, newStatus);
    });
    
    toast.success(`Moved ${selectedCount} items to ${getStageLabel(newStatus)}`);
    exitSelectionMode();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--admin-accent))]"></div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Selection mode toggle */}
      {enableBulkSelection && (
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant={isSelectionMode ? "default" : "outline"}
            size="sm"
            onClick={toggleSelectionMode}
            className="h-8"
          >
            {isSelectionMode ? (
              <>
                <CheckSquare className="h-4 w-4 mr-1" />
                Selection Mode
              </>
            ) : (
              <>
                <Square className="h-4 w-4 mr-1" />
                Select Multiple
              </>
            )}
          </Button>
          {isSelectionMode && (
            <span className="text-xs text-[hsl(var(--admin-text-muted))]">
              Press S to toggle, Escape to cancel
            </span>
          )}
        </div>
      )}

      <div 
        ref={containerRef}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        tabIndex={-1}
      >
        {orderedStages.map((stage) => (
          <DroppableColumn
            key={stage.id}
            status={{ value: stage.id, label: stage.label, intent: "neutral" as const, color: `bg-${stage.color}-500` }}
            items={itemsByStatus[stage.id] || []}
            onItemClick={onItemClick}
            Icon={Icon}
            iconColorClass={iconColorClass}
            renderItemBadge={renderItemBadge}
            isSelectionMode={isSelectionMode}
            isSelected={isSelected}
            onToggleSelection={toggleSelection}
            stageLabel={stage.label}
            stageColor={`bg-${stage.color}-500`}
            valueLabel={valueLabel}
          />
        ))}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem && (
          <AdminCard className="shadow-2xl rotate-3 scale-105 opacity-90">
            <AdminCardContent className="p-3">
              <div className="flex items-start gap-2">
                <div className={cn("p-1.5 rounded-md shrink-0", iconColorClass)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {activeItem.company || activeItem.name}
                  </p>
                </div>
              </div>
            </AdminCardContent>
          </AdminCard>
        )}
      </DragOverlay>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {isSelectionMode && selectedCount > 0 && (
          <BulkActionsBar
            selectedCount={selectedCount}
            onMoveToStatus={handleBulkMove}
            onCancel={exitSelectionMode}
            stages={orderedStages.map(s => ({ value: s.id, label: s.label }))}
          />
        )}
      </AnimatePresence>
    </DndContext>
  );
}
