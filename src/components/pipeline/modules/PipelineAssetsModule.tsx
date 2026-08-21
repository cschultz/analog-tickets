import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePipeline } from "../PipelineContext";
import { MediaLinksBlock } from "./MediaLinksBlock";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { AdminButton, AdminBadge, AdminInput } from "@/components/admin";
import { 
  ImageIcon,
  Upload, 
  Music,
  Video,
  FileText,
  File, 
  Trash2, 
  Download,
  Loader2,
  Link2,
  ExternalLink,
  Droplet,
  FolderOpen,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ArtistAsset {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  source_type: string;
  source_url: string | null;
  notes: string | null;
  created_at: string;
}

function getAssetIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("audio/")) return Music;
  if (mimeType.startsWith("video/")) return Video;
  if (mimeType.includes("pdf")) return FileText;
  return File;
}

function getSourceBadge(sourceType: string) {
  switch (sourceType) {
    case 'dropbox': return { label: 'Dropbox', color: 'bg-blue-500/20 text-blue-400' };
    case 'google_drive': return { label: 'Drive', color: 'bg-green-500/20 text-green-400' };
    case 'email_attachment': return { label: 'Email', color: 'bg-purple-500/20 text-purple-400' };
    case 'direct_url': return { label: 'URL', color: 'bg-orange-500/20 text-orange-400' };
    default: return { label: 'Upload', color: 'bg-[hsl(var(--admin-muted)/0.5)] text-[hsl(var(--admin-muted-foreground))]' };
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PipelineAssetsModule() {
  const { config, selectedRecord, updateRecord } = usePipeline();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<ArtistAsset | null>(null);

  const isArtist = config?.slug === "artist";

  // Media links from custom_fields
  const customFields = (selectedRecord?.custom_fields as Record<string, any>) || {};
  const mediaLinks = (customFields.media_links as string) || "";

  const handleSaveMediaLinks = useCallback(async (value: string) => {
    if (!selectedRecord) return;
    const updatedCustomFields = { ...customFields, media_links: value };
    updateRecord({ id: selectedRecord.id, custom_fields: updatedCustomFields });
  }, [selectedRecord, customFields, updateRecord]);

  const { data: assets = [], isLoading } = useAuthQuery({
    queryKey: ["artist-assets", selectedRecord?.id],
    queryFn: async () => {
      if (!selectedRecord?.id || !isArtist) return [];
      
      const { data, error } = await supabase
        .from("artist_assets")
        .select("*")
        .eq("artist_id", selectedRecord.id as string)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Assets query failed:", error.message);
        return [];
      }
      return data as ArtistAsset[];
    },
    enabled: !!selectedRecord?.id && isArtist,
  });

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedRecord?.id || !isArtist) return;

    setIsUploading(true);
    
    for (const file of Array.from(files)) {
      try {
        const filePath = `${selectedRecord.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("artist-assets")
          .upload(filePath, file);

        if (uploadError) {
          toast.error(`Failed to upload ${file.name}: ${uploadError.message}`);
          continue;
        }

        const { error: dbError } = await supabase
          .from("artist_assets")
          .insert({
            artist_id: selectedRecord.id as string,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            mime_type: file.type,
            source_type: "upload",
          });

        if (dbError) {
          toast.error(`Failed to save ${file.name}: ${dbError.message}`);
        }
      } catch (error: any) {
        toast.error(`Error uploading ${file.name}`);
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    queryClient.invalidateQueries({ queryKey: ["artist-assets", selectedRecord.id] });
    toast.success("Assets uploaded");
  }, [selectedRecord, isArtist, queryClient]);

  const handleExtractFromUrl = async () => {
    if (!urlInput.trim() || !selectedRecord?.id) return;

    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-artist-assets", {
        body: {
          artist_id: selectedRecord.id,
          urls: [urlInput.trim()],
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || "Asset extracted");
        queryClient.invalidateQueries({ queryKey: ["artist-assets", selectedRecord.id] });
        setUrlInput("");
        setShowUrlInput(false);
      } else {
        toast.error(data?.error || "Failed to extract asset");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to extract asset");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDelete = async (asset: ArtistAsset) => {
    if (!confirm(`Delete "${asset.file_name}"?`)) return;

    try {
      await supabase.storage.from("artist-assets").remove([asset.file_path]);
      const { error } = await supabase.from("artist_assets").delete().eq("id", asset.id);
      if (error) throw error;

      toast.success("Asset deleted");
      queryClient.invalidateQueries({ queryKey: ["artist-assets", selectedRecord?.id] });
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    }
  };

  const handleDownload = async (asset: ArtistAsset) => {
    try {
      const { data, error } = await supabase.storage.from("artist-assets").createSignedUrl(asset.file_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (error: any) {
      toast.error("Failed to download: " + error.message);
    }
  };

  const handlePreview = async (asset: ArtistAsset) => {
    try {
      const { data, error } = await supabase.storage.from("artist-assets").createSignedUrl(asset.file_path, 300);
      if (error) throw error;
      setPreviewAsset({ ...asset, file_path: data.signedUrl });
    } catch (error: any) {
      toast.error("Failed to preview: " + error.message);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  if (!isArtist || !selectedRecord) {
    return (
      <div className="py-8 text-center text-sm text-[hsl(var(--admin-muted-foreground))]">
        Assets are only available for artists.
      </div>
    );
  }

  // Group assets by type
  const images = assets.filter(a => a.mime_type?.startsWith("image/"));
  const audio = assets.filter(a => a.mime_type?.startsWith("audio/"));
  const other = assets.filter(a => !a.mime_type?.startsWith("image/") && !a.mime_type?.startsWith("audio/"));

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[hsl(var(--admin-foreground))]">Assets</h3>
          <AdminBadge intent="neutral" className="text-[10px] px-1.5">{assets.length}</AdminBadge>
        </div>
        <div className="flex items-center gap-2">
          <AdminButton 
            variant="adminOutline" 
            size="sm" 
            onClick={() => setShowUrlInput(!showUrlInput)}
          >
            <Link2 className="w-3.5 h-3.5 mr-1" />
            From URL
          </AdminButton>
          <AdminButton 
            variant="adminOutline" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
            Upload
          </AdminButton>
        </div>
        <input 
          ref={fileInputRef} 
          type="file" 
          multiple
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.zip"
          className="hidden" 
          onChange={(e) => handleFileSelect(e.target.files)} 
        />
      </div>

      {/* URL Input */}
      {showUrlInput && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]">
          <AdminInput
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste Dropbox, Google Drive, or direct file URL..."
            className="flex-1"
          />
          <AdminButton 
            variant="admin" 
            size="sm" 
            onClick={handleExtractFromUrl}
            disabled={!urlInput.trim() || isExtracting}
          >
            {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Extract"}
          </AdminButton>
        </div>
      )}

      {/* Media Links Block */}
      <MediaLinksBlock
        value={mediaLinks}
        onSave={handleSaveMediaLinks}
        disabled={false}
      />

      {isLoading ? (
        <div className="py-8 text-center text-xs text-[hsl(var(--admin-muted-foreground))]">Loading...</div>
      ) : assets.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          className={cn(
            "py-12 text-center border-2 border-dashed rounded-lg bg-[hsl(var(--admin-surface))] transition-colors",
            dragOver ? "border-[hsl(var(--admin-accent))] bg-[hsl(var(--admin-accent)/0.05)]" : "border-[hsl(var(--admin-border))]")
          }
        >
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[hsl(var(--admin-muted)/0.3)] flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-[hsl(var(--admin-muted-foreground))]" />
          </div>
          <p className="text-sm text-[hsl(var(--admin-muted-foreground))] mb-1">
            {dragOver ? "Drop files to upload" : "No assets yet"}
          </p>
          <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mb-4">
            Upload files or paste URLs from Dropbox/Google Drive
          </p>
          <div className="flex items-center justify-center gap-2">
            <AdminButton variant="adminOutline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-1" />Upload Files
            </AdminButton>
            <AdminButton variant="adminOutline" size="sm" onClick={() => setShowUrlInput(true)}>
              <Link2 className="w-3.5 h-3.5 mr-1" />From URL
            </AdminButton>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Images Grid */}
          {images.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[hsl(var(--admin-muted-foreground))] mb-3 flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5" />
                Images ({images.length})
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {images.map((asset) => (
                  <AssetThumbnail 
                    key={asset.id} 
                    asset={asset} 
                    onPreview={() => handlePreview(asset)}
                    onDownload={() => handleDownload(asset)}
                    onDelete={() => handleDelete(asset)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Audio List */}
          {audio.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[hsl(var(--admin-muted-foreground))] mb-3 flex items-center gap-2">
                <Music className="w-3.5 h-3.5" />
                Audio ({audio.length})
              </h4>
              <div className="space-y-2">
                {audio.map((asset) => (
                  <AssetRow 
                    key={asset.id} 
                    asset={asset}
                    onDownload={() => handleDownload(asset)}
                    onDelete={() => handleDelete(asset)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Files */}
          {other.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[hsl(var(--admin-muted-foreground))] mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" />
                Other Files ({other.length})
              </h4>
              <div className="space-y-2">
                {other.map((asset) => (
                  <AssetRow 
                    key={asset.id} 
                    asset={asset}
                    onDownload={() => handleDownload(asset)}
                    onDelete={() => handleDelete(asset)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewAsset && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewAsset(null)}
        >
          <div className="max-w-4xl max-h-[90vh] overflow-hidden rounded-lg bg-[hsl(var(--admin-card))]" onClick={(e) => e.stopPropagation()}>
            {previewAsset.mime_type?.startsWith("image/") && (
              <img 
                src={previewAsset.file_path} 
                alt={previewAsset.file_name}
                className="max-w-full max-h-[80vh] object-contain"
              />
            )}
            <div className="p-4 border-t border-[hsl(var(--admin-border))]">
              <p className="text-sm font-medium text-[hsl(var(--admin-foreground))]">{previewAsset.file_name}</p>
              <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mt-1">
                Click outside to close
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Thumbnail for images
function AssetThumbnail({ 
  asset, 
  onPreview, 
  onDownload, 
  onDelete 
}: { 
  asset: ArtistAsset; 
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const source = getSourceBadge(asset.source_type);

  // Load thumbnail
  useState(() => {
    supabase.storage
      .from("artist-assets")
      .createSignedUrl(asset.file_path, 300)
      .then(({ data }) => {
        if (data?.signedUrl) setImageUrl(data.signedUrl);
      });
  });

  return (
    <div className="relative group aspect-square rounded-lg overflow-hidden bg-[hsl(var(--admin-surface))] border border-[hsl(var(--admin-border))]">
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt={asset.file_name}
          className="w-full h-full object-cover cursor-pointer"
          onClick={onPreview}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-[hsl(var(--admin-muted-foreground))]" />
        </div>
      )}
      
      {/* Source badge */}
      <span className={cn("absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium", source.color)}>
        {source.label}
      </span>

      {/* Hover actions */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
        <AdminButton variant="adminGhost" size="sm" onClick={onPreview} className="h-7 w-7 p-0 text-white hover:text-white hover:bg-white/20">
          <Eye className="w-3.5 h-3.5" />
        </AdminButton>
        <AdminButton variant="adminGhost" size="sm" onClick={onDownload} className="h-7 w-7 p-0 text-white hover:text-white hover:bg-white/20">
          <Download className="w-3.5 h-3.5" />
        </AdminButton>
        <AdminButton variant="adminGhost" size="sm" onClick={onDelete} className="h-7 w-7 p-0 text-white hover:text-[hsl(var(--admin-error))] hover:bg-white/20">
          <Trash2 className="w-3.5 h-3.5" />
        </AdminButton>
      </div>
    </div>
  );
}

// Row for audio/other files
function AssetRow({ 
  asset, 
  onDownload, 
  onDelete 
}: { 
  asset: ArtistAsset;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const FileIcon = getAssetIcon(asset.mime_type);
  const source = getSourceBadge(asset.source_type);

  return (
    <div className="flex items-center justify-between p-3 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-card))] hover:bg-[hsl(var(--admin-card-hover))] transition-colors group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-md bg-[hsl(var(--admin-muted)/0.3)] flex items-center justify-center shrink-0">
          <FileIcon className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-[hsl(var(--admin-foreground))] truncate">{asset.file_name}</p>
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0", source.color)}>
              {source.label}
            </span>
          </div>
          <p className="text-[11px] text-[hsl(var(--admin-muted-foreground))]">
            {formatFileSize(asset.file_size)} · {formatDistanceToNow(new Date(asset.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {asset.source_url && (
          <AdminButton 
            variant="adminGhost" 
            size="sm" 
            onClick={() => window.open(asset.source_url!, "_blank")}
            className="h-7 w-7 p-0"
            title="View original"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </AdminButton>
        )}
        <AdminButton variant="adminGhost" size="sm" onClick={onDownload} className="h-7 w-7 p-0">
          <Download className="w-3.5 h-3.5" />
        </AdminButton>
        <AdminButton variant="adminGhost" size="sm" onClick={onDelete} className="h-7 w-7 p-0 text-[hsl(var(--admin-error))]">
          <Trash2 className="w-3.5 h-3.5" />
        </AdminButton>
      </div>
    </div>
  );
}
