import { useState } from "react";
import { usePipeline } from "../PipelineContext";
import { usePipelineDrawerCounts } from "@/hooks/usePipelineDrawerCounts";
import { Check, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin";

interface ChecklistItem {
  key: string;
  label: string;
  completed: boolean;
}

export function DrawerProgressChecklist() {
  const { config, selectedRecord, stages } = usePipeline();
  const counts = usePipelineDrawerCounts();
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Build checklist based on available modules
  const items: ChecklistItem[] = [];

  if (!config || !selectedRecord) return null;

  // Contact info
  if (config.has_contacts) {
    items.push({
      key: "contact",
      label: "Contact added",
      completed: counts.contacts > 0,
    });
  }

  // Contract
  if (config.has_contracts) {
    items.push({
      key: "contract",
      label: "Contract sent",
      completed: counts.contracts > 0,
    });
  }

  // Documents
  if (config.has_documents) {
    items.push({
      key: "docs",
      label: "Documents uploaded",
      completed: counts.documents > 0,
    });
  }

  // Calculate progress
  const completedCount = items.filter(i => i.completed).length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  const isComplete = completedCount === items.length;

  if (items.length === 0) return null;

  return (
    <div className="bg-[hsl(var(--admin-surface))] rounded-lg border border-[hsl(var(--admin-border))]">
      {/* Clickable header */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-[hsl(var(--admin-muted)/0.1)] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Mini progress bar */}
          <div className="w-16 h-1.5 bg-[hsl(var(--admin-muted)/0.2)] rounded-full overflow-hidden shrink-0">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isComplete ? "bg-[hsl(var(--admin-success))]" : "bg-[hsl(var(--admin-primary))]"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs font-medium text-[hsl(var(--admin-foreground))]">
            Progress
          </span>
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            isComplete 
              ? "bg-[hsl(var(--admin-success)/0.15)] text-[hsl(var(--admin-success))]"
              : "bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))]"
          )}>
            {completedCount}/{items.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
        )}
      </button>

      {/* Expandable checklist */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 space-y-1">
          {items.map(item => (
            <div 
              key={item.key}
              className={cn(
                "flex items-center gap-2 text-xs py-1",
                item.completed 
                  ? "text-[hsl(var(--admin-success))]" 
                  : "text-[hsl(var(--admin-muted-foreground))]"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                item.completed 
                  ? "bg-[hsl(var(--admin-success))] border-[hsl(var(--admin-success))]"
                  : "border-[hsl(var(--admin-border))] bg-transparent"
              )}>
                {item.completed && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className={cn(item.completed && "line-through opacity-60")}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
