import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminButton,
  AdminLabel,
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
} from "@/components/admin";
import { Plus, X, GripVertical, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CarouselPhoto {
  id: string;
  photo_id: string;
  position: number;
  photo: {
    id: string;
    file_name: string;
    public_image_url: string | null;
    temporary_url: string | null;
    theme: string | null;
  };
}

interface AvailablePhoto {
  id: string;
  file_name: string;
  public_image_url: string | null;
  temporary_url: string | null;
  theme: string | null;
}

interface CarouselPhotoPickerProps {
  postId: string;
  eventId: string;
  isCarousel: boolean;
  onToggleCarousel: (isCarousel: boolean) => void;
}

export function CarouselPhotoPicker({ 
  postId, 
  eventId, 
  isCarousel, 
  onToggleCarousel 
}: CarouselPhotoPickerProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Fetch carousel photos for this post
  const { data: carouselPhotos = [], isLoading: loadingCarousel } = useQuery({
    queryKey: ["carousel-photos", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_post_photos")
        .select(`
          id,
          photo_id,
          position,
          photo:social_photos (
            id,
            file_name,
            public_image_url,
            temporary_url,
            theme
          )
        `)
        .eq("post_id", postId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as unknown as CarouselPhoto[];
    },
    enabled: isCarousel,
  });

  // Fetch available photos for the picker
  const { data: availablePhotos = [], isLoading: loadingAvailable } = useQuery({
    queryKey: ["available-carousel-photos", eventId, postId],
    queryFn: async () => {
      // Get approved photos not already in this carousel
      const { data, error } = await supabase
        .from("social_photos")
        .select("id, file_name, public_image_url, temporary_url, theme")
        .eq("event_id", eventId)
        .in("status", ["approved", "proposed"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      
      // Filter out photos already in carousel
      const usedIds = new Set(carouselPhotos.map(cp => cp.photo_id));
      return (data as AvailablePhoto[]).filter(p => !usedIds.has(p.id));
    },
    enabled: pickerOpen,
  });

  // Add photo to carousel
  const addPhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const nextPosition = carouselPhotos.length;
      const { error } = await supabase
        .from("social_post_photos")
        .insert({
          post_id: postId,
          photo_id: photoId,
          position: nextPosition,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carousel-photos", postId] });
      queryClient.invalidateQueries({ queryKey: ["available-carousel-photos", eventId, postId] });
      toast.success("Photo added to carousel");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add photo");
    },
  });

  // Remove photo from carousel
  const removePhotoMutation = useMutation({
    mutationFn: async (carouselPhotoId: string) => {
      const { error } = await supabase
        .from("social_post_photos")
        .delete()
        .eq("id", carouselPhotoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carousel-photos", postId] });
      queryClient.invalidateQueries({ queryKey: ["available-carousel-photos", eventId, postId] });
      toast.success("Photo removed");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove photo");
    },
  });

  // Move photo in carousel order
  const movePhotoMutation = useMutation({
    mutationFn: async ({ carouselPhotoId, newPosition }: { carouselPhotoId: string; newPosition: number }) => {
      // Reorder all photos
      const reordered = [...carouselPhotos];
      const currentIndex = reordered.findIndex(p => p.id === carouselPhotoId);
      if (currentIndex === -1) return;
      
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(newPosition, 0, moved);
      
      // Update all positions
      for (let i = 0; i < reordered.length; i++) {
        const { error } = await supabase
          .from("social_post_photos")
          .update({ position: i })
          .eq("id", reordered[i].id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carousel-photos", postId] });
    },
  });

  const getPhotoUrl = (photo: { public_image_url: string | null; temporary_url: string | null }) => {
    return photo.public_image_url || photo.temporary_url;
  };

  if (!isCarousel) {
    return (
      <div>
        <AdminLabel className="text-xs mb-1.5 flex items-center gap-1">
          <ImageIcon className="h-3 w-3" /> Post Type
        </AdminLabel>
        <AdminButton
          size="sm"
          variant="adminOutline"
          onClick={() => onToggleCarousel(true)}
          className="w-full justify-center"
        >
          <Plus className="h-4 w-4 mr-1" />
          Make Carousel (Multiple Photos)
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <AdminLabel className="text-xs flex items-center gap-1">
          <ImageIcon className="h-3 w-3" /> Carousel Photos ({carouselPhotos.length}/10)
        </AdminLabel>
        <AdminButton
          size="sm"
          variant="adminGhost"
          onClick={() => onToggleCarousel(false)}
          className="text-xs h-6 px-2"
        >
          Single Photo
        </AdminButton>
      </div>

      {/* Carousel photo strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-2">
        {loadingCarousel ? (
          <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--admin-text-muted))]" />
        ) : (
          <>
            {carouselPhotos.map((cp, idx) => (
              <div
                key={cp.id}
                className="relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden group"
              >
                <img
                  src={getPhotoUrl(cp.photo) || ""}
                  alt={cp.photo.file_name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[10px] px-1 rounded">
                  {idx + 1}
                </div>
                <button
                  onClick={() => removePhotoMutation.mutate(cp.id)}
                  className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
                {idx > 0 && (
                  <button
                    onClick={() => movePhotoMutation.mutate({ carouselPhotoId: cp.id, newPosition: idx - 1 })}
                    className="absolute bottom-0.5 left-0.5 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1"
                  >
                    ←
                  </button>
                )}
                {idx < carouselPhotos.length - 1 && (
                  <button
                    onClick={() => movePhotoMutation.mutate({ carouselPhotoId: cp.id, newPosition: idx + 1 })}
                    className="absolute bottom-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1"
                  >
                    →
                  </button>
                )}
              </div>
            ))}

            {carouselPhotos.length < 10 && (
              <button
                onClick={() => setPickerOpen(true)}
                className="flex-shrink-0 w-16 h-16 rounded-md border-2 border-dashed border-[hsl(var(--admin-border))] flex items-center justify-center hover:border-[hsl(var(--admin-accent))] transition-colors"
              >
                <Plus className="h-5 w-5 text-[hsl(var(--admin-text-muted))]" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Photo picker sheet */}
      <AdminSheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <AdminSheetContent side="right" className="w-[400px] sm:w-[540px]">
          <AdminSheetHeader>
            <AdminSheetTitle>Add Photos to Carousel</AdminSheetTitle>
            <AdminSheetDescription>
              Select photos to add. Instagram allows up to 10 photos per carousel.
            </AdminSheetDescription>
          </AdminSheetHeader>
          
          <div className="grid grid-cols-3 gap-2 mt-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {loadingAvailable ? (
              <div className="col-span-3 flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
              </div>
            ) : availablePhotos.length === 0 ? (
              <div className="col-span-3 text-center py-8 text-[hsl(var(--admin-text-muted))]">
                No more photos available
              </div>
            ) : (
              availablePhotos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => {
                    addPhotoMutation.mutate(photo.id);
                  }}
                  className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-[hsl(var(--admin-accent))] transition-all"
                >
                  <img
                    src={getPhotoUrl(photo) || ""}
                    alt={photo.file_name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))
            )}
          </div>
        </AdminSheetContent>
      </AdminSheet>
    </div>
  );
}
