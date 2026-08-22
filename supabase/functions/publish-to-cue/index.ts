import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CUE_API_BASE = "https://api.oncue.so/v1";

interface CuePostResponse {
  data: {
    id: string;
    profileId: string;
    content: string;
    status: string;
    scheduledAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  message?: string;
}

interface CueErrorResponse {
  error: string;
}

/**
 * Send an approved post to Cue as a DRAFT
 * 
 * IMPORTANT: This function ONLY creates drafts in Cue.
 * - No scheduling or publishing happens from Lovable
 * - Final review and publish is done manually inside Cue
 * - Cue acts as a draft inbox for human approval
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
    const { postId } = body;
    // Note: publishNow and scheduledAt are intentionally NOT accepted
    // All posts go to Cue as drafts only

    console.log("[PUBLISH-CUE] Received postId:", postId);

    if (!postId) {
      return new Response(
        JSON.stringify({ error: "postId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get required Cue credentials from environment
    const cueApiKey = Deno.env.get("CUE_API_KEY")?.trim();
    const cueProfileId = Deno.env.get("CUE_PROFILE_ID")?.trim();
    const cueInstagramAccountId = Deno.env.get("CUE_INSTAGRAM_ACCOUNT_ID")?.trim();

    // Validate credentials exist and are non-empty
    const missingCreds: string[] = [];
    if (!cueApiKey) missingCreds.push("CUE_API_KEY");
    if (!cueProfileId) missingCreds.push("CUE_PROFILE_ID");
    if (!cueInstagramAccountId) missingCreds.push("CUE_INSTAGRAM_ACCOUNT_ID");

    if (missingCreds.length > 0) {
      console.error("[PUBLISH-CUE] Missing or empty Cue credentials:", missingCreds.join(", "));
      return new Response(
        JSON.stringify({ error: `Missing Cue credentials: ${missingCreds.join(", ")}. Please update in Settings.` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // After validation, we know these are defined - use non-null assertions
    const apiKey = cueApiKey!;
    const profileId = cueProfileId!;
    const instagramAccountId = cueInstagramAccountId!;
    
    // Log credential presence (not values) for debugging
    console.log("[PUBLISH-CUE] Credentials check:", {
      hasApiKey: true,
      profileIdPrefix: profileId.substring(0, 4),
      accountIdPrefix: instagramAccountId.substring(0, 4),
    });

    const supabase = getServiceClient();

    // Get the scheduled post with photo details (including caption_suggestions as fallback)
    const { data: post, error: postError } = await supabase
      .from("social_scheduled_posts")
      .select(`
        id,
        event_id,
        photo_id,
        scheduled_for,
        caption,
        approved_caption,
        use_silence,
        aspect_ratio,
        is_carousel,
        first_comment,
        location_id,
        status,
        include_photographer_credit,
        social_photos (
          id,
          public_image_url,
          storage_url,
          temporary_url,
          file_name,
          caption_suggestions,
          photographer_handle
        )
      `)
      .eq("id", postId)
      .single();

    if (postError || !post) {
      console.error("[PUBLISH-CUE] Post not found:", postError);
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this is a carousel post - if so, get all carousel photos
    let photosToUpload: Array<{
      id: string;
      public_image_url: string | null;
      storage_url: string | null;
      temporary_url: string | null;
      file_name: string | null;
      caption_suggestions: string[] | null;
      photographer_handle: string | null;
    }> = [];

    if ((post as { is_carousel?: boolean }).is_carousel) {
      // Get carousel photos in order
      const { data: carouselPhotos, error: carouselError } = await supabase
        .from("social_post_photos")
        .select(`
          position,
          photo:social_photos (
            id,
            public_image_url,
            storage_url,
            temporary_url,
            file_name,
            caption_suggestions,
            photographer_handle
          )
        `)
        .eq("post_id", postId)
        .order("position", { ascending: true });

      if (carouselError || !carouselPhotos || carouselPhotos.length === 0) {
        console.error("[PUBLISH-CUE] No carousel photos found:", carouselError);
        return new Response(
          JSON.stringify({ error: "Carousel post has no photos - add photos first" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      photosToUpload = carouselPhotos.map(cp => cp.photo as unknown as typeof photosToUpload[0]);
      console.log(`[PUBLISH-CUE] Carousel post with ${photosToUpload.length} photos`);
    } else {
      // Single photo post - use the main photo
      const photo = post.social_photos as unknown as typeof photosToUpload[0] | null;
      
      if (!photo) {
        return new Response(
          JSON.stringify({ error: "Post has no associated photo" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      photosToUpload = [photo];
    }

    // Validate all photos have URLs (fallback: storage_url -> public_image_url -> temporary_url)
    for (const photo of photosToUpload) {
      const imageUrl = photo.storage_url || photo.public_image_url || photo.temporary_url;
      if (!imageUrl) {
        return new Response(
          JSON.stringify({ error: `Photo ${photo.id} has no URL available` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get first photo for caption fallback
    const primaryPhoto = photosToUpload[0];

    // Build caption with fallback chain:
    // 1. approved_caption (from approval flow)
    // 2. caption (from scheduled post) 
    // 3. primaryPhoto.caption_suggestions[0] (AI-generated)
    // 4. Minimal placeholder if silence mode or all empty
    let caption = post.approved_caption || post.caption || null;
    
    // Fallback to photo's first caption suggestion if no caption on post
    if (!caption && primaryPhoto?.caption_suggestions?.length) {
      caption = primaryPhoto.caption_suggestions[0];
      console.log("[PUBLISH-CUE] Using photo caption_suggestion as fallback");
    }
    
    // Append photographer credit if enabled
    const includePhotographerCredit = (post as { include_photographer_credit?: boolean }).include_photographer_credit;
    const photographerHandle = primaryPhoto?.photographer_handle;
    
    if (includePhotographerCredit && photographerHandle && caption && caption !== ".") {
      // Append credit on a new line
      caption = `${caption}\n\n📷 @${photographerHandle}`;
      console.log("[PUBLISH-CUE] Appended photographer credit:", photographerHandle);
    }
    
    // Cue API requires content field to have at least 1 character
    // If use_silence is true or caption is empty, use a minimal placeholder
    if (post.use_silence || !caption?.trim()) {
      // Instagram allows posts without captions, but Cue API requires content
      // Using a period as a minimal placeholder - can be removed manually in Cue before publishing
      caption = ".";
      console.log("[PUBLISH-CUE] Using minimal placeholder for silent/empty caption");
    }

    // Step 1: Upload all images to Cue's media storage
    // Cue requires media to be uploaded via their API before attaching to posts
    console.log(`[PUBLISH-CUE] Step 1: Uploading ${photosToUpload.length} image(s) to Cue media storage...`);
    
    const mediaAssetIds: string[] = [];
    
    for (let i = 0; i < photosToUpload.length; i++) {
      const photoToUpload = photosToUpload[i];
      const imageUrl = photoToUpload.storage_url || photoToUpload.public_image_url || photoToUpload.temporary_url;
      const fileName = photoToUpload.file_name || `image-${Date.now()}-${i}.jpg`;
      
      const mediaUploadResponse = await fetch(`${CUE_API_BASE}/media/upload-from-url`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: imageUrl,
          filename: fileName,
        }),
      });

      const mediaResult = await mediaUploadResponse.json();
      console.log(`[PUBLISH-CUE] Media upload response ${i + 1}/${photosToUpload.length}:`, JSON.stringify(mediaResult));

      if (!mediaUploadResponse.ok) {
        const errorMsg = mediaResult?.error || "Failed to upload media to Cue";
        console.error("[PUBLISH-CUE] Media upload failed:", mediaUploadResponse.status, errorMsg);
        
        // Update post with error status
        await supabase
          .from("social_scheduled_posts")
          .update({
            status: "failed",
            error_message: `Media upload failed for photo ${i + 1}: ${errorMsg}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", postId);

        return new Response(
          JSON.stringify({ error: `Media upload failed: ${errorMsg}` }),
          { status: mediaUploadResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const mediaAssetId = mediaResult?.data?.id;
      if (!mediaAssetId) {
        console.error("[PUBLISH-CUE] No media asset ID in response");
        return new Response(
          JSON.stringify({ error: "Media upload succeeded but no asset ID returned" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      mediaAssetIds.push(mediaAssetId);
    }

    console.log("[PUBLISH-CUE] All media uploaded successfully, asset IDs:", mediaAssetIds);

    // Step 2: Create the post with the uploaded media asset(s)
    console.log("[PUBLISH-CUE] Step 2: Creating post with media asset(s)...");
    
    // Map aspect ratio to Cue format
    // Instagram supports: square (1:1), portrait (4:5), landscape (1.91:1)
    const aspectRatioValue = (post as { aspect_ratio?: string }).aspect_ratio || "square";
    const isCarousel = (post as { is_carousel?: boolean }).is_carousel || false;
    
    // Map our aspect ratio names to Cue's expected format
    // Cue expects: "square" (1:1), "portrait" (4:5), "landscape" (1.91:1)
    const cueAspectRatio = aspectRatioValue === "portrait" ? "portrait" 
      : aspectRatioValue === "landscape" ? "landscape" 
      : "square";
    
    // Cue API expects media references using mediaIds field (array of media asset IDs)
    // The media upload returns an ID like "med_xxxxx" which must be passed to mediaIds
    // Include aspectRatio in the item to specify crop/display format
    const cuePayload: Record<string, unknown> = {
      profileId: profileId,
      platforms: {
        [instagramAccountId]: {
          items: [
            {
              content: caption,
              mediaIds: mediaAssetIds, // All media IDs for carousel or single photo
              aspectRatio: cueAspectRatio, // Specify the aspect ratio for the post
            },
          ],
        },
      },
    };

    // DRAFT ONLY: No scheduling parameters sent to Cue
    // Posts will appear in Cue as drafts for manual review and publishing
    // Do NOT set publishNow or scheduledAt

    console.log("[PUBLISH-CUE] Sending to Cue as DRAFT:", {
      postId,
      mediaAssetIds,
      isCarousel,
      captionLength: caption.length,
      aspectRatio: cueAspectRatio,
      mode: "draft_only",
    });

    // Call Cue API to create the post
    const cueResponse = await fetch(`${CUE_API_BASE}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuePayload),
    });

    const cueResult = await cueResponse.json();
    
    // Log the actual response for debugging
    console.log("[PUBLISH-CUE] Raw Cue response:", JSON.stringify(cueResult));

    if (!cueResponse.ok) {
      const errorMsg = (cueResult as CueErrorResponse).error || cueResult?.message || "Unknown Cue API error";
      console.error("[PUBLISH-CUE] Cue API error:", cueResponse.status, errorMsg);
      
      // Update post with error status
      await supabase
        .from("social_scheduled_posts")
        .update({
          status: "failed",
          error_message: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);

      return new Response(
        JSON.stringify({ error: `Cue API error: ${errorMsg}` }),
        { status: cueResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle Cue API response format: { data: [{ id, status, ... }] }
    // The response is an array within data, we take the first item
    const cueDataArray = cueResult?.data;
    const cuePostData = Array.isArray(cueDataArray) ? cueDataArray[0] : (cueDataArray || cueResult);
    const cuePostId = cuePostData?.id || null;
    const cueStatus = cuePostData?.status || "draft";
    const cueMessage = cueResult?.message || (cuePostId ? "Draft created in Cue" : "Unknown response format");
    
    console.log("[PUBLISH-CUE] Parsed response - postId:", cuePostId, "status:", cueStatus);

    // Update scheduled post status to "in_cue" (draft sent, awaiting manual publish)
    // Note: We do NOT set published_at or change photo status - that only happens
    // when the post is actually published (tracked via webhook or manual sync)
    await supabase
      .from("social_scheduled_posts")
      .update({
        status: "in_cue",  // New status: draft is in Cue awaiting manual review
        cue_post_id: cuePostId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    // Photo status remains as-is until actually published via Cue
    // The cue-webhook or sync-cue-posts will update when published

    return new Response(
      JSON.stringify({
        success: true,
        cuePostId: cuePostId,
        status: "in_cue",
        message: cueMessage,
        mode: "draft_only",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[PUBLISH-CUE] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
