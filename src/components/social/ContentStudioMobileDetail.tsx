/**
 * ContentStudioMobileDetail - Full-screen mobile drawer for photo editing
 * 
 * Streamlined for speed:
 * - Send to Cue at top
 * - Caption + AI chat
 * - Minimal options
 */

import { memo, useCallback } from "react";
import { 
  AdminButton, AdminTextarea, AdminLabel 
} from "@/components/admin";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { 
  Send, MessageCircle, Loader2,
  Square, RectangleVertical, RectangleHorizontal, ChevronDown, Camera
} from "lucide-react";
import { CarouselPhotoPicker } from "./CarouselPhotoPicker";

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

const ASPECT_RATIOS: { value: AspectRatio; icon: typeof Square; ratio: string }[] = [
  { value: "square", icon: Square, ratio: "1:1" },
  { value: "portrait", icon: RectangleVertical, ratio: "4:5" },
  { value: "landscape", icon: RectangleHorizontal, ratio: "1.91:1" },
];

interface ContentStudioMobileDetailProps {
  open: boolean;
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

export const ContentStudioMobileDetail = memo(function ContentStudioMobileDetail({
  open,
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
}: ContentStudioMobileDetailProps) {
  const getPhotoUrl = useCallback((post: PostSuggestion) => {
    return post.photo?.public_image_url || post.photo?.temporary_url || post.photo?.storage_path;
  }, []);

  if (!selectedPost) return null;

  const canSend = editCaption || selectedPost.use_silence;

  return (
    <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-[hsl(var(--admin-background))]">
        <DrawerHeader className="pb-2 border-b border-[hsl(var(--admin-border))]">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-[hsl(var(--admin-text))]">Edit Post</DrawerTitle>
            <AdminButton size="sm" variant="adminGhost" onClick={onClose} className="min-h-[44px] min-w-[44px]">
              <ChevronDown className="h-5 w-5" />
            </AdminButton>
          </div>
        </DrawerHeader>
        
        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
          {/* Photo preview - compact */}
          <div 
            className={`
              bg-[hsl(var(--admin-hover))] rounded-xl overflow-hidden relative mx-auto mt-3
              ${selectedPost.aspect_ratio === "portrait" ? "aspect-[4/5] max-w-[60%]" : ""}
              ${selectedPost.aspect_ratio === "landscape" ? "aspect-[1.91/1] w-full" : ""}
              ${selectedPost.aspect_ratio === "square" || !selectedPost.aspect_ratio ? "aspect-square max-w-[60%]" : ""}
            `}
          >
            <img
              src={getPhotoUrl(selectedPost) || ""}
              alt={selectedPost.photo?.file_name || "Photo"}
              className="w-full h-full object-cover"
            />
          </div>
          
          {/* Frame selector - compact row */}
          <div className="flex gap-2">
            {ASPECT_RATIOS.map(({ value, icon: Icon, ratio }) => (
              <AdminButton
                key={value}
                size="sm"
                variant={selectedPost.aspect_ratio === value ? "admin" : "adminOutline"}
                onClick={() => {
                  onUpdatePost(selectedPost.id, { aspect_ratio: value });
                  onUpdateLocalPost({ aspect_ratio: value });
                }}
                className="flex-1 flex items-center justify-center gap-1 min-h-[44px]"
              >
                <Icon className="h-4 w-4" />
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
            <AdminLabel className="text-sm mb-1 block">Caption</AdminLabel>
            <AdminTextarea
              value={editCaption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Write a caption..."
              className="min-h-[80px] text-base"
            />
          </div>

          {/* AI Brainstorm */}
          <AdminButton variant="adminOutline" onClick={onOpenChat} className="w-full min-h-[48px]">
            <MessageCircle className="h-5 w-5 mr-2" />
            Brainstorm with AI
          </AdminButton>

          {/* First Comment */}
          <div>
            <AdminLabel className="text-sm mb-1 block text-[hsl(var(--admin-text-muted))]">
              First Comment (hashtags)
            </AdminLabel>
            <AdminTextarea
              value={editFirstComment}
              onChange={(e) => onFirstCommentChange(e.target.value)}
              placeholder="#analogcommons #livemusic..."
              className="min-h-[50px] text-base"
            />
          </div>

          {/* Photographer Credit */}
          {selectedPost.photo?.photographer_handle && (
            <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-[hsl(var(--admin-hover))]">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                <span className="text-sm">Credit @{selectedPost.photo.photographer_handle}</span>
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
        </div>
        
        {/* Send to Cue - sticky at bottom of drawer */}
        <div className="px-4 py-3 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-background))]">
          <AdminButton
            variant="admin"
            onClick={() => onSendToCue(selectedPost.id)}
            disabled={!canSend || publishingPostId === selectedPost.id}
            className="w-full min-h-[52px] text-base"
          >
            {publishingPostId === selectedPost.id ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Send className="h-5 w-5 mr-2" />
            )}
            Send to Cue
          </AdminButton>
        </div>
      </DrawerContent>
    </Drawer>
  );
});
