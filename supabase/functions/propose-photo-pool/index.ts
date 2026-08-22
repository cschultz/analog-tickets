import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface Photo {
  id: string;
  file_name: string;
  photographer_name: string | null;
  photo_year: number | null;
  source_id: string;
  quality_score: number | null;
  temporary_url: string | null;
  public_image_url: string | null;
  theme: string | null;
}

interface ScoredPhoto extends Photo {
  ai_score: number;
  ai_notes: string;
  cluster_id: number;
  is_cluster_best: boolean;
}

/**
 * Propose a balanced pool of candidate photos using AI vision analysis
 * 
 * FEATURES:
 * - Streams progress updates in real-time
 * - Skips photos that already have quality_score
 * - Processes ALL photos in batches with proportional selection
 * - Uses Gemini 3 Flash for best image understanding
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Create a streaming response
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

  // Start processing in background
  (async () => {
    try {
      const { isAdmin, error: authError } = await verifyAdmin(req);
      if (!isAdmin) {
        await sendFinal({ error: authError || "Admin access required" });
        return;
      }

      const { eventId, targetCount = 50, skipScored = true } = await req.json();

      if (!eventId) {
        await sendFinal({ error: "eventId is required" });
        return;
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        await sendFinal({ error: "AI service not configured" });
        return;
      }

      const supabase = getServiceClient();

      await sendProgress({ status: "starting", message: "Counting photos..." });

      // STEP 1: Get total count
      const { count: totalCount, error: countError } = await supabase
        .from("social_photos")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "candidate")
        .eq("approved", false);

      if (countError) {
        await sendFinal({ error: `Failed to count: ${countError.message}` });
        return;
      }

      if (!totalCount || totalCount === 0) {
        await sendFinal({ 
          success: true, 
          proposed: [],
          stats: { total_candidates: 0, proposed_count: 0, ai_analyzed: false }
        });
        return;
      }

      await sendProgress({ 
        status: "fetching", 
        message: `Found ${totalCount} candidate photos`,
        total: totalCount 
      });

      // STEP 2: Fetch all candidates
      const FETCH_BATCH_SIZE = 500;
      const allCandidates: Photo[] = [];
      let offset = 0;

      while (offset < totalCount) {
        const { data: batch, error: fetchError } = await supabase
          .from("social_photos")
          .select(`
            id, file_name, photographer_name, photo_year, source_id,
            quality_score, temporary_url, public_image_url, theme
          `)
          .eq("event_id", eventId)
          .eq("status", "candidate")
          .eq("approved", false)
          .range(offset, offset + FETCH_BATCH_SIZE - 1);

        if (fetchError) {
          await sendFinal({ error: `Failed to fetch: ${fetchError.message}` });
          return;
        }

        if (batch) allCandidates.push(...(batch as Photo[]));
        offset += FETCH_BATCH_SIZE;
      }

      // Filter to photos with URLs
      const photosWithUrls = allCandidates.filter(p => p.temporary_url || p.public_image_url);

      if (photosWithUrls.length === 0) {
        await sendFinal({ 
          success: true, 
          proposed: [],
          stats: { total_candidates: totalCount, proposed_count: 0, error: "No photos with accessible URLs" }
        });
        return;
      }

      // STEP 3: Separate scored vs unscored photos
      const unscoredPhotos = skipScored 
        ? photosWithUrls.filter(p => p.quality_score === null)
        : photosWithUrls;
      
      const alreadyScoredPhotos = skipScored 
        ? photosWithUrls.filter(p => p.quality_score !== null)
        : [];

      await sendProgress({ 
        status: "analyzing",
        message: `${unscoredPhotos.length} need analysis, ${alreadyScoredPhotos.length} already scored`,
        toAnalyze: unscoredPhotos.length,
        alreadyScored: alreadyScoredPhotos.length
      });

      // STEP 4: Shuffle unscored photos for random sampling
      const shuffled = shuffleArray([...unscoredPhotos]);

      // STEP 5: Process in batches
      const AI_BATCH_SIZE = 12;
      const PHOTOS_PER_PROCESSING_BATCH = 100;
      
      const processingBatches: Photo[][] = [];
      for (let i = 0; i < shuffled.length; i += PHOTOS_PER_PROCESSING_BATCH) {
        processingBatches.push(shuffled.slice(i, i + PHOTOS_PER_PROCESSING_BATCH));
      }

      // Calculate proportional selection per batch
      // Account for already-scored photos that will also contribute
      const totalPhotosConsidered = unscoredPhotos.length + alreadyScoredPhotos.length;
      const selectionsPerBatch = processingBatches.length > 0 
        ? Math.ceil((targetCount * unscoredPhotos.length / totalPhotosConsidered) / processingBatches.length)
        : 0;

      const allScoredPhotos: ScoredPhoto[] = [];
      let globalClusterId = 0;
      let totalAnalyzed = 0;
      let totalClusters = 0;
      let totalDuplicatesFiltered = 0;

      // Process each batch
      for (let batchIdx = 0; batchIdx < processingBatches.length; batchIdx++) {
        const processingBatch = processingBatches[batchIdx];
        
        await sendProgress({ 
          status: "processing",
          message: `Processing batch ${batchIdx + 1} of ${processingBatches.length}`,
          currentBatch: batchIdx + 1,
          totalBatches: processingBatches.length,
          photosInBatch: processingBatch.length,
          analyzed: totalAnalyzed
        });

        // Split into AI batches
        const aiBatches: Photo[][] = [];
        for (let i = 0; i < processingBatch.length; i += AI_BATCH_SIZE) {
          aiBatches.push(processingBatch.slice(i, i + AI_BATCH_SIZE));
        }

        const batchScoredPhotos: ScoredPhoto[] = [];

        for (const aiBatch of aiBatches) {
          try {
            const { scored, clusterCount } = await analyzeAndClusterBatch(aiBatch, LOVABLE_API_KEY, globalClusterId);
            batchScoredPhotos.push(...scored);
            globalClusterId += clusterCount;
            totalClusters += clusterCount;
            totalAnalyzed += aiBatch.length;
          } catch (batchError) {
            console.error("AI batch failed:", batchError);
            for (const photo of aiBatch) {
              batchScoredPhotos.push({
                ...photo,
                ai_score: 50,
                ai_notes: "Analysis unavailable",
                cluster_id: globalClusterId++,
                is_cluster_best: true,
              });
            }
          }
        }

        // Filter and select from this batch
        const clusterBestPhotos = batchScoredPhotos.filter(p => p.is_cluster_best);
        totalDuplicatesFiltered += batchScoredPhotos.length - clusterBestPhotos.length;
        
        const qualityPhotos = clusterBestPhotos.filter(p => p.ai_score >= 35);
        qualityPhotos.sort((a, b) => b.ai_score - a.ai_score);
        
        const selectedFromBatch = selectDiversePhotos(qualityPhotos, selectionsPerBatch);
        allScoredPhotos.push(...selectedFromBatch);

        // Update quality scores in DB
        for (const photo of batchScoredPhotos) {
          await supabase
            .from("social_photos")
            .update({ quality_score: photo.ai_score })
            .eq("id", photo.id);
        }

        await sendProgress({ 
          status: "batch_complete",
          message: `Batch ${batchIdx + 1} complete: selected ${selectedFromBatch.length} photos`,
          currentBatch: batchIdx + 1,
          selectedSoFar: allScoredPhotos.length,
          analyzed: totalAnalyzed
        });
      }

      // STEP 6: Include already-scored photos in final selection
      const scoredAsProposable: ScoredPhoto[] = alreadyScoredPhotos
        .filter(p => (p.quality_score || 0) >= 35)
        .map(p => ({
          ...p,
          ai_score: p.quality_score || 50,
          ai_notes: p.theme || "previously scored",
          cluster_id: -1,
          is_cluster_best: true,
        }));

      // Combine and do final selection
      const allCandidatesForSelection = [...allScoredPhotos, ...scoredAsProposable];
      allCandidatesForSelection.sort((a, b) => b.ai_score - a.ai_score);

      const finalProposed = selectDiversePhotos(allCandidatesForSelection, targetCount);

      // Calculate stats
      const proposedByPhotographer = new Map<string, number>();
      const proposedByTheme = new Map<string, number>();
      const proposedBySource = new Map<string, number>();
      const scoreDistribution = { high: 0, medium: 0, low: 0 };
      
      for (const photo of finalProposed) {
        const pKey = photo.photographer_name || "unknown";
        proposedByPhotographer.set(pKey, (proposedByPhotographer.get(pKey) || 0) + 1);
        
        const sKey = photo.source_id || "unknown";
        proposedBySource.set(sKey, (proposedBySource.get(sKey) || 0) + 1);
        
        const themeMatch = photo.ai_notes?.match(/\b(people|place|moment|stillness|detail)\b/i);
        const theme = themeMatch ? themeMatch[1].toLowerCase() : (photo.theme || "other");
        proposedByTheme.set(theme, (proposedByTheme.get(theme) || 0) + 1);

        if (photo.ai_score >= 70) scoreDistribution.high++;
        else if (photo.ai_score >= 50) scoreDistribution.medium++;
        else scoreDistribution.low++;
      }

      await sendFinal({
        success: true,
        proposed: finalProposed.map(p => p.id),
        stats: {
          total_candidates: totalCount,
          photos_with_urls: photosWithUrls.length,
          already_scored: alreadyScoredPhotos.length,
          newly_analyzed: totalAnalyzed,
          processing_batches: processingBatches.length,
          clusters_found: totalClusters,
          duplicates_filtered: totalDuplicatesFiltered,
          proposed_count: finalProposed.length,
          by_photographer: Object.fromEntries(proposedByPhotographer),
          by_source: Object.fromEntries(proposedBySource),
          by_theme: Object.fromEntries(proposedByTheme),
          score_distribution: scoreDistribution,
          sources_count: new Set(finalProposed.map(p => p.source_id)).size,
          ai_analyzed: true,
        },
      });
    } catch (error) {
      console.error("Error proposing photo pool:", error);
      await sendFinal({ error: String(error) });
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

function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function selectDiversePhotos(photos: ScoredPhoto[], limit: number): ScoredPhoto[] {
  const selected: ScoredPhoto[] = [];
  const usedIds = new Set<string>();
  const photographerCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  
  const uniquePhotographers = new Set(photos.map(p => p.photographer_name || "unknown")).size;
  const uniqueSources = new Set(photos.map(p => p.source_id || "unknown")).size;
  
  const maxPerPhotographer = Math.max(3, Math.ceil(limit / Math.max(uniquePhotographers, 1)));
  const maxPerSource = Math.max(5, Math.ceil(limit / Math.max(uniqueSources, 1)));

  for (const photo of photos) {
    if (selected.length >= limit) break;
    if (usedIds.has(photo.id)) continue;

    const photographer = photo.photographer_name || "unknown";
    const source = photo.source_id || "unknown";
    
    const pCount = photographerCounts.get(photographer) || 0;
    const sCount = sourceCounts.get(source) || 0;

    if (pCount < maxPerPhotographer && sCount < maxPerSource) {
      selected.push(photo);
      usedIds.add(photo.id);
      photographerCounts.set(photographer, pCount + 1);
      sourceCounts.set(source, sCount + 1);
    }
  }

  for (const photo of photos) {
    if (selected.length >= limit) break;
    if (!usedIds.has(photo.id)) {
      selected.push(photo);
      usedIds.add(photo.id);
    }
  }

  return selected;
}

async function analyzeAndClusterBatch(
  photos: Photo[], 
  apiKey: string,
  startClusterId: number
): Promise<{ scored: ScoredPhoto[]; clusterCount: number }> {
  const imageContents = photos.map((photo) => ({
    type: "image_url" as const,
    image_url: { url: photo.public_image_url || photo.temporary_url || "" }
  }));

  const prompt = `You are a photo curator. Analyze these ${photos.length} photos.

TASK 1 - CLUSTER SIMILAR PHOTOS:
Group photos that show the SAME scene, moment, or are near-duplicates.

TASK 2 - SCORE EACH PHOTO (0-100):
- Composition/framing: 25 pts
- Lighting/exposure: 25 pts  
- Visual interest/storytelling: 25 pts
- Technical quality: 25 pts

TASK 3 - CLASSIFY THEME:
Each photo is one of: people, place, moment, stillness, detail

Respond with ONLY valid JSON:
{
  "photos": [
    {"index": 0, "cluster": 1, "score": 85, "theme": "people", "notes": "sharp group shot"},
    ...
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
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI analysis failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  let parsed: { photos: Array<{ index: number; cluster: number; score: number; theme: string; notes: string }> };
  try {
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      scored: photos.map((p, idx) => ({
        ...p,
        ai_score: 50,
        ai_notes: "Parse error",
        cluster_id: startClusterId + idx,
        is_cluster_best: true,
      })),
      clusterCount: photos.length,
    };
  }

  const clusterScores = new Map<number, { bestScore: number; bestIndex: number }>();
  
  for (const result of parsed.photos || []) {
    const globalCluster = startClusterId + (result.cluster || 0);
    const current = clusterScores.get(globalCluster);
    if (!current || result.score > current.bestScore) {
      clusterScores.set(globalCluster, { bestScore: result.score, bestIndex: result.index });
    }
  }

  const scored: ScoredPhoto[] = photos.map((photo, idx) => {
    const result = parsed.photos?.find(r => r.index === idx);
    const globalCluster = startClusterId + (result?.cluster || idx);
    const clusterBest = clusterScores.get(globalCluster);
    
    return {
      ...photo,
      ai_score: result?.score ?? 50,
      ai_notes: `${result?.theme || "unknown"}: ${result?.notes || "no analysis"}`,
      cluster_id: globalCluster,
      is_cluster_best: clusterBest?.bestIndex === idx,
    };
  });

  return { scored, clusterCount: new Set(scored.map(p => p.cluster_id)).size };
}
