import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Default brand voice (fallback if database fetch fails)
const DEFAULT_BRAND_VOICE_PROMPT = `You are the editorial voice for Cosmico (fka Cosmico): a gathering built for presence, connection, creativity, and natural rhythm.

Tone:
- warm, grounded, human
- confident without hype
- reflective, not precious
- invitational, never salesy
- calm from the modern storm

Message pillars (choose and honor one):
- connection from the ground up
- the present of presence
- creativity as medicine
- tapped into natural rhythm
- calm from the modern storm

Writing rules:
- 90–140 words for the main caption
- short paragraphs with line breaks
- sensory, plainspoken language; trust the reader
- no urgency, no scarcity, no marketing jargon
- emojis optional, 0–2 max
- avoid exclamation-heavy hype

Avoid (anti-patterns):
- "don't miss", "limited time", "buy now", "tickets are going fast"
- buzzwords like "immersive", "unforgettable", "next-level"
- forced trend slang

Output JSON ONLY with keys:
- caption: string (include line breaks as \\n)
- first_comment: string (either 4–8 hashtags OR one gentle question)
- alt_text: string (1–2 sentences)
- format_recommendation: "4:5" | "1:1" | "crop_sensitive"
- warnings: string[] (empty if none)`;

/**
 * Fetch the active brand voice from the database
 */
async function getBrandVoicePrompt(supabase: ReturnType<typeof getServiceClient>): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("social_brand_voice")
      .select("system_prompt")
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[GENERATE-CAPTION] Error fetching brand voice:", error);
      return DEFAULT_BRAND_VOICE_PROMPT;
    }

    if (!data?.system_prompt) {
      console.log("[GENERATE-CAPTION] No active brand voice found, using default");
      return DEFAULT_BRAND_VOICE_PROMPT;
    }

    return data.system_prompt;
  } catch (err) {
    console.error("[GENERATE-CAPTION] Failed to fetch brand voice:", err);
    return DEFAULT_BRAND_VOICE_PROMPT;
  }
}

interface CaptionRequest {
  photo_id: string;
  bucket?: "invitation" | "texture" | "community";
  pillar?: "connection" | "presence" | "creativity" | "natural_rhythm" | "calm";
  editor_notes?: string;
  image_url?: string;
}

interface CaptionResponse {
  caption: string;
  first_comment: string;
  alt_text: string;
  format_recommendation: "4:5" | "1:1" | "crop_sensitive";
  warnings: string[];
}

/**
 * Generate caption using OpenAI GPT-5.2 via Lovable AI Gateway
 * 
 * Inputs:
 * - photo_id: required
 * - bucket: optional (invitation/texture/community)
 * - pillar: optional (connection/presence/creativity/natural_rhythm/calm)
 * - editor_notes: optional freeform guidance
 * - image_url: optional (for vision-based analysis)
 * 
 * Returns: caption, first_comment, alt_text, format_recommendation, warnings[]
 */
serve(async (req) => {
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

    const body: CaptionRequest = await req.json();
    const { photo_id, bucket, pillar, editor_notes, image_url } = body;

    if (!photo_id) {
      return new Response(
        JSON.stringify({ error: "photo_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Fetch brand voice from database
    const BRAND_VOICE_PROMPT = await getBrandVoicePrompt(supabase);

    // Fetch photo details
    const { data: photo, error: photoError } = await supabase
      .from("social_photos")
      .select("*")
      .eq("id", photo_id)
      .single();

    if (photoError || !photo) {
      return new Response(
        JSON.stringify({ error: `Photo not found: ${photoError?.message}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context for the AI
    let userPrompt = `Generate a caption for this social media post.

Photo context:
- Theme: ${photo.theme || "not classified"}
- Tags: ${photo.tags?.join(", ") || "none"}
- Quality notes: ${photo.quality_notes || "none"}`;

    if (bucket) {
      userPrompt += `\n- Content bucket: ${bucket}`;
    }

    if (pillar) {
      const pillarMap: Record<string, string> = {
        connection: "connection from the ground up",
        presence: "the present of presence",
        creativity: "creativity as medicine",
        natural_rhythm: "tapped into natural rhythm",
        calm: "calm from the modern storm",
      };
      userPrompt += `\n- Message pillar to emphasize: ${pillarMap[pillar] || pillar}`;
    }

    if (editor_notes) {
      userPrompt += `\n\nEditor notes: ${editor_notes}`;
    }

    userPrompt += `\n\nRespond with valid JSON only, no markdown code blocks.`;

    // Prepare messages for the API
    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
      { role: "system", content: BRAND_VOICE_PROMPT },
    ];

    // If we have an image URL, use vision capabilities
    if (image_url) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: image_url } },
        ],
      });
    } else {
      messages.push({ role: "user", content: userPrompt });
    }

    // Get API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    console.log("[GENERATE-CAPTION] Calling OpenAI GPT-5.2 for photo:", photo_id);

    // Call Lovable AI Gateway with OpenAI model
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages,
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[GENERATE-CAPTION] AI Gateway error:", aiResponse.status, errorText);
      
      // Handle rate limits
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Handle payment required
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let captionData: CaptionResponse;
    try {
      // Clean potential markdown code blocks
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      captionData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[GENERATE-CAPTION] Failed to parse AI response:", content);
      // Return a structured error with the raw content for debugging
      return new Response(
        JSON.stringify({ 
          error: "Failed to parse AI response", 
          raw_content: content,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!captionData.caption) {
      captionData.caption = "";
      captionData.warnings = [...(captionData.warnings || []), "Caption generation failed - please regenerate"];
    }

    // Update the scheduled post with the generated caption
    const { data: scheduledPost } = await supabase
      .from("social_scheduled_posts")
      .select("id")
      .eq("photo_id", photo_id)
      .in("status", ["draft", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scheduledPost) {
      await supabase
        .from("social_scheduled_posts")
        .update({
          caption: captionData.caption,
          caption_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", scheduledPost.id);
      
      console.log("[GENERATE-CAPTION] Updated scheduled post:", scheduledPost.id);
    }

    // Also store caption suggestions on the photo for reference
    const existingSuggestions = photo.caption_suggestions || [];
    await supabase
      .from("social_photos")
      .update({
        caption_suggestions: [...existingSuggestions, captionData.caption].slice(-5), // Keep last 5
        updated_at: new Date().toISOString(),
      })
      .eq("id", photo_id);

    console.log("[GENERATE-CAPTION] Success for photo:", photo_id);

    return new Response(
      JSON.stringify({
        success: true,
        photo_id,
        ...captionData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[GENERATE-CAPTION] Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
