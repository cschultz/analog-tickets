import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin role
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { prompt, recipientName, context } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Missing prompt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isRecovery = typeof context === 'string' && context.toLowerCase().includes('recovery');

    const systemPrompt = `You are an email copywriter for Cosmico / Cosmico 2026 — a boutique music & arts gathering capped at 700 people in Northern California (May 2026).

Tone: warm, personal, slightly editorial. Like writing to a friend you genuinely want at the party. Never salesy, never pushy, never clickbait.

Guidelines:
- Subject lines under 60 characters, specific and human (not "Don't miss out!")
- Use the recipient's first name naturally — once, near the top
- Be concise: 3–5 short paragraphs max
- ${isRecovery ? 'This is a personal recovery email from a real human on the Cosmico team — reference the specific reason this person is a hot lead (their progress, past attendance, what they were looking at). Acknowledge what they did without being creepy. Make a soft, low-pressure offer to help (answer questions, hold a spot, walk through options). Do NOT include a discount or promo code unless the context explicitly mentions one.' : 'Match the purpose described in the prompt.'}
- Sparingly use emojis (1 max, only if it fits)
- Sign off warmly — the signature is added automatically, do NOT include "Best, [Name]"
- Format the body as HTML with <p> tags. No headings, no buttons, no images.

Recipient: ${recipientName || 'there'}
${context ? `\nFull context about this lead:\n${context}` : ''}

Return STRICT JSON with two fields:
- subject: string
- body: HTML string (no greeting like "Hi X" — that's added automatically; no signature)`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse the JSON response
    let parsed;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Fallback: use the content as body
      parsed = {
        subject: "A note from Cosmico",
        body: `<p>${content.replace(/\n/g, '</p><p>')}</p>`
      };
    }

    return new Response(
      JSON.stringify({
        subject: parsed.subject || "A note from Cosmico",
        body: parsed.body || content
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error generating email draft:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to generate draft' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
