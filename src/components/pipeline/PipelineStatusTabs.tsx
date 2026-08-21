import { usePipeline } from "./PipelineContext";
import { AdminButton } from "@/components/admin";
import { cn } from "@/lib/utils";

export function PipelineStatusTabs() {
  const { stages, records, statusFilter, setStatusFilter } = usePipeline();
  
  // Count records per stage
  const stageCounts = stages.reduce((acc, stage) => {
    acc[stage.slug] = records.filter(r => r.pipeline_status === stage.slug).length;
    return acc;
  }, {} as Record<string, number>);
  
  const totalCount = records.length;
  
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-[hsl(var(--admin-surface))] rounded-lg border border-[hsl(var(--admin-border))] w-max min-w-0">
      {/* All tab */}
      <AdminButton
        variant="ghost"
        size="sm"
        onClick={() => setStatusFilter(null)}
        className={cn(
          "px-3 py-1.5 h-auto font-medium rounded-md transition-colors",
          statusFilter === null
            ? "bg-[hsl(var(--admin-bg))] text-[hsl(var(--admin-foreground))] shadow-sm hover:bg-[hsl(var(--admin-bg))]"
            : "text-[hsl(var(--admin-muted-foreground))] hover:text-[hsl(var(--admin-foreground))] hover:bg-[hsl(var(--admin-bg))]/50"
        )}
      >
        All
        <span className="ml-1.5 text-xs opacity-70">{totalCount}</span>
      </AdminButton>
      
      {/* Stage tabs */}
      {stages.map(stage => {
        const count = stageCounts[stage.slug] || 0;
        const isActive = statusFilter === stage.slug;
        
        return (
          <AdminButton
            key={stage.id}
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter(stage.slug)}
            className={cn(
              "px-3 py-1.5 h-auto font-medium rounded-md transition-colors flex items-center gap-1.5",
              isActive
                ? "bg-[hsl(var(--admin-bg))] shadow-sm hover:bg-[hsl(var(--admin-bg))]"
                : "hover:bg-[hsl(var(--admin-bg))]/50"
            )}
            style={{
              color: isActive ? stage.color : undefined,
            }}
          >
            {/* Color dot */}
            <span 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: stage.color }}
            />
            {stage.name}
            {count > 0 && (
              <span className={cn(
                "text-xs",
                isActive ? "opacity-80" : "opacity-60"
              )}>
                {count}
              </span>
            )}
          </AdminButton>
        );
      })}
    </div>
  );
}