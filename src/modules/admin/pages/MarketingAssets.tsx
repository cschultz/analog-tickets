import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminButton, AdminBadge } from "@/components/admin/AdminUI";
import { toast } from "sonner";
import { Image, Loader2, ExternalLink, Copy, FileText, Download, Archive } from "lucide-react";
import { applyAnalogTreatment, CLEAR_IMAGES, IMAGE_TREATMENTS } from "@/utils/analog-image-treatment";
import JSZip from "jszip";

// Import all images via Vite so we get real production URLs
const imageModules = import.meta.glob("/src/assets/may/*.{jpg,jpeg,png}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const ALL_IMAGES = Object.entries(imageModules).map(([path, url]) => ({
  name: path.split("/").pop()!,
  url: url as string,
}));

// Only export images that have a duotone treatment (skip clear/poster images)
const SOURCE_IMAGES = ALL_IMAGES.filter(
  (img) => !CLEAR_IMAGES.has(img.name) && IMAGE_TREATMENTS[img.name]
);

// All photo images (excluding posters/artwork for originals export)
const PHOTO_IMAGES = ALL_IMAGES.filter(
  (img) => !img.name.includes("poster") && !img.name.includes("lineup") && !img.name.includes("og-crew")
);

interface ExportedFile {
  name: string;
  size?: number;
  publicUrl: string;
}

