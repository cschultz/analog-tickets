import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
} from "https://deno.land/x/imagemagick_deno@0.0.14/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Instagram optimal sizes:
// - Feed posts: 1080px width max
// - Stories: 1080x1920
// We resize to max 1080px on the longest edge to keep file sizes reasonable
const MAX_DIMENSION = 1080;
const JPEG_QUALITY = 85;

let magickInitialized = false;

async function ensureMagickInitialized() {
  if (!magickInitialized) {
    await initializeImageMagick();
    magickInitialized = true;
    console.log("[COPY-STORAGE] ImageMagick initialized");
  }
}

/**
 * Resize image to Instagram-optimal dimensions
 * Max 1080px on longest edge, JPEG quality 85
 */
async function resizeImage(imageData: Uint8Array): Promise<Uint8Array> {
  await ensureMagickInitialized();
  
  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(imageData, (img) => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        
        // Calculate new dimensions (max 1080px on longest edge)
        let newWidth = originalWidth;
        let newHeight = originalHeight;
        
        if (originalWidth > MAX_DIMENSION || originalHeight > MAX_DIMENSION) {
          if (originalWidth > originalHeight) {
            // Landscape
            newWidth = MAX_DIMENSION;
            newHeight = Math.round((originalHeight / originalWidth) * MAX_DIMENSION);
          } else {
            // Portrait or square
            newHeight = MAX_DIMENSION;
            newWidth = Math.round((originalWidth / originalHeight) * MAX_DIMENSION);
          }
          
          const geometry = new MagickGeometry(newWidth, newHeight);
          geometry.ignoreAspectRatio = false;
          img.resize(geometry);
          
          console.log(`[COPY-STORAGE] Resized: ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight}`);
        } else {
          console.log(`[COPY-STORAGE] No resize needed: ${originalWidth}x${originalHeight}`);
        }
        
        // Set JPEG quality
        img.quality = JPEG_QUALITY;
        
        // Write as JPEG
        img.write((data) => {
          resolve(data);
        }, MagickFormat.Jpeg);
      });
    } catch (error) {
      console.error("[COPY-STORAGE] Resize error:", error);
      reject(error);
    }
  });
}

/**
 * Copy an approved photo from Dropbox to Supabase Storage
 * Resizes to Instagram-optimal dimensions (max 1080px)
 * Creates a stable public URL for Instagram publishing
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

    const { photoId } = await req.json();

    if (!photoId) {
      return new Response(
        JSON.stringify({ error: "photoId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Get photo details
    const { data: photo, error: photoError } = await supabase
      .from("social_photos")
      .select("id, dropbox_path, file_name, event_id, public_image_url, storage_status")
      .eq("id", photoId)
      .single();

    if (photoError || !photo) {
      return new Response(
        JSON.stringify({ error: "Photo not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If already has public URL and status is complete, skip
    if (photo.public_image_url && photo.storage_status === "complete") {
      return new Response(
        JSON.stringify({
          success: true,
          photoId,
          publicUrl: photo.public_image_url,
          message: "Already copied to storage",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as pending while we process
    await supabase
      .from("social_photos")
      .update({ storage_status: "pending" })
      .eq("id", photoId);

    // Get fresh download link from Dropbox
    const linkResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: photo.dropbox_path,
      }),
    });

    if (!linkResponse.ok) {
      const errorText = await linkResponse.text();
      console.error("Dropbox link error:", errorText);
      // Mark as failed
      await supabase
        .from("social_photos")
        .update({ storage_status: "failed" })
        .eq("id", photoId);
      return new Response(
        JSON.stringify({ error: "Failed to get Dropbox download link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { link } = await linkResponse.json();

    // Download the image
    const imageResponse = await fetch(link);
    if (!imageResponse.ok) {
      await supabase
        .from("social_photos")
        .update({ storage_status: "failed" })
        .eq("id", photoId);
      return new Response(
        JSON.stringify({ error: "Failed to download image from Dropbox" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const originalArrayBuffer = await imageResponse.arrayBuffer();
    const originalData = new Uint8Array(originalArrayBuffer);
    const originalSize = originalData.length;
    
    console.log(`[COPY-STORAGE] Downloaded ${photo.file_name}: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);

    // Resize the image for Instagram
    let processedData: Uint8Array;
    try {
      processedData = await resizeImage(originalData);
      const newSize = processedData.length;
      console.log(`[COPY-STORAGE] Processed size: ${(newSize / 1024 / 1024).toFixed(2)}MB (${Math.round((1 - newSize/originalSize) * 100)}% reduction)`);
    } catch (resizeError) {
      console.error("[COPY-STORAGE] Resize failed, using original:", resizeError);
      // Fall back to original if resize fails
      processedData = originalData;
    }

    // Upload to Supabase Storage (social-photos bucket)
    // Use .jpg extension since we always output JPEG
    const baseName = photo.file_name.replace(/\.[^.]+$/, "");
    const storagePath = `${photo.event_id}/${photoId}-${baseName}.jpg`;
    
    const { error: uploadError } = await supabase.storage
      .from("social-photos")
      .upload(storagePath, processedData, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      await supabase
        .from("social_photos")
        .update({ storage_status: "failed" })
        .eq("id", photoId);
      return new Response(
        JSON.stringify({ error: `Failed to upload to storage: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("social-photos")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Update photo record with public URL and storage_url, mark as complete
    const { error: updateError } = await supabase
      .from("social_photos")
      .update({
        public_image_url: publicUrl,
        storage_url: publicUrl,  // New field for permanent URL
        storage_path: storagePath,
        storage_status: "complete",
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoId);

    if (updateError) {
      console.error("Update error:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        photoId,
        publicUrl,
        storagePath,
        originalSize,
        processedSize: processedData.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error copying to storage:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
