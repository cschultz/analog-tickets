import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Export marketing images to a shareable storage bucket.
 * Images are stored as-is (the duotone treatment is CSS-based on the site).
 * For print, use the recipe in docs/analog-duotone-recipe.md.
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

    const body = await req.json();
    const supabase = getServiceClient();

    // LIST action
    if (body.action === "list") {
      const folder = body.folder || "treated";
      const { data: files, error } = await supabase.storage
        .from("marketing-assets")
        .list(folder, { limit: 500 });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fileList = (files || [])
        .filter((f) => f.name && !f.name.startsWith("."))
        .map((f) => {
          const { data } = supabase.storage
            .from("marketing-assets")
            .getPublicUrl(`${folder}/${f.name}`);
          return {
            name: f.name,
            size: f.metadata?.size,
            publicUrl: data.publicUrl,
          };
        });

      return new Response(
        JSON.stringify({ files: fileList, count: fileList.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // EXPORT action: download from URLs and upload to storage
    // Accepts either { images: [{url, name}] } or { imageUrls: string[] }
    const { images, imageUrls, folderName = "photos" } = body;
    
    const imagesToProcess: Array<{ url: string; name: string }> = images
      ? images
      : (imageUrls || []).map((u: string) => ({ url: u, name: u.split("/").pop() || "unknown.jpg" }));

    if (!imagesToProcess.length) {
      return new Response(
        JSON.stringify({ error: "images or imageUrls array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ name: string; publicUrl: string; size: number }> = [];
    const errors: Array<{ fileName: string; error: string }> = [];

    const BATCH_SIZE = 5;
    for (let i = 0; i < imagesToProcess.length; i += BATCH_SIZE) {
      const batch = imagesToProcess.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (img: { url: string; name: string }) => {
          const { url, name: fileName } = img;
          try {
            console.log(`[EXPORT] Downloading: ${fileName}`);
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Download failed: ${response.status}`);
            }

            const contentType = response.headers.get("content-type") || "image/jpeg";
            const data = new Uint8Array(await response.arrayBuffer());

            const storagePath = `${folderName}/${fileName}`;
            const { error: uploadError } = await supabase.storage
              .from("marketing-assets")
              .upload(storagePath, data, { contentType, upsert: true });

            if (uploadError) throw new Error(uploadError.message);

            const { data: urlData } = supabase.storage
              .from("marketing-assets")
              .getPublicUrl(storagePath);

            return { name: fileName, publicUrl: urlData.publicUrl, size: data.length };
          } catch (err) {
            throw { fileName, error: String(err) };
          }
        })
      );

      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          results.push(r.value);
        } else {
          errors.push(r.reason);
        }
      }
      console.log(`[EXPORT] Batch ${Math.floor(i / BATCH_SIZE) + 1} done: ${results.length} ok, ${errors.length} failed`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[EXPORT] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
