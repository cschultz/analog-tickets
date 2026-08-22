import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, verifyAdmin } from "../_shared/supabase-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Default fallback brand voice for chat
const DEFAULT_CHAT_SYSTEM = `You are the editorial voice for Cosmico. You write Instagram captions—not suggestions, not options. Final copy.

VOICE:
- Quiet confidence over helpful explanation
- Presence over description
- Authored, not suggested

EDITORIAL RESTRAINT (critical):
- Do NOT describe everything in the frame
- Choose ONE detail and let it carry the moment
- Do NOT explain why something matters—let it stand
- Avoid phrases like "there's a kind of…" or "this feels like…" or "something about…"
- Do NOT reference the photographer unless explicitly asked
- End slightly early; leave space for the viewer

WRITING RULES:
- 40–90 words maximum
- Declarative or fragment-based openings
- Short paragraphs, generous line breaks
- Sensory, plainspoken language
- No urgency, no scarcity, no marketing jargon
- Emojis: 0–1 max, only if natural
- Slightly unfinished endings that leave space

AVOID:
- "Don't miss", "limited time", "buy now"
- Buzzwords: "immersive", "unforgettable", "next-level"
- Meta-language: "this captures", "there's something about", "you can feel"
- Cataloging visual details (don't inventory the image)
- Explaining your intent or reasoning

OUTPUT:
- Write ONE confident caption. No options, no numbering.
- If the user asks for another take, provide a single alternative.
- Never label outputs as "Option 1" or "Here are some ideas"
- Just write the caption. That's it.`;

/**
 * Build chat system prompt from database brand voice
 */
async function buildChatSystemPrompt(supabase: ReturnType<typeof getServiceClient>): Promise<string> {
  try {
    const { data: brandVoice, error } = await supabase
      .from("social_brand_voice")
      .select("tone_description, message_pillars, writing_rules, anti_patterns, caption_length_guidance, emoji_guidance")
      .eq("is_active", true)
      .maybeSingle();

    if (error || !brandVoice) {
      console.log("[CAPTION-CHAT] No brand voice found, using default");
      return DEFAULT_CHAT_SYSTEM;
    }

    const toneLines = brandVoice.tone_description
      .split(";")
      .map((t: string) => `- ${t.trim()}`)
      .join("\n");

    const pillarLines = (brandVoice.message_pillars as string[] || [])
      .map((p: string) => `- ${p}`)
      .join("\n");

    const ruleLines = (brandVoice.writing_rules as string[] || [])
      .map((r: string) => `- ${r}`)
      .join("\n");

    const antiLines = (brandVoice.anti_patterns as string[] || [])
      .map((a: string) => `- "${a}"`)
      .join("\n");

    return `You are the editorial voice for Cosmico. You write Instagram captions—not suggestions, not options. Final copy.

VOICE & TONE:
${toneLines}

MESSAGE PILLARS (choose one, don't explain it):
${pillarLines}

EDITORIAL RESTRAINT (critical):
- Do NOT describe everything in the frame
- Choose ONE detail and let it carry the moment
- Do NOT explain why something matters—let it stand
- Avoid phrases like "there's a kind of…" or "this feels like…"
- Do NOT reference the photographer unless explicitly asked
- End slightly early; leave space for the viewer

WRITING RULES:
${ruleLines}

AVOID:
${antiLines}
- Meta-language: "this captures", "there's something about", "you can feel"
- Cataloging visual details

OUTPUT:
- Write ONE confident caption. No options, no numbering.
- If the user asks for another take, provide a single alternative.
- Just write the caption. That's it.`;
  } catch (err) {
    console.error("[CAPTION-CHAT] Failed to fetch brand voice:", err);
    return DEFAULT_CHAT_SYSTEM;
  }
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface CaptionChatRequest {
  messages: ChatMessage[];
  photoContext?: {
    theme?: string;
    tags?: string[];
    quality_notes?: string;
    photographer_name?: string;
    imageUrl?: string;
  };
}

/**
 * Caption Chat - Streaming chat endpoint for caption brainstorming
 * Uses OpenAI GPT-5.2 with locked brand voice
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

    const body: CaptionChatRequest = await req.json();
    const { messages, photoContext } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
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

    // Build system prompt from database brand voice
    let systemPrompt = await buildChatSystemPrompt(supabase);
    if (photoContext) {
      systemPrompt += `\n\nCURRENT PHOTO CONTEXT:`;
      if (photoContext.theme) systemPrompt += `\n- Theme: ${photoContext.theme}`;
      if (photoContext.tags?.length) systemPrompt += `\n- Tags: ${photoContext.tags.join(", ")}`;
      if (photoContext.quality_notes) systemPrompt += `\n- Visual notes: ${photoContext.quality_notes}`;
      if (photoContext.photographer_name) systemPrompt += `\n- Photographer: ${photoContext.photographer_name}`;
      systemPrompt += `\n\nUse this context to ground your caption suggestions in what's actually in the image.`;
    }

    // Build messages array with system prompt
    const aiMessages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }> = [
      { role: "system", content: systemPrompt },
    ];

    // Check if image URL is suitable for vision (skip large Dropbox URLs)
    // Dropbox temporary URLs point to full-res images (often 20MB+) which exceed AI limits
    const canUseVision = photoContext?.imageUrl && 
      !photoContext.imageUrl.includes("dropboxusercontent.com");
    
    // For Supabase Storage URLs, use the image transform endpoint to resize
    // so the AI doesn't reject oversized images
    let visionUrl = photoContext?.imageUrl;
    if (canUseVision && visionUrl && visionUrl.includes("supabase.co/storage")) {
      // Use Supabase image rendering to get a 1024px version
      visionUrl = visionUrl.replace(
        "/storage/v1/object/public/",
        "/storage/v1/render/image/public/"
      ) + "?width=1024&resize=contain";
      console.log("[CAPTION-CHAT] Using resized image for vision");
    }
    
    if (photoContext?.imageUrl && !canUseVision) {
      console.log("[CAPTION-CHAT] Skipping vision - Dropbox URL detected (likely too large)");
    }

    // Add conversation history, potentially with image on first user message
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      // If first user message and we have a suitable image URL, include it
      if (i === 0 && msg.role === "user" && canUseVision && photoContext?.imageUrl) {
        aiMessages.push({
          role: "user",
          content: [
            { type: "text", text: msg.content },
            { type: "image_url", image_url: { url: visionUrl! } },
          ],
        });
      } else {
        aiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    console.log("[CAPTION-CHAT] Starting stream, messages:", messages.length);

    // Call Lovable AI Gateway with streaming
    const response = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: aiMessages,
        stream: true,
        temperature: 0.5,
        max_completion_tokens: 400,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[CAPTION-CHAT] AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return streaming response
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("[CAPTION-CHAT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
