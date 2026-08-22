import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";
import { generateImageVariants } from "../_shared/image-processing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DropboxFile {
  ".tag": string;
  name: string;
  path_lower: string;
  path_display: string;
  id: string;
  client_modified: string;
  server_modified: string;
  size: number;
  content_hash?: string;
}

interface DropboxListResponse {
  entries: DropboxFile[];
  cursor: string;
  has_more: boolean;
}

// Process images in parallel batches for speed
const BATCH_SIZE = 5;

/**
 * Process a single image: download, resize, upload
 */
async function processImage(
  file: DropboxFile,
  eventId: string,
  sourceId: string,
  source: { photographer_name?: string; instagram_handle?: string; photo_year?: number } | null,
  supabase: ReturnType<typeof getServiceClient>,
  existingByPath: Map<string, { dropbox_path: string; sync_status: string | null; metadata: { content_hash?: string } | null }>
): Promise<{ status: 'imported' | 'processed' | 'skipped' | 'failed'; photoId?: string }> {
  const existing = existingByPath.get(file.path_lower);
  
  // Skip if already fully synced with same content
  if (existing?.sync_status === 'complete') {
    const existingHash = existing?.metadata?.content_hash;
    if (existingHash === file.content_hash) {
      return { status: 'skipped' };
    }
    console.log(`[SYNC] Content hash changed for ${file.name}, re-syncing`);
  }

  try {
    // Insert/update record with processing status
    const baseData = {
      event_id: eventId,
      source_id: sourceId,
      dropbox_path: file.path_lower,
      dropbox_file_id: file.id,
      file_name: file.name,
      file_size_bytes: file.size,
      status: "candidate",
      approved: false,
      photographer_name: source?.photographer_name || null,
      photographer_handle: source?.instagram_handle || null,
      photo_year: source?.photo_year || null,
      sync_status: "processing",
      metadata: {
        content_hash: file.content_hash,
        client_modified: file.client_modified,
        server_modified: file.server_modified,
      },
    };

    let photoId: string;
    let isNew = false;
    
    if (existing) {
      const { data: updated } = await supabase
        .from("social_photos")
        .update({ sync_status: "processing" })
        .eq("dropbox_path", file.path_lower)
        .select("id")
        .single();
      photoId = updated?.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("social_photos")
        .insert(baseData)
        .select("id")
        .single();
      
      if (insertError) {
        console.error(`[SYNC] Failed to insert ${file.name}:`, insertError);
        return { status: 'failed' };
      }
      photoId = inserted.id;
      isNew = true;
    }

    // Download from Dropbox
    const linkResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file.path_lower }),
    });

    if (!linkResponse.ok) {
      throw new Error(`Failed to get download link: ${linkResponse.status}`);
    }

    const { link } = await linkResponse.json();
    const imageResponse = await fetch(link);
    
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }

    const imageData = new Uint8Array(await imageResponse.arrayBuffer());
    console.log(`[SYNC] Downloaded ${file.name}: ${(imageData.length / 1024 / 1024).toFixed(2)}MB`);

    // Generate thumbnail and preview
    const variants = await generateImageVariants(imageData);
    console.log(`[SYNC] Generated variants for ${file.name}: thumb=${variants.thumbnail.width}x${variants.thumbnail.height}, preview=${variants.preview.width}x${variants.preview.height}`);

    // Upload both in parallel
    const thumbnailPath = `thumbnails/${eventId}/${photoId}.jpg`;
    const previewPath = `previews/${eventId}/${photoId}.jpg`;
    
    const [thumbResult, previewResult] = await Promise.all([
      supabase.storage.from("social-photos").upload(thumbnailPath, variants.thumbnail.data, {
        contentType: "image/jpeg",
        upsert: true,
      }),
      supabase.storage.from("social-photos").upload(previewPath, variants.preview.data, {
        contentType: "image/jpeg",
        upsert: true,
      }),
    ]);

    if (thumbResult.error) {
      throw new Error(`Thumbnail upload failed: ${thumbResult.error.message}`);
    }
    if (previewResult.error) {
      throw new Error(`Preview upload failed: ${previewResult.error.message}`);
    }

    // Get public URLs
    const { data: thumbUrl } = supabase.storage.from("social-photos").getPublicUrl(thumbnailPath);
    const { data: previewUrl } = supabase.storage.from("social-photos").getPublicUrl(previewPath);

    // Update photo record with permanent URLs
    await supabase
      .from("social_photos")
      .update({
        thumbnail_url: thumbUrl.publicUrl,
        preview_url: previewUrl.publicUrl,
        storage_url: previewUrl.publicUrl,
        public_image_url: previewUrl.publicUrl,
        original_width: variants.originalWidth,
        original_height: variants.originalHeight,
        sync_status: "complete",
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoId);

    console.log(`[SYNC] ✓ Processed ${file.name}`);
    return { status: isNew ? 'imported' : 'processed', photoId };

  } catch (error) {
    console.error(`[SYNC] ✗ Failed to process ${file.name}:`, error);
    
    await supabase
      .from("social_photos")
      .update({
        sync_status: "failed",
        sync_error: String(error),
      })
      .eq("dropbox_path", file.path_lower);
    
    return { status: 'failed' };
  }
}

