import { useState } from "react";
import { cn } from "@/lib/utils";
import { 
  Check, 
  ChevronDown, 
  Plus, 
  Trash2, 
  TableIcon, 
  LayoutGrid,
  Star
} from "lucide-react";
import { AdminButton, AdminInput } from "@/components/admin";
import { AdminDropdown } from "@/components/admin/AdminOverlay";
import { AdminDialog, AdminDialogContent, AdminDialogHeader, AdminDialogTitle, AdminDialogDescription, AdminDialogBody, AdminDialogFooter } from "@/components/admin/AdminDialog";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { InlineViewRename } from "@/components/admin/InlineViewRename";
import { SavedView, ViewMode } from "@/hooks/useSavedViews";

interface SavedViewsDropdownProps {
  views: SavedView[];
  activeViewId: string | null;
  onViewChange: (view: SavedView) => void;
  onCreateView: (name: string, viewMode: ViewMode) => Promise<void>;
  onUpdateView: (id: string, updates: Partial<SavedView>) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export function SavedViewsDropdown({
  views,
  activeViewId,
  onViewChange,
  onCreateView,
  onUpdateView,
  onDeleteView,
  isLoading,
  className,
}: SavedViewsDropdownProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewMode, setNewViewMode] = useState<ViewMode>("table");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeView = views.find(v => v.id === activeViewId) || views[0];

  const handleCreate = async () => {
    if (!newViewName.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreateView(newViewName.trim(), newViewMode);
      setNewViewName("");
      setNewViewMode("table");
      setIsCreateDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await onDeleteView(id);
  };

  return (
    <>
      <AdminDropdown
        align="start"
        trigger={
          <AdminButton 
            variant="adminOutline" 
            size="sm" 
            className={cn("gap-2 min-w-[140px] justify-between", className)}
            disabled={isLoading}
          >
            <span className="flex items-center gap-1.5">
              {activeView?.view_mode === "board" ? (
                <LayoutGrid className="h-3.5 w-3.5" />
              ) : (
                <TableIcon className="h-3.5 w-3.5" />
              )}
              <span className="truncate max-w-[100px]">{activeView?.name || "Select view"}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--admin-text-muted))]" />
          </AdminButton>
        }
      >
        <div className="w-64">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[hsl(var(--admin-border))]">
            <span className="text-xs font-medium text-[hsl(var(--admin-text-muted))] uppercase tracking-wider">
              Saved Views
            </span>
          </div>

          {/* Views list */}
          <div className="p-1 max-h-64 overflow-y-auto">
            {views.map((view) => (
              <div
                key={view.id}
                className="group flex items-center justify-between"
              >
                <button
                  onClick={() => onViewChange(view)}
                  className={cn(
                    "flex-1 flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors text-left",
                    activeViewId === view.id
                      ? "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text))] font-medium"
                      : "text-[hsl(var(--admin-text-secondary))] hover:bg-[hsl(var(--admin-hover))] hover:text-[hsl(var(--admin-text))]"
                  )}
                >
                  {view.view_mode === "board" ? (
                    <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <TableIcon className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <InlineViewRename
                    value={view.name}
                    isSystem={view.is_system}
                    onSave={async (name) => {
                      await onUpdateView(view.id, { name });
                    }}
                  />
                  {view.is_default && (
                    <Star className="h-3 w-3 text-[hsl(var(--admin-warning))] fill-current shrink-0" />
                  )}
                  {activeViewId === view.id && (
                    <Check className="h-3.5 w-3.5 text-[hsl(var(--admin-success))] ml-auto shrink-0" />
                  )}
                </button>
                
                {/* Delete action (only for non-system views) */}
                {!view.is_system && (
                  <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleDelete(view.id)}
                      className="p-1 rounded hover:bg-[hsl(var(--admin-error-muted))] text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-error))]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Create new view */}
          <div className="border-t border-[hsl(var(--admin-border))] p-1">
            <button
              onClick={() => setIsCreateDialogOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-[hsl(var(--admin-text-secondary))] hover:bg-[hsl(var(--admin-hover))] hover:text-[hsl(var(--admin-text))] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Create view
            </button>
          </div>
        </div>
      </AdminDropdown>

      {/* Create View Dialog */}
      <AdminDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <AdminDialogContent className="max-w-sm">
          <AdminDialogHeader>
            <AdminDialogTitle>Create View</AdminDialogTitle>
            <AdminDialogDescription>Create a new saved view with custom filters.</AdminDialogDescription>
          </AdminDialogHeader>
          <AdminDialogBody>
            <div className="space-y-4">
              <div className="space-y-2">
                <AdminLabel>View name</AdminLabel>
                <AdminInput
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="My custom view"
                />
              </div>
              <div className="space-y-2">
                <AdminLabel>Default layout</AdminLabel>
                <div className="flex gap-2">
                  <AdminButton
                    variant={newViewMode === "table" ? "admin" : "adminOutline"}
                    size="sm"
                    onClick={() => setNewViewMode("table")}
                  >
                    <TableIcon className="h-4 w-4 mr-1.5" />
                    Table
                  </AdminButton>
                  <AdminButton
                    variant={newViewMode === "board" ? "admin" : "adminOutline"}
                    size="sm"
                    onClick={() => setNewViewMode("board")}
                  >
                    <LayoutGrid className="h-4 w-4 mr-1.5" />
                    Board
                  </AdminButton>
                </div>
              </div>
            </div>
          </AdminDialogBody>
          <AdminDialogFooter>
            <AdminButton variant="adminOutline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton 
              variant="admin" 
              onClick={handleCreate} 
              disabled={!newViewName.trim() || isSubmitting}
            >
              Create View
            </AdminButton>
          </AdminDialogFooter>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}
