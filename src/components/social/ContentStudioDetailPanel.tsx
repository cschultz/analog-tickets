/**
 * ContentStudioDetailPanel - Streamlined detail panel for photo editing
 * 
 * Simplified flow:
 * - Photo preview
 * - Caption input + AI chat
 * - Send to Cue (primary action at top)
 */

import { memo, useCallback } from "react";
import { 
  AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle, 
  AdminButton, AdminTextarea, AdminLabel 
} from "@/components/admin";
import { 
  X, Pencil, Send, MessageCircle, Loader2,
  Square, RectangleVertical, RectangleHorizontal, Camera
} from "lucide-react";
import { CarouselPhotoPicker } from "./CarouselPhotoPicker";
import { Switch } from "@/components/ui/switch";

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
  include_photographer_credit: boolean;
  photo: {
    id: string;
    file_name: string;
    storage_path: string | null;
    public_image_url: string | null;
    temporary_url: string | null;
    photographer_name: string | null;
    photographer_handle: string | null;
    photo_year: number | null;
    theme: string | null;
    caption_suggestions: string[] | null;
    storage_status: string | null;
    silence_recommended: boolean;
  } | null;
}

interface SocialLocation {
  id: string;
  name: string;
  instagram_location_id: string | null;
  is_default: boolean;
}

type AspectRatio = "square" | "portrait" | "landscape";

const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: typeof Square; ratio: string }[] = [
  { value: "square", label: "Square", icon: Square, ratio: "1:1" },
  { value: "portrait", label: "Portrait", icon: RectangleVertical, ratio: "4:5" },
  { value: "landscape", label: "Landscape", icon: RectangleHorizontal, ratio: "1.91:1" },
];

interface ContentStudioDetailPanelProps {
  selectedPost: PostSuggestion | null;
  eventId?: string;
  locations: SocialLocation[];
  editCaption: string;
  editFirstComment: string;
  selectedLocationId: string | null;
  generatingCaptionsFor: string | null;
  publishingPostId: string | null;
  onClose: () => void;
  onCaptionChange: (caption: string) => void;
  onFirstCommentChange: (comment: string) => void;
  onLocationChange: (locationId: string | null) => void;
  onSelectCaptionOption: (caption: string) => void;
  onToggleSilence: (post: PostSuggestion) => void;
  onSkip: (postId: string) => void;
  onSaveCaption: () => void;
  onSendToCue: (postId: string) => void;
  onOpenChat: () => void;
  onGenerateCaptions: (photoId: string) => void;
  onUpdatePost: (id: string, updates: Record<string, unknown>) => void;
  onUpdateLocalPost: (updates: Partial<PostSuggestion>) => void;
}

