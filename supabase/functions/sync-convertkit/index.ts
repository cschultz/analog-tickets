import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName, tagIds } = await req.json();

    console.log('Received request to sync to ConvertKit:', { email, firstName, tagIds });

    if (!email) {
      console.log('No email provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('CONVERTKIT_API_KEY');
    if (!apiKey) {
      console.error('CONVERTKIT_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'ConvertKit API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cosmico tag ID
    const COSMICO_TAG_ID = '4190656';
    const tagsToApply = tagIds && tagIds.length > 0 ? tagIds : [COSMICO_TAG_ID];

    // Build request body for ConvertKit v4 API
    const body: Record<string, unknown> = {
      email_address: email.trim().toLowerCase(),
      state: 'active',
    };

    if (firstName) {
      body.first_name = firstName.trim();
    }

    console.log('Creating ConvertKit subscriber:', body);

    // ConvertKit v4 uses X-Kit-Api-Key header
    const response = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: {
        'X-Kit-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log('ConvertKit API response status:', response.status);
    console.log('ConvertKit API response:', responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);
      
      // Add tags to the subscriber
      if (tagsToApply.length > 0) {
        console.log('Adding tags to subscriber:', tagsToApply);
        for (const tagId of tagsToApply) {
          try {
            await fetch(`https://api.kit.com/v4/tags/${tagId}/subscribers`, {
              method: 'POST',
              headers: {
                'X-Kit-Api-Key': apiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email_address: email.trim().toLowerCase() }),
            });
          } catch (tagError) {
            console.error('Error adding tag:', tagId, tagError);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Subscriber synced to ConvertKit' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Check if it's a duplicate subscriber (which is fine)
      if (response.status === 422 && responseText.includes('already')) {
        return new Response(
          JSON.stringify({ success: true, message: 'Subscriber already exists in ConvertKit' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.error('ConvertKit API error:', responseText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to sync to ConvertKit', details: responseText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in sync-convertkit function:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
