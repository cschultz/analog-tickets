import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CUE_API_BASE = "https://api.oncue.so/v1";

interface CuePost {
  id: string;
  profileId: string;
  content: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  platforms: Array<{
    id: string;
    postId: string;
    socialAccountId: string;
    status: string;
    errorMessage: string | null;
    publishedAt: string | null;
    platformPostId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

/**
 * Sync Cue Post Statuses
 * 
 * Polls the Cue API to check status of posts that are "publishing" or "scheduled"
 * and updates our local database accordingly.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cueApiKey = Deno.env.get("CUE_API_KEY");
    if (!cueApiKey) {
      console.error("[SYNC-CUE] Missing CUE_API_KEY");
      return new Response(
        JSON.stringify({ error: "Cue API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Find posts that need status sync (publishing or scheduled with cue_post_id)
    const { data: pendingPosts, error: fetchError } = await supabase
      .from("social_scheduled_posts")
      .select("id, cue_post_id, status, photo_id")
      .not("cue_post_id", "is", null)
      .in("status", ["publishing", "scheduled"]);

    if (fetchError) {
      console.error("[SYNC-CUE] Failed to fetch pending posts:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch pending posts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pendingPosts || pendingPosts.length === 0) {
      console.log("[SYNC-CUE] No pending posts to sync");
      return new Response(
        JSON.stringify({ message: "No pending posts to sync", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SYNC-CUE] Found ${pendingPosts.length} posts to sync`);

    let synced = 0;
    let failed = 0;

    for (const post of pendingPosts) {
      try {
        // Fetch post status from Cue API
        const cueResponse = await fetch(`${CUE_API_BASE}/posts/${post.cue_post_id}`, {
          headers: {
            Authorization: `Bearer ${cueApiKey}`,
          },
        });

        if (!cueResponse.ok) {
          console.error(`[SYNC-CUE] Failed to fetch Cue post ${post.cue_post_id}:`, cueResponse.status);
          failed++;
          continue;
        }

        const cueResult = await cueResponse.json();
        const cuePost = cueResult.data as CuePost;

        // Determine the overall status from Cue
        let newStatus = post.status;
        let publishedAt: string | null = null;
        let errorMessage: string | null = null;
        let platformPostId: string | null = null;

        // Check platform-specific status (take the first one for Instagram)
        const platformStatus = cuePost.platforms?.[0];
        
        if (cuePost.status === "published" || platformStatus?.status === "published") {
          newStatus = "posted";
          publishedAt = platformStatus?.publishedAt || cuePost.updatedAt;
          platformPostId = platformStatus?.platformPostId || null;
        } else if (cuePost.status === "failed" || platformStatus?.status === "failed") {
          newStatus = "failed";
          errorMessage = platformStatus?.errorMessage || "Post failed on platform";
        } else if (cuePost.status === "scheduled") {
          newStatus = "scheduled";
        } else if (cuePost.status === "publishing") {
          // Still publishing, no change needed
          continue;
        }

        // Only update if status changed
        if (newStatus !== post.status) {
          const updateData: Record<string, unknown> = {
            status: newStatus,
            updated_at: new Date().toISOString(),
          };

          if (publishedAt) {
            updateData.published_at = publishedAt;
          }
          if (errorMessage) {
            updateData.error_message = errorMessage;
          }

          await supabase
            .from("social_scheduled_posts")
            .update(updateData)
            .eq("id", post.id);

          // Update photo status if posted
          if (newStatus === "posted" && post.photo_id) {
            await supabase
              .from("social_photos")
              .update({
                status: "posted",
                last_posted_at: publishedAt,
              })
              .eq("id", post.photo_id);
          }

          console.log(`[SYNC-CUE] Updated post ${post.id} from ${post.status} to ${newStatus}`);
          synced++;
        }
      } catch (error) {
        console.error(`[SYNC-CUE] Error processing post ${post.id}:`, error);
        failed++;
      }
    }

    console.log(`[SYNC-CUE] Sync complete: ${synced} updated, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: pendingPosts.length,
        synced,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[SYNC-CUE] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
