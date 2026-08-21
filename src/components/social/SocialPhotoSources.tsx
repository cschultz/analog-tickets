import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle, AdminButton, AdminInput, AdminBadge, AdminLabel } from "@/components/admin";
import { AdminSheet, AdminSheetContent, AdminSheetHeader, AdminSheetTitle, AdminSheetFooter } from "@/components/admin/AdminSheet";
import { Plus, FolderSync, Trash2, Pencil, RefreshCw, Loader2, FolderOpen, Check, X, Link2, XCircle, AlertTriangle } from "lucide-react";
import { AdminTooltipProvider, AdminTooltip } from "@/components/admin/AdminTooltip";
import { toast } from "sonner";
import { format, formatDistanceToNow, differenceInMinutes } from "date-fns";
import { DropboxFolderPicker } from "./DropboxFolderPicker";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";

interface PhotoSource {
  id: string;
  folder_path: string;
  photographer_name: string | null;
  instagram_handle: string | null;
  photo_year: number | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

interface Photographer {
  name: string;
  instagram_handle: string | null;
}

interface SyncJob {
  id: string;
  status: string;
  total_sources: number;
  processed_sources: number;
  current_folder: string | null;
  total_imported: number;
  total_skipped: number;
  total_failed: number;
  error_message?: string | null;
  started_at?: string;
}

const SYNC_TIMEOUT_MINUTES = 10; // Consider stuck after 10 minutes

export function SocialPhotoSources({ eventId }: { eventId?: string }) {
  const queryClient = useQueryClient();
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    photographer_name: "",
    instagram_handle: "",
    photo_year: new Date().getFullYear(),
  });
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [isAddingFolders, setIsAddingFolders] = useState(false);
  const [isRefreshingLinks, setIsRefreshingLinks] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["social-photo-sources", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("social_photo_sources")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PhotoSource[];
    },
    enabled: !!eventId,
  });

  // Check for running sync jobs on mount
  useEffect(() => {
    if (!eventId) return;
    
    const checkRunningJobs = async () => {
      const { data } = await supabase
        .from("sync_jobs")
        .select("*")
        .eq("event_id", eventId)
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setActiveJobId(data.id);
        setSyncJob(data as SyncJob);
      }
    };
    
    checkRunningJobs();
  }, [eventId]);

  // Check if sync job is stuck (no progress for SYNC_TIMEOUT_MINUTES)
  const isJobStuck = useMemo(() => {
    if (!syncJob || syncJob.status !== "running" || !syncJob.started_at) return false;
    const startedAt = new Date(syncJob.started_at);
    const minutesElapsed = differenceInMinutes(new Date(), startedAt);
    return minutesElapsed > SYNC_TIMEOUT_MINUTES;
  }, [syncJob]);

  // Subscribe to realtime updates for sync job
  useEffect(() => {
    if (!activeJobId) return;

    const channel = supabase
      .channel(`sync-job-${activeJobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sync_jobs",
          filter: `id=eq.${activeJobId}`,
        },
        (payload) => {
          const job = payload.new as SyncJob;
          setSyncJob(job);
          
          if (job.status === "completed") {
            toast.success(
              `Sync complete! Imported ${job.total_imported} photos (${job.total_skipped} skipped${job.total_failed > 0 ? `, ${job.total_failed} failed` : ""})`
            );
            setActiveJobId(null);
            setSyncJob(null);
            queryClient.invalidateQueries({ queryKey: ["social-photo-sources", eventId] });
            queryClient.invalidateQueries({ queryKey: ["social-photo-library", eventId] });
          } else if (job.status === "failed") {
            toast.error(`Sync failed: ${job.error_message || "Unknown error"}`);
            setActiveJobId(null);
            setSyncJob(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeJobId, eventId, queryClient]);

  // Extract unique photographers for dropdown
  const photographers = useMemo(() => {
    const unique = new Map<string, Photographer>();
    sources.forEach((source) => {
      if (source.photographer_name) {
        unique.set(source.photographer_name, {
          name: source.photographer_name,
          instagram_handle: source.instagram_handle,
        });
      }
    });
    return Array.from(unique.values());
  }, [sources]);

  const createMutation = useMutation({
    mutationFn: async (folders: string[]) => {
      const insertData = folders.map((folder_path) => ({
        folder_path,
        event_id: eventId,
        photo_year: new Date().getFullYear(),
      }));
      const { error } = await supabase
        .from("social_photo_sources")
        .insert(insertData);
      if (error) throw error;
    },
    onSuccess: (_, folders) => {
      queryClient.invalidateQueries({ queryKey: ["social-photo-sources", eventId] });
      toast.success(`Added ${folders.length} folder${folders.length !== 1 ? "s" : ""}`);
      setIsAddingFolders(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add folders");
      setIsAddingFolders(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PhotoSource> & { id: string }) => {
      const { error } = await supabase
        .from("social_photo_sources")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-photo-sources", eventId] });
      toast.success("Source updated");
      setEditingSourceId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update source");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("social_photo_sources")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-photo-sources", eventId] });
      toast.success("Photo source removed");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove source");
    },
  });

  const handleFoldersSelected = async (paths: string[]) => {
    setIsAddingFolders(true);
    
    try {
      // For each selected folder, check if it has subfolders and expand them
      const allFolderPaths: string[] = [];
      
      for (const path of paths) {
        const { data, error } = await supabase.functions.invoke("list-dropbox-folders", {
          body: { path },
        });
        
        if (error) {
          console.error("Error listing folder:", path, error);
          // If we can't list, just add the folder itself
          allFolderPaths.push(path);
          continue;
        }
        
        if (data.folders && data.folders.length > 0) {
          // Has subfolders - add each subfolder instead
          for (const subfolder of data.folders) {
            allFolderPaths.push(subfolder.path);
          }
        } else {
          // No subfolders - add the folder itself
          allFolderPaths.push(path);
        }
      }
      
      // Filter out duplicates and already-existing paths
      const existingPaths = new Set(sources.map(s => s.folder_path.toLowerCase()));
      const uniqueNewPaths = allFolderPaths.filter(
        (p, i, arr) => arr.indexOf(p) === i && !existingPaths.has(p.toLowerCase())
      );
      
      if (uniqueNewPaths.length === 0) {
        toast.info("All folders are already added");
        setIsAddingFolders(false);
        return;
      }
      
      createMutation.mutate(uniqueNewPaths);
    } catch (error: any) {
      console.error("Error expanding folders:", error);
      toast.error("Failed to process folders");
      setIsAddingFolders(false);
    }
  };

  const startEditing = (source: PhotoSource) => {
    setEditingSourceId(source.id);
    setEditFormData({
      photographer_name: source.photographer_name || "",
      instagram_handle: source.instagram_handle || "",
      photo_year: source.photo_year || new Date().getFullYear(),
    });
  };

  const cancelEditing = () => {
    setEditingSourceId(null);
  };

  const saveEditing = (id: string) => {
    updateMutation.mutate({
      id,
      photographer_name: editFormData.photographer_name || null,
      instagram_handle: editFormData.instagram_handle || null,
      photo_year: editFormData.photo_year || null,
    });
  };

  const handlePhotographerSelect = (name: string) => {
    const photographer = photographers.find((p) => p.name === name);
    if (photographer) {
      setEditFormData({
        ...editFormData,
        photographer_name: photographer.name,
        instagram_handle: photographer.instagram_handle || "",
      });
    }
  };

  const handleSync = async (source: PhotoSource) => {
    if (!eventId) return;
    
    setSyncingSourceId(source.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to sync photos");
        return;
      }

      const response = await supabase.functions.invoke("sync-dropbox-photos", {
        body: {
          sourceId: source.id,
          folderPath: source.folder_path,
          eventId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Sync failed");
      }

      const { stats } = response.data;
      queryClient.invalidateQueries({ queryKey: ["social-photo-sources", eventId] });
      queryClient.invalidateQueries({ queryKey: ["social-photo-library", eventId] });
      
      toast.success(
        `Synced ${stats.imported} new photos (${stats.skipped} already imported)`
      );
    } catch (error: any) {
      console.error("Sync error:", error);
      toast.error(error.message || "Failed to sync photos");
    } finally {
      setSyncingSourceId(null);
    }
  };

  const handleSyncAll = async () => {
    if (!eventId || sources.length === 0) return;
    
    const activeSources = sources.filter(s => s.is_active);
    if (activeSources.length === 0) {
      toast.error("No active sources to sync");
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to sync photos");
        return;
      }

      toast.info("Starting background sync...");
      
      const response = await supabase.functions.invoke("sync-dropbox-background", {
        body: { eventId },
      });

      console.log("Background sync response:", response);

      if (response.error) {
        throw new Error(response.error.message || "Failed to start sync");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      if (response.data?.jobId) {
        setActiveJobId(response.data.jobId);
        setSyncJob({
          id: response.data.jobId,
          status: "running",
          total_sources: response.data.totalSources,
          processed_sources: 0,
          current_folder: null,
          total_imported: 0,
          total_skipped: 0,
          total_failed: 0,
        });
        toast.success("Sync started in background - you can navigate away");
      }
    } catch (error: any) {
      console.error("Sync all error:", error);
      toast.error(error.message || "Failed to start sync");
    }
  };

  const handleCancelSync = async () => {
    if (!eventId) return;
    
    setIsCancelling(true);
    try {
      const response = await supabase.functions.invoke("cancel-sync-job", {
        body: activeJobId ? { jobId: activeJobId } : { eventId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to cancel");
      }

      setActiveJobId(null);
      setSyncJob(null);
      toast.success("Sync cancelled");
      queryClient.invalidateQueries({ queryKey: ["social-photo-sources", eventId] });
    } catch (error: any) {
      console.error("Cancel sync error:", error);
      toast.error(error.message || "Failed to cancel sync");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRefreshLinks = async () => {
    if (!eventId) return;
    
    setIsRefreshingLinks(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to refresh links");
        return;
      }

      toast.info("Refreshing expired photo links...");
      
      const response = await supabase.functions.invoke("refresh-dropbox-links", {
        body: { eventId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Refresh failed");
      }

      const { stats } = response.data;
      queryClient.invalidateQueries({ queryKey: ["social-photo-library", eventId] });
      
      if (stats.refreshed === 0 && stats.failed === 0) {
        toast.success("All photo links are still valid!");
      } else {
        toast.success(
          `Refreshed ${stats.refreshed} photo links${stats.failed > 0 ? ` (${stats.failed} failed)` : ""}`
        );
      }
    } catch (error: any) {
      console.error("Refresh links error:", error);
      toast.error(error.message || "Failed to refresh links");
    } finally {
      setIsRefreshingLinks(false);
    }
  };

  const isSyncing = !!activeJobId;

  return (
    <AdminCard>
      <AdminCardHeader className="flex flex-row items-center justify-between">
        <AdminCardTitle className="flex items-center gap-2">
          <FolderSync className="h-5 w-5" />
          Dropbox Sources
        </AdminCardTitle>
        <div className="flex items-center gap-2">
          {/* Refresh Links Button */}
          <AdminTooltipProvider>
            <AdminTooltip content="Refresh expired photo links (no re-sync needed)">
              <AdminButton 
                size="sm" 
                variant="adminGhost"
                onClick={handleRefreshLinks}
                disabled={isRefreshingLinks || isSyncing}
              >
                {isRefreshingLinks ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </AdminButton>
            </AdminTooltip>
          </AdminTooltipProvider>

          {/* Cancel Sync Button - only show when syncing or stuck */}
          {(isSyncing || isJobStuck) && (
            <AdminButton 
              size="sm" 
              variant="adminOutline"
              className="text-[hsl(var(--admin-error))] border-[hsl(var(--admin-error))] hover:bg-[hsl(var(--admin-error))]/10"
              onClick={handleCancelSync}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Cancel
            </AdminButton>
          )}

          <AdminButton 
            size="sm" 
            variant="adminOutline" 
            onClick={handleSyncAll}
            disabled={isSyncing || sources.length === 0}
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {syncJob ? `${syncJob.processed_sources}/${syncJob.total_sources}` : "Syncing..."}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Sync All
              </>
            )}
          </AdminButton>
          <AdminButton 
            size="sm" 
            variant="admin" 
            onClick={() => setFolderPickerOpen(true)}
            disabled={isAddingFolders}
          >
            {isAddingFolders ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Add Folders
          </AdminButton>
        </div>
      </AdminCardHeader>

      <DropboxFolderPicker
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        onSelect={handleFoldersSelected}
        multiSelect
      />

      {/* Progress bar during sync */}
      {isSyncing && syncJob && (
        <div className="px-4 pb-4">
          <div className={`rounded-lg p-3 border ${
            isJobStuck 
              ? "bg-[hsl(var(--admin-warning))]/10 border-[hsl(var(--admin-warning))]" 
              : "bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[hsl(var(--admin-text-muted))] flex items-center gap-2">
                {isJobStuck && <AlertTriangle className="h-4 w-4 text-[hsl(var(--admin-warning))]" />}
                {isJobStuck ? "Sync appears stuck" : `Syncing folder ${syncJob.processed_sources} of ${syncJob.total_sources}`}
              </span>
              {syncJob.current_folder && (
                <span className="text-sm font-medium truncate max-w-[200px]">
                  {syncJob.current_folder}
                </span>
              )}
            </div>
            <div className="h-2 bg-[hsl(var(--admin-muted))] rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  isJobStuck ? "bg-[hsl(var(--admin-warning))]" : "bg-[hsl(var(--admin-primary))]"
                }`}
                style={{ width: `${syncJob.total_sources > 0 ? (syncJob.processed_sources / syncJob.total_sources) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                {isJobStuck ? (
                  <>
                    Started {syncJob.started_at && formatDistanceToNow(new Date(syncJob.started_at), { addSuffix: true })} — 
                    <span className="text-[hsl(var(--admin-warning))]"> Click "Cancel" to reset and try again</span>
                  </>
                ) : (
                  "✓ Running in background - you can navigate away"
                )}
              </p>
              {isJobStuck && (
                <AdminButton 
                  size="sm" 
                  variant="adminOutline"
                  className="text-[hsl(var(--admin-error))] border-[hsl(var(--admin-error))] hover:bg-[hsl(var(--admin-error))]/10"
                  onClick={handleCancelSync}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                  )}
                  Cancel & Reset
                </AdminButton>
              )}
            </div>
          </div>
        </div>
      )}

      <AdminCardContent>
        {isLoading ? (
          <div className="py-8 text-center text-[hsl(var(--admin-text-muted))]">Loading...</div>
        ) : sources.length === 0 ? (
          <div className="py-12 text-center text-[hsl(var(--admin-text-muted))]">
            <FolderSync className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No photo sources connected</p>
            <p className="text-sm mt-1 max-w-xs mx-auto">
              Add Dropbox folders to import photos for review and publishing
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => {
              const isEditing = editingSourceId === source.id;
              
              return (
                <div
                  key={source.id}
                  className="p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <AdminTooltipProvider>
                          <AdminTooltip 
                            side="bottom"
                            content={
                              <div className="space-y-1 max-w-md">
                                <p className="font-mono text-xs break-all">{source.folder_path}</p>
                                {source.photographer_name && (
                                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                                    📸 {source.photographer_name}
                                    {source.instagram_handle && ` (@${source.instagram_handle})`}
                                  </p>
                                )}
                              </div>
                            }
                          >
                            <code className="text-sm font-mono text-[hsl(var(--admin-text))] bg-[hsl(var(--admin-hover))] px-2 py-0.5 rounded truncate max-w-[300px] cursor-help">
                              {source.folder_path}
                            </code>
                          </AdminTooltip>
                        </AdminTooltipProvider>
                        {source.is_active ? (
                          <AdminBadge intent="success" size="sm">Active</AdminBadge>
                        ) : (
                          <AdminBadge intent="neutral" size="sm">Inactive</AdminBadge>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <AdminLabel className="text-xs">Photographer</AdminLabel>
                              <div className="mt-1">
                                {photographers.length > 0 ? (
                                  <AdminSelect
                                    value={editFormData.photographer_name || "__new__"}
                                    onValueChange={(value) => {
                                      if (value === "__new__") {
                                        setEditFormData({ ...editFormData, photographer_name: "" });
                                      } else {
                                        handlePhotographerSelect(value);
                                      }
                                    }}
                                    placeholder="Select or add new"
                                    className="h-8 text-sm"
                                  >
                                    <AdminSelectItem value="__new__">+ Add new photographer</AdminSelectItem>
                                    {photographers.map((p) => (
                                      <AdminSelectItem key={p.name} value={p.name}>
                                        {p.name}
                                      </AdminSelectItem>
                                    ))}
                                  </AdminSelect>
                                ) : (
                                  <AdminInput
                                    value={editFormData.photographer_name}
                                    onChange={(e) => setEditFormData({ ...editFormData, photographer_name: e.target.value })}
                                    placeholder="Name"
                                    className="h-8 text-sm"
                                  />
                                )}
                              </div>
                              {photographers.length > 0 && (editFormData.photographer_name === "" || !photographers.find(p => p.name === editFormData.photographer_name)) && (
                                <AdminInput
                                  value={editFormData.photographer_name}
                                  onChange={(e) => setEditFormData({ ...editFormData, photographer_name: e.target.value })}
                                  placeholder="New photographer name"
                                  className="h-8 text-sm mt-2"
                                />
                              )}
                            </div>
                            <div>
                              <AdminLabel className="text-xs">Instagram @</AdminLabel>
                              <AdminInput
                                value={editFormData.instagram_handle}
                                onChange={(e) => setEditFormData({ ...editFormData, instagram_handle: e.target.value.replace("@", "") })}
                                placeholder="handle"
                                className="h-8 text-sm mt-1"
                              />
                            </div>
                            <div>
                              <AdminLabel className="text-xs">Year</AdminLabel>
                              <AdminInput
                                type="number"
                                value={editFormData.photo_year}
                                onChange={(e) => setEditFormData({ ...editFormData, photo_year: parseInt(e.target.value) || new Date().getFullYear() })}
                                className="h-8 text-sm mt-1"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <AdminButton size="sm" variant="admin" onClick={() => saveEditing(source.id)}>
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Save
                            </AdminButton>
                            <AdminButton size="sm" variant="adminGhost" onClick={cancelEditing}>
                              <X className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </AdminButton>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 mt-2 text-sm text-[hsl(var(--admin-text-muted))]">
                          {source.photographer_name ? (
                            <span>📸 {source.photographer_name}</span>
                          ) : (
                            <span className="italic opacity-60">No photographer</span>
                          )}
                          {source.instagram_handle && (
                            <span className="text-[hsl(var(--admin-primary))]">@{source.instagram_handle}</span>
                          )}
                          {source.photo_year && (
                            <span>📅 {source.photo_year}</span>
                          )}
                          {source.last_synced_at && (
                            <span>Last sync: {format(new Date(source.last_synced_at), "MMM d, h:mm a")}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {!isEditing && (
                      <div className="flex items-center gap-1">
                        <AdminButton size="icon" variant="adminGhost" onClick={() => startEditing(source)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </AdminButton>
                        <AdminButton
                          size="icon"
                          variant="adminGhost"
                          onClick={() => {
                            if (confirm("Remove this photo source?")) {
                              deleteMutation.mutate(source.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </AdminButton>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}