export const ContentStudioDetailPanel = memo(function ContentStudioDetailPanel({
  selectedPost,
  eventId,
  editCaption,
  editFirstComment,
  publishingPostId,
  onClose,
  onCaptionChange,
  onFirstCommentChange,
  onToggleSilence,
  onSkip,
  onSendToCue,
  onOpenChat,
  onUpdatePost,
  onUpdateLocalPost,
}: ContentStudioDetailPanelProps) {
  const getPhotoUrl = useCallback((post: PostSuggestion) => {
    return post.photo?.public_image_url || post.photo?.temporary_url || post.photo?.storage_path;
  }, []);

  if (!selectedPost) {
    return (
      <AdminCard>
        <AdminCardContent className="py-12">
          <div className="text-center text-[hsl(var(--admin-text-muted))]">
            <Pencil className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Select a photo</p>
            <p className="text-sm mt-1">
              Click any photo to add a caption and send to Cue
            </p>
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  const canSend = editCaption || selectedPost.use_silence;

  return (
    <AdminCard className="max-h-[calc(100vh-12rem)] flex flex-col">
      <AdminCardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <AdminCardTitle className="text-base">Edit Post</AdminCardTitle>
          <AdminButton size="sm" variant="adminGhost" onClick={onClose}>
            <X className="h-4 w-4" />
          </AdminButton>
        </div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-3 overflow-y-auto flex-1 min-h-0">
        {/* PRIMARY ACTION - Send to Cue */}
        <AdminButton
          variant="admin"
          onClick={() => onSendToCue(selectedPost.id)}
          disabled={!canSend || publishingPostId === selectedPost.id}
          className="w-full"
        >
          {publishingPostId === selectedPost.id ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-1" />
          )}
          Send to Cue
        </AdminButton>

        {/* Photo preview with aspect ratio */}
        <div 
          className={`
            bg-[hsl(var(--admin-hover))] rounded-lg overflow-hidden relative mx-auto
            ${selectedPost.aspect_ratio === "portrait" ? "aspect-[4/5] max-w-[200px]" : ""}
            ${selectedPost.aspect_ratio === "landscape" ? "aspect-[1.91/1] w-full" : ""}
            ${selectedPost.aspect_ratio === "square" || !selectedPost.aspect_ratio ? "aspect-square max-w-[200px]" : ""}
          `}
        >
          <img
            src={getPhotoUrl(selectedPost) || ""}
            alt={selectedPost.photo?.file_name || "Photo"}
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Frame selector - compact */}
        <div className="flex gap-1">
          {ASPECT_RATIOS.map(({ value, icon: Icon, ratio }) => (
            <AdminButton
              key={value}
              size="sm"
              variant={selectedPost.aspect_ratio === value ? "admin" : "adminOutline"}
              onClick={() => {
                onUpdatePost(selectedPost.id, { aspect_ratio: value });
                onUpdateLocalPost({ aspect_ratio: value });
              }}
              className="flex-1 flex items-center justify-center gap-1 h-8"
            >
              <Icon className="h-3 w-3" />
              <span className="text-xs">{ratio}</span>
            </AdminButton>
          ))}
        </div>
        
        {/* Carousel option */}
        {eventId && (
          <CarouselPhotoPicker
            postId={selectedPost.id}
            eventId={eventId}
            isCarousel={selectedPost.is_carousel || false}
            onToggleCarousel={(isCarousel) => {
              onUpdatePost(selectedPost.id, { is_carousel: isCarousel });
              onUpdateLocalPost({ is_carousel: isCarousel });
            }}
          />
        )}

        {/* Caption input */}
        <div>
          <AdminLabel className="text-xs mb-1 block">Caption</AdminLabel>
          <AdminTextarea
            value={editCaption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Write a caption..."
            className="min-h-[70px] text-sm"
          />
        </div>

        {/* AI Brainstorm button */}
        <AdminButton variant="adminOutline" onClick={onOpenChat} className="w-full" size="sm">
          <MessageCircle className="h-4 w-4 mr-1" />
          Brainstorm with AI
        </AdminButton>

        {/* First Comment - collapsed by default, just a simple input */}
        <div>
          <AdminLabel className="text-xs mb-1 block text-[hsl(var(--admin-text-muted))]">
            First Comment (hashtags)
          </AdminLabel>
          <AdminTextarea
            value={editFirstComment}
            onChange={(e) => onFirstCommentChange(e.target.value)}
            placeholder="#analogcommons #livemusic..."
            className="min-h-[40px] text-sm"
          />
        </div>

        {/* Photographer Credit Toggle - only if handle exists */}
        {selectedPost.photo?.photographer_handle && (
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-[hsl(var(--admin-hover))]">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              <span className="text-xs">Credit @{selectedPost.photo.photographer_handle}</span>
            </div>
            <Switch
              checked={selectedPost.include_photographer_credit}
              onCheckedChange={(checked) => {
                onUpdatePost(selectedPost.id, { include_photographer_credit: checked });
                onUpdateLocalPost({ include_photographer_credit: checked });
              }}
            />
          </div>
        )}

      </AdminCardContent>
    </AdminCard>
  );
});
