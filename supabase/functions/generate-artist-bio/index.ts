import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { artistId, artistName, forceRegenerate = false } = await req.json();
    
    if (!artistId && !artistName) {
      return new Response(JSON.stringify({ error: 'artistId or artistName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Generating bio for artist:', artistName || artistId);

    // Check if artist already has a bio
    let artist;
    if (artistId) {
      const { data, error } = await supabase
        .from('artists')
        .select('id, name, bio, genre, spotify_url')
        .eq('id', artistId)
        .single();
      if (error) throw error;
      artist = data;
    }

    if (artist?.bio && !forceRegenerate) {
      console.log('Artist already has bio, skipping generation');
      return new Response(JSON.stringify({ artist, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nameToSearch = artistName || artist?.name;
    if (!nameToSearch) {
      return new Response(JSON.stringify({ error: 'Could not determine artist name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use AI to generate a bio
    const prompt = `You are writing artist bios for a boutique music festival called Cosmico, held along the Russian River in Sonoma County, California. The festival celebrates intimate performances, community connection, and musical discovery.

Write a brief, evocative bio (2-3 sentences, max 50 words) for the musical artist "${nameToSearch}". 

The bio should:
- Capture their musical essence and what makes them special
- Use poetic, festival-appropriate language (warm, inviting, slightly mystical)
- Focus on the feeling/experience of their music rather than career achievements
- Avoid mentioning specific albums, chart positions, or awards

If you're not familiar with this artist, write a generic but fitting bio based on their name and any context clues.

Return ONLY the bio text, no quotes or additional formatting.`;

    console.log('Calling AI to generate bio for:', nameToSearch);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const generatedBio = aiData.choices?.[0]?.message?.content?.trim();

    if (!generatedBio) {
      throw new Error('No bio generated from AI');
    }

    console.log('Generated bio:', generatedBio);

    // Update the artist's bio in the database if we have an artistId
    if (artistId) {
      const { error: updateError } = await supabase
        .from('artists')
        .update({ bio: generatedBio })
        .eq('id', artistId);

      if (updateError) {
        console.error('Error updating artist bio:', updateError);
        throw updateError;
      }

      console.log('Updated artist bio in database');
    }

    return new Response(JSON.stringify({ 
      bio: generatedBio,
      artistId,
      artistName: nameToSearch,
      updated: !!artistId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('generate-artist-bio error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
