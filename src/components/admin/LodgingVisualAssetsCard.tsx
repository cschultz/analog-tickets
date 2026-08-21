import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
} from "@/components/admin/AdminCard";
import { AdminButton } from "@/components/admin/AdminUI";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { Image, Upload, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface LodgingVisualAsset {
  id: string;
  product_type: "tent" | "cabin";
  image_type: "interior" | "exterior";
  image_url: string;
  display_order: number;
  source_url: string | null;
  source_note: string | null;
  alt_text: string | null;
  is_active: boolean;
}

type ProductType = "tent" | "cabin";
type ImageType = "interior" | "exterior";

interface ImageSlotProps {
  productType: ProductType;
  imageType: ImageType;
  asset: LodgingVisualAsset | undefined;
  onUpload: (file: File, productType: ProductType, imageType: ImageType) => void;
  onRemove: (id: string) => void;
  isUploading: boolean;
}

function ImageSlot({ productType, imageType, asset, onUpload, onRemove, isUploading }: ImageSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file, productType, imageType);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const label = `${imageType.charAt(0).toUpperCase() + imageType.slice(1)} Image`;

  return (
    <div className="space-y-2">
      <AdminLabel>{label}</AdminLabel>
      <div className="relative aspect-video rounded-lg border border-[hsl(var(--admin-border))] overflow-hidden bg-[hsl(var(--admin-surface-hover))]">
        {asset?.image_url ? (
          <>
            <img
              src={asset.image_url}
              alt={asset.alt_text || `${productType} ${imageType}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <AdminButton
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                <Upload className="h-3 w-3 mr-1" />
                Replace
              </AdminButton>
              <AdminButton
                variant="outline"
                size="sm"
                onClick={() => onRemove(asset.id)}
                className="bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30"
              >
                <Trash2 className="h-3 w-3" />
              </AdminButton>
            </div>
          </>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full h-full flex flex-col items-center justify-center gap-2 text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-surface))] transition-colors"
          >
            <Upload className="h-6 w-6" />
            <span className="text-xs">Upload {imageType} image</span>
          </button>
        )}
      </div>
      {asset?.source_note && (
        <p className="text-xs text-[hsl(var(--admin-text-muted))] flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          {asset.source_note}
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

export function LodgingVisualAssetsCard() {
  const queryClient = useQueryClient();
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const { data: assets, isLoading } = useAuthQuery({
    queryKey: ["lodging-visual-assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lodging_visual_assets")
        .select("*")
        .order("product_type")
        .order("image_type")
        .order("display_order");
      if (error) throw error;
      return data as LodgingVisualAsset[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      productType,
      imageType,
    }: {
      file: File;
      productType: ProductType;
      imageType: ImageType;
    }) => {
      // Upload to storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${productType}-${imageType}-${Date.now()}.${fileExt}`;
      const filePath = `${productType}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("lodging-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("lodging-images")
        .getPublicUrl(filePath);

      // Find existing asset
      const existing = assets?.find(
        (a) => a.product_type === productType && a.image_type === imageType && a.display_order === 0
      );

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("lodging_visual_assets")
          .update({
            image_url: urlData.publicUrl,
            source_url: null,
            source_note: "Uploaded by admin",
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase.from("lodging_visual_assets").insert({
          product_type: productType,
          image_type: imageType,
          image_url: urlData.publicUrl,
          display_order: 0,
          source_note: "Uploaded by admin",
          alt_text: `${productType} ${imageType} image`,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lodging-visual-assets"] });
      toast.success("Image uploaded successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to upload image");
    },
    onSettled: () => {
      setUploadingSlot(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lodging_visual_assets")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lodging-visual-assets"] });
      toast.success("Image removed");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove image");
    },
  });

  const handleUpload = (file: File, productType: ProductType, imageType: ImageType) => {
    setUploadingSlot(`${productType}-${imageType}`);
    uploadMutation.mutate({ file, productType, imageType });
  };

  const handleRemove = (id: string) => {
    removeMutation.mutate(id);
  };

  const getAsset = (productType: ProductType, imageType: ImageType) => {
    return assets?.find(
      (a) => a.product_type === productType && a.image_type === imageType && a.display_order === 0 && a.is_active
    );
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
          Loading...
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Image className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminCardTitle className="text-base font-semibold">Visual Assets</AdminCardTitle>
        </div>
        <AdminCardDescription className="text-xs">
          Manage images displayed on the accommodations selection page
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-6">
        {/* Tent Images */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[hsl(var(--admin-text))] flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[hsl(var(--admin-accent))]/10 text-[hsl(var(--admin-accent))] text-xs">
              TENT
            </span>
            Glamping Tent Images
          </h4>
          <div className="grid sm:grid-cols-2 gap-4">
            <ImageSlot
              productType="tent"
              imageType="interior"
              asset={getAsset("tent", "interior")}
              onUpload={handleUpload}
              onRemove={handleRemove}
              isUploading={uploadingSlot === "tent-interior"}
            />
            <ImageSlot
              productType="tent"
              imageType="exterior"
              asset={getAsset("tent", "exterior")}
              onUpload={handleUpload}
              onRemove={handleRemove}
              isUploading={uploadingSlot === "tent-exterior"}
            />
          </div>
        </div>

        {/* Cabin Images */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[hsl(var(--admin-text))] flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-xs">
              CABIN
            </span>
            Glamping Cabin Images
          </h4>
          <div className="grid sm:grid-cols-2 gap-4">
            <ImageSlot
              productType="cabin"
              imageType="interior"
              asset={getAsset("cabin", "interior")}
              onUpload={handleUpload}
              onRemove={handleRemove}
              isUploading={uploadingSlot === "cabin-interior"}
            />
            <ImageSlot
              productType="cabin"
              imageType="exterior"
              asset={getAsset("cabin", "exterior")}
              onUpload={handleUpload}
              onRemove={handleRemove}
              isUploading={uploadingSlot === "cabin-exterior"}
            />
          </div>
        </div>

        <p className="text-xs text-[hsl(var(--admin-text-muted))] border-t border-[hsl(var(--admin-border))] pt-4">
          Images are displayed on the accommodations selection page during checkout. 
          Changes appear immediately without requiring a rebuild.
        </p>
      </AdminCardContent>
    </AdminCard>
  );
}
