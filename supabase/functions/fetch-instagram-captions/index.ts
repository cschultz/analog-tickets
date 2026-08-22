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
    const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN');
    const META_PAGE_ID = Deno.env.get('META_PAGE_ID'); // Optional: direct Page ID
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!META_ACCESS_TOKEN) {
      throw new Error('META_ACCESS_TOKEN not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Parse request body for options
    const { limit = 50, importToVoice = false, eventId } = await req.json().catch(() => ({}));

    let pageId: string;
    let pageAccessToken: string;

    // First, try to get /me to see what type of entity the token is for
    console.log('Testing token type...');
    const meResponse = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${META_ACCESS_TOKEN}`
    );
    const meData = await meResponse.json();
    console.log('Token /me response:', JSON.stringify(meData, null, 2));

    if (meData.error) {
      throw new Error(`Meta API error: ${meData.error.message}`);
    }

    // Check if META_PAGE_ID is provided (direct configuration)
    if (META_PAGE_ID) {
      console.log('Using directly configured META_PAGE_ID:', META_PAGE_ID);
      pageId = META_PAGE_ID;
      pageAccessToken = META_ACCESS_TOKEN;
    } else {
      // Try to get pages - this works for User Access Tokens
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${META_ACCESS_TOKEN}`
      );
      const pagesData = await pagesResponse.json();
      console.log('Pages API response:', JSON.stringify(pagesData, null, 2));

      if (pagesData.error) {
        throw new Error(`Meta API error: ${pagesData.error.message}`);
      }

      if (pagesData.data && pagesData.data.length > 0) {
        // User token with page access
        const page = pagesData.data[0];
        pageId = page.id;
        pageAccessToken = page.access_token;
        console.log('Found page via /me/accounts:', page.name);
      } else {
        // No pages found via /me/accounts - the token might be a Page Access Token directly
        console.log('No pages in /me/accounts. Trying token as Page Access Token...');
        
        const igCheckResponse = await fetch(
          `https://graph.facebook.com/v18.0/${meData.id}?fields=instagram_business_account&access_token=${META_ACCESS_TOKEN}`
        );
        const igCheckData = await igCheckResponse.json();
        console.log('Direct IG check response:', JSON.stringify(igCheckData, null, 2));

        if (igCheckData.instagram_business_account) {
          // Token is a Page Access Token
          pageId = meData.id;
          pageAccessToken = META_ACCESS_TOKEN;
          console.log('Token is a Page Access Token for page:', meData.name);
        } else {
          throw new Error(
            'Could not find Instagram Business Account. Options:\n' +
            '1. Use a Page Access Token instead of User Token (in Graph API Explorer, select your Page from the dropdown, not "User Token")\n' +
            '2. Or add META_PAGE_ID secret with your Facebook Page ID\n' +
            '3. Make sure your Instagram is a Business/Creator account linked to your Facebook Page'
          );
        }
      }
    }

    // Get Instagram Business Account linked to the page
    const igAccountResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
    );
    const igAccountData = await igAccountResponse.json();

    if (igAccountData.error) {
      throw new Error(`Meta API error getting IG account: ${igAccountData.error.message}`);
    }

    if (!igAccountData.instagram_business_account) {
      throw new Error('No Instagram Business Account linked to this Facebook Page.');
    }

    const igAccountId = igAccountData.instagram_business_account.id;
    console.log('Found Instagram Business Account:', igAccountId);

    // Fetch recent media with captions
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v18.0/${igAccountId}/media?fields=id,caption,media_type,timestamp,permalink&limit=${limit}&access_token=${pageAccessToken}`
    );
    const mediaData = await mediaResponse.json();

    if (mediaData.error) {
      throw new Error(`Meta API error fetching media: ${mediaData.error.message}`);
    }

    const posts = mediaData.data || [];
    console.log(`Fetched ${posts.length} posts from Instagram`);

    // Filter to only posts with captions (excluding empty/null)
    const postsWithCaptions = posts.filter((post: any) => 
      post.caption && post.caption.trim().length > 0
    );

    // Analyze caption patterns for voice training
    const captionAnalysis = postsWithCaptions.map((post: any) => ({
      instagram_post_id: post.id,
      caption: post.caption,
      word_count: post.caption.split(/\s+/).length,
      has_emoji: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/u.test(post.caption),
      has_hashtag: post.caption.includes('#'),
      timestamp: post.timestamp,
      permalink: post.permalink,
      media_type: post.media_type
    }));

    // If importing to voice examples table
    let importedCount = 0;
    if (importToVoice && captionAnalysis.length > 0) {
      if (!eventId) {
        throw new Error('eventId is required when importToVoice is true');
      }

      // Get existing examples to avoid duplicates
      const { data: existingExamples } = await supabase
        .from('social_caption_examples')
        .select('example_caption')
        .eq('event_id', eventId);

      const existingTexts = new Set(existingExamples?.map(e => e.example_caption) || []);

      // Filter captions that match your voice criteria:
      // - Short (under 15 words is good, under 10 is ideal)
      // - No hashtags
      // - Minimal or no emojis
      const voiceMatchingCaptions = captionAnalysis.filter((c: any) => 
        c.word_count <= 15 && 
        !c.has_hashtag &&
        !existingTexts.has(c.caption)
      );

      if (voiceMatchingCaptions.length > 0) {
        const examplesToInsert = voiceMatchingCaptions.map((c: any) => ({
          event_id: eventId,
          example_caption: c.caption,
          photo_context: `Imported from Instagram. Original: ${c.permalink}`
        }));

        const { error: insertError, data: inserted } = await supabase
          .from('social_caption_examples')
          .insert(examplesToInsert)
          .select();

        if (insertError) {
          console.error('Error inserting examples:', insertError);
        } else {
          importedCount = inserted?.length || 0;
        }
      }
    }

    // Summary stats
    const stats = {
      total_posts_fetched: posts.length,
      posts_with_captions: postsWithCaptions.length,
      avg_word_count: captionAnalysis.length > 0 
        ? Math.round(captionAnalysis.reduce((sum: number, c: any) => sum + c.word_count, 0) / captionAnalysis.length)
        : 0,
      posts_with_hashtags: captionAnalysis.filter((c: any) => c.has_hashtag).length,
      posts_with_emojis: captionAnalysis.filter((c: any) => c.has_emoji).length,
      short_captions_under_10_words: captionAnalysis.filter((c: any) => c.word_count <= 10).length,
      imported_to_voice: importedCount
    };

    return new Response(
      JSON.stringify({
        success: true,
        stats,
        captions: captionAnalysis,
        message: importToVoice 
          ? `Fetched ${posts.length} posts, imported ${importedCount} captions to voice examples.`
          : `Fetched ${posts.length} posts with ${postsWithCaptions.length} captions. Set importToVoice=true to import matching captions.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const error = err as Error;
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        hint: error.message?.includes('token') 
          ? 'Your Meta access token may be expired or missing permissions. Tokens typically expire in 60 days.'
          : undefined
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
