import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Cue Webhook Handler
 * 
 * Receives status updates from Cue when posts are published, fail, etc.
 * Expected payload structure (based on typical social scheduling APIs):
 * {
 *   event: "post.published" | "post.failed" | "post.scheduled",
 *   postId: string,
 *   status: string,
 *   publishedAt?: string,
 *   error?: string,
 *   platformPostId?: string
 * }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log raw payload for debugging
    const rawBody = await req.text();
    console.log("[CUE-WEBHOOK] Raw payload:", rawBody);

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("[CUE-WEBHOOK] Invalid JSON payload");
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract event data - adjust field names based on actual Cue webhook format
    const {
      event,
      postId,
      post_id,
      status,
      error,
      publishedAt,
      published_at,
      platformPostId,
      platform_post_id,
      data,
    } = payload;

    // Handle nested data structure if Cue wraps in a data object
    const eventData = data || payload;
    const cuePostId = postId || post_id || eventData?.postId || eventData?.id;
    const eventType = event || eventData?.event || eventData?.type;

    console.log("[CUE-WEBHOOK] Parsed event:", { eventType, cuePostId, status });

    if (!cuePostId) {
      console.error("[CUE-WEBHOOK] Missing post ID in payload");
      return new Response(
        JSON.stringify({ error: "Missing post ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Find the scheduled post by cue_post_id
    const { data: post, error: fetchError } = await supabase
      .from("social_scheduled_posts")
      .select("id, status, photo_id")
      .eq("cue_post_id", cuePostId)
      .single();

    if (fetchError || !post) {
      console.error("[CUE-WEBHOOK] Post not found for cue_post_id:", cuePostId, fetchError);
      // Return 200 to acknowledge receipt even if we can't find the post
      return new Response(
        JSON.stringify({ acknowledged: true, warning: "Post not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine new status based on event type
    let newStatus = post.status;
    let updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const eventLower = (eventType || status || "").toLowerCase();

    if (eventLower.includes("publish") || eventLower.includes("posted") || eventLower === "success") {
      newStatus = "posted";
      updateData.status = "posted";
      updateData.published_at = publishedAt || published_at || new Date().toISOString();
      updateData.error_message = null;
      
      // Also update the photo status
      if (post.photo_id) {
        await supabase
          .from("social_photos")
          .update({
            status: "posted",
            last_posted_at: updateData.published_at,
          })
          .eq("id", post.photo_id);
      }
    } else if (eventLower.includes("fail") || eventLower.includes("error")) {
      newStatus = "failed";
      updateData.status = "failed";
      updateData.error_message = error || eventData?.error || eventData?.message || "Unknown error from Cue";
    } else if (eventLower.includes("schedule")) {
      newStatus = "scheduled";
      updateData.status = "scheduled";
    }

    // Store platform-specific post ID if provided (e.g., Instagram post ID)
    if (platformPostId || platform_post_id) {
      updateData.platform_post_id = platformPostId || platform_post_id;
    }

    // Update the scheduled post
    const { error: updateError } = await supabase
      .from("social_scheduled_posts")
      .update(updateData)
      .eq("id", post.id);

    if (updateError) {
      console.error("[CUE-WEBHOOK] Failed to update post:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update post status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[CUE-WEBHOOK] Updated post", post.id, "to status:", newStatus);

    return new Response(
      JSON.stringify({
        success: true,
        postId: post.id,
        newStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CUE-WEBHOOK] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
