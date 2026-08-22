import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient();

  try {
    // Verify admin access
    const { isAdmin, error: authError, user } = await verifyAdmin(req);
    console.log("sync-dropbox-background: Auth check:", { isAdmin, userId: user?.id });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: authError || "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { eventId } = await req.json();

    if (!eventId) {
      return new Response(
        JSON.stringify({ error: "eventId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all active sources for this event
    const { data: sources, error: sourcesError } = await supabase
      .from("social_photo_sources")
      .select("id, folder_path, photographer_name, photo_year")
      .eq("event_id", eventId)
      .eq("is_active", true);

    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active sources to sync" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a sync job record
    const { data: job, error: jobError } = await supabase
      .from("sync_jobs")
      .insert({
        event_id: eventId,
        job_type: "dropbox_sync",
        status: "running",
        total_sources: sources.length,
        processed_sources: 0,
        started_at: new Date().toISOString(),
        created_by: user?.id,
      })
      .select("id")
      .single();

    if (jobError) {
      throw new Error(`Failed to create sync job: ${jobError.message}`);
    }

    console.log(`sync-dropbox-background: Created job ${job.id} for ${sources.length} sources`);

    // Return immediately with job ID - processing continues in background
    // Use EdgeRuntime.waitUntil to keep the function running
    const processPromise = processSourcesInBackground(
      supabase,
      job.id,
      sources,
      eventId
    );

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processPromise);
    } else {
      // Fallback: wait for completion (not truly background, but works)
      await processPromise;
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        totalSources: sources.length,
        message: "Sync started in background",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-dropbox-background error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processSourcesInBackground(
  supabase: any,
  jobId: string,
  sources: any[],
  eventId: string
) {
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  try {
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const folderName = source.folder_path.split("/").pop() || source.folder_path;

      // Update job progress
      await supabase
        .from("sync_jobs")
        .update({
          processed_sources: i,
          current_folder: folderName,
        })
        .eq("id", jobId);

      console.log(`Processing source ${i + 1}/${sources.length}: ${source.folder_path}`);

      try {
        const result = await syncSingleSource(supabase, source, eventId);
        totalImported += result.imported;
        totalSkipped += result.skipped;
      } catch (err) {
        console.error(`Failed to sync ${source.folder_path}:`, err);
        totalFailed++;
      }
    }

    // Mark job as completed
    await supabase
      .from("sync_jobs")
      .update({
        status: "completed",
        processed_sources: sources.length,
        current_folder: null,
        total_imported: totalImported,
        total_skipped: totalSkipped,
        total_failed: totalFailed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(`sync-dropbox-background: Job ${jobId} completed. Imported: ${totalImported}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`);
  } catch (error) {
    console.error(`sync-dropbox-background: Job ${jobId} failed:`, error);
    
    await supabase
      .from("sync_jobs")
      .update({
        status: "failed",
        error_message: String(error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

async function syncSingleSource(
  supabase: any,
  source: any,
  eventId: string
): Promise<{ imported: number; skipped: number }> {
  const folderPath = source.folder_path;
  
  // Fetch files from Dropbox folder
  const listResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: folderPath.startsWith("/") ? folderPath : `/${folderPath}`,
      recursive: false,
      include_media_info: true,
      include_deleted: false,
    }),
  });

  if (!listResponse.ok) {
    const errorText = await listResponse.text();
    throw new Error(`Dropbox API error: ${errorText}`);
  }

  const listData: DropboxListResponse = await listResponse.json();

  // Filter for image files only
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"];
  const imageFiles = listData.entries.filter(
    (entry) =>
      entry[".tag"] === "file" &&
      imageExtensions.some((ext) => entry.name.toLowerCase().endsWith(ext))
  );

  console.log(`Found ${imageFiles.length} images in ${folderPath}`);

  // Get existing photos to check for duplicates
  const { data: existingPhotos } = await supabase
    .from("social_photos")
    .select("dropbox_path, dropbox_file_id")
    .eq("source_id", source.id);

  const existingPaths = new Set(existingPhotos?.map((p: any) => p.dropbox_path) || []);
  const existingIds = new Set(
    existingPhotos?.map((p: any) => p.dropbox_file_id).filter(Boolean) || []
  );

  let imported = 0;
  let skipped = 0;

  for (const file of imageFiles) {
    const isExisting = existingPaths.has(file.path_lower) || existingIds.has(file.id);

    // Get a temporary link for preview
    const linkResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: file.path_lower }),
    });

    if (!linkResponse.ok) {
      console.error(`Failed to get link for ${file.name}`);
      skipped++;
      continue;
    }

    const linkData = await linkResponse.json();
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    if (isExisting) {
      // Update existing photo with fresh temporary URL
      await supabase
        .from("social_photos")
        .update({
          temporary_url: linkData.link,
          url_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("dropbox_path", file.path_lower);
      skipped++;
    } else {
      // Insert new photo as candidate
      const { error: insertError } = await supabase.from("social_photos").insert({
        event_id: eventId,
        source_id: source.id,
        dropbox_path: file.path_lower,
        dropbox_file_id: file.id,
        file_name: file.name,
        file_size_bytes: file.size,
        temporary_url: linkData.link,
        url_expires_at: expiresAt,
        status: "candidate",
        approved: false,
        photographer_name: source.photographer_name || null,
        photographer_handle: source.instagram_handle || null,
        photo_year: source.photo_year || null,
        metadata: {
          content_hash: file.content_hash,
          client_modified: file.client_modified,
          server_modified: file.server_modified,
        },
      });

      if (insertError) {
        console.error(`Failed to insert ${file.name}:`, JSON.stringify(insertError));
        skipped++;
        continue;
      }

      imported++;
    }
  }

  // Update source last_synced_at
  await supabase
    .from("social_photo_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", source.id);

  return { imported, skipped };
}
