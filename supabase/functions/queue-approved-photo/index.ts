import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SchedulePhase {
  posts_per_week: number;
  post_time: string;
}

/**
 * Queue a single approved photo to the next available slot
 * Called immediately when a photo is approved
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
    const { photoId, eventId, caption, useSilence } = body;

    if (!photoId || !eventId) {
      return new Response(
        JSON.stringify({ error: "photoId and eventId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();
    console.log("[QUEUE-PHOTO] Queueing photo:", photoId, "for event:", eventId);

    // Check if photo is already queued
    const { data: existingPost } = await supabase
      .from("social_scheduled_posts")
      .select("id")
      .eq("photo_id", photoId)
      .in("status", ["draft", "approved"])
      .maybeSingle();

    if (existingPost) {
      console.log("[QUEUE-PHOTO] Photo already queued:", photoId);
      return new Response(
        JSON.stringify({ success: true, already_queued: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get schedule phase for timing
    const today = new Date().toISOString().split("T")[0];
    const { data: phase } = await supabase
      .from("social_schedule_phases")
      .select("posts_per_week, post_time")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("phase_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    const postsPerWeek = (phase as SchedulePhase)?.posts_per_week || 3;
    const basePostTime = (phase as SchedulePhase)?.post_time || "18:30:00";
    const daysPerPost = Math.floor(7 / postsPerWeek);

    // Get blackout dates
    const { data: blackouts } = await supabase
      .from("social_blackout_dates")
      .select("blackout_date")
      .eq("event_id", eventId)
      .gte("blackout_date", today);

    const blackoutDates = new Set(blackouts?.map(b => b.blackout_date) || []);

    // Get existing scheduled post dates
    const { data: existingPosts } = await supabase
      .from("social_scheduled_posts")
      .select("scheduled_for")
      .eq("event_id", eventId)
      .in("status", ["draft", "approved"])
      .gte("scheduled_for", new Date().toISOString());

    const scheduledDates = new Set(
      existingPosts?.map(p => new Date(p.scheduled_for).toISOString().split("T")[0]) || []
    );

    // Find next available slot
    let candidateDate = new Date();
    candidateDate.setDate(candidateDate.getDate() + 1); // Start tomorrow
    let attempts = 0;
    const maxAttempts = 90; // Look up to 90 days ahead

    while (attempts < maxAttempts) {
      const dateStr = candidateDate.toISOString().split("T")[0];
      
      // Check if this date is available
      if (!blackoutDates.has(dateStr) && !scheduledDates.has(dateStr)) {
        // Found an available slot!
        break;
      }
      
      candidateDate.setDate(candidateDate.getDate() + 1);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return new Response(
        JSON.stringify({ error: "No available slots in next 90 days" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate post time with small random offset (0-15 min)
    const [hours, minutes] = basePostTime.split(":").map(Number);
    const randomOffset = Math.floor(Math.random() * 15);
    const postDate = new Date(candidateDate);
    postDate.setUTCHours(hours + 8, minutes + randomOffset, 0, 0); // PT to UTC

    console.log("[QUEUE-PHOTO] Scheduling for:", postDate.toISOString());

    // Create the scheduled post with approved_caption
    const { error: insertError } = await supabase
      .from("social_scheduled_posts")
      .insert({
        event_id: eventId,
        photo_id: photoId,
        scheduled_for: postDate.toISOString(),
        caption: caption || null,
        approved_caption: caption || null,  // Store as approved_caption
        use_silence: useSilence || false,
        status: "draft",
      });

    if (insertError) {
      throw new Error(`Failed to create post: ${insertError.message}`);
    }

    // Update photo status to queued and set last_posted_at for repeat prevention
    await supabase
      .from("social_photos")
      .update({ 
        status: "queued",
        last_posted_at: postDate.toISOString(),  // Track for 8-week repeat prevention
      })
      .eq("id", photoId);

    return new Response(
      JSON.stringify({
        success: true,
        scheduled_for: postDate.toISOString(),
        date: candidateDate.toISOString().split("T")[0],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[QUEUE-PHOTO] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