/**
 * Sync Dropbox Photos - "Sync Once, Store Forever" Architecture
 * 
 * Optimizations:
 * - Parallel batch processing (5 images at a time)
 * - Content hash checking to skip unchanged files
 * - Parallel upload of thumbnail + preview
 * - Returns cursor for pagination support
 */
serve(async (req) => {
  console.log("[SYNC] Request received");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { isAdmin, error: authError, user } = await verifyAdmin(req);
    console.log("[SYNC] Auth check:", { isAdmin, authError, userId: user?.id });
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: authError || "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { sourceId, folderPath, eventId, cursor, batchOnly } = await req.json();
    console.log("[SYNC] Params:", { sourceId, folderPath, eventId, cursor, batchOnly });

    if (!folderPath || !sourceId) {
      return new Response(
        JSON.stringify({ error: "folderPath and sourceId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Get source info
    const { data: source } = await supabase
      .from("social_photo_sources")
      .select("photographer_name, instagram_handle, photo_year, priority")
      .eq("id", sourceId)
      .single();

    // Fetch files from Dropbox folder (use cursor for pagination)
    let listData: DropboxListResponse;
    
    if (cursor) {
      const continueResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor }),
      });
      
      if (!continueResponse.ok) {
        const errorText = await continueResponse.text();
        console.error("[SYNC] Dropbox continue error:", errorText);
        return new Response(
          JSON.stringify({ error: "Failed to continue Dropbox listing", details: errorText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      listData = await continueResponse.json();
    } else {
      const listResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: folderPath.startsWith("/") ? folderPath : `/${folderPath}`,
          recursive: false,
          include_media_info: true,
          include_deleted: false,
          include_has_explicit_shared_members: false,
        }),
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error("[SYNC] Dropbox API error:", errorText);
        return new Response(
          JSON.stringify({ error: "Failed to list Dropbox folder", details: errorText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      listData = await listResponse.json();
    }
    
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"];
    const imageFiles = listData.entries.filter(
      (entry) => 
        entry[".tag"] === "file" && 
        imageExtensions.some((ext) => entry.name.toLowerCase().endsWith(ext))
    );

    console.log(`[SYNC] Found ${imageFiles.length} images in batch`);

    // Get existing photos to check for duplicates
    const { data: existingPhotos } = await supabase
      .from("social_photos")
      .select("dropbox_path, dropbox_file_id, sync_status, metadata")
      .eq("source_id", sourceId);

    const existingByPath = new Map(existingPhotos?.map((p) => [p.dropbox_path, p]) || []);

    let imported = 0;
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    // Process images in parallel batches
    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
      const batch = imageFiles.slice(i, i + BATCH_SIZE);
      console.log(`[SYNC] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(imageFiles.length / BATCH_SIZE)}`);
      
      const results = await Promise.all(
        batch.map(file => processImage(file, eventId, sourceId, source, supabase, existingByPath))
      );
      
      for (const result of results) {
        switch (result.status) {
          case 'imported': imported++; break;
          case 'processed': processed++; break;
          case 'skipped': skipped++; break;
          case 'failed': failed++; break;
        }
      }
      
      // For batchOnly mode, only process one batch per request (for UI responsiveness)
      if (batchOnly) {
        console.log(`[SYNC] Batch mode: processed ${batch.length} images, returning for next batch`);
        break;
      }
    }

    // Update source last_synced_at
    await supabase
      .from("social_photo_sources")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", sourceId);

    console.log(`[SYNC] Complete: imported=${imported}, processed=${processed}, skipped=${skipped}, failed=${failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total_found: imageFiles.length,
          imported,
          processed,
          skipped,
          failed,
          has_more: listData.has_more || (batchOnly && imageFiles.length > BATCH_SIZE),
          cursor: listData.cursor,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[SYNC] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
