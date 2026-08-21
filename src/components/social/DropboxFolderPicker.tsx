import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminButton, AdminInput, AdminBadge } from "@/components/admin";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetFooter,
} from "@/components/admin/AdminSheet";
import { Folder, FolderOpen, ChevronRight, Loader2, Home, Image, ArrowLeft, Check, Square, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { AdminScrollArea } from "@/components/admin";

const LAST_DROPBOX_PATH_KEY = "dropbox_last_browsed_path";

interface DropboxFolder {
  id: string;
  name: string;
  path: string;
  path_lower: string;
}

interface DropboxFolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (paths: string[]) => void;
  initialPath?: string;
  multiSelect?: boolean;
}

export function DropboxFolderPicker({ 
  open, 
  onOpenChange, 
  onSelect, 
  initialPath = "",
  multiSelect = false 
}: DropboxFolderPickerProps) {
  const getStartPath = useCallback(() => {
    if (initialPath) return initialPath;
    const storedPath = localStorage.getItem(LAST_DROPBOX_PATH_KEY);
    return storedPath || "";
  }, [initialPath]);

  const [currentPath, setCurrentPath] = useState(getStartPath());
  const [folders, setFolders] = useState<DropboxFolder[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());

  const loadFolders = async (path: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke("list-dropbox-folders", {
        body: { path },
      });

      if (fnError) throw fnError;
      if (data.error) {
        if (data.error.includes("token") || data.error.includes("401")) {
          throw new Error("Dropbox access token is invalid or expired. Please update it in settings.");
        }
        throw new Error(data.error);
      }

      setFolders(data.folders);
      setImageCount(data.imageCount || 0);
      setCurrentPath(path);
      // Save browsed path for next time
      localStorage.setItem(LAST_DROPBOX_PATH_KEY, path);
    } catch (err: any) {
      console.error("Failed to load folders:", err);
      setError(err.message || "Failed to load folders");
      toast.error("Failed to load Dropbox folders");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setSelectedFolders(new Set());
      loadFolders(getStartPath());
    }
    onOpenChange(isOpen);
  };

  const navigateToFolder = (path: string) => {
    loadFolders(path);
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    const parentPath = parts.length ? "/" + parts.join("/") : "";
    loadFolders(parentPath);
  };

  const toggleFolderSelection = (folderPath: string) => {
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const handleSelect = () => {
    if (multiSelect) {
      if (selectedFolders.size > 0) {
        onSelect(Array.from(selectedFolders));
        onOpenChange(false);
        setSelectedFolders(new Set());
      } else {
        toast.error("Please select at least one folder");
      }
    } else {
      if (currentPath) {
        onSelect([currentPath]);
        onOpenChange(false);
      } else {
        toast.error("Please navigate to a folder first");
      }
    }
  };

  const handleFolderClick = (folder: DropboxFolder, e: React.MouseEvent) => {
    if (multiSelect) {
      // In multi-select mode, click toggles selection, double-click navigates
      toggleFolderSelection(folder.path);
    } else {
      navigateToFolder(folder.path);
    }
  };

  const handleFolderDoubleClick = (folder: DropboxFolder) => {
    if (multiSelect) {
      navigateToFolder(folder.path);
    }
  };

  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <AdminSheet open={open} onOpenChange={handleOpenChange}>
      <AdminSheetContent side="right" className="w-full sm:max-w-lg">
        <AdminSheetHeader>
          <AdminSheetTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {multiSelect ? "Select Folders" : "Browse Dropbox"}
          </AdminSheetTitle>
        </AdminSheetHeader>

        <div className="flex-1 flex flex-col gap-4 py-4 overflow-hidden">
          {/* Multi-select hint */}
          {multiSelect && (
            <div className="text-sm text-[hsl(var(--admin-text-muted))] bg-[hsl(var(--admin-hover))] rounded-lg px-3 py-2">
              Click to select folders • Double-click to navigate into a folder
            </div>
          )}

          {/* Breadcrumb navigation */}
          <div className="flex items-center gap-1 text-sm overflow-x-auto pb-1">
            <AdminButton
              variant="adminGhost"
              size="sm"
              onClick={() => navigateToFolder("")}
              className="flex items-center gap-1 px-2 py-1"
            >
              <Home className="h-3.5 w-3.5" />
            </AdminButton>
            {pathParts.map((part, index) => (
              <div key={index} className="flex items-center">
                <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--admin-text-muted))]" />
                <AdminButton
                  variant="adminGhost"
                  size="sm"
                  onClick={() => navigateToFolder("/" + pathParts.slice(0, index + 1).join("/"))}
                  className="px-2 py-1 truncate max-w-[120px]"
                >
                  {part}
                </AdminButton>
              </div>
            ))}
          </div>

          {/* Current path and selection count */}
          <div className="flex items-center gap-2">
            <AdminInput
              value={currentPath || "/"}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            {multiSelect && selectedFolders.size > 0 && (
              <AdminBadge intent="info" size="sm">
                {selectedFolders.size} selected
              </AdminBadge>
            )}
            {!multiSelect && imageCount > 0 && (
              <div className="flex items-center gap-1 text-sm text-[hsl(var(--admin-text-muted))] whitespace-nowrap">
                <Image className="h-4 w-4" />
                {imageCount} photos
              </div>
            )}
          </div>

          {/* Folder list */}
          <div className="flex-1 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-surface))] overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
              </div>
            ) : error ? (
              <div className="py-8 px-4 text-center">
                <p className="text-[hsl(var(--admin-error))] text-sm">{error}</p>
                <AdminButton 
                  variant="adminGhost" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => loadFolders(currentPath)}
                >
                  Try again
                </AdminButton>
              </div>
            ) : (
              <AdminScrollArea className="h-[320px]">
                <div className="p-1">
                  {currentPath && (
                    <AdminButton
                      variant="adminGhost"
                      onClick={navigateUp}
                      className="w-full flex items-center justify-start gap-3 px-3 py-2.5"
                    >
                      <ArrowLeft className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                      <span className="text-[hsl(var(--admin-text-muted))]">..</span>
                    </AdminButton>
                  )}
                  {folders.length === 0 && !currentPath ? (
                    <div className="py-8 text-center text-[hsl(var(--admin-text-muted))] text-sm">
                      No folders found
                    </div>
                  ) : folders.length === 0 ? (
                    <div className="py-6 text-center text-sm">
                      <span className="text-[hsl(var(--admin-text-muted))]">No subfolders here</span>
                      {imageCount > 0 && (
                        <p className="mt-1 text-[hsl(var(--admin-primary))]">
                          Found {imageCount} photos in this folder
                        </p>
                      )}
                    </div>
                  ) : (
                    folders.map((folder) => {
                      const isSelected = selectedFolders.has(folder.path);
                      return (
                        <AdminButton
                          key={folder.id}
                          variant="adminGhost"
                          onClick={(e) => handleFolderClick(folder, e)}
                          onDoubleClick={() => handleFolderDoubleClick(folder)}
                          className={`w-full flex items-center justify-start gap-3 px-3 py-2.5 group ${
                            isSelected ? "bg-[hsl(var(--admin-primary)/0.1)]" : ""
                          }`}
                        >
                          {multiSelect && (
                            isSelected ? (
                              <CheckSquare className="h-4 w-4 text-[hsl(var(--admin-primary))]" />
                            ) : (
                              <Square className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                            )
                          )}
                          <Folder className={`h-4 w-4 ${isSelected ? "text-[hsl(var(--admin-primary))]" : "text-[hsl(var(--admin-primary))]"}`} />
                          <span className={`flex-1 truncate text-left ${isSelected ? "text-[hsl(var(--admin-primary))] font-medium" : "text-[hsl(var(--admin-text))]"}`}>
                            {folder.name}
                          </span>
                          <ChevronRight className="h-4 w-4 text-[hsl(var(--admin-text-muted))] opacity-0 group-hover:opacity-100 transition-opacity" />
                        </AdminButton>
                      );
                    })
                  )}
                </div>
              </AdminScrollArea>
            )}
          </div>

          {/* Selected folders preview (multi-select only) */}
          {multiSelect && selectedFolders.size > 0 && (
            <div className="border border-[hsl(var(--admin-border))] rounded-lg p-3 bg-[hsl(var(--admin-hover))]">
              <div className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-2">Selected folders:</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedFolders).map((path) => (
                  <AdminBadge 
                    key={path} 
                    intent="neutral" 
                    size="sm"
                    className="cursor-pointer hover:line-through"
                    onClick={() => toggleFolderSelection(path)}
                  >
                    {path.split("/").pop()}
                  </AdminBadge>
                ))}
              </div>
            </div>
          )}
        </div>

        <AdminSheetFooter className="flex-row justify-between gap-2 pt-4 border-t border-[hsl(var(--admin-border))]">
          <AdminButton variant="adminGhost" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton 
            variant="admin" 
            onClick={handleSelect}
            disabled={multiSelect ? selectedFolders.size === 0 : !currentPath}
          >
            <Check className="h-4 w-4 mr-1" />
            {multiSelect 
              ? `Add ${selectedFolders.size} Folder${selectedFolders.size !== 1 ? "s" : ""}`
              : "Select This Folder"
            }
          </AdminButton>
        </AdminSheetFooter>
      </AdminSheetContent>
    </AdminSheet>
  );
}
