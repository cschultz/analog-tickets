import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("refresh-dropbox-links: Request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin access
    const { isAdmin, error: authError } = await verifyAdmin(req);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: authError || "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { eventId, sourceId } = await req.json();
    console.log("refresh-dropbox-links: Params:", { eventId, sourceId });

    if (!eventId) {
      return new Response(
        JSON.stringify({ error: "eventId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Get photos that need URL refresh (expired or expiring soon)
    const expiryThreshold = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min buffer
    
    let query = supabase
      .from("social_photos")
      .select("id, dropbox_path, file_name")
      .eq("event_id", eventId)
      .not("dropbox_path", "is", null);
    
    if (sourceId) {
      query = query.eq("source_id", sourceId);
    }
    
    // Only refresh expired or soon-to-expire URLs
    query = query.or(`url_expires_at.is.null,url_expires_at.lt.${expiryThreshold}`);
    
    const { data: photos, error: photosError } = await query.limit(500);

    if (photosError) {
      throw new Error(`Failed to fetch photos: ${photosError.message}`);
    }

    if (!photos || photos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No photos need URL refresh",
          stats: { refreshed: 0, failed: 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`refresh-dropbox-links: Refreshing ${photos.length} photos`);

    let refreshed = 0;
    let failed = 0;
    const batchSize = 20;
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    // Process in batches to avoid rate limits
    for (let i = 0; i < photos.length; i += batchSize) {
      const batch = photos.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (photo) => {
          try {
            const linkResponse = await dropboxFetch(
              "https://api.dropboxapi.com/2/files/get_temporary_link",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ path: photo.dropbox_path }),
              }
            );

            if (!linkResponse.ok) {
              throw new Error(`Dropbox API error: ${linkResponse.status}`);
            }

            const linkData = await linkResponse.json();

            const { error: updateError } = await supabase
              .from("social_photos")
              .update({
                temporary_url: linkData.link,
                url_expires_at: expiresAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", photo.id);

            if (updateError) {
              throw updateError;
            }

            return true;
          } catch (err) {
            console.error(`Failed to refresh ${photo.file_name}:`, err);
            throw err;
          }
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          refreshed++;
        } else {
          failed++;
        }
      }

      // Small delay between batches
      if (i + batchSize < photos.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(`refresh-dropbox-links: Completed. Refreshed: ${refreshed}, Failed: ${failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total: photos.length,
          refreshed,
          failed,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("refresh-dropbox-links error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
