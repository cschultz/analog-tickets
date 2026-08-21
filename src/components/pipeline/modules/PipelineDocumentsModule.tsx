import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePipeline } from "../PipelineContext";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { AdminButton, AdminBadge } from "@/components/admin";
import { AdminDialog, AdminDialogContent, AdminDialogHeader, AdminDialogTitle, AdminDialogDescription } from "@/components/admin/AdminDialog";
import { 
  Files, 
  Upload, 
  FileText, 
  Image, 
  File, 
  Trash2, 
  Download,
  Loader2,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface PipelineDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  document_type: string;
  notes: string | null;
  created_at: string;
}

type DocumentsTable = "artist_documents" | "artisan_documents" | "vendor_documents" | "partner_documents";

function getDocumentsTableConfig(slug: string | undefined) {
  switch (slug) {
    case "artist":
      return { table: "artist_documents" as const, foreignKey: "artist_id", bucket: "artist-documents" };
    case "artisan":
      return { table: "artisan_documents" as const, foreignKey: "artisan_id", bucket: "artisan-documents" };
    case "vendor":
      return { table: "vendor_documents" as const, foreignKey: "vendor_id", bucket: "vendor-documents" };
    case "partner":
      return { table: "partner_documents" as const, foreignKey: "partner_id", bucket: "partner-documents" };
    default:
      return null;
  }
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.includes("pdf")) return FileText;
  return File;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PipelineDocumentsModule() {
  const { config, selectedRecord } = usePipeline();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PipelineDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const tableConfig = getDocumentsTableConfig(config?.slug);

  const { data: documents = [], isLoading } = useAuthQuery({
    queryKey: ["pipeline-documents", config?.slug, selectedRecord?.id],
    queryFn: async () => {
      if (!selectedRecord?.id || !config || !tableConfig) return [];
      
      try {
        const { data, error } = await supabase
          .from(tableConfig.table)
          .select("*")
          .eq(tableConfig.foreignKey as never, selectedRecord.id as never)
          .order("created_at", { ascending: false });

        if (error) {
          console.warn("Documents table query failed:", error.message);
          return [];
        }
        return data as PipelineDocument[];
      } catch (e) {
        return [];
      }
    },
    enabled: !!selectedRecord?.id && !!config?.has_documents && !!tableConfig,
  });

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedRecord?.id || !config || !tableConfig) {
      if (!tableConfig && config) {
        toast.error(`Documents not yet supported for ${config.name_plural || config.slug}`);
      }
      return;
    }

    setIsUploading(true);
    const file = files[0];

    try {
      const filePath = `${selectedRecord.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(tableConfig.bucket)
        .upload(filePath, file);

      if (uploadError) {
        if (uploadError.message.includes("not found")) {
          toast.error("Storage bucket not configured.");
        } else {
          throw uploadError;
        }
        return;
      }

      const insertData = {
        [tableConfig.foreignKey]: selectedRecord.id,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        document_type: "other",
      };

      const { error: dbError } = await supabase
        .from(tableConfig.table)
        .insert(insertData as never);

      if (dbError) throw dbError;

      toast.success("Document uploaded");
      queryClient.invalidateQueries({ queryKey: ["pipeline-documents", config.slug, selectedRecord.id] });
    } catch (error: any) {
      toast.error("Failed to upload: " + error.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [selectedRecord, config, tableConfig, queryClient]);

  const handleDelete = async (doc: PipelineDocument) => {
    if (!confirm(`Delete "${doc.file_name}"?`) || !tableConfig) return;

    try {
      await supabase.storage.from(tableConfig.bucket).remove([doc.file_path]);
      const { error } = await supabase.from(tableConfig.table).delete().eq("id", doc.id);
      if (error) throw error;

      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: ["pipeline-documents", config?.slug, selectedRecord?.id] });
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    }
  };

  const handleDownload = async (doc: PipelineDocument) => {
    if (!tableConfig) return;
    
    try {
      const { data, error } = await supabase.storage.from(tableConfig.bucket).createSignedUrl(doc.file_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (error: any) {
      toast.error("Failed to download: " + error.message);
    }
  };

  const handlePreview = async (doc: PipelineDocument) => {
    if (!tableConfig) return;
    
    setPreviewDoc(doc);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.storage.from(tableConfig.bucket).createSignedUrl(doc.file_path, 3600);
      if (error) throw error;
      setPreviewUrl(data.signedUrl);
    } catch (error: any) {
      toast.error("Failed to load preview: " + error.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const isPreviewable = (mimeType: string | null) => {
    if (!mimeType) return false;
    return mimeType.includes("pdf") || mimeType.startsWith("image/");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  if (!config?.has_documents || !selectedRecord) return null;
  
  // Show message if pipeline type doesn't have documents support
  if (!tableConfig) {
    return (
      <div className="py-8 text-center border border-dashed border-[hsl(var(--admin-border))] rounded-lg">
        <p className="text-sm text-[hsl(var(--admin-muted-foreground))]">
          Documents coming soon for {config.name_plural || config.slug}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[hsl(var(--admin-foreground))]">Documents</h3>
          <AdminBadge intent="neutral" className="text-[10px] px-1.5">{documents.length}</AdminBadge>
        </div>
        <AdminButton variant="adminOutline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
          Upload
        </AdminButton>
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileSelect(e.target.files)} />
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-[hsl(var(--admin-muted-foreground))]">Loading...</div>
      ) : documents.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          className={cn(
            "py-12 text-center border-2 border-dashed rounded-lg bg-[hsl(var(--admin-surface))] transition-colors",
            dragOver ? "border-[hsl(var(--admin-accent))] bg-[hsl(var(--admin-accent)/0.05)]" : "border-[hsl(var(--admin-border))]"
          )}
        >
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[hsl(var(--admin-muted)/0.3)] flex items-center justify-center">
            <Files className="w-5 h-5 text-[hsl(var(--admin-muted-foreground))]" />
          </div>
          <p className="text-sm text-[hsl(var(--admin-muted-foreground))] mb-1">{dragOver ? "Drop file to upload" : "No documents uploaded"}</p>
          <p className="text-xs text-[hsl(var(--admin-muted-foreground))] mb-3">Drag & drop or click to upload</p>
          <AdminButton variant="adminOutline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Upload className="w-3.5 h-3.5 mr-1" />Upload First Document
          </AdminButton>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const FileIcon = getFileIcon(doc.mime_type);
            const canPreview = isPreviewable(doc.mime_type);
            return (
              <div 
                key={doc.id} 
                className={cn(
                  "flex items-center justify-between p-3 border border-[hsl(var(--admin-border))] rounded-lg bg-[hsl(var(--admin-card))] hover:bg-[hsl(var(--admin-card-hover))] transition-colors group",
                  canPreview && "cursor-pointer"
                )}
                onClick={() => canPreview && handlePreview(doc)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-md bg-[hsl(var(--admin-muted)/0.3)] flex items-center justify-center shrink-0">
                    <FileIcon className="w-4 h-4 text-[hsl(var(--admin-muted-foreground))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-[hsl(var(--admin-foreground))] truncate">{doc.file_name}</p>
                    <p className="text-[11px] text-[hsl(var(--admin-muted-foreground))]">{formatFileSize(doc.file_size)} · {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canPreview && (
                    <AdminButton variant="adminGhost" size="sm" onClick={(e) => { e.stopPropagation(); handlePreview(doc); }} className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></AdminButton>
                  )}
                  <AdminButton variant="adminGhost" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(doc); }} className="h-7 w-7 p-0"><Download className="w-3.5 h-3.5" /></AdminButton>
                  <AdminButton variant="adminGhost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(doc); }} className="h-7 w-7 p-0 text-[hsl(var(--admin-error))]"><Trash2 className="w-3.5 h-3.5" /></AdminButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Document Preview Dialog */}
      <AdminDialog open={!!previewDoc} onOpenChange={(open) => { if (!open) { setPreviewDoc(null); setPreviewUrl(null); } }}>
        <AdminDialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <AdminDialogHeader>
            <AdminDialogTitle>{previewDoc?.file_name}</AdminDialogTitle>
            <AdminDialogDescription>
              {formatFileSize(previewDoc?.file_size ?? null)} · {previewDoc?.created_at ? formatDistanceToNow(new Date(previewDoc.created_at), { addSuffix: true }) : ""}
            </AdminDialogDescription>
          </AdminDialogHeader>
          <div className="flex-1 min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-[hsl(var(--admin-muted-foreground))]">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Loading preview…
              </div>
            ) : previewUrl ? (
              previewDoc?.mime_type?.startsWith("image/") ? (
                <img src={previewUrl} alt={previewDoc.file_name} className="max-w-full max-h-[70vh] mx-auto rounded-lg" />
              ) : (
                <iframe
                  src={previewUrl}
                  className="w-full h-[70vh] border-0 rounded-lg"
                  title={previewDoc?.file_name}
                />
              )
            ) : (
              <div className="flex items-center justify-center py-16 text-sm text-[hsl(var(--admin-muted-foreground))]">
                Unable to load preview
              </div>
            )}
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}