const MarketingAssets = () => {
  const [exporting, setExporting] = useState(false);
  const [listing, setListing] = useState(false);
  const [files, setFiles] = useState<ExportedFile[]>([]);
  const [progress, setProgress] = useState("");
  const [zipping, setZipping] = useState(false);
  const treatedBlobsRef = useRef<Map<string, Blob>>(new Map());
  const listExported = async () => {
    setListing(true);
    try {
      const res = await supabase.functions.invoke("export-marketing-images", {
        body: { action: "list" },
      });
      if (res.error) throw res.error;
      setFiles(res.data.files || []);
      toast.success(`Found ${res.data.count} exported images`);
    } catch (err: any) {
      toast.error(err.message || "Failed to list files");
    } finally {
      setListing(false);
    }
  };

  const exportAll = async () => {
    setExporting(true);
    const total = SOURCE_IMAGES.length;
    let completed = 0;
    const results: ExportedFile[] = [];
    const errors: string[] = [];
    treatedBlobsRef.current.clear();

    try {
      const BATCH_SIZE = 3;
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = SOURCE_IMAGES.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.allSettled(
          batch.map(async (img) => {
            const baseName = img.name.replace(/\.[^.]+$/, "");
            const outputName = `${baseName}-analog.jpg`;

            const blob = await applyAnalogTreatment(img.url);
            treatedBlobsRef.current.set(outputName, blob);

            const storagePath = `treated/${outputName}`;
            const { error: uploadError } = await supabase.storage
              .from("marketing-assets")
              .upload(storagePath, blob, {
                contentType: "image/jpeg",
                upsert: true,
              });

            if (uploadError) throw new Error(uploadError.message);

            const { data: urlData } = supabase.storage
              .from("marketing-assets")
              .getPublicUrl(storagePath);

            return {
              name: outputName,
              size: blob.size,
              publicUrl: urlData.publicUrl,
            };
          })
        );

        for (const r of batchResults) {
          if (r.status === "fulfilled") {
            results.push(r.value);
          } else {
            errors.push(String(r.reason));
          }
          completed++;
        }
        setProgress(`Processing ${completed}/${total} images...`);
      }

      setProgress("");
      setFiles(results);

      if (results.length > 0) {
        toast.success(
          `Exported ${results.length} treated images${errors.length > 0 ? `, ${errors.length} failed` : ""}`
        );
      } else {
        toast.error(`Export failed: ${errors[0] || "Unknown error"}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Export failed");
      setProgress("");
    } finally {
      setExporting(false);
    }
  };

  const exportOriginals = async () => {
    setExporting(true);
    const total = PHOTO_IMAGES.length;
    let completed = 0;
    const results: ExportedFile[] = [];
    const errors: string[] = [];
    treatedBlobsRef.current.clear();

    try {
      const BATCH_SIZE = 3;
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = PHOTO_IMAGES.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.allSettled(
          batch.map(async (img) => {
            // Fetch the original image as-is
            const res = await fetch(img.url);
            if (!res.ok) throw new Error(`Failed to fetch ${img.name}`);
            const blob = await res.blob();
            treatedBlobsRef.current.set(img.name, blob);

            const storagePath = `originals/${img.name}`;
            const { error: uploadError } = await supabase.storage
              .from("marketing-assets")
              .upload(storagePath, blob, {
                contentType: blob.type || "image/jpeg",
                upsert: true,
              });

            if (uploadError) throw new Error(uploadError.message);

            const { data: urlData } = supabase.storage
              .from("marketing-assets")
              .getPublicUrl(storagePath);

            return {
              name: img.name,
              size: blob.size,
              publicUrl: urlData.publicUrl,
            };
          })
        );

        for (const r of batchResults) {
          if (r.status === "fulfilled") {
            results.push(r.value);
          } else {
            errors.push(String(r.reason));
          }
          completed++;
        }
        setProgress(`Uploading originals ${completed}/${total}...`);
      }

      setProgress("");
      setFiles(results);

      if (results.length > 0) {
        toast.success(
          `Exported ${results.length} original photos${errors.length > 0 ? `, ${errors.length} failed` : ""}`
        );
      } else {
        toast.error(`Export failed: ${errors[0] || "Unknown error"}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Export failed");
      setProgress("");
    } finally {
      setExporting(false);
    }
  };

  const downloadZip = async () => {
    setZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("analog-treated-photos")!;

      // If we have blobs from a recent export, use those
      if (treatedBlobsRef.current.size > 0) {
        for (const [name, blob] of treatedBlobsRef.current) {
          folder.file(name, blob);
        }
      } else {
        // Otherwise fetch from storage URLs
        setProgress("Downloading images for ZIP...");
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setProgress(`Downloading ${i + 1}/${files.length}...`);
          const res = await fetch(file.publicUrl);
          if (res.ok) {
            folder.file(file.name, await res.blob());
          }
        }
      }

      setProgress("Creating ZIP file...");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analog-treated-photos-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress("");
      toast.success("ZIP downloaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to create ZIP");
      setProgress("");
    } finally {
      setZipping(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Marketing Assets"
        subtitle="Export photos with the Analog duotone + film grain treatment baked in. Web resolution — for print, use the recipe with high-res originals."
      />

      <AdminCard>
        <AdminCardContent className="p-6">
          <div className="flex flex-wrap gap-3 items-center">
            <AdminButton onClick={exportAll} disabled={exporting} variant="admin">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Image className="h-4 w-4 mr-2" />}
              Export with Duotone Treatment
            </AdminButton>

            <AdminButton onClick={exportOriginals} disabled={exporting} variant="admin">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Image className="h-4 w-4 mr-2" />}
              Export Originals (No Treatment)
            </AdminButton>

            <AdminButton onClick={listExported} disabled={listing} variant="adminOutline">
              {listing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              View Exported Files
            </AdminButton>

            <AdminButton
              onClick={downloadZip}
              disabled={zipping || (files.length === 0 && treatedBlobsRef.current.size === 0)}
              variant="adminOutline"
            >
              {zipping ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
              Download ZIP
            </AdminButton>

            <AdminButton variant="adminGhost" asChild>
              <a
                href="/docs/analog-duotone-recipe.md"
                download="analog-duotone-recipe.md"
              >
                <FileText className="h-4 w-4 mr-1" />
                Print Recipe Guide
              </a>
            </AdminButton>
          </div>

          {progress && (
            <div className="mt-4 flex items-center gap-2 text-sm text-[hsl(var(--admin-text-muted))]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{progress}</span>
            </div>
          )}

          <div className="mt-3 p-3 rounded-md bg-[hsl(var(--admin-muted))] text-sm text-[hsl(var(--admin-text-muted))]">
            <span className="font-semibold text-[hsl(var(--admin-text))]">Note:</span>{" "}
            Images are exported with the full Analog treatment (grayscale + magenta tint + film grain).
            These are web-resolution. For print, share the recipe doc with your designer.
          </div>
        </AdminCardContent>
      </AdminCard>

      {files.length > 0 && (
        <AdminCard>
          <AdminCardHeader
            action={<AdminBadge intent="success">{files.length} files</AdminBadge>}
          >
            <AdminCardTitle>Exported Images ({files.length})</AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((file) => (
                <div
                  key={file.name}
                  className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden bg-[hsl(var(--admin-surface))]"
                >
                  <div className="aspect-square bg-[hsl(var(--admin-muted))]">
                    <img
                      src={file.publicUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3 space-y-2">
                    <span className="block text-sm font-medium text-[hsl(var(--admin-text))] truncate">
                      {file.name}
                    </span>
                    <span className="block text-xs text-[hsl(var(--admin-text-muted))]">
                      {formatSize(file.size)}
                    </span>
                    <div className="flex gap-2">
                      <AdminButton size="sm" variant="adminOutline" onClick={() => copyUrl(file.publicUrl)}>
                        <Copy className="h-3 w-3 mr-1" /> URL
                      </AdminButton>
                      <AdminButton size="sm" variant="adminOutline" asChild>
                        <a href={file.publicUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" /> Open
                        </a>
                      </AdminButton>
                      <AdminButton size="sm" variant="adminOutline" asChild>
                        <a href={file.publicUrl} download={file.name}>
                          <Download className="h-3 w-3" />
                        </a>
                      </AdminButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AdminCardContent>
        </AdminCard>
      )}
    </div>
  );
};

export default MarketingAssets;
