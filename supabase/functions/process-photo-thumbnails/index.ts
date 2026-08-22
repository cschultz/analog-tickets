import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 5;

/**
 * Process Photo Thumbnails - "Upload to Storage" approach
 * 
 * Instead of resizing with ImageMagick (broken in edge runtime),
 * we upload originals to Supabase Storage and use the render endpoint
 * for on-the-fly thumbnails: /render/image/public/bucket/path?width=400
 * 
 * For the grid, the frontend appends ?width=400&quality=75 to the storage URL.
 * For detail view, it uses the full URL.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { isAdmin, error: authError } = await verifyAdmin(req);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: authError || "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { eventId, batchSize } = await req.json();
    const limit = Math.min(batchSize || BATCH_SIZE, 10);

    if (!eventId) {
      return new Response(
        JSON.stringify({ error: "eventId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Get counts for progress
    const { count: totalPending } = await supabase
      .from("social_photos")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("sync_status", ["pending", "failed"]);

    const { count: totalComplete } = await supabase
      .from("social_photos")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("sync_status", "complete");

    // Get next batch of pending photos
    const { data: pendingPhotos, error: fetchError } = await supabase
      .from("social_photos")
      .select("id, dropbox_path, file_name, temporary_url, url_expires_at, event_id, public_image_url")
      .eq("event_id", eventId)
      .in("sync_status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch: ${fetchError.message}`);
    }

    if (!pendingPhotos || pendingPhotos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          remaining: 0,
          totalComplete: totalComplete || 0,
          done: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const photo of pendingPhotos) {
      try {
        // If already has a public_image_url in storage, just mark complete
        if (photo.public_image_url?.includes("supabase.co/storage")) {
          await supabase
            .from("social_photos")
            .update({
              storage_url: photo.public_image_url,
              sync_status: "complete",
              sync_error: null,
            })
            .eq("id", photo.id);
          processed++;
          continue;
        }

        // Mark as processing
        await supabase
          .from("social_photos")
          .update({ sync_status: "processing" })
          .eq("id", photo.id);

        // Get download URL
        let downloadUrl = photo.temporary_url;
        const urlExpired = !photo.url_expires_at || new Date(photo.url_expires_at) < new Date();

        if (!downloadUrl || urlExpired) {
          if (!photo.dropbox_path) throw new Error("No dropbox_path");
          
          const linkResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: photo.dropbox_path }),
          });

          if (!linkResponse.ok) throw new Error(`Dropbox link failed: ${linkResponse.status}`);
          const { link } = await linkResponse.json();
          downloadUrl = link;

          // Refresh temp URL
          await supabase
            .from("social_photos")
            .update({
              temporary_url: link,
              url_expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            })
            .eq("id", photo.id);
        }

        // Download the image
        const imageResponse = await fetch(downloadUrl);
        if (!imageResponse.ok) throw new Error(`Download failed: ${imageResponse.status}`);

        const imageData = new Uint8Array(await imageResponse.arrayBuffer());
        const sizeMB = (imageData.length / 1024 / 1024).toFixed(1);
        console.log(`[THUMBS] Downloaded ${photo.file_name}: ${sizeMB}MB`);

        // Determine content type
        const ext = (photo.file_name || "").toLowerCase();
        let contentType = "image/jpeg";
        if (ext.endsWith(".png")) contentType = "image/png";
        else if (ext.endsWith(".webp")) contentType = "image/webp";
        else if (ext.endsWith(".gif")) contentType = "image/gif";

        // Upload original to Supabase Storage
        const storagePath = `${eventId}/${photo.id}-${photo.file_name || "photo.jpg"}`;
        
        const { error: uploadError } = await supabase.storage
          .from("social-photos")
          .upload(storagePath, imageData, {
            contentType,
            upsert: true,
          });

        if (uploadError) throw new Error(`Upload: ${uploadError.message}`);

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("social-photos")
          .getPublicUrl(storagePath);

        const publicUrl = urlData.publicUrl;

        // Update photo with permanent storage URL
        await supabase
          .from("social_photos")
          .update({
            public_image_url: publicUrl,
            storage_url: publicUrl,
            storage_path: storagePath,
            storage_status: "complete",
            sync_status: "complete",
            sync_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", photo.id);

        processed++;
        console.log(`[THUMBS] ✓ ${photo.file_name} uploaded to storage`);
      } catch (error) {
        failed++;
        console.error(`[THUMBS] ✗ ${photo.file_name}:`, error);
        
        await supabase
          .from("social_photos")
          .update({
            sync_status: "failed",
            sync_error: String(error),
          })
          .eq("id", photo.id);
      }
    }

    const remaining = (totalPending || 0) - processed;

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        remaining: Math.max(0, remaining),
        totalComplete: (totalComplete || 0) + processed,
        totalPending: totalPending || 0,
        done: remaining <= 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[THUMBS] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
