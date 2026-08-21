import { AdminButton } from "@/components/admin";
import { LayoutGrid, List } from "lucide-react";

interface ViewModeToggleProps {
  viewMode: "kanban" | "table";
  onViewModeChange: (mode: "kanban" | "table") => void;
  className?: string;
}

export function ViewModeToggle({ viewMode, onViewModeChange, className }: ViewModeToggleProps) {
  return (
    <div className={`flex items-center gap-1 ${className || ""}`}>
      <AdminButton
        variant={viewMode === "kanban" ? "admin" : "adminOutline"}
        size="sm"
        onClick={() => onViewModeChange("kanban")}
        className="gap-1.5"
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="hidden sm:inline">Kanban</span>
      </AdminButton>
      <AdminButton
        variant={viewMode === "table" ? "admin" : "adminOutline"}
        size="sm"
        onClick={() => onViewModeChange("table")}
        className="gap-1.5"
      >
        <List className="w-4 h-4" />
        <span className="hidden sm:inline">Table</span>
      </AdminButton>
    </div>
  );
}
