import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Photo {
  id: string;
  photographer_name: string | null;
  public_image_url: string | null;
  storage_status: string | null;
}

/**
 * Generate random photo suggestions for Content Studio
 * 
 * Simplified logic:
 * - Pulls ALL approved photos with complete storage
 * - Excludes photos posted to Cue in last N days
 * - Randomly shuffles and returns up to maxSuggestions
 * - No scoring, theming, or silence logic - just random variety
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
    const eventId = body.eventId;
    const maxSuggestions = body.maxSuggestions || 30;
    const excludeRecentDays = body.excludeRecentDays || 100;

    if (!eventId) {
      return new Response(
        JSON.stringify({ error: "eventId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();
    console.log("[GENERATE-DRAFTS] Starting - eventId:", eventId, "max:", maxSuggestions, "excludeDays:", excludeRecentDays);

    // Get existing draft AND approved (non-Cue) posts - clear them all before generating fresh batch
    const { data: existingDrafts } = await supabase
      .from("social_scheduled_posts")
      .select("id, photo_id")
      .eq("event_id", eventId)
      .in("status", ["draft", "approved"])
      .is("cue_post_id", null);
    
    // Remember these photo IDs to exclude from the new batch (for variety)
    const previousBatchPhotoIds = new Set(
      existingDrafts?.map(d => d.photo_id).filter(Boolean) || []
    );
    
    if (existingDrafts && existingDrafts.length > 0) {
      const draftIds = existingDrafts.map(d => d.id);
      const draftPhotoIds = existingDrafts.map(d => d.photo_id).filter(Boolean);
      
      await supabase
        .from("social_scheduled_posts")
        .delete()
        .in("id", draftIds);
      
      console.log("[GENERATE-DRAFTS] Cleared", draftIds.length, "existing drafts");
      
      // Reset photo status
      if (draftPhotoIds.length > 0) {
        await supabase
          .from("social_photos")
          .update({ status: "approved" })
          .in("id", draftPhotoIds);
      }
    }

    // Get photos posted to Cue recently (to exclude)
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - excludeRecentDays);
    
    const { data: recentlyPostedPosts } = await supabase
      .from("social_scheduled_posts")
      .select("photo_id")
      .eq("event_id", eventId)
      .not("cue_post_id", "is", null)
      .gte("created_at", recentCutoff.toISOString());
    
    const recentlyPostedPhotoIds = new Set(recentlyPostedPosts?.map(p => p.photo_id).filter(Boolean) || []);
    console.log("[GENERATE-DRAFTS] Excluding", recentlyPostedPhotoIds.size, "recently posted photos");

    // Get ALL candidate/approved photos (skip rejected) - no approval step required
    // Use either public_image_url OR temporary_url (Dropbox direct link)
    // Fetch ALL candidate/approved photos - use range to bypass 1000-row default limit
    let allPhotos: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: batch, error: batchError } = await supabase
        .from("social_photos")
        .select("id, photographer_name, public_image_url, temporary_url, storage_status, status")
        .eq("event_id", eventId)
        .neq("status", "rejected")
        .neq("status", "posted")
        .range(from, from + pageSize - 1);
      
      if (batchError) throw new Error(`Failed to fetch photos: ${batchError.message}`);
      if (!batch || batch.length === 0) break;
      allPhotos = allPhotos.concat(batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    const availablePhotosRaw = allPhotos;

    // Filter to photos that have at least one usable URL
    const photosWithUrls = (availablePhotosRaw || []).filter(p => 
      p.public_image_url || p.temporary_url
    );

    console.log("[GENERATE-DRAFTS] Found", photosWithUrls.length, "photos with URLs (from", availablePhotosRaw?.length || 0, "non-rejected)");

    if (!photosWithUrls || photosWithUrls.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          drafts_created: 0,
          message: "No photos available with usable URLs - sync Dropbox sources first",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out recently posted photos AND previous batch (for variety on refresh)
    let availablePhotos = (photosWithUrls as Photo[]).filter(p => 
      !recentlyPostedPhotoIds.has(p.id) && !previousBatchPhotoIds.has(p.id)
    );
    
    console.log("[GENERATE-DRAFTS] Available after exclusions:", availablePhotos.length, "(excluded", previousBatchPhotoIds.size, "from previous batch)");
    
    // If we don't have enough photos after excluding previous batch, allow some back in
    if (availablePhotos.length < maxSuggestions && previousBatchPhotoIds.size > 0) {
      const previousBatchPhotos = (photosWithUrls as Photo[]).filter(p => 
        previousBatchPhotoIds.has(p.id) && !recentlyPostedPhotoIds.has(p.id)
      );
      console.log("[GENERATE-DRAFTS] Not enough variety, adding back", Math.min(previousBatchPhotos.length, maxSuggestions - availablePhotos.length), "from previous batch");
      availablePhotos = [...availablePhotos, ...previousBatchPhotos];
    }

    if (availablePhotos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          drafts_created: 0,
          message: `No photos available - all ${photosWithUrls.length} photos were posted to Cue in the last ${excludeRecentDays} days`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prioritize photos with storage URLs (fast thumbnails) over Dropbox-only
    const withStorage = availablePhotos.filter(p => p.public_image_url);
    const withoutStorage = availablePhotos.filter(p => !p.public_image_url);
    
    // Crypto-strength shuffle to avoid Math.random() seed issues across invocations
    const shuffle = (arr: Photo[]) => {
      const randomValues = new Uint32Array(arr.length);
      crypto.getRandomValues(randomValues);
      for (let i = arr.length - 1; i > 0; i--) {
        const j = randomValues[i] % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    shuffle(withStorage);
    shuffle(withoutStorage);
    
    // Log first 4 photo IDs for debugging repeat issues
    const first4 = withStorage.slice(0, 4).map(p => p.id.slice(0, 8));
    console.log("[GENERATE-DRAFTS] First 4 storage photos after shuffle:", first4.join(", "));
    
    // Take from storage-backed first, then fill with Dropbox-only
    const selectedPhotos = [
      ...withStorage.slice(0, maxSuggestions),
      ...withoutStorage.slice(0, Math.max(0, maxSuggestions - withStorage.length)),
    ].slice(0, maxSuggestions);

    console.log("[GENERATE-DRAFTS] Selected", selectedPhotos.length, "photos (", withStorage.length, "with storage,", withoutStorage.length, "Dropbox-only)");

    // Create drafts with placeholder scheduled times (not important for this flow)
    const now = new Date();
    const inserts = selectedPhotos.map((photo, index) => {
      const scheduledFor = new Date(now);
      scheduledFor.setDate(scheduledFor.getDate() + index + 1);
      scheduledFor.setHours(18, 30 + Math.floor(Math.random() * 15), 0, 0);
      
      return {
        event_id: eventId,
        photo_id: photo.id,
        scheduled_for: scheduledFor.toISOString(),
        caption: null,
        use_silence: false,
        status: "draft",
      };
    });

    const { error: insertError } = await supabase
      .from("social_scheduled_posts")
      .insert(inserts);

    if (insertError) {
      throw new Error(`Failed to insert drafts: ${insertError.message}`);
    }

    // Update photos status to queued
    const photoIds = selectedPhotos.map(p => p.id);
    await supabase
      .from("social_photos")
      .update({ status: "queued" })
      .in("id", photoIds);

    console.log("[GENERATE-DRAFTS] Created", selectedPhotos.length, "drafts");

    return new Response(
      JSON.stringify({
        success: true,
        drafts_created: selectedPhotos.length,
        total_available: availablePhotos.length,
        excluded_recent: recentlyPostedPhotoIds.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating post drafts:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
