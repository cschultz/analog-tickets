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
    const { email, firstName, segmentIds } = await req.json();

    console.log('Received request to sync to Flodesk:', { email, firstName, segmentIds });

    if (!email) {
      console.log('No email provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FLODESK_API_KEY');
    if (!apiKey) {
      console.error('FLODESK_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Flodesk API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cosmico segment ID
    const COSMICO_SEGMENT_ID = '6930a0da231c07add766b8a0';

    // Build request body
    const body: Record<string, unknown> = {
      email: email.trim().toLowerCase(),
      segment_ids: segmentIds && segmentIds.length > 0 ? segmentIds : [COSMICO_SEGMENT_ID],
    };

    if (firstName) {
      body.first_name = firstName.trim();
    }

    console.log('Creating/updating Flodesk subscriber:', body);

    // Flodesk uses Basic auth with API key as username, empty password
    const authHeader = 'Basic ' + btoa(apiKey + ':');

    const response = await fetch('https://api.flodesk.com/v1/subscribers', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'User-Agent': 'Cosmico App (cosmico.events)',
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log('Flodesk API response status:', response.status);
    console.log('Flodesk API response:', responseText);

    if (response.ok) {
      return new Response(
        JSON.stringify({ success: true, message: 'Subscriber synced to Flodesk' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.error('Flodesk API error:', responseText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to sync to Flodesk', details: responseText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in sync-flodesk function:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
