import { useState, useMemo, memo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  AdminCard, AdminCardContent, AdminButton, AdminBadge
} from "@/components/admin";
import { 
  X, Loader2, VolumeX, RefreshCw, 
  ExternalLink, Image as ImageIcon, Zap
} from "lucide-react";
import { CaptionChatDrawer } from "./CaptionChatDrawer";
import { ContentStudioDetailPanel } from "./ContentStudioDetailPanel";
import { ContentStudioMobileDetail } from "./ContentStudioMobileDetail";
import { ContentStudioSkeleton } from "./ContentStudioSkeleton";
import { LazyImage } from "./LazyImage";
import { toast } from "sonner";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePhotoProcessing } from "@/hooks/usePhotoProcessing";


interface PostSuggestion {
  id: string;
  scheduled_for: string;
  caption: string | null;
  caption_skipped: boolean;
  use_silence: boolean;
  aspect_ratio: "square" | "portrait" | "landscape";
  first_comment: string | null;
  location_id: string | null;
  is_carousel: boolean;
  status: "draft" | "approved" | "scheduled" | "posted" | "failed" | "skipped" | "publishing";
  cue_post_id: string | null;
  photo: {
    id: string;
    file_name: string;
    thumbnail_url: string | null;  // 400px fast grid loading
    preview_url: string | null;    // 1080px detail view & AI vision
    storage_path: string | null;
    storage_url: string | null;
    public_image_url: string | null;
    temporary_url: string | null;
    photographer_name: string | null;
    photographer_handle: string | null;
    photo_year: number | null;
    theme: string | null;
    caption_suggestions: string[] | null;
    storage_status: string | null;
    sync_status: string | null;
    silence_recommended: boolean;
  } | null;
  include_photographer_credit: boolean;
}

interface SocialLocation {
  id: string;
  name: string;
  instagram_location_id: string | null;
  is_default: boolean;
}

const CUE_DASHBOARD_URL = "https://app.oncue.so/dashboard";

// Memoized photo grid item to prevent unnecessary re-renders
const PhotoGridItem = memo(({ 
  post, 
  isSelected,
  isFocused,
  onSelect, 
  onToggleSilence,
  isMobile = false 
}: { 
  post: PostSuggestion; 
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (post: PostSuggestion) => void;
  onToggleSilence: (post: PostSuggestion) => void;
  isMobile?: boolean;
}) => {
  // Prioritize: thumbnail (400px fast) > storage with render transform > preview > Dropbox temporary
  const storageUrl = post.photo?.storage_url || post.photo?.public_image_url;
  const thumbnailUrl = post.photo?.thumbnail_url || (
    storageUrl?.includes("supabase.co/storage")
      ? storageUrl.replace("/object/public/", "/render/image/public/") + "?width=400&height=400&quality=75&resize=cover"
      : null
  );
  const photoUrl = thumbnailUrl || post.photo?.preview_url || storageUrl || post.photo?.temporary_url;
  
  return (
    <div
      tabIndex={0}
      onClick={() => onSelect(post)}
      data-photo-id={post.id}
      className={`
        relative aspect-square rounded-lg overflow-hidden cursor-pointer group outline-none
        transition-all duration-200 touch-manipulation
        ${isSelected ? "ring-2 ring-[hsl(var(--admin-accent))] ring-offset-2 ring-offset-[hsl(var(--admin-surface))]" : ""}
        ${isFocused && !isSelected ? "ring-2 ring-[hsl(var(--admin-border))] ring-offset-1 ring-offset-[hsl(var(--admin-surface))]" : ""}
        ${!isSelected && !isFocused ? "hover:ring-1 hover:ring-[hsl(var(--admin-border))]" : ""}
      `}
    >
      <LazyImage
        src={photoUrl}
        alt={post.photo?.file_name || "Photo"}
        className="w-full h-full object-cover"
        fallbackClassName="w-full h-full"
        fallbackSrc={storageUrl || post.photo?.temporary_url}
      />
      
      {/* Overlay gradient - always visible on mobile for better UX */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity ${isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
      
      {/* Silence indicator - always visible on mobile if active */}
      {post.use_silence && (
        <div className={`absolute ${isMobile ? "bottom-2 right-2 h-8 w-8" : "bottom-1 right-1 h-6 w-6"} rounded-full bg-black/70 flex items-center justify-center`}>
          <VolumeX className={`${isMobile ? "h-4 w-4" : "h-3 w-3"} text-[hsl(var(--admin-accent))]`} />
        </div>
      )}
      
      {/* Quick silence toggle on hover - hidden on mobile (use detail panel instead) */}
      {!isMobile && !post.use_silence && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSilence(post); }}
          className="absolute bottom-1 right-1 h-6 w-6 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
          title="Mark silent"
        >
          <VolumeX className="h-3 w-3 text-white" />
        </button>
      )}
      
      {/* Caption status indicator on mobile */}
      {isMobile && (post.caption || post.status === "approved") && (
        <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-[hsl(var(--admin-success))]" />
      )}
    </div>
  );
});
PhotoGridItem.displayName = 'PhotoGridItem';


