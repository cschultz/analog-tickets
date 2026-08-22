import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedOffer {
  artist_name: string;
  offer_amount: number | null;
  offer_currency: string;
  deposit_percentage: number | null;
  deposit_notes: string | null;
  additional_perks: string | null;
  capacity: number | null;
  ticket_price: number | null;
  performance_date: string | null;
  set_time: string | null;
  set_length_minutes: number | null;
  stage: string | null;
  indoor_outdoor: string | null;
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  state: string | null;
  guest_list_count: number | null;
  guest_list_notes: string | null;
  ages: string | null;
  merchandise_terms: string | null;
  radius_clause: string | null;
  radius_miles: number | null;
  radius_days: number | null;
  other_terms: string | null;
  others_on_lineup: string | null;
  past_lineup_url: string | null;
  expiration_date: string | null;
}

function logStep(step: string, details?: unknown) {
  console.log(`[PARSE-OFFER] ${step}`, details ? JSON.stringify(details) : '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    logStep('Authenticated user', { userId: user.id });

    const { offerText, eventId } = await req.json();

    if (!offerText) {
      throw new Error('No offer text provided');
    }

    logStep('Received offer text', { length: offerText.length, eventId });

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Use Lovable AI to parse the offer
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert at parsing artist performance offers. Extract structured data from the offer text.
            
Return a JSON object with these fields (use null for missing values):
- artist_name: string (required)
- offer_amount: number (just the number, e.g., 4000 not "$4,000")
- offer_currency: string (default "USD")
- deposit_percentage: number (e.g., 50 for "50%")
- deposit_notes: string (any notes about deposit timing, etc.)
- additional_perks: string (lodging, food, travel, etc.)
- capacity: number
- ticket_price: number
- performance_date: string (ISO date format YYYY-MM-DD)
- set_time: string (e.g., "4:00 PM")
- set_length_minutes: number (e.g., 90 for "90 min")
- stage: string (e.g., "Main Stage")
- indoor_outdoor: string (e.g., "Outdoor", "Indoor", "Both")
- venue_name: string
- venue_address: string (street address only)
- city: string
- state: string (2-letter code preferred)
- guest_list_count: number
- guest_list_notes: string (any flexibility notes)
- ages: string (e.g., "All ages", "21+")
- merchandise_terms: string
- radius_clause: string (full text of radius clause)
- radius_miles: number
- radius_days: number (total days, e.g., 100 for "50 days pre-post")
- other_terms: string (any other important terms)
- others_on_lineup: string
- past_lineup_url: string
- expiration_date: string (ISO date format YYYY-MM-DD)

Only return valid JSON, no markdown or explanation.`
          },
          {
            role: 'user',
            content: offerText
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_offer_data',
              description: 'Extract structured offer data from the text',
              parameters: {
                type: 'object',
                properties: {
                  artist_name: { type: 'string' },
                  offer_amount: { type: 'number', nullable: true },
                  offer_currency: { type: 'string' },
                  deposit_percentage: { type: 'number', nullable: true },
                  deposit_notes: { type: 'string', nullable: true },
                  additional_perks: { type: 'string', nullable: true },
                  capacity: { type: 'number', nullable: true },
                  ticket_price: { type: 'number', nullable: true },
                  performance_date: { type: 'string', nullable: true },
                  set_time: { type: 'string', nullable: true },
                  set_length_minutes: { type: 'number', nullable: true },
                  stage: { type: 'string', nullable: true },
                  indoor_outdoor: { type: 'string', nullable: true },
                  venue_name: { type: 'string', nullable: true },
                  venue_address: { type: 'string', nullable: true },
                  city: { type: 'string', nullable: true },
                  state: { type: 'string', nullable: true },
                  guest_list_count: { type: 'number', nullable: true },
                  guest_list_notes: { type: 'string', nullable: true },
                  ages: { type: 'string', nullable: true },
                  merchandise_terms: { type: 'string', nullable: true },
                  radius_clause: { type: 'string', nullable: true },
                  radius_miles: { type: 'number', nullable: true },
                  radius_days: { type: 'number', nullable: true },
                  other_terms: { type: 'string', nullable: true },
                  others_on_lineup: { type: 'string', nullable: true },
                  past_lineup_url: { type: 'string', nullable: true },
                  expiration_date: { type: 'string', nullable: true },
                },
                required: ['artist_name'],
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_offer_data' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logStep('AI API error', { status: aiResponse.status, error: errorText });
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    logStep('AI response received', { choices: aiData.choices?.length });

    // Extract the parsed data from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const parsedOffer: ParsedOffer = JSON.parse(toolCall.function.arguments);
    logStep('Parsed offer data', parsedOffer);

    // Try to find matching artist in database
    let artistId: string | null = null;
    if (parsedOffer.artist_name) {
      const { data: artists } = await supabase
        .from('artists')
        .select('id, name')
        .ilike('name', `%${parsedOffer.artist_name}%`)
        .limit(1);
      
      if (artists && artists.length > 0) {
        artistId = artists[0].id;
        logStep('Found matching artist', { artistId, name: artists[0].name });
      }
    }

    // Insert the offer into the database
    const { data: offer, error: insertError } = await supabase
      .from('artist_offers')
      .insert({
        event_id: eventId || null,
        artist_id: artistId,
        artist_name: parsedOffer.artist_name,
        status: 'draft',
        offer_amount: parsedOffer.offer_amount,
        offer_currency: parsedOffer.offer_currency || 'USD',
        deposit_percentage: parsedOffer.deposit_percentage,
        deposit_notes: parsedOffer.deposit_notes,
        additional_perks: parsedOffer.additional_perks,
        capacity: parsedOffer.capacity,
        ticket_price: parsedOffer.ticket_price,
        performance_date: parsedOffer.performance_date,
        set_time: parsedOffer.set_time,
        set_length_minutes: parsedOffer.set_length_minutes,
        stage: parsedOffer.stage,
        indoor_outdoor: parsedOffer.indoor_outdoor,
        venue_name: parsedOffer.venue_name,
        venue_address: parsedOffer.venue_address,
        city: parsedOffer.city,
        state: parsedOffer.state,
        guest_list_count: parsedOffer.guest_list_count,
        guest_list_notes: parsedOffer.guest_list_notes,
        ages: parsedOffer.ages,
        merchandise_terms: parsedOffer.merchandise_terms,
        radius_clause: parsedOffer.radius_clause,
        radius_miles: parsedOffer.radius_miles,
        radius_days: parsedOffer.radius_days,
        other_terms: parsedOffer.other_terms,
        others_on_lineup: parsedOffer.others_on_lineup,
        past_lineup_url: parsedOffer.past_lineup_url,
        expiration_date: parsedOffer.expiration_date,
        raw_offer_text: offerText,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      logStep('Insert error', insertError);
      throw insertError;
    }

    logStep('Offer created', { offerId: offer.id });

    return new Response(JSON.stringify({ 
      success: true, 
      offer,
      parsed: parsedOffer,
      artistMatched: !!artistId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logStep('Error', { message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
