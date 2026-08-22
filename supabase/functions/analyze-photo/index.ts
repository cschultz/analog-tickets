import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface AnalysisResult {
  theme: "place" | "people" | "moment" | "stillness" | "detail";
  tags: string[];
  quality_flags: string[];
  silence_recommended: boolean;
  caption_suggestions: string[];
}

/**
 * Analyze an approved photo using vision AI
 * - Classify theme: place/people/moment/stillness/detail
 * - Add secondary tags
 * - Generate 0-3 short caption suggestions (3-9 words, calm/zen, no emojis)
 * - Determine if silence is recommended based on theme
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

    const { photoId, imageUrl } = await req.json();

    if (!photoId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: "photoId and imageUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Call vision AI for analysis
    const prompt = `Analyze this photo for a festival/retreat Instagram account with a calm, zen aesthetic.

Respond in valid JSON format only, no markdown:
{
  "theme": "<one of: place, people, moment, stillness, detail>",
  "tags": ["<2-5 descriptive tags like 'sunset', 'crowd', 'nature', 'workshop', 'dancing'>"],
  "quality_flags": ["<any quality issues like 'blurry', 'too dark', 'cropped poorly', or empty array if good>"],
  "silence_recommended": <true if the image speaks for itself and doesn't need a caption, false otherwise>,
  "caption_suggestions": ["<0-3 short captions, 3-9 words each, calm/poetic tone, NO emojis, NO hashtags>"]
}

Theme definitions:
- place: landscape, venue, environment, space
- people: portraits, groups, community, faces
- moment: action, dancing, performance, interaction
- stillness: meditation, calm, peaceful scenes
- detail: close-ups, objects, textures, food

For silence_recommended, consider:
- stillness/detail themes often work better without captions (50-60%)
- place themes sometimes work without captions (30-40%)
- people/moment themes usually benefit from captions`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse the JSON response
    let analysis: AnalysisResult;
    try {
      // Clean potential markdown code blocks
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Fallback to defaults
      analysis = {
        theme: "moment",
        tags: [],
        quality_flags: [],
        silence_recommended: false,
        caption_suggestions: [],
      };
    }

    // Validate theme
    const validThemes = ["place", "people", "moment", "stillness", "detail"];
    if (!validThemes.includes(analysis.theme)) {
      analysis.theme = "moment";
    }

    // Update the photo with analysis results
    const { error: updateError } = await supabase
      .from("social_photos")
      .update({
        theme: analysis.theme,
        tags: analysis.tags,
        quality_notes: analysis.quality_flags.length > 0 ? analysis.quality_flags.join(", ") : null,
        silence_recommended: analysis.silence_recommended,
        caption_suggestions: analysis.caption_suggestions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoId);

    if (updateError) {
      throw new Error(`Failed to update photo: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        photoId,
        analysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error analyzing photo:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
