import { useState, useMemo, useCallback } from "react";
import { usePipeline } from "./PipelineContext";
import { getFieldDisplayValue } from "@/hooks/usePipelineData";
import { PipelineStage } from "@/hooks/usePipelineConfig";
import { StageHeaderEditor } from "./inline/StageHeaderEditor";
import { AddStageButton } from "./inline/AddStageButton";
import { ProgressDots } from "./ProgressDots";
import { NextStepBadge } from "./NextStepBadge";
import { useRecordProgress } from "@/hooks/useRecordProgress";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import { 
  AdminBadge, 
  AdminScrollArea,
  AdminButton,
  getIntentFromColor, 
  getBorderClassFromColor 
} from "@/components/admin";
import { AdminAvatar } from "@/components/admin/AdminPrimitives";
import { Mail, Phone, DollarSign, GripVertical, Plus, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PipelineKanbanView() {
  const {
    config,
    stages,
    cardFields,
    records,
    isLoading,
    setSelectedRecord,
    setIsDrawerOpen,
    updateStatus,
    getField,
    setIsAddDialogOpen,
    createRecord,
  } = usePipeline();

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [touchDragData, setTouchDragData] = useState<{ 
    recordId: string; 
    startY: number;
    startX: number;
  } | null>(null);

  const toggleCollapse = useCallback((stageSlug: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageSlug)) {
        next.delete(stageSlug);
      } else {
        next.add(stageSlug);
      }
      return next;
    });
  }, []);

  // Get record progress data for all records
  const recordIds = useMemo(() => records.map(r => r.id), [records]);
  const { data: progressData } = useRecordProgress({
    entityType: config?.slug || "vendor",
    recordIds,
    enabled: !!config?.slug && recordIds.length > 0,
  });

  // Group records by stage
  const recordsByStage = useMemo(() => {
    return stages.reduce((acc, stage) => {
      acc[stage.slug] = records.filter(r => r.pipeline_status === stage.slug);
      return acc;
    }, {} as Record<string, typeof records>);
  }, [stages, records]);

  if (isLoading) {
    return (
      <div className="flex gap-3 pb-4 overflow-x-auto">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-shrink-0 w-[260px] md:max-w-[280px] bg-[hsl(var(--admin-surface))] rounded-lg p-4 animate-pulse">
            <div className="h-6 bg-[hsl(var(--admin-border))] rounded w-24 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(j => (
                <div key={j} className="h-24 bg-[hsl(var(--admin-border))] rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, recordId: string) => {
    setDraggedId(recordId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stageSlug: string) => {
    e.preventDefault();
    setDragOverStage(stageSlug);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, stageSlug: string) => {
    e.preventDefault();
    if (draggedId) {
      updateStatus(draggedId, stageSlug);
    }
    setDraggedId(null);
    setDragOverStage(null);
  };

  // Touch handlers for mobile drag-and-drop
  const handleTouchStart = (e: React.TouchEvent, recordId: string) => {
    const touch = e.touches[0];
    setTouchDragData({ 
      recordId, 
      startY: touch.clientY,
      startX: touch.clientX
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDragData) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchDragData.startX);
    const deltaY = Math.abs(touch.clientY - touchDragData.startY);
    
    // Only start drag if horizontal movement is significant
    if (deltaX > 30 && deltaX > deltaY) {
      setDraggedId(touchDragData.recordId);
      
      // Find which column we're over
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      const column = element?.closest('[data-stage-slug]');
      if (column) {
        const stageSlug = column.getAttribute('data-stage-slug');
        if (stageSlug) {
          setDragOverStage(stageSlug);
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (draggedId && dragOverStage) {
      updateStatus(draggedId, dragOverStage);
    }
    setDraggedId(null);
    setDragOverStage(null);
    setTouchDragData(null);
  };

  const handleCardClick = (record: typeof records[0]) => {
    // Don't open drawer if we were dragging
    if (touchDragData) return;
    setSelectedRecord(record);
    setIsDrawerOpen(true);
  };

  // Get display fields
  const nameField = getField("name") || getField("company_name") || getField("business_name");
  const companyField = getField("company_name") || getField("business_name");
  const valueField = getField("deal_value") || getField("total_value") || getField("booth_fee");

  // Calculate stage totals
  const getStageTotals = (stageRecords: typeof records) => {
    if (!valueField) return { count: stageRecords.length, total: 0 };
    const total = stageRecords.reduce((sum, r) => {
      const val = r[valueField.slug];
      return sum + (typeof val === "number" ? val : 0);
    }, 0);
    return { count: stageRecords.length, total };
  };

  return (
    <div className="flex gap-3 pb-4 overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
      {stages.map((stage) => {
        const stageRecords = recordsByStage[stage.slug] || [];
        const { count, total } = getStageTotals(stageRecords);
        const intent = getIntentFromColor(stage.color);
        const isDragOver = dragOverStage === stage.slug;
        const isCollapsed = collapsedStages.has(stage.slug);
        const isEmpty = count === 0;

        // Collapsed column - thin clickable bar
        if (isCollapsed) {
          return (
            <div
              key={stage.id}
              data-stage-slug={stage.slug}
              className={cn(
                "flex-shrink-0 w-10 flex flex-col items-center rounded-lg border-t-2 cursor-pointer transition-all duration-200",
                "bg-[hsl(var(--admin-surface))] hover:bg-[hsl(var(--admin-accent-subtle))]",
                getBorderClassFromColor(stage.color),
                isDragOver && "bg-[hsl(var(--admin-accent-subtle))] ring-2 ring-[hsl(var(--admin-accent))] ring-inset w-16"
              )}
              onClick={() => toggleCollapse(stage.slug)}
              onDragOver={(e) => handleDragOver(e, stage.slug)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                handleDrop(e, stage.slug);
                // Auto-expand when dropping
                setCollapsedStages(prev => {
                  const next = new Set(prev);
                  next.delete(stage.slug);
                  return next;
                });
              }}
            >
              <div className="py-3 flex flex-col items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
                <span className="text-[10px] font-medium text-[hsl(var(--admin-muted-foreground))] [writing-mode:vertical-lr] rotate-180">
                  {stage.name}
                </span>
                {count > 0 && (
                  <AdminBadge intent={intent} size="sm" className="text-[10px] px-1">
                    {count}
                  </AdminBadge>
                )}
              </div>
            </div>
          );
        }

        return (
          <div
            key={stage.id}
            data-stage-slug={stage.slug}
            className={cn(
              "flex-shrink-0 w-[280px] md:w-[260px] md:min-w-[200px] md:max-w-[280px]",
              "flex flex-col rounded-lg border-t-2 transition-all duration-200",
              "bg-[hsl(var(--admin-surface))]",
              getBorderClassFromColor(stage.color),
              isDragOver && "bg-[hsl(var(--admin-accent-subtle))] ring-2 ring-[hsl(var(--admin-accent))] ring-inset"
            )}
            onDragOver={(e) => handleDragOver(e, stage.slug)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.slug)}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-[hsl(var(--admin-border))]">
              <div className="flex items-center justify-between">
                <StageHeaderEditor stage={stage}>
                  <div className="flex items-center gap-2">
                    <AdminBadge intent={intent} size="sm">
                      {stage.name}
                    </AdminBadge>
                    <span className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                      {count}
                    </span>
                  </div>
                </StageHeaderEditor>
                <div className="flex items-center gap-1">
                  {total > 0 && (
                    <span className="text-xs font-medium text-[hsl(var(--admin-success))]">
                      ${total.toLocaleString()}
                    </span>
                  )}
                  {isEmpty && (
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-[hsl(var(--admin-muted-foreground))]"
                      onClick={() => toggleCollapse(stage.slug)}
                      title="Collapse empty column"
                    >
                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                    </AdminButton>
                  )}
                </div>
              </div>
            </div>

            {/* Cards */}
            <AdminScrollArea className="h-[calc(100vh-320px)] md:h-[calc(100vh-280px)]">
              <div className="p-2 space-y-2 touch-pan-y">
                {stageRecords.map((record) => {
                  const name = nameField ? String(record[nameField.slug] || "") : "";
                  const company = companyField && companyField.slug !== nameField?.slug 
                    ? String(record[companyField.slug] || "") 
                    : "";
                  const value = valueField ? record[valueField.slug] : null;
                  const isDragging = draggedId === record.id;
                  
                  // Get progress info
                  const progress = progressData?.[record.id] || {
                    hasContact: false,
                    hasContract: false,
                    hasDocument: false,
                    hasEmail: false,
                  };

                    return (
                      <AdminCard
                        key={record.id}
                        className={cn(
                          "cursor-pointer transition-all duration-200",
                          "hover:shadow-md hover:border-[hsl(var(--admin-accent))]",
                          isDragging && "opacity-50 scale-[0.98] rotate-1 shadow-lg ring-2 ring-[hsl(var(--admin-accent))]",
                          !isDragging && "hover:-translate-y-0.5",
                          "touch-manipulation"
                        )}
                        draggable
                        onDragStart={(e) => handleDragStart(e, record.id)}
                        onTouchStart={(e) => handleTouchStart(e, record.id)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onClick={() => handleCardClick(record)}
                    >
                      <AdminCardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))] mt-0.5 cursor-grab" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm text-[hsl(var(--admin-foreground))] truncate">
                                  {company || name}
                                </p>
                                {company && name && company !== name && (
                                  <p className="text-xs text-[hsl(var(--admin-muted-foreground))] truncate">
                                    {name}
                                  </p>
                                )}
                              </div>
                              <AdminAvatar
                                name={company || name} 
                                type={(config?.slug as "vendor" | "artist" | "artisan" | "partner") || "default"} 
                                size="sm" 
                              />
                            </div>

                            {/* Quick info row */}
                            <div className="flex items-center gap-3 mt-2 text-[hsl(var(--admin-muted-foreground))]">
                              {record.email && (
                                <Mail className="w-3 h-3" />
                              )}
                              {record.phone && (
                                <Phone className="w-3 h-3" />
                              )}
                              {typeof value === "number" && value > 0 && (
                                <span className="flex items-center gap-1 text-xs text-[hsl(var(--admin-success))]">
                                  <DollarSign className="w-3 h-3" />
                                  {value.toLocaleString()}
                                </span>
                              )}
                            </div>

                          </div>
                        </div>
                      </AdminCardContent>
                    </AdminCard>
                  );
                })}

                {stageRecords.length === 0 && (
                  <div className="py-8 flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-[hsl(var(--admin-muted)/0.3)] flex items-center justify-center mb-2">
                      <Plus className="w-5 h-5 text-[hsl(var(--admin-muted-foreground))]" />
                    </div>
                    <p className="text-xs text-[hsl(var(--admin-muted-foreground))]">
                      No {config?.name_plural?.toLowerCase() || "records"}
                    </p>
                    <p className="text-[10px] text-[hsl(var(--admin-muted-foreground))] mt-0.5">
                      Drag here or add new
                    </p>
                  </div>
                )}
              </div>
            </AdminScrollArea>

            {/* Quick Add Button */}
            <div className="p-2 border-t border-[hsl(var(--admin-border))]">
              <AdminButton
                variant="ghost"
                size="sm"
                className="w-full justify-center gap-1.5 text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))]"
                onClick={() => {
                  // Create a new record with this stage pre-selected
                  createRecord({ pipeline_status: stage.slug });
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add {config?.name_singular || "Record"}
              </AdminButton>
            </div>
          </div>
        );
      })}
      
      {/* Add Stage Button */}
      {config && (
        <AddStageButton pipelineId={config.id} existingStageCount={stages.length} />
      )}
    </div>
  );
}
