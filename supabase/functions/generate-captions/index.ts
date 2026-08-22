import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CaptionExample {
  example_caption: string;
  photo_context: string | null;
}

/**
 * Generate 3 caption variants for a photo using AI
 * Uses brand voice examples as style guides
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

    const { photoId, eventId } = await req.json();

    if (!photoId || !eventId) {
      return new Response(
        JSON.stringify({ error: "photoId and eventId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();

    // Fetch brand voice from database for style reference
    let brandVoiceContext = "";
    try {
      const { data: brandVoice } = await supabase
        .from("social_brand_voice")
        .select("tone_description, message_pillars, anti_patterns")
        .eq("is_active", true)
        .maybeSingle();
      
      if (brandVoice) {
        const pillars = (brandVoice.message_pillars as string[])?.join(", ") || "";
        const antiPatterns = (brandVoice.anti_patterns as string[])?.join('", "') || "";
        brandVoiceContext = `
Brand tone: ${brandVoice.tone_description}
Message pillars: ${pillars}
Never use: "${antiPatterns}"`;
      }
    } catch (err) {
      console.error("Failed to fetch brand voice:", err);
    }

    // Get photo details
    const { data: photo, error: photoError } = await supabase
      .from("social_photos")
      .select("id, file_name, theme, photographer_name, quality_notes, public_image_url, temporary_url")
      .eq("id", photoId)
      .single();

    if (photoError || !photo) {
      return new Response(
        JSON.stringify({ error: "Photo not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get caption examples for voice/style reference
    const { data: examples } = await supabase
      .from("social_caption_examples")
      .select("example_caption, photo_context")
      .eq("event_id", eventId)
      .limit(10);

    const captionExamples = (examples || []) as CaptionExample[];
    
    // Build the prompt
    const examplesText = captionExamples.length > 0
      ? captionExamples.map(e => `- "${e.example_caption}"`).join("\n")
      : "- A moment of stillness...\n- Let the weekend begin ✌️\n- Finding magic in the everyday";

    const photoContext = [
      photo.theme && `Theme: ${photo.theme}`,
      photo.photographer_name && `Photographer: ${photo.photographer_name}`,
      photo.quality_notes && `AI notes: ${photo.quality_notes}`,
    ].filter(Boolean).join(". ");

    // Get the image URL - prefer public URL, fall back to temporary
    const imageUrl = photo.public_image_url || photo.temporary_url;

    const systemPrompt = `You are a social media copywriter for a boutique music festival called Cosmico. 
Your voice is: warm, poetic but grounded, emotionally resonant, calm, inviting.

NEVER use:
- Corporate language ("optimize", "solutions", "scale", "platform", "experience", "community")
- Overly promotional tone or calls to action
- More than 1 emoji per caption
- Hashtags in the caption itself
- Generic phrases like: "A moment worth sharing", "Magic in the air", "This is what it's all about", "Moments like these", "Pure magic", "Living for this", "Good vibes only", "Unforgettable", "Can't believe"
- Vague descriptors without visual anchors: "beautiful", "amazing", "incredible", "perfect", "awesome", "epic"
- Starting with "When..." or "That moment when..."

ALWAYS:
- Reference SPECIFIC visible elements (the golden hour light on skin, a half-smile, dust in the air, the curve of a tent, hands raised mid-song)
- Ground captions in what you actually SEE, not what you assume
- Let the image speak—describe, don't explain
- Vary your sentence structures (fragments, questions, observations, micro-stories)

TONE VARIATIONS (rotate between these):
- Observational/quiet: Simply name what's there
- Invitational/warm: Draw the reader in gently  
- Wistful/nostalgic: Memory-tinged, soft edges
- Playful/knowing: A wink, light humor
- Sensory/immersive: Textures, sounds, smells

Here are example captions that capture our voice:
${examplesText}`;

    // Randomly select tone emphasis for variety
    const tones = ["observational", "invitational", "wistful", "playful", "sensory"];
    const primaryTone = tones[Math.floor(Math.random() * tones.length)];
    const secondaryTone = tones[Math.floor(Math.random() * tones.length)];

    // Build messages with vision capability - TWO-PASS approach
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    
    userContent.push({
      type: "text",
      text: `STEP 1: First, observe the photo carefully. Identify 5-6 SPECIFIC visual details:
- Light quality: golden hour, harsh midday, soft overcast, neon glow, firelight, blue hour, dappled shade
- Human elements: gestures, expressions, body language, clothing details, jewelry, posture
- Textures: dust, fabric, skin, wood, metal, grass, water, smoke
- Colors: what dominates? What contrasts? Any unexpected color notes?
- Environment/setting: architecture, nature, crowd density, time of day cues
- Mood indicators: energy level, stillness vs movement, intimacy vs vastness

STEP 2: Now write exactly 3 caption options. Each must be DISTINCTLY DIFFERENT in both length AND emotional tone:

**Caption 1 - SHORT (3-8 words) | Tone: ${primaryTone}**
A quiet observation or fragment. No complete sentences needed. Just name what you see with precision.
Good examples: "Dust and gold, 6pm." / "Her hands, mid-song." / "That look. You know the one." / "Three notes in."
Bad examples: "Pure magic." / "Living the dream." / "This is it."

**Caption 2 - MEDIUM (10-18 words) | Tone: ${secondaryTone}**  
Evoke a feeling, ask a gentle question, or make a poetic observation. One thought, fully formed.
Good examples: "Somewhere between the last song and the first star, we found what we came for." / "The kind of tired that feels like permission." / "Nobody warned us about the silence after the encore."
Bad examples: "Having such an amazing time here!" / "This is what it's all about."

**Caption 3 - LONGER (20-35 words) | Mix tones**
A micro-story or sensory description. Paint a scene. Let the reader feel present. Include at least 2 specific visual details from your observation.
Good examples: "The bass still humming in our chests, we walked back through the meadow. Someone laughed. The sky was doing that thing where pink becomes purple becomes night." / "She held her coffee with both hands even though it wasn't cold. The sun hadn't found our corner of the tent yet. Someone was tuning a guitar three campsites over."

${photoContext ? `Additional context: ${photoContext}` : ""}

IMPORTANT: Each caption must reference at least ONE specific visual element you identified. No generic descriptions.

Return ONLY a JSON array with exactly 3 caption strings (short, medium, long), nothing else:
["short caption", "medium caption", "longer caption"]`
    });

    // Add image if available
    if (imageUrl) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageUrl }
      });
    }

    // Call Lovable AI with vision
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.9, // Slightly higher for more variety
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to generate captions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse the JSON array from the response
    let captions: string[] = [];
    try {
      // Find JSON array in the response
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        captions = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse captions:", parseError, content);
      // Fallback: split by newlines or use the whole content
      captions = content.split("\n").filter((s: string) => s.trim().length > 0).slice(0, 3);
    }

    // Ensure we have exactly 3 captions
    while (captions.length < 3) {
      captions.push("A moment worth sharing...");
    }
    captions = captions.slice(0, 3);

    // Store captions on the photo
    const { error: updateError } = await supabase
      .from("social_photos")
      .update({ 
        caption_suggestions: captions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photoId);

    if (updateError) {
      console.error("Failed to save captions:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        captions,
        photoId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating captions:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
