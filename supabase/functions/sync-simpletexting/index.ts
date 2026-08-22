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
    const { phone, email, firstName, listName } = await req.json();

    console.log('Received request to sync contact:', { phone, email, firstName, listName });

    if (!phone) {
      console.log('No phone number provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('SIMPLYTEXT_API_KEY');
    if (!apiKey) {
      console.error('SIMPLYTEXT_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'SimpleTexting API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default list name if not provided
    const group = listName || 'Cosmico Full List';
    
    // Clean phone number - remove non-numeric characters
    const cleanPhone = phone.replace(/\D/g, '');
    
    console.log('Adding contact to SimpleTexting:', { cleanPhone, group, email });

    // Build the URL with query parameters
    const params = new URLSearchParams({
      token: apiKey,
      group: group,
      phone: cleanPhone,
    });

    // Add optional fields if provided
    if (email) {
      params.append('email', email);
    }
    if (firstName) {
      params.append('firstName', firstName);
    }

    const response = await fetch(
      `https://app2.simpletexting.com/v1/group/contact/add?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const data = await response.json();
    console.log('SimpleTexting API response:', data);

    // SimpleTexting returns code 1 for success
    if (data.code === 1) {
      return new Response(
        JSON.stringify({ success: true, message: 'Contact added successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (data.code === 12) {
      // Code 12 = already added (not an error)
      console.log('Contact already exists in list');
      return new Response(
        JSON.stringify({ success: true, message: 'Contact already exists' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (data.message && data.message.toLowerCase().includes('already')) {
      // Handle "already in this list" message as success
      console.log('Contact already exists in list (message check)');
      return new Response(
        JSON.stringify({ success: true, message: 'Contact already exists' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.error('SimpleTexting API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.message || 'Failed to add contact' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in sync-simpletexting function:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
