/**
 * useRepeatPhotoFilter - Hook to check if a photo has been used recently
 * 
 * Implements the 8-week repeat prevention rule:
 * - Checks last_posted_at on social_photos
 * - Checks social_scheduled_posts for same photo in approved/scheduled/published status
 * 
 * Returns whether a photo can be used and if override is required.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

const REUSE_WINDOW_DAYS = 56; // 8 weeks

interface RepeatCheckResult {
  isRepeat: boolean;
  lastUsedAt: string | null;
  daysSinceUse: number | null;
  scheduledPostId: string | null;
  canOverride: boolean;
}

export function useRepeatPhotoCheck(photoId: string | undefined, eventId: string | undefined) {
  return useQuery({
    queryKey: ["repeat-photo-check", photoId, eventId],
    queryFn: async (): Promise<RepeatCheckResult> => {
      if (!photoId || !eventId) {
        return { isRepeat: false, lastUsedAt: null, daysSinceUse: null, scheduledPostId: null, canOverride: true };
      }

      const cutoffDate = subDays(new Date(), REUSE_WINDOW_DAYS).toISOString();
      const now = new Date();

      // Check 1: last_posted_at on the photo itself
      const { data: photo, error: photoError } = await supabase
        .from("social_photos")
        .select("last_posted_at")
        .eq("id", photoId)
        .single();

      if (photoError) throw photoError;

      if (photo?.last_posted_at) {
        const lastPosted = new Date(photo.last_posted_at);
        if (lastPosted >= new Date(cutoffDate)) {
          const daysSince = Math.floor((now.getTime() - lastPosted.getTime()) / (1000 * 60 * 60 * 24));
          return {
            isRepeat: true,
            lastUsedAt: photo.last_posted_at,
            daysSinceUse: daysSince,
            scheduledPostId: null,
            canOverride: true,
          };
        }
      }

      // Check 2: Check scheduled posts for this photo
      const { data: scheduledPosts, error: scheduledError } = await supabase
        .from("social_scheduled_posts")
        .select("id, scheduled_for, status")
        .eq("photo_id", photoId)
        .eq("event_id", eventId)
        .in("status", ["approved", "scheduled", "published"])
        .gte("scheduled_for", cutoffDate)
        .order("scheduled_for", { ascending: false })
        .limit(1);

      if (scheduledError) throw scheduledError;

      if (scheduledPosts && scheduledPosts.length > 0) {
        const post = scheduledPosts[0];
        const scheduledDate = new Date(post.scheduled_for);
        const daysDiff = Math.floor((now.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          isRepeat: true,
          lastUsedAt: post.scheduled_for,
          daysSinceUse: daysDiff,
          scheduledPostId: post.id,
          canOverride: true,
        };
      }

      return {
        isRepeat: false,
        lastUsedAt: null,
        daysSinceUse: null,
        scheduledPostId: null,
        canOverride: true,
      };
    },
    enabled: !!photoId && !!eventId,
    staleTime: 30000,
  });
}

/**
 * Get all photo IDs that should be excluded from curation (used in last 8 weeks)
 */
export function useExcludedPhotoIds(eventId: string | undefined) {
  return useQuery({
    queryKey: ["excluded-photo-ids", eventId],
    queryFn: async (): Promise<Set<string>> => {
      if (!eventId) return new Set();

      const cutoffDate = subDays(new Date(), REUSE_WINDOW_DAYS).toISOString();
      const excludedIds = new Set<string>();

      // Fetch both in parallel
      const [recentlyPostedResult, scheduledPostsResult] = await Promise.all([
        supabase
          .from("social_photos")
          .select("id")
          .eq("event_id", eventId)
          .not("last_posted_at", "is", null)
          .gte("last_posted_at", cutoffDate),
        supabase
          .from("social_scheduled_posts")
          .select("photo_id")
          .eq("event_id", eventId)
          .in("status", ["approved", "scheduled", "published"])
          .gte("scheduled_for", cutoffDate),
      ]);

      recentlyPostedResult.data?.forEach(p => excludedIds.add(p.id));
      scheduledPostsResult.data?.forEach(p => {
        if (p.photo_id) excludedIds.add(p.photo_id);
      });

      return excludedIds;
    },
    enabled: !!eventId,
    staleTime: 120000, // Cache for 2 minutes - these don't change often
    gcTime: 180000,
  });
}