export function ContentStudio({ eventId }: { eventId?: string }) {
  const queryClient = useQueryClient();
  const gridRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [selectedPost, setSelectedPost] = useState<PostSuggestion | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [generatingCaptionsFor, setGeneratingCaptionsFor] = useState<string | null>(null);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  
  const [editFirstComment, setEditFirstComment] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // Track grid columns for keyboard navigation
  const [gridColumns, setGridColumns] = useState(5);
  
  // Update grid columns on resize - 2 cols on mobile for larger photos
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 480) setGridColumns(2); // Mobile: 2 columns for larger photos
      else if (width < 640) setGridColumns(3);
      else if (width < 768) setGridColumns(4);
      else if (width < 1024) setGridColumns(5);
      else if (width < 1280) setGridColumns(4);
      else setGridColumns(5);
    };
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["content-studio-suggestions", eventId, refreshCounter],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("social_scheduled_posts")
        .select(`
          id,
          scheduled_for,
          caption,
          caption_skipped,
          use_silence,
          aspect_ratio,
          first_comment,
          location_id,
          is_carousel,
          status,
          cue_post_id,
          include_photographer_credit,
          photo:social_photos (
            id,
            file_name,
            thumbnail_url,
            preview_url,
            storage_path,
            storage_url,
            public_image_url,
            temporary_url,
            photographer_name,
            photographer_handle,
            photo_year,
            theme,
            caption_suggestions,
            storage_status,
            sync_status,
            silence_recommended
          )
        `)
        .eq("event_id", eventId)
        .in("status", ["draft", "approved"])
        .is("cue_post_id", null)
        .order("scheduled_for", { ascending: true })
        .limit(30);
      if (error) throw error;
      return data as unknown as PostSuggestion[];
    },
    enabled: !!eventId,
    staleTime: 0,
    gcTime: 0,
  });

  // Fetch locations
  const { data: locations = [] } = useQuery({
    queryKey: ["social-locations", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("social_locations")
        .select("id, name, instagram_location_id, is_default")
        .eq("event_id", eventId)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data as SocialLocation[];
    },
    enabled: !!eventId,
    staleTime: 60000,
  });

  // Keyboard navigation
  const selectedIndex = useMemo(() => 
    suggestions.findIndex(s => s.id === selectedPost?.id),
    [suggestions, selectedPost?.id]
  );

  const { focusedIndex, setFocusedIndex } = useKeyboardNavigation({
    containerRef: gridRef,
    itemSelector: "[data-photo-id]",
    columns: gridColumns,
    enabled: !chatOpen && suggestions.length > 0,
    onOpen: (_el, index) => {
      if (suggestions[index]) {
        handleSelectPost(suggestions[index]);
      }
    },
    onSelect: (_el, index) => {
      // Just update focus, don't select yet
    },
    onEscape: () => {
      setSelectedPost(null);
    },
  });

  // Image count for display (native lazy loading handles preloading)
  const totalCount = suggestions.length;

  // Counts - memoized
  const { readyCount, needsCaptionCount } = useMemo(() => ({
    readyCount: suggestions.filter(s => s.status === "approved" || (s.caption || s.use_silence)).length,
    needsCaptionCount: suggestions.filter(s => !s.caption && !s.use_silence).length,
  }), [suggestions]);

  const updatePostMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("social_scheduled_posts")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-studio-suggestions", eventId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update");
    },
  });

  const refreshSuggestionsMutation = useMutation({
    mutationFn: async () => {
      if (!eventId) throw new Error("No event selected");
      const response = await supabase.functions.invoke("generate-post-drafts", {
        body: { eventId, daysAhead: 60, maxSuggestions: 30, excludeRecentDays: 100 },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      setRefreshCounter(c => c + 1);
      const count = data?.drafts_created || 0;
      if (count > 0) {
        toast.success(`Added ${count} new suggestions`);
      } else {
        toast.info(data?.message || "No new suggestions available");
      }
      setIsRefreshing(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to refresh");
      setIsRefreshing(false);
    },
  });

  const generateCaptionMutation = useMutation({
    mutationFn: async ({ photoId }: { photoId: string }) => {
      if (!eventId) throw new Error("No event selected");
      const response = await supabase.functions.invoke("generate-captions", {
        body: { photoId, eventId },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-studio-suggestions", eventId] });
      toast.success("Captions generated");
      setGeneratingCaptionsFor(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to generate captions");
      setGeneratingCaptionsFor(null);
    },
  });

  // Batch caption generation removed - use chat-based caption flow instead

  const publishToCueMutation = useMutation({
    mutationFn: async ({ postId }: { postId: string }) => {
      const response = await supabase.functions.invoke("publish-to-cue", {
        body: { postId, publishNow: false },
      });
      if (response.error) {
        // Extract the actual error message from the response data
        const detail = response.data?.error || response.error?.message || "Failed to send to Cue";
        throw new Error(detail);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-studio-suggestions", eventId] });
      toast.success("Sent to Cue!");
      setPublishingPostId(null);
      setSelectedPost(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send to Cue");
      setPublishingPostId(null);
    },
  });

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshSuggestionsMutation.mutate();
  }, [refreshSuggestionsMutation]);

  const handleSelectPost = useCallback((post: PostSuggestion) => {
    const postWithDefaults = {
      ...post,
      aspect_ratio: post.aspect_ratio || "square" as const,
    };
    setSelectedPost(postWithDefaults);
    setEditCaption(post.caption || "");
    setEditFirstComment(post.first_comment || "");
    setSelectedLocationId(post.location_id || null);
    // Update focused index to match
    const idx = suggestions.findIndex(s => s.id === post.id);
    if (idx !== -1) setFocusedIndex(idx);
  }, [suggestions, setFocusedIndex]);

  const handleSaveCaption = useCallback(() => {
    if (!selectedPost) return;
    updatePostMutation.mutate({
      id: selectedPost.id,
      updates: { caption: editCaption || null, caption_skipped: false, use_silence: false, status: "approved" },
    });
    setSelectedPost(prev => prev ? { ...prev, caption: editCaption, status: "approved" } : null);
    toast.success("Caption saved");
  }, [selectedPost, editCaption, updatePostMutation]);

  const handleToggleSilence = useCallback((post: PostSuggestion) => {
    const newSilence = !post.use_silence;
    updatePostMutation.mutate({
      id: post.id,
      updates: { 
        caption: null, 
        caption_skipped: newSilence, 
        use_silence: newSilence,
        status: newSilence ? "approved" : "draft"
      },
    });
    if (selectedPost?.id === post.id) {
      setSelectedPost(prev => prev ? { ...prev, use_silence: newSilence, caption: null } : null);
    }
  }, [selectedPost?.id, updatePostMutation]);

  const handleSelectCaptionOption = useCallback((caption: string) => {
    if (!selectedPost) return;
    updatePostMutation.mutate({
      id: selectedPost.id,
      updates: { caption, caption_skipped: false, use_silence: false, status: "approved" },
    });
    setEditCaption(caption);
    setSelectedPost(prev => prev ? { ...prev, caption, status: "approved" } : null);
  }, [selectedPost, updatePostMutation]);

  const handleSendToCue = useCallback(async (postId: string) => {
    // Auto-save all pending edits to DB BEFORE sending to Cue
    // This fixes the bug where caption/aspect_ratio/first_comment exist only in local state
    if (selectedPost && selectedPost.id === postId) {
      const updates: Record<string, unknown> = {};
      if (editCaption) {
        updates.caption = editCaption;
        updates.caption_skipped = false;
        updates.use_silence = false;
        updates.status = "approved";
      }
      if (editFirstComment) {
        updates.first_comment = editFirstComment;
      }
      // aspect_ratio, location_id, include_photographer_credit are already saved on change
      // but caption and first_comment are only in local state until explicit save
      
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from("social_scheduled_posts")
          .update(updates)
          .eq("id", postId);
        if (error) {
          toast.error("Failed to save caption before sending");
          return;
        }
      }
    }
    
    setPublishingPostId(postId);
    publishToCueMutation.mutate({ postId });
  }, [publishToCueMutation, selectedPost, editCaption, editFirstComment]);

  const handleSkip = useCallback((postId: string) => {
    updatePostMutation.mutate({
      id: postId,
      updates: { status: "skipped" },
    });
    if (selectedPost?.id === postId) {
      setSelectedPost(null);
    }
  }, [selectedPost?.id, updatePostMutation]);

  const handleFirstCommentChange = useCallback((comment: string) => {
    setEditFirstComment(comment);
    if (selectedPost) {
      updatePostMutation.mutate({
        id: selectedPost.id,
        updates: { first_comment: comment || null },
      });
    }
  }, [selectedPost, updatePostMutation]);

  const handleLocationChange = useCallback((locationId: string | null) => {
    setSelectedLocationId(locationId);
    if (selectedPost) {
      updatePostMutation.mutate({
        id: selectedPost.id,
        updates: { location_id: locationId },
      });
    }
  }, [selectedPost, updatePostMutation]);

  const handleGenerateCaptions = useCallback((photoId: string) => {
    setGeneratingCaptionsFor(photoId);
    generateCaptionMutation.mutate({ photoId });
  }, [generateCaptionMutation]);

  const handleUpdatePost = useCallback((id: string, updates: Record<string, unknown>) => {
    updatePostMutation.mutate({ id, updates });
  }, [updatePostMutation]);

  const handleUpdateLocalPost = useCallback((updates: Partial<PostSuggestion>) => {
    setSelectedPost(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const { isRunning, pending, isLoading: cronLoading, startProcessing, stopProcessing } = usePhotoProcessing(eventId);

  if (isLoading) {
    return <ContentStudioSkeleton />;
  }


  return (
    <div className="space-y-4">
      {/* Photo processing banner */}
      {(pending > 0 || isRunning) && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[hsl(var(--admin-hover))] border border-[hsl(var(--admin-border))]">
          <Zap className="h-4 w-4 text-[hsl(var(--admin-accent))] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[hsl(var(--admin-text))]">
              {isRunning
                ? `Processing photos... ${pending} remaining (auto-stops when done)`
                : `${pending} photos need uploading for faster loading`}
            </p>
          </div>
          {isRunning ? (
            <AdminButton size="sm" variant="adminOutline" onClick={stopProcessing} disabled={cronLoading} className="shrink-0">
              {cronLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Stop"}
            </AdminButton>
          ) : (
            <AdminButton size="sm" variant="admin" onClick={startProcessing} disabled={cronLoading} className="shrink-0">
              {cronLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Zap className="h-3 w-3 mr-1" /> Process</>}
            </AdminButton>
          )}
        </div>
      )}

      {/* Header with actions - simplified on mobile */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[hsl(var(--admin-text))]">
              Content Studio
            </h3>
            <p className="text-sm text-[hsl(var(--admin-text-muted))]">
              {suggestions.length} photos • {readyCount} ready
            </p>
          </div>
          {/* Cue link - always visible */}
          <AdminButton 
            size="sm" 
            variant="adminGhost" 
            onClick={() => window.open(CUE_DASHBOARD_URL, "_blank")}
            className="shrink-0"
          >
            <ExternalLink className="h-4 w-4" />
            {!isMobile && <span className="ml-1">Go to Cue</span>}
          </AdminButton>
        </div>
        
        {/* Action buttons - stack on mobile */}
        <div className={`flex gap-2 ${isMobile ? "flex-col" : "flex-row flex-wrap"}`}>
          <AdminButton 
            size="sm" 
            variant="admin" 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className={isMobile ? "w-full justify-center min-h-[44px]" : ""}
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {isRefreshing ? "Refreshing..." : "Refresh Suggestions"}
          </AdminButton>
      </div>
      </div>

      {suggestions.length === 0 ? (
        <AdminCard>
          <AdminCardContent className="py-12">
            <div className="text-center text-[hsl(var(--admin-text-muted))]">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No post suggestions yet</p>
              <p className="text-sm mt-1 mb-4">
                Approve photos in the Sources tab, then refresh suggestions
              </p>
              <AdminButton onClick={handleRefresh} disabled={isRefreshing}>
                {isRefreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh Suggestions
              </AdminButton>
            </div>
          </AdminCardContent>
        </AdminCard>
      ) : (
        <>
          {/* Photo Wall - 2 columns on mobile for larger photos */}
          <div className={isMobile ? "" : "grid gap-4 lg:grid-cols-[1fr_380px]"}>
            <div 
              ref={gridRef}
              className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3"
            >
              {suggestions.map((post, index) => (
                <PhotoGridItem
                  key={post.id}
                  post={post}
                  isSelected={selectedPost?.id === post.id}
                  isFocused={focusedIndex === index}
                  onSelect={handleSelectPost}
                  onToggleSilence={handleToggleSilence}
                  isMobile={isMobile}
                />
              ))}
            </div>

            {/* Desktop Detail Panel */}
            {!isMobile && (
              <div className="lg:sticky lg:top-4 lg:self-start hidden lg:block">
                <ContentStudioDetailPanel
                  selectedPost={selectedPost}
                  eventId={eventId}
                  locations={locations}
                  editCaption={editCaption}
                  editFirstComment={editFirstComment}
                  selectedLocationId={selectedLocationId}
                  generatingCaptionsFor={generatingCaptionsFor}
                  publishingPostId={publishingPostId}
                  onClose={() => setSelectedPost(null)}
                  onCaptionChange={setEditCaption}
                  onFirstCommentChange={handleFirstCommentChange}
                  onLocationChange={handleLocationChange}
                  onSelectCaptionOption={handleSelectCaptionOption}
                  onToggleSilence={handleToggleSilence}
                  onSkip={handleSkip}
                  onSaveCaption={handleSaveCaption}
                  onSendToCue={handleSendToCue}
                  onOpenChat={() => setChatOpen(true)}
                  onGenerateCaptions={handleGenerateCaptions}
                  onUpdatePost={handleUpdatePost}
                  onUpdateLocalPost={handleUpdateLocalPost}
                />
              </div>
            )}
          </div>

          {/* Mobile Detail Drawer */}
          {isMobile && (
            <ContentStudioMobileDetail
              open={!!selectedPost}
              selectedPost={selectedPost}
              eventId={eventId}
              locations={locations}
              editCaption={editCaption}
              editFirstComment={editFirstComment}
              selectedLocationId={selectedLocationId}
              generatingCaptionsFor={generatingCaptionsFor}
              publishingPostId={publishingPostId}
              onClose={() => setSelectedPost(null)}
              onCaptionChange={setEditCaption}
              onFirstCommentChange={handleFirstCommentChange}
              onLocationChange={handleLocationChange}
              onSelectCaptionOption={handleSelectCaptionOption}
              onToggleSilence={handleToggleSilence}
              onSkip={handleSkip}
              onSaveCaption={handleSaveCaption}
              onSendToCue={handleSendToCue}
              onOpenChat={() => setChatOpen(true)}
              onGenerateCaptions={handleGenerateCaptions}
              onUpdatePost={handleUpdatePost}
              onUpdateLocalPost={handleUpdateLocalPost}
            />
          )}
        </>
      )}

      {/* Caption Chat Drawer */}
      <CaptionChatDrawer
        open={chatOpen}
        onOpenChange={setChatOpen}
        photo={selectedPost?.photo ? {
          id: selectedPost.photo.id,
          file_name: selectedPost.photo.file_name,
          theme: selectedPost.photo.theme || undefined,
          photographer_name: selectedPost.photo.photographer_name || undefined,
          public_image_url: selectedPost.photo.public_image_url || undefined,
          temporary_url: selectedPost.photo.temporary_url || undefined,
          storage_url: selectedPost.photo.storage_url || undefined,
          caption_suggestions: selectedPost.photo.caption_suggestions || undefined,
        } : null}
        onCaptionSelected={(caption) => {
          setEditCaption(caption);
          setChatOpen(false);
          if (selectedPost) {
            updatePostMutation.mutate({
              id: selectedPost.id,
              updates: { caption, caption_skipped: false, use_silence: false, status: "approved" },
            });
            setSelectedPost(prev => prev ? { ...prev, caption, status: "approved" } : null);
          }
        }}
      />
    </div>
  );
}
