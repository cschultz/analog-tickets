import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface Photo {
  id: string;
  file_name: string;
  dropbox_path: string | null;
  temporary_url: string | null;
  public_image_url: string | null;
  quality_score: number | null;
  url_expires_at: string | null;
}

// Caption generation removed - using chat-based caption flow instead

/**
 * Bulk analyze all unscored photos for an event
 * Persists job state to database for recovery after browser sleep
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendProgress = async (data: Record<string, unknown>) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  const sendFinal = async (data: Record<string, unknown>) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify({ ...data, done: true })}\n\n`));
    await writer.close();
  };

  (async () => {
    let jobId: string | null = null;
    const supabase = getServiceClient();

    try {
      const { isAdmin, error: authError } = await verifyAdmin(req);
      if (!isAdmin) {
        await sendFinal({ error: authError || "Admin access required" });
        return;
      }

      const { eventId, limit } = await req.json();
      if (!eventId) {
        await sendFinal({ error: "eventId is required" });
        return;
      }
      
      // Optional limit for incremental analysis (default: no limit)
      const maxPhotos = typeof limit === "number" && limit > 0 ? limit : null;

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        await sendFinal({ error: "AI service not configured" });
        return;
      }

      // Caption examples no longer needed - captions generated via chat flow

      await sendProgress({ message: "Checking photo URLs..." });

      // Get unscored photos with URL expiry info
      const { data: unscoredPhotos, error: fetchError } = await supabase
        .from("social_photos")
        .select("id, file_name, dropbox_path, temporary_url, public_image_url, url_expires_at")
        .eq("event_id", eventId)
        .is("quality_score", null)
        .limit(1000);

      if (fetchError) {
        await sendFinal({ error: `Failed to fetch photos: ${fetchError.message}` });
        return;
      }

      let photosWithUrls = (unscoredPhotos as Photo[]).filter(
        p => p.temporary_url || p.public_image_url || p.dropbox_path
      );

      // Apply limit if specified (for incremental analysis)
      if (maxPhotos && photosWithUrls.length > maxPhotos) {
        photosWithUrls = photosWithUrls.slice(0, maxPhotos);
        console.log(`Limited to ${maxPhotos} photos for incremental analysis`);
      }

      if (photosWithUrls.length === 0) {
        await sendFinal({ 
          success: true, 
          analyzed: 0,
          message: "All photos already analyzed" 
        });
        return;
      }

      // Auto-refresh expired/expiring Dropbox URLs
      const expiryBuffer = 30 * 60 * 1000; // 30 min buffer
      const now = Date.now();
      const expiredPhotos = photosWithUrls.filter(p => {
        if (p.public_image_url) return false; // Has permanent URL
        if (!p.dropbox_path) return false; // Can't refresh without path
        if (!p.url_expires_at) return true; // No expiry = needs refresh
        return new Date(p.url_expires_at).getTime() < now + expiryBuffer;
      });

      if (expiredPhotos.length > 0) {
        await sendProgress({ 
          message: `Refreshing ${expiredPhotos.length} expired Dropbox links...`,
          total: photosWithUrls.length,
          analyzed: 0,
        });

        const refreshBatchSize = 20;
        let refreshed = 0;
        const newExpiresAt = new Date(now + 4 * 60 * 60 * 1000).toISOString();

        for (let i = 0; i < expiredPhotos.length; i += refreshBatchSize) {
          const batch = expiredPhotos.slice(i, i + refreshBatchSize);
          
          const results = await Promise.allSettled(
            batch.map(async (photo) => {
              try {
                const linkResponse = await dropboxFetch(
                  "https://api.dropboxapi.com/2/files/get_temporary_link",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: photo.dropbox_path }),
                  }
                );

                if (!linkResponse.ok) {
                  console.error(`Dropbox link error for ${photo.file_name}: ${linkResponse.status}`);
                  return false;
                }

                const linkData = await linkResponse.json();
                
                // Update the photo with new URL
                await supabase
                  .from("social_photos")
                  .update({
                    temporary_url: linkData.link,
                    url_expires_at: newExpiresAt,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", photo.id);
                
                // Update in-memory for this session
                photo.temporary_url = linkData.link;
                photo.url_expires_at = newExpiresAt;
                return true;
              } catch (err) {
                console.error(`Failed to refresh ${photo.file_name}:`, err);
                return false;
              }
            })
          );

          refreshed += results.filter(r => r.status === "fulfilled" && r.value).length;
          
          if (i + refreshBatchSize < expiredPhotos.length) {
            await new Promise(r => setTimeout(r, 200));
          }
        }

        console.log(`Auto-refreshed ${refreshed}/${expiredPhotos.length} Dropbox links`);
        await sendProgress({ 
          message: `Refreshed ${refreshed} links. Starting AI analysis...`,
          total: photosWithUrls.length,
          analyzed: 0,
        });
      }

      // Filter to photos that now have valid URLs
      const validPhotos = photosWithUrls.filter(p => p.temporary_url || p.public_image_url);

      if (validPhotos.length === 0) {
        await sendFinal({ 
          success: false, 
          error: "No photos have valid URLs after refresh. Check Dropbox connection." 
        });
        return;
      }

      const BATCH_SIZE = 6; // Smaller batches for stability
      const totalBatches = Math.ceil(validPhotos.length / BATCH_SIZE);

      // Create job record in database for persistence
      const { data: jobData, error: jobError } = await supabase
        .from("social_analysis_jobs")
        .insert({
          event_id: eventId,
          status: "running",
          total_photos: validPhotos.length,
          analyzed_count: 0,
          failed_count: 0,
          current_batch: 0,
          total_batches: totalBatches,
        })
        .select("id")
        .single();

      if (jobError) {
        console.error("Failed to create job:", jobError);
        // Continue without persistence - still works, just won't survive browser sleep
      } else {
        jobId = jobData.id;
      }

      await sendProgress({ 
        message: `Found ${validPhotos.length} photos to analyze`,
        total: validPhotos.length,
        analyzed: 0,
        jobId,
      });

      let totalAnalyzed = 0;
      let totalFailed = 0;

      for (let i = 0; i < validPhotos.length; i += BATCH_SIZE) {
        const batch = validPhotos.slice(i, i + BATCH_SIZE);
        const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
        
        await sendProgress({
          message: `Analyzing batch ${currentBatch}/${totalBatches}`,
          analyzed: totalAnalyzed,
          total: validPhotos.length,
          currentBatch,
          totalBatches,
          jobId,
        });

        try {
          const results = await analyzeBatch(batch, LOVABLE_API_KEY);
          
          // Update scores and themes in database (no captions - use chat flow instead)
          let batchSuccess = 0;
          for (const { id, score, theme } of results) {
            const { error: updateError } = await supabase
              .from("social_photos")
              .update({ 
                quality_score: score,
                theme: theme,
                updated_at: new Date().toISOString()
              })
              .eq("id", id);
            
            if (updateError) {
              console.error(`Failed to update photo ${id}:`, updateError.message);
            } else {
              batchSuccess++;
            }
          }
          
          console.log(`Batch ${currentBatch}: Updated ${batchSuccess}/${batch.length} photos with scores`);
          totalAnalyzed += batchSuccess;
          totalFailed += batch.length - batchSuccess;
        } catch (batchError) {
          console.error("Batch analysis failed:", batchError);
          totalFailed += batch.length;
          
          // Assign default scores to failed photos
          for (const photo of batch) {
            const { error: fallbackError } = await supabase
              .from("social_photos")
              .update({ 
                quality_score: 50,
                updated_at: new Date().toISOString()
              })
              .eq("id", photo.id);
            
            if (fallbackError) {
              console.error(`Fallback update failed for ${photo.id}:`, fallbackError.message);
            }
          }
        }

        // Update job progress in database
        if (jobId) {
          await supabase
            .from("social_analysis_jobs")
            .update({
              analyzed_count: totalAnalyzed,
              failed_count: totalFailed,
              current_batch: currentBatch,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        }

        // Small delay between batches to avoid rate limits
        if (i + BATCH_SIZE < validPhotos.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Mark job as completed
      if (jobId) {
        await supabase
          .from("social_analysis_jobs")
          .update({
            status: "completed",
            analyzed_count: totalAnalyzed,
            failed_count: totalFailed,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }

      await sendFinal({
        success: true,
        analyzed: totalAnalyzed,
        failed: totalFailed,
        total: validPhotos.length,
        jobId,
        message: `Analyzed ${totalAnalyzed} photos${totalFailed > 0 ? ` (${totalFailed} failed)` : ""}`
      });
    } catch (error) {
      console.error("Bulk analysis error:", error);
      
      // Mark job as failed
      if (jobId) {
        await supabase
          .from("social_analysis_jobs")
          .update({
            status: "failed",
            error_message: String(error),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
      
      await sendFinal({ error: String(error), jobId });
    }
  })();

  return new Response(stream.readable, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});

async function analyzeBatch(
  photos: Photo[],
  apiKey: string
): Promise<Array<{ id: string; score: number; theme: string }>> {
  const imageContents = photos.map((photo) => ({
    type: "image_url" as const,
    image_url: { url: photo.public_image_url || photo.temporary_url || "" }
  }));

  const prompt = `Analyze these ${photos.length} photos for a boutique music festival Instagram.

For EACH photo provide:
1. SCORE (0-100): composition (25), lighting (25), visual interest (25), technical quality (25)
2. THEME: One of: people, place, moment, stillness, detail

Respond with ONLY valid JSON:
{
  "photos": [
    {"index": 0, "score": 85, "theme": "people"},
    {"index": 1, "score": 72, "theme": "place"}
  ]
}`;

  const response = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{
        role: "user",
        content: [{ type: "text", text: prompt }, ...imageContents]
      }],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", response.status, errorText);
    throw new Error(`AI analysis failed: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  let parsed: { photos: Array<{ index: number; score: number; theme: string }> };
  try {
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    // Return defaults if parsing fails
    return photos.map(p => ({ 
      id: p.id, 
      score: 50, 
      theme: "moment"
    }));
  }

  return photos.map((photo, idx) => {
    const result = parsed.photos?.find(r => r.index === idx);
    const rawScore = result?.score ?? 50;
    const clampedScore = Math.round(Math.max(0, Math.min(100, rawScore)));
    
    return {
      id: photo.id,
      score: clampedScore,
      theme: result?.theme ?? "moment",
    };
  });
}
